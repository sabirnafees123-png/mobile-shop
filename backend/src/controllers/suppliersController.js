// src/controllers/suppliersController.js
const { query } = require('../config/database');

exports.getAll = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM suppliers WHERE is_active = true ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getOne = async (req, res) => {
  try {
    const supplier = await query(`SELECT * FROM suppliers WHERE id = $1`, [req.params.id]);
    if (!supplier.rows.length) return res.status(404).json({ success: false, message: 'Supplier not found' });
    
    const ledger = await query(
      `SELECT * FROM supplier_ledger WHERE supplier_id = $1 ORDER BY transaction_date DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...supplier.rows[0], ledger: ledger.rows } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name, phone, email, address, city, country, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Supplier name required' });
    const result = await query(
      `INSERT INTO suppliers (name, phone, email, address, city, country, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, phone, email, address, city || 'Sharjah', country || 'UAE', notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};



// Add this to backend/src/controllers/salesController.js

// POST /api/v1/sales/:id/return
exports.returnSale = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { note } = req.body;
    const invoiceId = req.params.id;

    // Get invoice
    const invoice = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [invoiceId]);
    if (!invoice.rows.length)
      throw new Error('Invoice not found');

    const inv = invoice.rows[0];

    if (inv.payment_status === 'returned')
      throw new Error('Invoice already returned');

    // Get items
    const items = await client.query('SELECT * FROM sale_items WHERE invoice_id = $1', [invoiceId]);

    // Restore inventory for each item
    for (const item of items.rows) {
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, last_updated = NOW() WHERE product_id = $2`,
        [item.qty, item.product_id]
      );
      // Log movement
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, note, created_by)
         VALUES ($1, 'in', $2, $3, $4)`,
        [item.product_id, item.qty, `Return: ${inv.invoice_number} — ${note || 'Customer return'}`, req.user?.id]
      );
    }

    // Reverse customer balance if any was added
    if (inv.customer_id && inv.amount_due > 0) {
      await client.query(
        `UPDATE customers SET balance = balance - $1 WHERE id = $2`,
        [inv.amount_due, inv.customer_id]
      );
    }

    // Mark invoice as returned
    await client.query(
      `UPDATE sales_invoices SET payment_status = 'returned', notes = CONCAT(COALESCE(notes,''), ' | RETURNED: ', $1) WHERE id = $2`,
      [note || 'Customer return', invoiceId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Return processed successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

module.exports = { getAllSales, getSale, createSale, returnSale };
  try {
    const { name, phone, email, address, city, country, notes } = req.body;
    const result = await query(
      `UPDATE suppliers SET name=$1, phone=$2, email=$3, address=$4, city=$5, country=$6, notes=$7 WHERE id=$8 RETURNING *`,
      [name, phone, email, address, city, country, notes, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
