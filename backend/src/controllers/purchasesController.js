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
      `INSERT INTO purchases (purchase_number, supplier_id, purchase_date, total_amount, amount_paid, payment_status, notes, shop_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [purchaseNumber, supplier_id,
       purchase_date || new Date().toISOString().split('T')[0],
       totalAmount, amount_paid,
       amount_paid >= totalAmount ? 'paid' : amount_paid > 0 ? 'partial' : 'unpaid',
       notes, parseInt(items[0].shop_id)]
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

    // ── Batch inventory upsert ────────────────────────────────────────
    const invMap = {};
    resolvedItems.forEach(item => {
      const key = `${item.finalProductId}:${parseInt(item.shop_id)}`;
      if (!invMap[key]) invMap[key] = { product_id: item.finalProductId, shop_id: parseInt(item.shop_id), qty: 0 };
      invMap[key].qty += item.qty || 1;
    });
    const invRows   = Object.values(invMap);
    const invValues = invRows.map((_, i) => { const b=i*3; return `($${b+1},$${b+2},$${b+3},5)`; }).join(',');
    const invParams = invRows.flatMap(r => [r.product_id, r.shop_id, r.qty]);
    await client.query(
      `INSERT INTO inventory (product_id, shop_id, quantity, min_stock) VALUES ${invValues}
       ON CONFLICT (product_id, shop_id)
       DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, last_updated = NOW()`,
      invParams
    );

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
