// src/routes/reports.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

// helper: build date + shop param arrays safely
function buildFilters(req, tableAlias = '') {
  const { from, to, shop_id } = req.query;
  const t   = tableAlias ? tableAlias + '.' : '';
  const params = [];
  let idx = 1;
  let sql = '';
  if (from)    { sql += ` AND ${t}sale_date >= $${idx++}`;    params.push(from); }
  if (to)      { sql += ` AND ${t}sale_date <= $${idx++}`;    params.push(to); }
  if (shop_id) { sql += ` AND ${t}shop_id = $${idx++}`;       params.push(shop_id); }
  return { sql, params, nextIdx: idx };
}

// ── GET /api/v1/reports/summary ──────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;

    const shopSales = shop_id ? `AND si.shop_id = '${shop_id}'` : '';
    const shopPurch = shop_id ? `AND p.shop_id  = '${shop_id}'` : '';
    const shopExp   = shop_id ? `AND shop_id    = '${shop_id}'` : '';

    const dateS = from && to ? `AND si.sale_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND si.sale_date >= '${from}'` : to ? `AND si.sale_date <= '${to}'` : '';
    const dateP = from && to ? `AND p.purchase_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND p.purchase_date >= '${from}'` : to ? `AND p.purchase_date <= '${to}'` : '';
    const dateE = from && to ? `AND expense_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND expense_date >= '${from}'` : to ? `AND expense_date <= '${to}'` : '';

    const [sales, expenses, purchases, byShop] = await Promise.all([
      query(`SELECT COALESCE(SUM(total_amount),0) as total_sales,
               COALESCE(SUM(amount_paid),0) as total_collected,
               COALESCE(SUM(amount_due),0)  as total_due,
               COUNT(*) as invoice_count
             FROM sales_invoices si
             WHERE payment_status != 'returned' ${dateS} ${shopSales}`),
      query(`SELECT COALESCE(SUM(amount),0) as total_expenses, COUNT(*) as expense_count
             FROM expenses WHERE 1=1 ${dateE} ${shopExp}`),
      query(`SELECT COALESCE(SUM(total_amount),0) as total_purchases, COUNT(*) as purchase_count
             FROM purchases p WHERE 1=1 ${dateP} ${shopPurch}`),
      // Per-shop breakdown
      query(`
        SELECT sh.name as shop_name,
               COALESCE(SUM(si.total_amount),0)  as sales,
               COALESCE(SUM(si.amount_paid),0)   as collected,
               COUNT(si.id)                       as invoice_count
        FROM shops sh
        LEFT JOIN sales_invoices si ON si.shop_id = sh.id
          AND si.payment_status != 'returned' ${dateS}
        WHERE sh.is_active = true
        GROUP BY sh.id, sh.name
        ORDER BY sh.name
      `),
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
        profit:    { gross: totalSales - totalPurchases, net: totalSales - totalPurchases - totalExpenses },
        by_shop:   byShop.rows,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/sales ────────────────────────────────
router.get('/sales', async (req, res) => {
  try {
    const { from, to, payment_status, shop_id } = req.query;
    let sql = `
      SELECT si.*, c.name as customer_name,
             COUNT(s.id) as item_count,
             sh.name as shop_name,
             u.name  as sold_by
      FROM sales_invoices si
      LEFT JOIN customers  c  ON c.id  = si.customer_id
      LEFT JOIN sale_items s  ON s.invoice_id = si.id
      LEFT JOIN shops      sh ON sh.id = si.shop_id
      LEFT JOIN users      u  ON u.id  = si.user_id
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

// ── GET /api/v1/reports/purchases ────────────────────────────
router.get('/purchases', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let sql = `
      SELECT p.*, s.name as supplier_name,
             COUNT(pi.id) as item_count,
             sh.name as shop_name
      FROM purchases p
      JOIN suppliers s         ON s.id  = p.supplier_id
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      LEFT JOIN shops sh       ON sh.id = p.shop_id
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

// ── GET /api/v1/reports/expenses ─────────────────────────────
router.get('/expenses', async (req, res) => {
  try {
    const { from, to, shop_id, category_id } = req.query;
    let sql = `
      SELECT e.*, sh.name as shop_name, ec.name as category_name
      FROM expenses e
      LEFT JOIN shops s              ON s.id  = e.shop_id
      LEFT JOIN shops sh             ON sh.id = e.shop_id
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (from)        { sql += ` AND e.expense_date >= $${idx++}`; params.push(from); }
    if (to)          { sql += ` AND e.expense_date <= $${idx++}`; params.push(to); }
    if (shop_id)     { sql += ` AND e.shop_id = $${idx++}`;       params.push(shop_id); }
    if (category_id) { sql += ` AND e.category_id = $${idx++}`;   params.push(category_id); }
    sql += ` ORDER BY e.expense_date DESC`;
    const result = await query(sql, params);

    // Category breakdown
    const breakdown = await query(`
      SELECT ec.name as category, COALESCE(SUM(e.amount),0) as total, COUNT(*) as count
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE 1=1
        ${from    ? `AND e.expense_date >= '${from}'`    : ''}
        ${to      ? `AND e.expense_date <= '${to}'`      : ''}
        ${shop_id ? `AND e.shop_id = '${shop_id}'`       : ''}
      GROUP BY ec.name
      ORDER BY total DESC
    `);

    res.json({ success: true, data: result.rows, category_breakdown: breakdown.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/inventory ────────────────────────────
router.get('/inventory', async (req, res) => {
  try {
    const { shop_id } = req.query;
    let sql = `
      SELECT i.*, p.name, p.brand, p.model, p.category, p.selling_price, p.base_cost,
             sh.name as shop_name,
             CASE WHEN i.quantity = 0           THEN 'out_of_stock'
                  WHEN i.quantity <= i.min_stock THEN 'low_stock'
                  ELSE 'in_stock' END as stock_status,
             (i.quantity * p.base_cost)     as cost_value,
             (i.quantity * p.selling_price) as retail_value
      FROM inventory i
      JOIN products p    ON p.id  = i.product_id
      LEFT JOIN shops sh ON sh.id = i.shop_id
      WHERE p.is_active = true
    `;
    const params = [];
    if (shop_id) { sql += ` AND i.shop_id = $1`; params.push(shop_id); }
    sql += ` ORDER BY sh.name, p.name`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/salesperson ──────────────────────────
router.get('/salesperson', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let sql = `
      SELECT u.id, u.name as salesperson,
             sh.name as shop_name,
             COUNT(si.id)                        as invoices,
             COALESCE(SUM(si.total_amount),  0)  as total_sales,
             COALESCE(SUM(si.amount_paid),   0)  as collected,
             COALESCE(SUM(si.amount_due),    0)  as outstanding
      FROM users u
      LEFT JOIN sales_invoices si ON si.user_id = u.id
        AND si.payment_status != 'returned'
        ${from    ? `AND si.sale_date >= '${from}'`    : ''}
        ${to      ? `AND si.sale_date <= '${to}'`      : ''}
        ${shop_id ? `AND si.shop_id = '${shop_id}'`    : ''}
      LEFT JOIN shops sh ON sh.id = si.shop_id
      WHERE u.is_active = true
      GROUP BY u.id, u.name, sh.name
      ORDER BY total_sales DESC
    `;
    const result = await query(sql);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
