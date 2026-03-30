// src/controllers/salesController.js
// Business Logic: Create invoice → sale_items → decrease inventory_stock

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
    if (from) { sql += ` AND si.sale_date >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND si.sale_date <= $${idx++}`; params.push(to); }
    if (payment_status) { sql += ` AND si.payment_status = $${idx++}`; params.push(payment_status); }
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
    if (!invoice.rows.length) return res.status(404).json({ success: false, message: 'Invoice not found' });

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
// Body: { customer_id, sale_date, discount, payment_method, amount_paid, notes,
//         items: [{product_id, inventory_stock_id, imei, qty, unit_price, discount}] }
exports.createSale = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { customer_id, sale_date, discount = 0, payment_method = 'cash', amount_paid = 0, notes, items } = req.body;

    if (!items || !items.length) throw new Error('At least one sale item is required');

    // Validate and get stock for each item
    const enrichedItems = [];
    for (const item of items) {
      if (!item.product_id || !item.unit_price) throw new Error('Each item needs product_id and unit_price');

      let stockRow = null;
      if (item.inventory_stock_id) {
        const stock = await client.query(
          `SELECT * FROM inventory_stock WHERE id = $1 AND status = 'in_stock' AND qty_remaining >= $2`,
          [item.inventory_stock_id, item.qty || 1]
        );
        if (!stock.rows.length) throw new Error(`Stock item ${item.inventory_stock_id} not available or insufficient qty`);
        stockRow = stock.rows[0];
      }
      enrichedItems.push({ ...item, stockRow });
    }

    // Calculate totals
    const subtotal = enrichedItems.reduce((sum, item) => sum + ((item.qty || 1) * item.unit_price), 0);
    const totalAmount = subtotal - discount;
    const invoiceNumber = await generateInvoiceNumber();

    // 1. Create invoice
    const invoice = await client.query(
      `INSERT INTO sales_invoices (invoice_number, customer_id, sale_date, subtotal, discount, total_amount, amount_paid, payment_method, payment_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        invoiceNumber, customer_id, sale_date || new Date().toISOString().split('T')[0],
        subtotal, discount, totalAmount, amount_paid, payment_method,
        amount_paid >= totalAmount ? 'paid' : amount_paid > 0 ? 'partial' : 'unpaid',
        notes
      ]
    );
    const invoiceId = invoice.rows[0].id;

    // 2. Create sale items and update inventory
    for (const item of enrichedItems) {
      const qty = item.qty || 1;
      const unitCost = item.stockRow ? item.stockRow.unit_cost : 0;

      await client.query(
        `INSERT INTO sale_items (invoice_id, product_id, inventory_stock_id, imei, qty, unit_cost, unit_price, discount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [invoiceId, item.product_id, item.inventory_stock_id, item.imei, qty, unitCost, item.unit_price, item.discount || 0]
      );

      // Decrease inventory stock
      if (item.inventory_stock_id) {
        const newQtySold = (item.stockRow.qty_sold || 0) + qty;
        const isFullySold = newQtySold >= item.stockRow.qty_purchased;
        await client.query(
          `UPDATE inventory_stock SET qty_sold = $1, status = $2 WHERE id = $3`,
          [newQtySold, isFullySold ? 'sold' : 'in_stock', item.inventory_stock_id]
        );
      }
    }

    // 3. Update customer balance if amount_due > 0
    if (customer_id && amount_paid < totalAmount) {
      const amountDue = totalAmount - amount_paid;
      await client.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [amountDue, customer_id]);
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
