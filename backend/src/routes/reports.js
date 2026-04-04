// src/routes/reports.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

// ── GET /api/v1/reports/summary ──────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let shopFilter = shop_id ? `AND shop_id = '${shop_id}'` : '';

    const dateFilter = from && to ? `AND sale_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND sale_date >= '${from}'` : to ? `AND sale_date <= '${to}'` : '';
    const expFilter  = from && to ? `AND expense_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND expense_date >= '${from}'` : to ? `AND expense_date <= '${to}'` : '';
    const purFilter  = from && to ? `AND purchase_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND purchase_date >= '${from}'` : to ? `AND purchase_date <= '${to}'` : '';

    const [sales, expenses, purchases] = await Promise.all([
      query(`SELECT COALESCE(SUM(total_amount),0) as total_sales,
        COALESCE(SUM(amount_paid),0) as total_collected,
        COALESCE(SUM(amount_due),0) as total_due, COUNT(*) as invoice_count
        FROM sales_invoices WHERE payment_status != 'returned' ${dateFilter} ${shopFilter}`),
      query(`SELECT COALESCE(SUM(amount),0) as total_expenses, COUNT(*) as expense_count
             FROM expenses WHERE 1=1 ${expFilter}`),
      query(`SELECT COALESCE(SUM(total_amount),0) as total_purchases, COUNT(*) as purchase_count
             FROM purchases WHERE 1=1 ${purFilter} ${shopFilter}`),
    ]);

    const totalSales     = parseFloat(sales.rows[0].total_sales);
    const totalExpenses  = parseFloat(expenses.rows[0].total_expenses);
    const totalPurchases = parseFloat(purchases.rows[0].total_purchases);

    res.json({
      success: true,
      data: {
        sales:     { total: totalSales, collected: parseFloat(sales.rows[0].total_collected), due: parseFloat(sales.rows[0].total_due), count: parseInt(sales.rows[0].invoice_count) },
        expenses:  { total: totalExpenses, count: parseInt(expenses.rows[0].expense_count) },
        purchases: { total: totalPurchases, count: parseInt(purchases.rows[0].purchase_count) },
        profit:    { gross: totalSales - totalPurchases, net: totalSales - totalPurchases - totalExpenses }
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/sales ────────────────────────────────────────────────
router.get('/sales', async (req, res) => {
  try {
    const { from, to, payment_status, shop_id } = req.query;
    let sql = `
      SELECT si.*, c.name as customer_name, COUNT(s.id) as item_count,
             sh.name as shop_name, u.name as sold_by
      FROM sales_invoices si
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN sale_items s ON s.invoice_id = si.id
      LEFT JOIN shops sh ON sh.id = si.shop_id
      LEFT JOIN users u ON u.id = si.user_id
      WHERE si.payment_status != 'returned'
    `;
    const params = [];
    let idx = 1;
    if (from)           { sql += ` AND si.sale_date >= $${idx++}`;      params.push(from); }
    if (to)             { sql += ` AND si.sale_date <= $${idx++}`;      params.push(to); }
    if (payment_status) { sql += ` AND si.payment_status = $${idx++}`;  params.push(payment_status); }
    if (shop_id)        { sql += ` AND si.shop_id = $${idx++}`;         params.push(shop_id); }
    sql += ` GROUP BY si.id, c.name, sh.name, u.name ORDER BY si.sale_date DESC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/purchases ────────────────────────────────────────────
router.get('/purchases', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let sql = `
      SELECT p.*, s.name as supplier_name, COUNT(pi.id) as item_count,
             sh.name as shop_name
      FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      LEFT JOIN shops sh ON sh.id = p.shop_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (from)    { sql += ` AND p.purchase_date >= $${idx++}`; params.push(from); }
    if (to)      { sql += ` AND p.purchase_date <= $${idx++}`; params.push(to); }
    if (shop_id) { sql += ` AND p.shop_id = $${idx++}`;        params.push(shop_id); }
    sql += ` GROUP BY p.id, s.name, sh.name ORDER BY p.purchase_date DESC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/expenses ─────────────────────────────────────────────
router.get('/expenses', async (req, res) => {
  try {
    const { from, to, category } = req.query;
    let sql = `SELECT * FROM expenses WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (from)     { sql += ` AND expense_date >= $${idx++}`; params.push(from); }
    if (to)       { sql += ` AND expense_date <= $${idx++}`; params.push(to); }
    if (category) { sql += ` AND category = $${idx++}`;      params.push(category); }
    sql += ` ORDER BY expense_date DESC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/top-products ─────────────────────────────────────────
router.get('/top-products', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let sql = `
      SELECT p.name, p.brand, p.model,
        SUM(si.qty) as units_sold,
        SUM(si.qty * si.unit_price) as revenue,
        SUM(si.qty * si.unit_cost)  as cost,
        SUM(si.qty * (si.unit_price - si.unit_cost)) as profit
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      JOIN sales_invoices inv ON inv.id = si.invoice_id
      WHERE inv.payment_status != 'returned'
    `;
    const params = [];
    let idx = 1;
    if (from)    { sql += ` AND inv.sale_date >= $${idx++}`; params.push(from); }
    if (to)      { sql += ` AND inv.sale_date <= $${idx++}`; params.push(to); }
    if (shop_id) { sql += ` AND inv.shop_id = $${idx++}`;    params.push(shop_id); }
    sql += ` GROUP BY p.id, p.name, p.brand, p.model ORDER BY units_sold DESC LIMIT 20`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/salesperson ──────────────────────────────────────────
router.get('/salesperson', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let sql = `
      SELECT 
        u.id, u.name as salesperson,
        COUNT(si.id) as invoice_count,
        COALESCE(SUM(si.total_amount), 0) as total_revenue,
        COALESCE(SUM(si.amount_paid), 0) as total_collected,
        COALESCE(SUM(si.amount_due), 0) as total_due,
        COALESCE(SUM(si.discount), 0) as total_discount,
        COUNT(DISTINCT si.customer_id) as unique_customers,
        COALESCE(SUM(items.item_count), 0) as total_items_sold
      FROM users u
      LEFT JOIN sales_invoices si ON si.user_id = u.id 
        AND si.payment_status != 'returned'
    `;
    const params = [];
    let idx = 1;
    if (from)    { sql += ` AND si.sale_date >= $${idx++}`; params.push(from); }
    if (to)      { sql += ` AND si.sale_date <= $${idx++}`; params.push(to); }
    if (shop_id) { sql += ` AND si.shop_id = $${idx++}`;    params.push(shop_id); }
    sql += `
      LEFT JOIN (
        SELECT invoice_id, COUNT(*) as item_count FROM sale_items GROUP BY invoice_id
      ) items ON items.invoice_id = si.id
      WHERE u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_revenue DESC
    `;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
