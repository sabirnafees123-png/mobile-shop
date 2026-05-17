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
        sales:     { total: totalSales, collected: parseFloat(sales.rows[0].total_collected), due: parseFloat(sales.rows[0].total_due), count: parseInt(sales.rows[0].invoice_count) },
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
router.get('/salesperson', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let sql = `
      SELECT u.id, u.name as salesperson,
             COUNT(DISTINCT si.id)        as invoice_count,
             SUM(sli.qty)                 as total_items_sold,
             SUM(si.total_amount)         as total_revenue,
             SUM(si.amount_paid)          as total_collected,
             SUM(si.amount_due)           as total_due,
             SUM(si.discount)             as total_discount,
             COUNT(DISTINCT si.customer_id) as unique_customers
      FROM users u
      LEFT JOIN sales_invoices si ON si.user_id = u.id
        AND si.payment_status != 'returned'
        ${from ? `AND si.sale_date >= '${from}'` : ''}
        ${to   ? `AND si.sale_date <= '${to}'`   : ''}
        ${shop_id ? `AND si.shop_id = '${shop_id}'` : ''}
      LEFT JOIN sale_items sli ON sli.invoice_id = si.id
      WHERE u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_revenue DESC NULLS LAST
    `;
    const result = await query(sql);
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
        ec.name  AS category,
        COALESCE(SUM(e.amount), 0) AS total,
        COUNT(*)                   AS count
      FROM shops sh
      LEFT JOIN expenses            e  ON e.shop_id = sh.id ${dateE}
      LEFT JOIN expense_categories  ec ON ec.id = e.category_id
      WHERE sh.is_active = true
      GROUP BY sh.name, ec.name
      ORDER BY sh.name, total DESC
    `);

    // ── 4. Purchases per shop ─────────────────────────────────────────────────
    const purchasesByShop = await query(`
      SELECT
        sh.name AS shop_name,
        COALESCE(SUM(p.total_amount), 0)  AS total_purchased,
        COALESCE(SUM(p.amount_paid),  0)  AS cash_paid,
        COALESCE(SUM(p.amount_due),   0)  AS credit_owed,
        COUNT(*)                          AS purchase_count
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

// ── GET /api/v1/reports/product-margin ───────────────────────────────────────
router.get('/product-margin', async (req, res) => {
  try {
    const { from, to, shop_id, category } = req.query;
    const params = [];
    let where = `WHERE si.payment_status != 'returned'`;
    if (from)     { params.push(from);     where += ` AND si.sale_date >= $${params.length}`; }
    if (to)       { params.push(to);       where += ` AND si.sale_date <= $${params.length}`; }
    if (shop_id)  { params.push(shop_id);  where += ` AND si.shop_id = $${params.length}`; }
    if (category) { params.push(category); where += ` AND p.category = $${params.length}`; }
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
        SELECT sh.name as shop_name, COALESCE(ec.name,'General') as category, COALESCE(SUM(e.amount),0) as total
        FROM shops sh LEFT JOIN expenses e ON e.shop_id=sh.id AND e.expense_date BETWEEN $1 AND $2
        LEFT JOIN expense_categories ec ON ec.id=e.category_id
        WHERE sh.is_active=true GROUP BY sh.name, ec.name ORDER BY sh.name, total DESC
      `, [dateFrom, dateTo]),
      query(`SELECT id, name FROM shops WHERE is_active=true ORDER BY name`),
      query(`
        SELECT sh.name as shop_name, COALESCE(p.category,'Uncategorized') as category,
          SUM(i.quantity) as units, SUM(i.quantity * p.base_cost) as cost_value
        FROM inventory i JOIN products p ON p.id=i.product_id LEFT JOIN shops sh ON sh.id=i.shop_id
        WHERE p.is_active=true AND i.quantity>0 GROUP BY sh.name, p.category ORDER BY sh.name, cost_value DESC
      `),
      query(`
        SELECT o.*, s.name as shop_name, ec.name as category_name FROM obligations o
        LEFT JOIN shops s ON s.id=o.shop_id LEFT JOIN expense_categories ec ON ec.id=o.category_id
        WHERE o.status='pending' AND o.due_date BETWEEN $1 AND $2 ORDER BY o.due_date ASC
      `, [today, next60]),
      query(`
        SELECT c.*, s.name as shop_name FROM cheques c LEFT JOIN shops s ON s.id=c.shop_id
        WHERE c.type='outgoing' AND c.status='pending' AND c.due_date BETWEEN $1 AND $2
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

module.exports = router;
