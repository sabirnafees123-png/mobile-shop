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

    const [sales, expenses, purchases, byShop, cogs] = await Promise.all([
      query(`SELECT COALESCE(SUM(total_amount),0) as total_sales,
               COALESCE(SUM(COALESCE(exchange_trade_in_value,0)),0) as total_trade_in,
               COALESCE(SUM(total_amount - COALESCE(exchange_trade_in_value,0)),0) as net_sales,
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
      // COGS — actual unit_cost * qty from sale_items (correct method)
      query(`
        SELECT COALESCE(SUM(sli.unit_cost * sli.qty), 0) as total_cogs
        FROM sale_items sli
        JOIN sales_invoices si ON si.id = sli.invoice_id
        WHERE si.payment_status != 'returned' ${dateS} ${shopSales}
      `),
    ]);

    const totalSales     = parseFloat(sales.rows[0].total_sales);
    const totalExpenses  = parseFloat(expenses.rows[0].total_expenses);
    const totalPurchases = parseFloat(purchases.rows[0].total_purchases);
    const totalCOGS      = parseFloat(cogs.rows[0].total_cogs);
    const grossProfit    = totalSales - totalCOGS;

    res.json({
      success: true,
      data: {
        sales:     { total: totalSales, trade_in: parseFloat(sales.rows[0].total_trade_in), net: parseFloat(sales.rows[0].net_sales), collected: parseFloat(sales.rows[0].total_collected), due: parseFloat(sales.rows[0].total_due), count: parseInt(sales.rows[0].invoice_count) },
        expenses:  { total: totalExpenses, count: parseInt(expenses.rows[0].expense_count) },
        purchases: { total: totalPurchases, count: parseInt(purchases.rows[0].purchase_count) },
        cogs:      totalCOGS,
        profit:    { gross: grossProfit, net: grossProfit - totalExpenses },
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
      SELECT si.*,
             c.name as customer_name,
             COUNT(s.id) as item_count,
             sh.name as shop_name,
             u.name  as sold_by,
             COALESCE(si.exchange_trade_in_value, 0) as trade_in_value,
             si.total_amount as gross_sales,
             si.total_amount - COALESCE(si.exchange_trade_in_value, 0) as net_sales
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
    const { from, to, shop_id, category } = req.query;
    let sql = `
      SELECT e.*, sh.name as shop_name, e.category as category_name
      FROM expenses e
      LEFT JOIN shops sh             ON sh.id = e.shop_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (from)     { sql += ` AND e.expense_date >= $${idx++}`; params.push(from); }
    if (to)       { sql += ` AND e.expense_date <= $${idx++}`; params.push(to); }
    if (shop_id)  { sql += ` AND e.shop_id = $${idx++}`;       params.push(shop_id); }
    if (category) { sql += ` AND e.category = $${idx++}`;      params.push(category); }
    sql += ` ORDER BY e.expense_date DESC`;
    const result = await query(sql, params);

    // Category breakdown
    const bParams = [];
    let bIdx = 1;
    let bSql = `
      SELECT COALESCE(e.category,'Uncategorized') as category, COALESCE(SUM(e.amount),0) as total, COUNT(*) as count
      FROM expenses e
      WHERE 1=1
    `;
    if (from)    { bSql += ` AND e.expense_date >= $${bIdx++}`; bParams.push(from); }
    if (to)      { bSql += ` AND e.expense_date <= $${bIdx++}`; bParams.push(to); }
    if (shop_id) { bSql += ` AND e.shop_id = $${bIdx++}`;       bParams.push(shop_id); }
    bSql += ` GROUP BY e.category ORDER BY total DESC`;
    const breakdown = await query(bSql, bParams);

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

// ── GET /api/v1/reports/stock-value ──────────────────────────
router.get('/stock-value', async (req, res) => {
  try {
    const { as_of_date } = req.query;

    // Get all shops first
    const shopsResult = await query(`SELECT id, name FROM shops WHERE is_active = true ORDER BY name`);
    const shops = shopsResult.rows;

    // Get stock value grouped by category, sub_category, shop
    const dateFilter = as_of_date
      ? `AND (is.received_at::date <= '${as_of_date}' OR is.received_at IS NULL)`
      : '';

    const result = await query(`
      SELECT
        COALESCE(p.category, 'Uncategorized')     as category,
        COALESCE(p.sub_category, 'Uncategorized') as sub_category,
        sh.name                                    as shop_name,
        sh.id                                      as shop_id,
        COUNT(DISTINCT p.id)                       as product_count,
        SUM(i.quantity)                            as total_units,
        SUM(i.quantity * p.base_cost)              as cost_value,
        SUM(i.quantity * p.selling_price)          as retail_value
      FROM inventory i
      JOIN products p    ON p.id  = i.product_id
      LEFT JOIN shops sh ON sh.id = i.shop_id
      WHERE p.is_active = true
        AND i.quantity > 0
      GROUP BY p.category, p.sub_category, sh.name, sh.id
      ORDER BY p.category, p.sub_category, sh.name
    `);

    // Also get category totals across all shops
    const categoryTotals = await query(`
      SELECT
        COALESCE(p.category, 'Uncategorized') as category,
        SUM(i.quantity)                        as total_units,
        SUM(i.quantity * p.base_cost)          as cost_value,
        SUM(i.quantity * p.selling_price)      as retail_value
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE p.is_active = true AND i.quantity > 0
      GROUP BY p.category
      ORDER BY cost_value DESC
    `);

    // Grand total
    const grandTotal = await query(`
      SELECT
        SUM(i.quantity)                        as total_units,
        SUM(i.quantity * p.base_cost)          as cost_value,
        SUM(i.quantity * p.selling_price)      as retail_value
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE p.is_active = true AND i.quantity > 0
    `);

    res.json({
      success: true,
      data: {
        rows: result.rows,
        category_totals: categoryTotals.rows,
        grand_total: grandTotal.rows[0],
        shops,
        as_of_date: as_of_date || new Date().toISOString().split('T')[0],
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


// ── GET /api/v1/reports/top-products ─────────────────────────────────────────
router.get('/top-products', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    const params = [];
    let where = `WHERE si.payment_status != 'returned'`;
    if (from)    { params.push(from);    where += ` AND si.sale_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND si.sale_date <= $${params.length}`; }
    if (shop_id) { params.push(shop_id); where += ` AND si.shop_id = $${params.length}`; }
    const result = await query(`
      SELECT p.name, p.brand,
        SUM(sli.qty) as units_sold,
        SUM(sli.unit_price * sli.qty) as revenue,
        SUM(sli.unit_cost  * sli.qty) as cost,
        SUM((sli.unit_price - sli.unit_cost) * sli.qty) as profit
      FROM sale_items sli
      JOIN sales_invoices si ON si.id = sli.invoice_id
      JOIN products p ON p.id = sli.product_id
      ${where}
      GROUP BY p.id, p.name, p.brand
      ORDER BY profit DESC LIMIT 50
    `, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/salesperson ──────────────────────────────────────────
// Invoice-level totals and item-level quantities are computed in SEPARATE subqueries.
// (Joining sales_invoices to sale_items and summing invoice totals would count an invoice
//  once per item row — double-counting revenue / collected / due / discount.)
router.get('/salesperson', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    const params = [];
    let cond = `si.payment_status != 'returned'`;
    if (from)    { params.push(from);    cond += ` AND si.sale_date >= $${params.length}`; }
    if (to)      { params.push(to);      cond += ` AND si.sale_date <= $${params.length}`; }
    if (shop_id) { params.push(shop_id); cond += ` AND si.shop_id = $${params.length}`; }
    const result = await query(`
      SELECT u.id, u.name as salesperson,
             COALESCE(inv.invoice_count, 0)    as invoice_count,
             COALESCE(itm.total_items_sold, 0) as total_items_sold,
             inv.total_revenue, inv.total_collected, inv.total_due, inv.total_discount,
             COALESCE(inv.unique_customers, 0) as unique_customers
      FROM users u
      LEFT JOIN (
        SELECT si.user_id,
               COUNT(*)                       as invoice_count,
               SUM(si.total_amount)           as total_revenue,
               SUM(si.amount_paid)            as total_collected,
               SUM(si.amount_due)             as total_due,
               SUM(si.discount)               as total_discount,
               COUNT(DISTINCT si.customer_id) as unique_customers
        FROM sales_invoices si WHERE ${cond} GROUP BY si.user_id
      ) inv ON inv.user_id = u.id
      LEFT JOIN (
        SELECT si.user_id, SUM(sli.qty) as total_items_sold
        FROM sale_items sli JOIN sales_invoices si ON si.id = sli.invoice_id
        WHERE ${cond} GROUP BY si.user_id
      ) itm ON itm.user_id = u.id
      WHERE u.is_active = true
      ORDER BY inv.total_revenue DESC NULLS LAST
    `, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


router.get('/print-summary', async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateS = from && to ? `AND si.sale_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND si.sale_date >= '${from}'` : to ? `AND si.sale_date <= '${to}'` : '';
    const dateP = from && to ? `AND p.purchase_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND p.purchase_date >= '${from}'` : to ? `AND p.purchase_date <= '${to}'` : '';
    const dateE = from && to ? `AND e.expense_date BETWEEN '${from}' AND '${to}'`
      : from ? `AND e.expense_date >= '${from}'` : to ? `AND e.expense_date <= '${to}'` : '';

    // ── 1. Sales per shop (with cost of goods from sale_items) ───────────────
    const dateFrom = from || '2000-01-01';
    const dateTo   = to   || new Date().toISOString().split('T')[0];

    const salesByShop = await query(`
      SELECT
        sh.id   AS shop_id,
        sh.name AS shop_name,
        COALESCE((
          SELECT COUNT(DISTINCT si2.id)
          FROM sales_invoices si2
          WHERE si2.shop_id = sh.id
            AND si2.payment_status != 'returned'
            AND si2.sale_date BETWEEN $1 AND $2
        ), 0) AS invoice_count,
        COALESCE((
          SELECT COUNT(DISTINCT si2.id)
          FROM sales_invoices si2
          WHERE si2.shop_id = sh.id
            AND si2.payment_status = 'returned'
            AND si2.sale_date BETWEEN $1 AND $2
        ), 0) AS returned_count,
        COALESCE((
          SELECT SUM(si2.total_amount)
          FROM sales_invoices si2
          WHERE si2.shop_id = sh.id
            AND si2.payment_status != 'returned'
            AND si2.sale_date BETWEEN $1 AND $2
        ), 0) AS net_sales,
        COALESCE((
          SELECT SUM(si2.amount_paid)
          FROM sales_invoices si2
          WHERE si2.shop_id = sh.id
            AND si2.payment_status != 'returned'
            AND si2.sale_date BETWEEN $1 AND $2
        ), 0) AS cash_collected,
        COALESCE((
          SELECT SUM(si2.amount_due)
          FROM sales_invoices si2
          WHERE si2.shop_id = sh.id
            AND si2.payment_status != 'returned'
            AND si2.sale_date BETWEEN $1 AND $2
        ), 0) AS pending_amount,
        COALESCE((
          SELECT SUM(sli2.unit_cost * sli2.qty)
          FROM sale_items sli2
          JOIN sales_invoices si2 ON si2.id = sli2.invoice_id
          WHERE si2.shop_id = sh.id
            AND si2.payment_status != 'returned'
            AND si2.sale_date BETWEEN $1 AND $2
        ), 0) AS cost_of_goods
      FROM shops sh
      WHERE sh.is_active = true
      ORDER BY sh.name
    `, [dateFrom, dateTo]);

    // ── 2. Payment method breakdown per shop ─────────────────────────────────
    const paymentByShop = await query(`
      SELECT
        sh.name AS shop_name,
        si.payment_method,
        COALESCE(SUM(si.amount_paid), 0) AS amount
      FROM shops sh
      LEFT JOIN sales_invoices si ON si.shop_id = sh.id
        AND si.payment_status != 'returned' ${dateS}
      WHERE sh.is_active = true
      GROUP BY sh.name, si.payment_method
      ORDER BY sh.name, si.payment_method
    `);

    // ── 3. Expenses by shop and category ─────────────────────────────────────
    const expensesByShop = await query(`
      SELECT
        sh.name  AS shop_name,
        e.category AS category,
        COALESCE(SUM(e.amount), 0) AS total,
        COUNT(e.id)                AS count
      FROM shops sh
      LEFT JOIN expenses            e  ON e.shop_id = sh.id ${dateE}
      WHERE sh.is_active = true
      GROUP BY sh.name, e.category
      ORDER BY sh.name, total DESC
    `);

    // ── 4. Purchases per shop ─────────────────────────────────────────────────
    const purchasesByShop = await query(`
      SELECT
        sh.name AS shop_name,
        COALESCE(SUM(p.total_amount), 0)  AS total_purchased,
        COALESCE(SUM(p.amount_paid),  0)  AS cash_paid,
        COALESCE(SUM(p.amount_due),   0)  AS credit_owed,
        COUNT(p.id)                       AS purchase_count
      FROM shops sh
      LEFT JOIN purchases p ON p.shop_id = sh.id ${dateP}
      WHERE sh.is_active = true
      GROUP BY sh.name
      ORDER BY sh.name
    `);

    // ── 5. Build totals ───────────────────────────────────────────────────────
    const shops            = salesByShop.rows;
    const totalNetSales    = shops.reduce((s, r) => s + parseFloat(r.net_sales    || 0), 0);
    const totalCOGS        = shops.reduce((s, r) => s + parseFloat(r.cost_of_goods|| 0), 0);
    const totalGrossProfit = totalNetSales - totalCOGS;

    const expRows      = expensesByShop.rows;
    const totalExpenses = expRows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
    const totalNetProfit = totalGrossProfit - totalExpenses;

    const purchRows    = purchasesByShop.rows;
    const totalPurchased = purchRows.reduce((s, r) => s + parseFloat(r.total_purchased || 0), 0);

    res.json({
      success: true,
      data: {
        from, to,
        sales_by_shop:    salesByShop.rows,
        payment_by_shop:  paymentByShop.rows,
        expenses_by_shop: expRows,
        purchases_by_shop: purchRows,
        totals: {
          net_sales:       totalNetSales,
          cost_of_goods:   totalCOGS,
          gross_profit:    totalGrossProfit,
          gross_margin:    totalNetSales > 0 ? ((totalGrossProfit / totalNetSales) * 100).toFixed(1) : '0.0',
          total_expenses:  totalExpenses,
          net_profit:      totalNetProfit,
          net_margin:      totalNetSales > 0 ? ((totalNetProfit / totalNetSales) * 100).toFixed(1) : '0.0',
          total_purchased: totalPurchased,
        },
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/purchase-invoice ─────────────────────────────────────
router.get('/purchase-invoice', async (req, res) => {
  try {
    const { invoice_number } = req.query;
    if (!invoice_number) return res.status(400).json({ success: false, message: 'Invoice number required' });
    const purchase = await query(`
      SELECT p.*, s.name as supplier_name, sh.name as shop_name
      FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN shops sh ON sh.id = p.shop_id
      WHERE p.purchase_number ILIKE $1 LIMIT 1
    `, [`%${invoice_number}%`]);
    if (!purchase.rows.length) return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    const purch = purchase.rows[0];
    const items = await query(`
      SELECT pi.id, pi.serial_number, pi.qty as qty_purchased, pi.unit_cost, pi.recommended_selling_price,
        p2.name as product_name, p2.brand, p2.category, p2.sub_category,
        COALESCE(ist.qty_remaining, 0) as qty_in_stock, COALESCE(ist.qty_sold, 0) as qty_sold,
        COALESCE((SELECT SUM(si.unit_price * si.qty) FROM sale_items si WHERE si.inventory_stock_id = ist.id), 0) as revenue,
        COALESCE((SELECT SUM(si.unit_cost * si.qty)  FROM sale_items si WHERE si.inventory_stock_id = ist.id), 0) as cogs
      FROM purchase_items pi LEFT JOIN products p2 ON p2.id = pi.product_id
      LEFT JOIN inventory_stock ist ON ist.purchase_item_id = pi.id
      WHERE pi.purchase_id = $1 ORDER BY p2.category, p2.name
    `, [purch.id]);
    const totalCost    = items.rows.reduce((s,r) => s + parseFloat(r.unit_cost||0)*parseInt(r.qty_purchased||0), 0);
    const totalRevenue = items.rows.reduce((s,r) => s + parseFloat(r.revenue||0), 0);
    const totalCOGS    = items.rows.reduce((s,r) => s + parseFloat(r.cogs||0), 0);
    const grossProfit  = totalRevenue - totalCOGS;
    const qtyInStock   = items.rows.reduce((s,r) => s + parseInt(r.qty_in_stock||0), 0);
    const qtySold      = items.rows.reduce((s,r) => s + parseInt(r.qty_sold||0), 0);
    const stockValue   = items.rows.reduce((s,r) => s + parseFloat(r.unit_cost||0)*parseInt(r.qty_in_stock||0), 0);
    res.json({ success: true, data: { purchase: purch, items: items.rows,
      totals: { totalCost, totalRevenue, totalCOGS, grossProfit, qtyInStock, qtySold, stockValue,
        margin: totalRevenue > 0 ? ((grossProfit/totalRevenue)*100).toFixed(1) : '0.0' } } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Category filter values from the UI ('Mobile', 'Tab', ...) are matched case-insensitively and
// include the known variants stored in the database ('MOBILE', 'Mobile Phone', 'IPAD', 'MACBOOK', ...).
const CATEGORY_ALIASES = {
  MOBILE: ['MOBILE','MOBILE PHONE'], TAB: ['TAB','IPAD','TABLET'], IPAD: ['IPAD'],
  LAPTOP: ['LAPTOP','MACBOOK'], ACCESSORIES: ['ACCESSORIES'],
};
const categoryList = (c) => { const k = String(c).trim().toUpperCase(); return CATEGORY_ALIASES[k] || [k]; };

// ── GET /api/v1/reports/product-margin ───────────────────────────────────────
router.get('/product-margin', async (req, res) => {
  try {
    const { from, to, shop_id, category } = req.query;
    const params = [];
    let where = `WHERE si.payment_status != 'returned'`;
    if (from)     { params.push(from);     where += ` AND si.sale_date >= $${params.length}`; }
    if (to)       { params.push(to);       where += ` AND si.sale_date <= $${params.length}`; }
    if (shop_id)  { params.push(shop_id);  where += ` AND si.shop_id = $${params.length}`; }
    if (category) { params.push(categoryList(category)); where += ` AND UPPER(TRIM(p.category)) = ANY($${params.length})`; }
    const result = await query(`
      SELECT p.name as product_name, p.brand,
        COALESCE(p.category,'Uncategorized') as category, COALESCE(p.sub_category,'') as sub_category,
        SUM(sli.qty) as qty_sold, SUM(sli.unit_price * sli.qty) as revenue,
        SUM(sli.unit_cost * sli.qty) as cogs,
        SUM((sli.unit_price - sli.unit_cost) * sli.qty) as gross_profit,
        CASE WHEN SUM(sli.unit_price * sli.qty) > 0
          THEN ROUND((SUM((sli.unit_price - sli.unit_cost) * sli.qty) / SUM(sli.unit_price * sli.qty) * 100)::numeric, 1)
          ELSE 0 END as margin_pct
      FROM sale_items sli JOIN sales_invoices si ON si.id = sli.invoice_id
      JOIN products p ON p.id = sli.product_id ${where}
      GROUP BY p.id, p.name, p.brand, p.category, p.sub_category
      ORDER BY gross_profit DESC
    `, params);
    const totals = result.rows.reduce((acc, r) => ({
      qty_sold: acc.qty_sold + parseInt(r.qty_sold||0), revenue: acc.revenue + parseFloat(r.revenue||0),
      cogs: acc.cogs + parseFloat(r.cogs||0), gross_profit: acc.gross_profit + parseFloat(r.gross_profit||0),
    }), { qty_sold:0, revenue:0, cogs:0, gross_profit:0 });
    totals.margin_pct = totals.revenue > 0 ? ((totals.gross_profit/totals.revenue)*100).toFixed(1) : '0.0';
    res.json({ success: true, data: { rows: result.rows, totals } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/daily-inventory ──────────────────────────────────────
router.get('/daily-inventory', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'Date range required' });
    const currentValue = await query(`
      SELECT i.shop_id, sh.name as shop_name, SUM(i.quantity * p.base_cost) as cost_value
      FROM inventory i JOIN products p ON p.id = i.product_id LEFT JOIN shops sh ON sh.id = i.shop_id
      WHERE p.is_active = true AND i.quantity > 0 GROUP BY i.shop_id, sh.name
    `);
    const shops = currentValue.rows;
    const dates = [];
    const d = new Date(from); const end = new Date(to);
    while (d <= end) { dates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate()+1); }
    const rows = await Promise.all(dates.map(async (date) => {
      const shopValues = {};
      for (const shop of shops) {
        const sa = await query(`SELECT COALESCE(SUM(sli.unit_cost * sli.qty), 0) as value FROM sale_items sli JOIN sales_invoices si ON si.id = sli.invoice_id WHERE si.shop_id = $1 AND si.sale_date > $2 AND si.payment_status != 'returned'`, [shop.shop_id, date]);
        const pa = await query(`SELECT COALESCE(SUM(pi.unit_cost * pi.qty), 0) as value FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id WHERE pi.shop_id = $1 AND p.purchase_date > $2`, [shop.shop_id, date]);
        const val = parseFloat(shop.cost_value||0) + parseFloat(sa.rows[0].value||0) - parseFloat(pa.rows[0].value||0);
        shopValues[shop.shop_id] = { shop_name: shop.shop_name, cost_value: Math.max(0, val) };
      }
      return { date, shops: shopValues, total: Object.values(shopValues).reduce((s,v) => s+v.cost_value, 0) };
    }));
    res.json({ success: true, data: { rows, shops: shops.map(s => ({ id: s.shop_id, name: s.shop_name })) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/stock-value ──────────────────────────────────────────
router.get('/stock-value', async (req, res) => {
  try {
    const { as_of_date } = req.query;
    const shopsResult = await query(`SELECT id, name FROM shops WHERE is_active = true ORDER BY name`);
    const shops = shopsResult.rows;
    const result = await query(`
      SELECT COALESCE(p.category,'Uncategorized') as category, COALESCE(p.sub_category,'Uncategorized') as sub_category,
        sh.name as shop_name, sh.id as shop_id, COUNT(DISTINCT p.id) as product_count,
        SUM(i.quantity) as total_units, SUM(i.quantity * p.base_cost) as cost_value, SUM(i.quantity * p.selling_price) as retail_value
      FROM inventory i JOIN products p ON p.id = i.product_id LEFT JOIN shops sh ON sh.id = i.shop_id
      WHERE p.is_active = true AND i.quantity > 0
      GROUP BY p.category, p.sub_category, sh.name, sh.id ORDER BY p.category, p.sub_category, sh.name
    `);
    const categoryTotals = await query(`
      SELECT COALESCE(p.category,'Uncategorized') as category, SUM(i.quantity) as total_units,
        SUM(i.quantity * p.base_cost) as cost_value, SUM(i.quantity * p.selling_price) as retail_value
      FROM inventory i JOIN products p ON p.id = i.product_id WHERE p.is_active = true AND i.quantity > 0
      GROUP BY p.category ORDER BY cost_value DESC
    `);
    const grandTotal = await query(`
      SELECT SUM(i.quantity) as total_units, SUM(i.quantity * p.base_cost) as cost_value, SUM(i.quantity * p.selling_price) as retail_value
      FROM inventory i JOIN products p ON p.id = i.product_id WHERE p.is_active = true AND i.quantity > 0
    `);
    res.json({ success: true, data: { rows: result.rows, category_totals: categoryTotals.rows, grand_total: grandTotal.rows[0], shops, as_of_date: as_of_date || new Date().toISOString().split('T')[0] } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/full-business-report ──────────────────────────────────
router.get('/full-business-report', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const dateTo   = to   || new Date().toISOString().split('T')[0];
    const today    = new Date().toISOString().split('T')[0];
    const next60   = new Date(Date.now() + 60*86400000).toISOString().split('T')[0];

    const [salesResult, cogsResult, expResult, shopsList, stockValue, obligations60, cheques60] = await Promise.all([
      query(`
        SELECT sh.name as shop_name,
          COALESCE((SELECT COUNT(*) FROM sales_invoices si WHERE si.shop_id=sh.id AND si.payment_status!='returned' AND si.sale_date BETWEEN $1 AND $2),0) as invoice_count,
          COALESCE((SELECT SUM(si.total_amount) FROM sales_invoices si WHERE si.shop_id=sh.id AND si.payment_status!='returned' AND si.sale_date BETWEEN $1 AND $2),0) as net_sales,
          COALESCE((SELECT SUM(si.amount_paid) FROM sales_invoices si WHERE si.shop_id=sh.id AND si.payment_status!='returned' AND si.sale_date BETWEEN $1 AND $2),0) as collected,
          COALESCE((SELECT SUM(sli.unit_cost*sli.qty) FROM sale_items sli JOIN sales_invoices si ON si.id=sli.invoice_id WHERE si.shop_id=sh.id AND si.payment_status!='returned' AND si.sale_date BETWEEN $1 AND $2),0) as cogs
        FROM shops sh WHERE sh.is_active=true ORDER BY sh.name
      `, [dateFrom, dateTo]),
      query(`SELECT COALESCE(SUM(sli.unit_cost*sli.qty),0) as total_cogs FROM sale_items sli JOIN sales_invoices si ON si.id=sli.invoice_id WHERE si.payment_status!='returned' AND si.sale_date BETWEEN $1 AND $2`, [dateFrom, dateTo]),
      query(`
        SELECT sh.name as shop_name, COALESCE(e.category,'General') as category, COALESCE(SUM(e.amount),0) as total
        FROM shops sh LEFT JOIN expenses e ON e.shop_id=sh.id AND e.expense_date BETWEEN $1 AND $2
        WHERE sh.is_active=true GROUP BY sh.name, e.category ORDER BY sh.name, total DESC
      `, [dateFrom, dateTo]),
      query(`SELECT id, name FROM shops WHERE is_active=true ORDER BY name`),
      query(`
        SELECT sh.name as shop_name, COALESCE(p.category,'Uncategorized') as category,
          SUM(i.quantity) as units, SUM(i.quantity * p.base_cost) as cost_value
        FROM inventory i JOIN products p ON p.id=i.product_id LEFT JOIN shops sh ON sh.id=i.shop_id
        WHERE p.is_active=true AND i.quantity>0 GROUP BY sh.name, p.category ORDER BY sh.name, cost_value DESC
      `),
      query(`
        SELECT o.*, s.name as shop_name, CONCAT_WS(' - ', ec.category, NULLIF(ec.sub_category,'')) as category_name FROM obligations o
        LEFT JOIN shops s ON s.id=o.shop_id LEFT JOIN expense_categories ec ON ec.id=o.category_id
        WHERE o.status='pending' AND o.due_date BETWEEN $1 AND $2 ORDER BY o.due_date ASC
      `, [today, next60]),
      query(`
        SELECT c.*, s.name as shop_name FROM cheques c LEFT JOIN shops s ON s.id=c.shop_id
        WHERE c.type='outbound' AND c.status='pending' AND c.due_date BETWEEN $1 AND $2
        ORDER BY c.due_date ASC
      `, [today, next60]),
    ]);

    const totalSales  = salesResult.rows.reduce((s,r)=>s+parseFloat(r.net_sales||0),0);
    const totalCOGS   = parseFloat(cogsResult.rows[0].total_cogs||0);
    const totalExp    = expResult.rows.reduce((s,r)=>s+parseFloat(r.total||0),0);
    const grossProfit = totalSales - totalCOGS;
    const netProfit   = grossProfit - totalExp;
    const stockByShop = {};
    stockValue.rows.forEach(r => {
      if (!stockByShop[r.shop_name]) stockByShop[r.shop_name] = { categories:[], total:0 };
      stockByShop[r.shop_name].categories.push(r);
      stockByShop[r.shop_name].total += parseFloat(r.cost_value||0);
    });

    res.json({ success: true, data: {
      period: { from: dateFrom, to: dateTo }, shops: shopsList.rows,
      sales_by_shop: salesResult.rows, expenses: expResult.rows,
      totals: { totalSales, totalCOGS, grossProfit, totalExp, netProfit },
      stock_by_shop: stockByShop,
      stock_grand_total: stockValue.rows.reduce((s,r)=>s+parseFloat(r.cost_value||0),0),
      obligations_60: obligations60.rows, cheques_60: cheques60.rows,
      next60, today,
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/reports/upcoming-expenses ──────────────────────────────
// Combines outbound pending cheques + pending obligations, grouped by month.
// No date range limit — shows everything currently entered as pending.
router.get('/upcoming-expenses', async (req, res) => {
  try {
    const combined = await query(`
      SELECT due_date, amount,
             'Cheque' AS source, cheque_number AS reference,
             COALESCE(NULLIF(payee_payer,''), NULLIF(notes,''), bank) AS detail
      FROM cheques
      WHERE type = 'outbound' AND status = 'pending'

      UNION ALL

      SELECT o.due_date, o.amount,
             'Obligation' AS source, o.title AS reference,
             COALESCE(
               NULLIF(CONCAT(ec.category, CASE WHEN ec.sub_category IS NOT NULL AND ec.sub_category != '' THEN ' - '||ec.sub_category ELSE '' END), ''),
               NULLIF(o.person_name,''),
               NULLIF(o.notes,'')
             ) AS detail
      FROM obligations o
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      WHERE o.status = 'pending' AND (o.cheque_id IS NULL)
        -- skip an obligation that is just the same cheque entered a second time
        -- (same cheque number [in its own field or inside its title], same due date, same amount)
        AND NOT EXISTS (
          SELECT 1 FROM cheques c2
          WHERE c2.type = 'outbound' AND c2.status = 'pending'
            AND c2.due_date = o.due_date AND c2.amount = o.amount
            AND COALESCE(c2.cheque_number,'') <> ''
            AND (
              REGEXP_REPLACE(UPPER(c2.cheque_number), '[[:space:]]', '', 'g')
                = REGEXP_REPLACE(UPPER(COALESCE(o.cheque_number,'')), '[[:space:]]', '', 'g')
              OR POSITION(REGEXP_REPLACE(UPPER(c2.cheque_number), '[[:space:]]', '', 'g')
                  IN REGEXP_REPLACE(UPPER(COALESCE(o.title,'')), '[[:space:]]', '', 'g')) > 0
            )
        )

      ORDER BY due_date
    `);

    const monthly = {};
    let grandTotal = 0;
    combined.rows.forEach(r => {
      const key = r.due_date.toISOString().slice(0, 7); // YYYY-MM
      if (!monthly[key]) monthly[key] = { month_key: key, total: 0 };
      monthly[key].total += parseFloat(r.amount || 0);
      grandTotal += parseFloat(r.amount || 0);
    });
    const months = Object.values(monthly).sort((a, b) => a.month_key.localeCompare(b.month_key));

    res.json({ success: true, data: {
      months,
      grand_total: grandTotal,
      details: combined.rows,
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


// Normalises product category names into the 3 buckets used by the Daily Business Report.
// (Purchase flow creates products as 'Mobile Phone'; older data has Ipad / Macbook / Tablet variants.)
const dailyCat = (col) => `CASE
          WHEN UPPER(TRIM(${col})) IN ('MOBILE','MOBILE PHONE') THEN 'Mobile'
          WHEN UPPER(TRIM(${col})) IN ('TAB','IPAD','TABLET')   THEN 'Tab'
          WHEN UPPER(TRIM(${col})) IN ('LAPTOP','MACBOOK')      THEN 'Laptop'
        END`;

// ── GET /api/v1/reports/daily-business?date=YYYY-MM-DD ──────
// AlAman + Blessing only (Wholesale excluded by design).
router.get('/daily-business', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const [
      shopsList, sales, purchasesNew, paymentsOnly, expenses,
      cashReg, customerReceipts, stockValue,
    ] = await Promise.all([
      query(`SELECT id, name FROM shops WHERE name IN ('AlAman','Blessing') ORDER BY name`),

      // Sales: invoices, amount, cost, margin — per shop.
      // NOTE: sale amount and cost are computed in SEPARATE subqueries on purpose.
      // Joining sales_invoices to sale_items and then doing SUM(total_amount) would count an
      // invoice's total once per item row (double-counting multi-item invoices).
      query(`
        SELECT sh.name as shop_name,
          (SELECT COUNT(*) FROM sales_invoices si
             WHERE si.shop_id = sh.id AND si.sale_date = $1 AND si.payment_status != 'returned') as invoice_count,
          COALESCE((SELECT SUM(si.total_amount) FROM sales_invoices si
             WHERE si.shop_id = sh.id AND si.sale_date = $1 AND si.payment_status != 'returned'), 0) as sale_amount,
          COALESCE((SELECT SUM(sli.unit_cost * sli.qty) FROM sale_items sli
             JOIN sales_invoices si ON si.id = sli.invoice_id
             WHERE si.shop_id = sh.id AND si.sale_date = $1 AND si.payment_status != 'returned'), 0) as cost_amount
        FROM shops sh
        WHERE sh.name IN ('AlAman','Blessing')
        ORDER BY sh.name
      `, [date]),

      // New purchases today — supplier-wise, per shop
      query(`
        SELECT sh.name as shop_name, s.name as supplier_name,
          COUNT(p.id) as purchase_count,
          COALESCE(SUM(p.total_amount),0) as total_amount,
          COALESCE(SUM(p.amount_paid),0) as amount_paid,
          COALESCE(SUM(p.amount_due),0) as amount_due
        FROM purchases p
        JOIN shops sh ON sh.id = p.shop_id
        JOIN suppliers s ON s.id = p.supplier_id
        WHERE sh.name IN ('AlAman','Blessing') AND p.purchase_date = $1
        GROUP BY sh.name, s.name ORDER BY sh.name, s.name
      `, [date]),

      // Standalone payments made today (supplier_ledger, transaction_type='payment').
      // When a purchase is created with a paid amount, the system ALSO writes a 'payment' ledger row
      // with description 'Payment with purchase PUR-...'. That money is already shown in the
      // "New Purchases > Paid" column, so it is excluded here to avoid showing it twice.
      query(`
        SELECT sh.name as shop_name, s.name as supplier_name,
          COALESCE(SUM(ABS(sl.amount)),0) as amount_paid
        FROM supplier_ledger sl
        JOIN shops sh ON sh.id = sl.shop_id
        JOIN suppliers s ON s.id = sl.supplier_id
        WHERE sh.name IN ('AlAman','Blessing') AND sl.transaction_date = $1
          AND sl.transaction_type = 'payment'
          AND COALESCE(sl.description,'') NOT LIKE 'Payment with purchase%'
        GROUP BY sh.name, s.name ORDER BY sh.name, s.name
      `, [date]),

      // Expenses today — per shop + category (v2 schema: e.category is a text column, no category_id join)
      query(`
        SELECT sh.name as shop_name, COALESCE(e.category,'Uncategorized') as category,
          COALESCE(SUM(e.amount),0) as total
        FROM shops sh
        LEFT JOIN expenses e ON e.shop_id = sh.id AND e.expense_date = $1
        WHERE sh.name IN ('AlAman','Blessing')
        GROUP BY sh.name, e.category ORDER BY sh.name, total DESC
      `, [date]),

      // Cash register — opening/closing per shop
      query(`
        SELECT sh.name as shop_name, cr.opening_balance, cr.closing_balance, cr.status
        FROM shops sh
        LEFT JOIN cash_register cr ON cr.shop_id = sh.id AND cr.register_date = $1
        WHERE sh.name IN ('AlAman','Blessing') ORDER BY sh.name
      `, [date]),

      // Money collected from customers today (refunds excluded). Two sources:
      //  1) customer_receipts  — receipts entered on the Customers page (no shop_id column)
      //  2) cash_manual_entries 'Payment received ...' — payments collected on credit invoices
      //     (has shop_id; invoice number is taken from the description, e.g. 'Payment received (cash) — INV-001')
      query(`
        SELECT COALESCE(c.name,'—') AS customer_name, NULL::text AS shop_name,
               COALESCE(NULLIF(cr.note,''),'Customer receipt') AS reference,
               COALESCE(cr.payment_method,'cash') AS payment_method, cr.amount AS amount
        FROM customer_receipts cr
        JOIN customers c ON c.id = cr.customer_id
        WHERE cr.receipt_date = $1 AND COALESCE(cr.payment_method,'') != 'refund'
        UNION ALL
        SELECT COALESCE(c2.name,'Walk-in') AS customer_name, sh.name AS shop_name,
               NULLIF(TRIM(SPLIT_PART(cme.description,'—',2)),'') AS reference,
               CASE WHEN cme.category = 'Payment Received' THEN 'cash' ELSE LOWER(cme.category) END AS payment_method,
               cme.amount AS amount
        FROM cash_manual_entries cme
        JOIN shops sh ON sh.id = cme.shop_id
        LEFT JOIN sales_invoices si ON si.invoice_number = TRIM(SPLIT_PART(cme.description,'—',2))
        LEFT JOIN customers c2 ON c2.id = si.customer_id
        WHERE cme.entry_type = 'in' AND cme.entry_date = $1
          AND cme.description LIKE 'Payment received%'
          AND sh.name IN ('AlAman','Blessing')
        ORDER BY amount DESC
      `, [date]),

      // Stock value (cost price) at the END of the selected date — Mobile / Tab / Laptop only.
      // Same method the app's "Daily Inventory Value" report uses:
      //   value at end of date D = current stock value
      //                           + cost of items SOLD after D   (they were still in stock on D)
      //                           - cost of items PURCHASED after D (they were not yet in stock on D)
      // For today's date this equals the exact current stock; for past dates it is an estimate
      // (stock transfers / returns / manual adjustments are not tracked by this method).
      // Category names are normalised (see dailyCat) because the purchase flow still creates
      // new products with category 'Mobile Phone', and older data has Ipad / Macbook variants.
      query(`
        WITH cur AS (
          SELECT i.shop_id, ${dailyCat('p.category')} AS category,
                 SUM(i.quantity * p.base_cost) AS v
          FROM inventory i JOIN products p ON p.id = i.product_id
          WHERE p.is_active = true AND i.quantity > 0 AND ${dailyCat('p.category')} IS NOT NULL
          GROUP BY i.shop_id, ${dailyCat('p.category')}
        ),
        sold_after AS (
          SELECT si.shop_id, ${dailyCat('p.category')} AS category,
                 SUM(sli.unit_cost * sli.qty) AS v
          FROM sale_items sli
          JOIN sales_invoices si ON si.id = sli.invoice_id
          JOIN products p ON p.id = sli.product_id
          WHERE si.sale_date > $1 AND si.payment_status != 'returned' AND ${dailyCat('p.category')} IS NOT NULL
          GROUP BY si.shop_id, ${dailyCat('p.category')}
        ),
        bought_after AS (
          SELECT pi.shop_id, ${dailyCat('p.category')} AS category,
                 SUM(pi.unit_cost * pi.qty) AS v
          FROM purchase_items pi
          JOIN purchases pu ON pu.id = pi.purchase_id
          JOIN products p ON p.id = pi.product_id
          WHERE pu.purchase_date > $1 AND ${dailyCat('p.category')} IS NOT NULL
          GROUP BY pi.shop_id, ${dailyCat('p.category')}
        )
        SELECT sh.name AS shop_name, c.category,
               GREATEST(0, COALESCE(cur.v,0) + COALESCE(sold_after.v,0) - COALESCE(bought_after.v,0)) AS cost_value
        FROM shops sh
        CROSS JOIN (VALUES ('Mobile'),('Tab'),('Laptop')) AS c(category)
        LEFT JOIN cur          ON cur.shop_id          = sh.id AND cur.category          = c.category
        LEFT JOIN sold_after   ON sold_after.shop_id   = sh.id AND sold_after.category   = c.category
        LEFT JOIN bought_after ON bought_after.shop_id = sh.id AND bought_after.category = c.category
        WHERE sh.name IN ('AlAman','Blessing')
        ORDER BY sh.name, c.category
      `, [date]),
    ]);

    res.json({
      success: true,
      data: {
        date, shops: shopsList.rows,
        sales: sales.rows,
        purchases_new: purchasesNew.rows,
        payments_only: paymentsOnly.rows,
        expenses: expenses.rows,
        cash_register: cashReg.rows,
        customer_receipts: customerReceipts.rows,
        stock_value: stockValue.rows,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
