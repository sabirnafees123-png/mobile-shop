// src/controllers/purchasesController.js
const { query, getClient } = require('../config/database');

async function generatePurchaseNumber(client) {
  const year = new Date().getFullYear();
  const result = await client.query(
    `SELECT purchase_number FROM purchases
     WHERE purchase_number LIKE $1
     ORDER BY purchase_number DESC LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [`PUR-${year}-%`]
  );
  let next = 1;
  if (result.rows.length) {
    const last = result.rows[0].purchase_number;
    next = parseInt(last.split('-')[2]) + 1;
  }
  return `PUR-${year}-${String(next).padStart(3, '0')}`;
}

// GET /api/v1/purchases
exports.getAllPurchases = async (req, res) => {
  try {
    const { shop_id, search, payment_status, from, to } = req.query;

    // --- pagination params ---
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.max(1, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    // --- shared WHERE fragment ---
    let where = `WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (shop_id)        { where += ` AND p.shop_id = $${idx++}`;                                                    params.push(parseInt(shop_id)); }
    if (payment_status) { where += ` AND p.payment_status = $${idx++}`;                                             params.push(payment_status); }
    if (from)           { where += ` AND p.purchase_date >= $${idx++}`;                                             params.push(from); }
    if (to)             { where += ` AND p.purchase_date <= $${idx++}`;                                             params.push(to); }
    if (search)         { where += ` AND (p.purchase_number ILIKE $${idx} OR s.name ILIKE $${idx++})`;              params.push(`%${search}%`); }

    // --- COUNT query ---
    // Subquery needed because inner query uses GROUP BY
    const countSql = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT p.id
        FROM purchases p
        JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
        ${where}
        GROUP BY p.id, s.name
      ) sub
    `;
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].total);

    // --- DATA query ---
    const dataSql = `
      SELECT p.*, s.name as supplier_name, COUNT(pi.id) as item_count
      FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      ${where}
      GROUP BY p.id, s.name
      ORDER BY p.purchase_date DESC, p.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const result = await query(dataSql, [...params, limit, offset]);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/purchases/:id
exports.getPurchase = async (req, res) => {
  try {
    const purchase = await query(
      `SELECT p.*, s.name as supplier_name, s.phone as supplier_phone
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = $1`, [req.params.id]
    );
    if (!purchase.rows.length)
      return res.status(404).json({ success: false, message: 'Purchase not found' });

    const items = await query(
      `SELECT pi.*, pr.name as product_name, pr.brand, pr.model, pr.color, pr.type,
              sh.name as shop_name
       FROM purchase_items pi
       JOIN products pr ON pr.id = pi.product_id
       LEFT JOIN shops sh ON sh.id = pi.shop_id
       WHERE pi.purchase_id = $1`, [req.params.id]
    );
    res.json({ success: true, data: { ...purchase.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/purchases
// Key change: each item can have serial_number as primary key.
// If product_id not provided, system finds by serial or creates new product.
exports.createPurchase = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { supplier_id, purchase_date, amount_paid = 0, notes, items } = req.body;

    if (!supplier_id) throw new Error('supplier_id is required');
    if (!items || !items.length) throw new Error('At least one item is required');
    if (items.some(i => !i.shop_id)) throw new Error('Each item must have a shop selected');
    if (items.some(i => !i.unit_cost)) throw new Error('Each item needs a cost price');

    const totalAmount    = items.reduce((sum, item) => sum + ((item.qty || 1) * item.unit_cost), 0);
    const purchaseNumber = await generatePurchaseNumber(client);

    // Create purchase header
    const purchase = await client.query(
      `INSERT INTO purchases (purchase_number, supplier_id, purchase_date, total_amount, amount_paid, payment_status, notes, shop_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [purchaseNumber, supplier_id,
       purchase_date || new Date().toISOString().split('T')[0],
       totalAmount, amount_paid,
       amount_paid >= totalAmount ? 'paid' : amount_paid > 0 ? 'partial' : 'unpaid',
       notes, parseInt(items[0].shop_id), req.user?.id||null]
    );
    const purchaseId = purchase.rows[0].id;

    // ── Batch lookup existing products by serial ──────────────────────
    const serialsToCheck = items.filter(i => !i.product_id && i.serial_number).map(i => i.serial_number);
    const existingBySerial = {};
    if (serialsToCheck.length) {
      const found = await client.query(
        `SELECT id, serial_number FROM products WHERE serial_number = ANY($1)`, [serialsToCheck]
      );
      found.rows.forEach(r => { existingBySerial[r.serial_number] = r.id; });
    }

    // ── Separate: existing (update price) vs new (insert product) ─────
    const toUpdate = [];
    const toCreate = [];
    items.forEach(item => {
      // Find ID if existing product — via dropdown (product_id) OR found by serial
      const existingId = item.product_id || (item.serial_number && existingBySerial[item.serial_number]);

      if (existingId) {
        if (item.recommended_selling_price && parseFloat(item.recommended_selling_price) > 0) {
          toUpdate.push({ id: existingId, price: item.recommended_selling_price });
        }
      } else {
        toCreate.push(item);
      }
    });

    // ── Batch UPDATE existing products (single query with CASE WHEN) ───
    if (toUpdate.length) {
      const ids    = toUpdate.map(u => u.id);
      const prices = toUpdate.map(u => u.price);
      // Build: UPDATE products SET selling_price = CASE id WHEN x THEN y ... END WHERE id = ANY(...)
      const caseWhen = toUpdate.map((u, i) => `WHEN $${i*2+1}::uuid THEN $${i*2+2}::numeric`).join(' ');
      const params   = toUpdate.flatMap(u => [u.id, u.price]);
      params.push(ids);
      await client.query(
        `UPDATE products SET selling_price = CASE id ${caseWhen} END
         WHERE id = ANY($${params.length})`,
        params
      );
    }

    // ── Batch INSERT new products (single multi-row INSERT) ──────────
    let newProductResults = [];
    if (toCreate.length) {
      const vals   = toCreate.map((_, i) => { const b=i*8; return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},true)`; }).join(',');
      const params = toCreate.flatMap(item => [
        item.product_name || item.serial_number || 'Unknown Product',
        item.brand || null, item.color || null, item.serial_number || null,
        item.product_type || 'Used', 'Mobile Phone',
        item.recommended_selling_price || 0, item.unit_cost || 0,
      ]);
      const result = await client.query(
        `INSERT INTO products (name,brand,color,serial_number,type,category,selling_price,base_cost,is_active)
         VALUES ${vals} RETURNING id, serial_number`,
        params
      );
      newProductResults = result.rows.map(row => ({ rows: [row] }));
    }
    newProductResults.forEach((r, idx) => {
      const row = r.rows[0];
      const item = toCreate[idx];
      if (row.serial_number) existingBySerial[row.serial_number] = row.id;
      // Also track by product_name for items without serial
      if (!item.serial_number && item.product_name) existingBySerial[`__name__${item.product_name}`] = row.id;
    });

    // Build resolvedItems
    const resolvedItems = items.map(item => ({
      ...item,
      finalProductId: item.product_id
        || (item.serial_number && existingBySerial[item.serial_number])
        || (!item.serial_number && item.product_name && existingBySerial[`__name__${item.product_name}`])
        || null,
    }));

    // Safety check — ensure all items have a product_id
    const missingProduct = resolvedItems.find(i => !i.finalProductId);
    if (missingProduct) throw new Error(`Could not resolve product for item: ${missingProduct.product_name || missingProduct.serial_number || 'unknown'}`);


    // ── Batch INSERT purchase_items ───────────────────────────────────
    const piValues = resolvedItems.map((_, i) => {
      const b = i * 8;
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`;
    }).join(',');
    const piParams = resolvedItems.flatMap(item => [
      purchaseId, item.finalProductId,
      item.serial_number || null, item.imei || null,
      item.qty || 1, item.unit_cost,
      item.recommended_selling_price || 0, parseInt(item.shop_id),
    ]);
    await client.query(
      `INSERT INTO purchase_items (purchase_id, product_id, serial_number, imei, qty, unit_cost, recommended_selling_price, shop_id)
       VALUES ${piValues}`, piParams
    );

    // ── Batch inventory upsert — skip service items ──────────────────
    const productIds = resolvedItems.map(i => i.finalProductId);
    const serviceCheck = await client.query(
      `SELECT id, is_service FROM products WHERE id = ANY($1)`,
      [productIds]
    );
    const serviceMap = {};
    serviceCheck.rows.forEach(r => { serviceMap[r.id] = r.is_service; });

    const invMap = {};
    resolvedItems.forEach(item => {
      if (serviceMap[item.finalProductId]) return; // skip service items
      const key = `${item.finalProductId}:${parseInt(item.shop_id)}`;
      if (!invMap[key]) invMap[key] = { product_id: item.finalProductId, shop_id: parseInt(item.shop_id), qty: 0 };
      invMap[key].qty += item.qty || 1;
    });
    const invRows = Object.values(invMap);
    if (invRows.length > 0) {
      const invValues = invRows.map((_, i) => { const b=i*3; return `($${b+1},$${b+2},$${b+3},5)`; }).join(',');
      const invParams = invRows.flatMap(r => [r.product_id, r.shop_id, r.qty]);
      await client.query(
        `INSERT INTO inventory (product_id, shop_id, quantity, min_stock) VALUES ${invValues}
         ON CONFLICT (product_id, shop_id)
         DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, last_updated = NOW()`,
        invParams
      );
    }

    // ── Log stock movements ('in') — one per item, skip service items ──
    const movementItems = resolvedItems.filter(item => !serviceMap[item.finalProductId]);
    if (movementItems.length > 0) {
      const smValues = movementItems.map((_, i) => { const b = i*4; return `($${b+1},'in',$${b+2},$${b+3},$${b+4})`; }).join(',');
      const smParams = movementItems.flatMap(item => [
        item.finalProductId, item.qty || 1,
        `Purchase ${purchaseNumber}${item.serial_number ? ' — ' + item.serial_number : ''}`,
        req.user?.id || null,
      ]);
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, note, created_by) VALUES ${smValues}`,
        smParams
      );
    }

    // Update supplier balance — only net due affects balance
    const amountDue  = totalAmount - amount_paid;
    const supplier   = await client.query('SELECT balance FROM suppliers WHERE id = $1', [supplier_id]);
    const oldBalance = parseFloat(supplier.rows[0].balance);
    const balAfterPurchase = oldBalance + totalAmount;       // balance goes UP by full purchase
    const balAfterPayment  = balAfterPurchase - amount_paid; // then DOWN by what was paid
    const newBalance = balAfterPayment;                      // = oldBalance + amountDue

    await client.query('UPDATE suppliers SET balance = $1 WHERE id = $2', [newBalance, supplier_id]);

    // Ledger: purchase entry = full totalAmount (not amountDue)
    await client.query(
      `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date, shop_id)
       VALUES ($1,'purchase',$2,'purchase',$3,$4,$5,$6,$7)`,
      [supplier_id, purchaseId, totalAmount, balAfterPurchase,
       `Purchase ${purchaseNumber} - ${items.length} item(s)`,
       purchase_date || new Date().toISOString().split('T')[0], parseInt(items[0].shop_id)]
    );

    if (amount_paid > 0) {
      await client.query(
        `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date, shop_id)
         VALUES ($1,'payment',$2,'purchase',$3,$4,$5,$6,$7)`,
        [supplier_id, purchaseId, -amount_paid, balAfterPayment,
         `Payment with purchase ${purchaseNumber}`,
         purchase_date || new Date().toISOString().split('T')[0], parseInt(items[0].shop_id)]
      );
    }

    await client.query('COMMIT');

    const created = await query(
      `SELECT p.*, s.name as supplier_name FROM purchases p
       JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $1`, [purchaseId]
    );
    res.status(201).json({
      success: true,
      message: `Purchase ${purchaseNumber} created successfully`,
      data: created.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

exports.recordPayment = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { amount, payment_date, notes } = req.body;
    if (!amount || amount <= 0) throw new Error('Valid payment amount required');

    const purchase = await client.query('SELECT * FROM purchases WHERE id = $1', [req.params.id]);
    if (!purchase.rows.length) throw new Error('Purchase not found');
    const p = purchase.rows[0];
    const newAmountPaid = parseFloat(p.amount_paid) + parseFloat(amount);
    if (newAmountPaid > parseFloat(p.total_amount)) throw new Error('Payment exceeds total amount');

    await client.query(
      `UPDATE purchases SET amount_paid=$1, payment_status=$2 WHERE id=$3`,
      [newAmountPaid, newAmountPaid >= p.total_amount ? 'paid' : 'partial', req.params.id]
    );

    const supplier = await client.query('SELECT balance FROM suppliers WHERE id=$1', [p.supplier_id]);
    const newSupplierBalance = parseFloat(supplier.rows[0].balance) - parseFloat(amount);
    await client.query('UPDATE suppliers SET balance=$1 WHERE id=$2', [newSupplierBalance, p.supplier_id]);

    const payDate = payment_date || new Date().toISOString().split('T')[0];

    await client.query(
      `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date, shop_id)
       VALUES ($1,'payment',$2,'purchase',$3,$4,$5,$6,$7)`,
      [p.supplier_id, p.id, -amount, newSupplierBalance,
       notes || `Payment for ${p.purchase_number}`,
       payDate, p.shop_id || null]
    );

    // Record in cash register — register MUST be open, else block
    const regCheck = await client.query(
      `SELECT status FROM cash_register WHERE register_date = $1 AND shop_id = $2 LIMIT 1`,
      [payDate, p.shop_id]
    );
    const regStatus = regCheck.rows[0]?.status;
    if (regStatus === 'closed') {
      throw new Error(`Register for ${payDate} is closed. Please reopen the register first.`);
    }
    if (!regStatus) {
      throw new Error(`Register for ${payDate} is not open. Please open the register for that date first.`);
    }
    await client.query(
      `UPDATE cash_register SET total_expenses = total_expenses + $1
       WHERE register_date = $2 AND shop_id = $3 AND status = 'open'`,
      [amount, payDate, p.shop_id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Payment recorded', new_balance: newSupplierBalance });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};


// POST /api/v1/purchases/:id/revise-price
// Body: { items: [{ id: <purchase_item id>, unit_cost: <new rate> }], note?, dry_run? }
//
// Revises the rate of one or more items on an existing purchase (e.g. supplier
// gave a discount at payment time, or a rate was entered wrongly) and keeps
// everything that depends on it in sync, inside ONE transaction:
//   purchase_items.unit_cost -> purchases.total_amount / payment_status
//   -> supplier_ledger (purchase row + running balance of later rows)
//   -> suppliers.balance
//   -> products.base_cost and already-sold sale_items.unit_cost (only when safe)
// No cash moves, so the cash register is NOT touched.
// dry_run=true runs everything, returns the effects, then rolls back.
exports.revisePurchasePrice = async (req, res) => {
  const client = await getClient();
  const round2 = n => Math.round((parseFloat(n) + Number.EPSILON) * 100) / 100;
  const dryRun = req.body.dry_run === true;
  try {
    await client.query('BEGIN');
    const { items: changes, note } = req.body;
    if (!Array.isArray(changes) || !changes.length) throw new Error('No price changes provided');

    const pRes = await client.query('SELECT * FROM purchases WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!pRes.rows.length) throw new Error('Purchase not found');
    const p = pRes.rows[0];

    const itemsRes = await client.query(
      `SELECT pi.id, pi.product_id, pi.qty, pi.unit_cost,
              pr.name AS product_name, pr.brand, pr.base_cost
       FROM purchase_items pi
       JOIN products pr ON pr.id = pi.product_id
       WHERE pi.purchase_id = $1`, [p.id]
    );
    const itemById = {};
    itemsRes.rows.forEach(r => { itemById[r.id] = r; });

    // ── Validate and collect the real changes ────────────────────────
    const seen = new Set();
    const changed = [];
    for (const c of changes) {
      const it = itemById[c.id];
      if (!it) throw new Error('One of the items does not belong to this purchase');
      if (seen.has(c.id)) throw new Error('Same item sent twice');
      seen.add(c.id);
      const newCost = round2(c.unit_cost);
      if (!isFinite(newCost) || newCost <= 0) throw new Error(`Invalid rate for ${it.product_name}`);
      const oldCost = round2(it.unit_cost);
      if (newCost === oldCost) continue;
      changed.push({ it, oldCost, newCost, qty: parseFloat(it.qty) || 1 });
    }
    if (!changed.length) throw new Error('No price change found');

    // Only the difference created by the edited items is applied, so any
    // older mismatch elsewhere is left exactly as it was.
    const delta    = round2(changed.reduce((s, c) => s + c.qty * (c.newCost - c.oldCost), 0));
    const oldTotal = round2(p.total_amount);
    const newTotal = round2(oldTotal + delta);
    if (newTotal <= 0) throw new Error('Revised total must be greater than 0');

    // ── 1. Items ─────────────────────────────────────────────────────
    for (const c of changed) {
      await client.query('UPDATE purchase_items SET unit_cost = $1 WHERE id = $2', [c.newCost, c.it.id]);
    }

    // ── 2. Purchase header (amount_due is a generated column — not touched)
    const paid      = round2(p.amount_paid);
    const newStatus = paid >= newTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const today     = new Date().toISOString().split('T')[0];
    const noteLine  = `[Price revised ${today}: ${oldTotal} -> ${newTotal}]${note ? ' ' + note : ''}`;
    const newNotes  = p.notes ? `${p.notes}\n${noteLine}` : noteLine;
    await client.query(
      'UPDATE purchases SET total_amount = $1, payment_status = $2, notes = $3 WHERE id = $4',
      [newTotal, newStatus, newNotes, p.id]
    );

    // ── 3. Supplier ledger: purchase row, then shift later rows ──────
    const lRes = await client.query(
      `SELECT id, supplier_id FROM supplier_ledger
       WHERE reference_id = $1 AND transaction_type = 'purchase' AND reference_type = 'purchase'
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE`, [p.id]
    );
    if (!lRes.rows.length) {
      throw new Error('Supplier ledger entry for this purchase was not found, so it cannot be revised safely');
    }
    const le = lRes.rows[0];

    await client.query(
      `UPDATE supplier_ledger
       SET amount = amount + $1,
           balance_after = balance_after + $1,
           description = COALESCE(description, '') || $2
       WHERE id = $3`,
      [delta, ` (rate revised ${oldTotal} -> ${newTotal})`, le.id]
    );

    // Rows displayed after the purchase row (later date, or same date and later
    // time, or this purchase's own payment row created in the same moment).
    // Compared inside SQL so timestamp precision is never lost.
    await client.query(
      `UPDATE supplier_ledger sl
       SET balance_after = sl.balance_after + $1
       FROM supplier_ledger anchor
       WHERE anchor.id = $2
         AND sl.supplier_id = anchor.supplier_id
         AND sl.id <> anchor.id
         AND (
              sl.transaction_date > anchor.transaction_date
           OR (sl.transaction_date = anchor.transaction_date AND sl.created_at > anchor.created_at)
           OR (sl.transaction_date = anchor.transaction_date AND sl.created_at = anchor.created_at AND sl.reference_id = $3)
         )`,
      [delta, le.id, p.id]
    );

    // ── 4. Supplier balance ──────────────────────────────────────────
    const sRes = await client.query(
      'UPDATE suppliers SET balance = balance + $1 WHERE id = $2 RETURNING balance',
      [delta, p.supplier_id]
    );
    const supplierBalanceAfter = parseFloat(sRes.rows[0].balance);

    // ── 5. Product cost + already-sold sale cost (only when safe) ────
    const costUpdated = [];
    const costSkipped = [];
    for (const c of changed) {
      const label = `${c.it.brand ? c.it.brand + ' ' : ''}${c.it.product_name}`;

      const cnt = await client.query(
        'SELECT COUNT(*)::int AS n FROM purchase_items WHERE product_id = $1', [c.it.product_id]
      );
      if (cnt.rows[0].n !== 1) {
        costSkipped.push({ product: label, reason: 'Product appears in more than one purchase line, so its cost was left as is' });
        continue;
      }
      const baseNow = c.it.base_cost == null ? null : round2(c.it.base_cost);
      if (baseNow !== c.oldCost) {
        costSkipped.push({ product: label, reason: `Product cost (${baseNow === null ? 'empty' : baseNow}) differs from this purchase rate (${c.oldCost}) — probably edited manually, so it was left as is` });
        continue;
      }

      await client.query('UPDATE products SET base_cost = $1 WHERE id = $2', [c.newCost, c.it.product_id]);
      const sold = await client.query(
        `UPDATE sale_items SET unit_cost = $1
         WHERE product_id = $2 AND ROUND(unit_cost::numeric, 2) = $3
         RETURNING id`,
        [c.newCost, c.it.product_id, c.oldCost]
      );
      costUpdated.push({ product: label, old_cost: c.oldCost, new_cost: c.newCost, sales_updated: sold.rowCount });
    }

    const result = {
      dry_run: dryRun,
      purchase_number: p.purchase_number,
      old_total: oldTotal,
      new_total: newTotal,
      delta,
      amount_paid: paid,
      new_payment_status: newStatus,
      overpaid: paid > newTotal ? round2(paid - newTotal) : 0,
      supplier_balance_after: supplierBalanceAfter,
      items: changed.map(c => ({
        id: c.it.id,
        product: `${c.it.brand ? c.it.brand + ' ' : ''}${c.it.product_name}`,
        qty: c.qty, old_cost: c.oldCost, new_cost: c.newCost,
      })),
      cost_updated: costUpdated,
      cost_skipped: costSkipped,
    };

    if (dryRun) await client.query('ROLLBACK');
    else        await client.query('COMMIT');

    res.json({
      success: true,
      message: dryRun ? 'Preview only — nothing was saved' : 'Purchase price revised',
      data: result,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};
