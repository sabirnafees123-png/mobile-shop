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
    let sql = `
      SELECT p.*, s.name as supplier_name,
             COUNT(pi.id) as item_count
      FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (shop_id) {
      // Filter purchases that have at least one item going to this shop
      sql += ` AND p.id IN (SELECT purchase_id FROM purchase_items WHERE shop_id = $1)`;
      params.push(parseInt(shop_id));
    }
    sql += ` GROUP BY p.id, s.name ORDER BY p.purchase_date DESC, p.created_at DESC`;
    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, data: result.rows });
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
      `SELECT pi.*, pr.name as product_name, pr.brand, pr.model, pr.color,
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
// Each line item now has its own shop_id
exports.createPurchase = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { supplier_id, purchase_date, amount_paid = 0, notes, items } = req.body;

    if (!supplier_id) throw new Error('supplier_id is required');
    if (!items || !items.length) throw new Error('At least one purchase item is required');
    if (items.some(i => !i.shop_id)) throw new Error('Each item must have a shop selected');

    const totalAmount    = items.reduce((sum, item) => sum + (item.qty * item.unit_cost), 0);
    const purchaseNumber = await generatePurchaseNumber();

    // Create purchase header (no shop_id at header level anymore)
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

    // Create purchase items — each with its own shop
    for (const item of items) {
      if (!item.product_id || !item.unit_cost)
        throw new Error('Each item needs product_id and unit_cost');

      await client.query(
        `INSERT INTO purchase_items
          (purchase_id, product_id, serial_number, imei, qty, unit_cost, recommended_selling_price, shop_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [purchaseId, item.product_id,
         item.serial_number || null,
         item.imei || null,
         item.qty || 1, item.unit_cost,
         item.recommended_selling_price || 0,
         parseInt(item.shop_id)]
      );

      if (item.recommended_selling_price && item.recommended_selling_price > 0) {
        await client.query(
          `UPDATE products SET selling_price = $1 WHERE id = $2`,
          [item.recommended_selling_price, item.product_id]
        );
      }

      // Also update serial number on product if provided
      if (item.serial_number) {
        await client.query(
          `UPDATE products SET serial_number = $1 WHERE id = $2`,
          [item.serial_number, item.product_id]
        );
      }

      // Upsert inventory for THIS ITEM'S SHOP
      await client.query(
        `INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
         VALUES ($1, $2, $3, 5)
         ON CONFLICT (product_id, shop_id)
         DO UPDATE SET quantity = inventory.quantity + $3, last_updated = NOW()`,
        [item.product_id, parseInt(item.shop_id), item.qty || 1]
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
      `UPDATE purchases SET amount_paid = $1, payment_status = $2 WHERE id = $3`,
      [newAmountPaid, newAmountPaid >= p.total_amount ? 'paid' : 'partial', req.params.id]
    );

    const supplier = await client.query('SELECT balance FROM suppliers WHERE id = $1', [p.supplier_id]);
    const newSupplierBalance = parseFloat(supplier.rows[0].balance) - parseFloat(amount);
    await client.query('UPDATE suppliers SET balance = $1 WHERE id = $2', [newSupplierBalance, p.supplier_id]);

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
