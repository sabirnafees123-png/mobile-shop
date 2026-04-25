// src/controllers/purchasesController.js
const { query, getClient } = require('../config/database');

async function generatePurchaseNumber() {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) as count FROM purchases WHERE EXTRACT(YEAR FROM purchase_date) = $1`, [year]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `PUR-${year}-${String(count).padStart(3, '0')}`;
}

// GET /api/v1/purchases
exports.getAllPurchases = async (req, res) => {
  try {
    const { shop_id } = req.query;

    // --- pagination params ---
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.max(1, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    // --- shared WHERE fragment ---
    let where = `WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (shop_id) {
      where += ` AND p.id IN (SELECT purchase_id FROM purchase_items WHERE shop_id = $${idx++})`;
      params.push(parseInt(shop_id));
    }

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

    const totalAmount    = items.reduce((sum, item) => sum + ((item.qty || 1) * item.unit_cost), 0);
    const purchaseNumber = await generatePurchaseNumber();

    // Create purchase header
    const purchase = await client.query(
      `INSERT INTO purchases (purchase_number, supplier_id, purchase_date, total_amount, amount_paid, payment_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [purchaseNumber, supplier_id,
       purchase_date || new Date().toISOString().split('T')[0],
       totalAmount, amount_paid,
       amount_paid >= totalAmount ? 'paid' : amount_paid > 0 ? 'partial' : 'unpaid',
       notes]
    );
    const purchaseId = purchase.rows[0].id;

    for (const item of items) {
      if (!item.unit_cost) throw new Error('Each item needs a cost price');

      let finalProductId = item.product_id || null;

      // ── Auto product resolution ──────────────────────────────────────
      if (!finalProductId && item.serial_number) {
        // 1. Try to find existing product by serial number
        const existing = await client.query(
          `SELECT id FROM products WHERE serial_number = $1 LIMIT 1`,
          [item.serial_number]
        );
        if (existing.rows.length) {
          finalProductId = existing.rows[0].id;
        }
      }

      if (!finalProductId) {
        // 2. Create new product with provided details
        const productName = item.product_name || item.serial_number || 'Unknown Product';
        const newProduct  = await client.query(
          `INSERT INTO products (name, brand, color, serial_number, type, category, selling_price, base_cost, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
          [productName,
           item.brand || null,
           item.color || null,
           item.serial_number || null,
           item.product_type || 'Used',
           'Mobile Phone',
           item.recommended_selling_price || 0,
           item.unit_cost || 0]
        );
        finalProductId = newProduct.rows[0].id;
      } else {
        // 3. Update existing product's selling price if provided
        if (item.recommended_selling_price && parseFloat(item.recommended_selling_price) > 0) {
          await client.query(
            `UPDATE products SET selling_price = $1, serial_number = COALESCE($2, serial_number) WHERE id = $3`,
            [item.recommended_selling_price, item.serial_number || null, finalProductId]
          );
        }
      }
      // ─────────────────────────────────────────────────────────────────

      await client.query(
        `INSERT INTO purchase_items
          (purchase_id, product_id, serial_number, imei, qty, unit_cost, recommended_selling_price, shop_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [purchaseId, finalProductId,
         item.serial_number || null,
         item.imei || null,
         item.qty || 1,
         item.unit_cost,
         item.recommended_selling_price || 0,
         parseInt(item.shop_id)]
      );

      // Upsert inventory for this item's shop
      await client.query(
        `INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
         VALUES ($1,$2,$3,5)
         ON CONFLICT (product_id, shop_id)
         DO UPDATE SET quantity = inventory.quantity + $3, last_updated = NOW()`,
        [finalProductId, parseInt(item.shop_id), item.qty || 1]
      );
    }

    // Update supplier balance
    const amountDue  = totalAmount - amount_paid;
    const supplier   = await client.query('SELECT balance FROM suppliers WHERE id = $1', [supplier_id]);
    const newBalance = parseFloat(supplier.rows[0].balance) + amountDue;
    await client.query('UPDATE suppliers SET balance = $1 WHERE id = $2', [newBalance, supplier_id]);

    await client.query(
      `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date)
       VALUES ($1,'purchase',$2,'purchase',$3,$4,$5,$6)`,
      [supplier_id, purchaseId, amountDue, newBalance,
       `Purchase ${purchaseNumber} - ${items.length} item(s)`,
       purchase_date || new Date().toISOString().split('T')[0]]
    );

    if (amount_paid > 0) {
      const balAfterPayment = newBalance - amount_paid;
      await client.query(
        `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date)
         VALUES ($1,'payment',$2,'purchase',$3,$4,$5,$6)`,
        [supplier_id, purchaseId, -amount_paid, balAfterPayment,
         `Payment with purchase ${purchaseNumber}`,
         purchase_date || new Date().toISOString().split('T')[0]]
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

// POST /api/v1/purchases/:id/pay
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

    await client.query(
      `INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date)
       VALUES ($1,'payment',$2,'purchase',$3,$4,$5,$6)`,
      [p.supplier_id, p.id, -amount, newSupplierBalance,
       notes || `Payment for ${p.purchase_number}`,
       payment_date || new Date().toISOString().split('T')[0]]
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
