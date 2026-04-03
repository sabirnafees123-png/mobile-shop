// src/controllers/salesController.js
const { query, getClient } = require('../config/database');

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) as count FROM sales_invoices WHERE EXTRACT(YEAR FROM sale_date) = $1`,
    [year]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `INV-${year}-${String(count).padStart(4, '0')}`;
}

// GET /api/v1/sales
exports.getAllSales = async (req, res) => {
  try {
    const { from, to, payment_status } = req.query;
    let sql = `
      SELECT si.*, c.name as customer_name,
             COUNT(s.id) as item_count
      FROM sales_invoices si
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN sale_items s ON s.invoice_id = si.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (from)           { sql += ` AND si.sale_date >= $${idx++}`;        params.push(from); }
    if (to)             { sql += ` AND si.sale_date <= $${idx++}`;        params.push(to); }
    if (payment_status) { sql += ` AND si.payment_status = $${idx++}`;    params.push(payment_status); }
    sql += ` GROUP BY si.id, c.name ORDER BY si.sale_date DESC, si.created_at DESC`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/sales/:id
exports.getSale = async (req, res) => {
  try {
    const invoice = await query(
      `SELECT si.*, c.name as customer_name, c.phone as customer_phone
       FROM sales_invoices si
       LEFT JOIN customers c ON c.id = si.customer_id
       WHERE si.id = $1`,
      [req.params.id]
    );
    if (!invoice.rows.length)
      return res.status(404).json({ success: false, message: 'Invoice not found' });

    const items = await query(
      `SELECT s.*, p.name as product_name, p.brand, p.model
       FROM sale_items s JOIN products p ON p.id = s.product_id
       WHERE s.invoice_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...invoice.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/sales
exports.createSale = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      customer_id, customer_name, customer_phone,
      sale_date, discount = 0, payment_method = 'cash',
      amount_paid = 0, notes, items
    } = req.body;

    if (!items || !items.length)
      throw new Error('At least one sale item is required');

    let finalCustomerId = customer_id || null;
    if (!customer_id && customer_name) {
      const existing = customer_phone
        ? await client.query('SELECT id FROM customers WHERE phone = $1', [customer_phone])
        : { rows: [] };
      if (existing.rows.length) {
        finalCustomerId = existing.rows[0].id;
      } else {
        const newCust = await client.query(
          `INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id`,
          [customer_name, customer_phone || null]
        );
        finalCustomerId = newCust.rows[0].id;
      }
    }

    const enrichedItems = [];
    for (const item of items) {
      if (!item.product_id) throw new Error('Each item needs a product');
      enrichedItems.push({ ...item });
    }

    const subtotal      = enrichedItems.reduce((sum, i) => sum + ((i.qty || 1) * i.unit_price), 0);
    const totalAmount   = subtotal - parseFloat(discount);
    const paid          = parseFloat(amount_paid);
    const amountDue     = totalAmount - paid;
    const invoiceNumber = await generateInvoiceNumber();

    const invoice = await client.query(
      `INSERT INTO sales_invoices
        (invoice_number, customer_id, sale_date, subtotal, discount, total_amount,
         amount_paid, amount_due, payment_method, payment_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        invoiceNumber, finalCustomerId,
        sale_date || new Date().toISOString().split('T')[0],
        subtotal, discount, totalAmount, paid, amountDue,
        payment_method,
        paid >= totalAmount ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        notes
      ]
    );
    const invoiceId = invoice.rows[0].id;

    for (const item of enrichedItems) {
      const qty = parseInt(item.qty) || 1;
      await client.query(
        `INSERT INTO sale_items (invoice_id, product_id, qty, unit_cost, unit_price, discount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [invoiceId, item.product_id, qty, 0, item.unit_price, item.discount || 0]
      );
      await client.query(
        `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW()
         WHERE product_id = $2 AND quantity >= $1`,
        [qty, item.product_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, note, created_by)
         VALUES ($1, 'out', $2, $3, $4)`,
        [item.product_id, qty, `Sale ${invoiceNumber}`, req.user?.id]
      );
    }

    if (finalCustomerId && amountDue > 0) {
      await client.query(
        `UPDATE customers SET balance = balance + $1 WHERE id = $2`,
        [amountDue, finalCustomerId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: `Invoice ${invoiceNumber} created successfully`,
      data: invoice.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

// POST /api/v1/sales/:id/return
exports.returnSale = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { note } = req.body;
    const invoiceId = req.params.id;

    const invoice = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [invoiceId]);
    if (!invoice.rows.length) throw new Error('Invoice not found');

    const inv = invoice.rows[0];
    if (inv.payment_status === 'returned') throw new Error('Invoice already returned');

    const items = await client.query('SELECT * FROM sale_items WHERE invoice_id = $1', [invoiceId]);

    for (const item of items.rows) {
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, last_updated = NOW() WHERE product_id = $2`,
        [item.qty, item.product_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, note, created_by)
         VALUES ($1, 'in', $2, $3, $4)`,
        [item.product_id, item.qty, `Return: ${inv.invoice_number} — ${note || 'Customer return'}`, req.user?.id]
      );
    }

    if (inv.customer_id && inv.amount_due > 0) {
      await client.query(
        `UPDATE customers SET balance = balance - $1 WHERE id = $2`,
        [inv.amount_due, inv.customer_id]
      );
    }

    await client.query(
      `UPDATE sales_invoices SET payment_status = 'returned',
       notes = CONCAT(COALESCE(notes,''), ' | RETURNED: ', $1) WHERE id = $2`,
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
