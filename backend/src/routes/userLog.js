const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

// GET /api/v1/user-log?from=YYYY-MM-DD&to=YYYY-MM-DD&user_id=
router.get('/', async (req, res) => {
  try {
    const { from, to, user_id } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'from and to required' });

    const params = [from, to];
    let userFilter = '';
    if (user_id) { params.push(user_id); userFilter = `AND u.id = $${params.length}`; }

    // 1. Sales invoices
    const sales = await query(`
      SELECT
        si.created_at as time,
        u.name as user_name,
        'sale' as type,
        si.invoice_number as reference,
        si.total_amount as amount,
        si.payment_method,
        si.payment_status,
        sh.name as shop_name,
        si.id as record_id,
        COALESCE(c.name, 'Walk-in') as extra
      FROM sales_invoices si
      LEFT JOIN users u ON u.id = si.user_id
      LEFT JOIN shops sh ON sh.id = si.shop_id
      LEFT JOIN customers c ON c.id = si.customer_id
      WHERE si.sale_date BETWEEN $1 AND $2
        AND si.payment_status != 'returned'
        ${userFilter}
      ORDER BY si.created_at DESC
    `, params);

    // 2. Purchases
    const purchases = await query(`
      SELECT
        p.created_at as time,
        NULL as user_name,
        'purchase' as type,
        p.purchase_number as reference,
        p.total_amount as amount,
        p.payment_status,
        NULL as payment_method,
        sh.name as shop_name,
        p.id as record_id,
        s.name as extra
      FROM purchases p
      LEFT JOIN shops sh ON sh.id = p.shop_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.purchase_date BETWEEN $1 AND $2
      ORDER BY p.created_at DESC
    `, params);

    // 3. Expenses
    const expenses = await query(`
      SELECT
        e.created_at as time,
        u.name as user_name,
        'expense' as type,
        CONCAT(e.category, ' / ', COALESCE(e.sub_category,'')) as reference,
        e.amount,
        e.payment_method,
        NULL as payment_status,
        sh.name as shop_name,
        e.id as record_id,
        e.description as extra
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN shops sh ON sh.id = e.shop_id
      WHERE e.expense_date BETWEEN $1 AND $2
        ${userFilter}
      ORDER BY e.created_at DESC
    `, params);

    // 4. Finance transactions
    const finance = await query(`
      SELECT
        ft.created_at as time,
        u.name as user_name,
        'finance' as type,
        fa.name as reference,
        ft.amount,
        ft.transaction_type as payment_method,
        NULL as payment_status,
        sh.name as shop_name,
        ft.id as record_id,
        ft.description as extra
      FROM finance_transactions ft
      LEFT JOIN users u ON u.id = ft.created_by
      LEFT JOIN finance_accounts fa ON fa.id = ft.account_id
      LEFT JOIN shops sh ON sh.id = ft.shop_id
      WHERE ft.transaction_date BETWEEN $1 AND $2
        ${userFilter}
      ORDER BY ft.created_at DESC
    `, params);

    // Merge and sort by time
    const all = [
      ...sales.rows.map(r => ({...r, type:'sale'})),
      ...purchases.rows.map(r => ({...r, type:'purchase'})),
      ...expenses.rows.map(r => ({...r, type:'expense'})),
      ...finance.rows.map(r => ({...r, type:'finance'})),
    ].sort((a,b) => new Date(b.time) - new Date(a.time));

    // Get all active users for filter
    const users = await query(`SELECT id, name FROM users WHERE is_active=true ORDER BY name`);

    res.json({ success: true, data: all, users: users.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/v1/user-log/detail/:type/:id — secondary effects
router.get('/detail/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    let details = [];

    if (type === 'sale') {
      // Items sold + inventory impact
      const items = await query(`
        SELECT p.name, p.serial_number, si.qty, si.unit_price, si.unit_cost
        FROM sale_items si JOIN products p ON p.id = si.product_id
        WHERE si.invoice_id = $1
      `, [id]);
      const inv = await query(`
        SELECT si2.invoice_number, si2.payment_status, si2.amount_paid, si2.amount_due
        FROM sales_invoices si2 WHERE si2.id = $1
      `, [id]);
      details = [
        { section: 'Items Sold', rows: items.rows.map(r => `${r.name}${r.serial_number?' ('+r.serial_number+')':''} — Qty:${r.qty} Price:AED ${r.unit_price} Cost:AED ${r.unit_cost}`) },
        { section: 'Payment', rows: inv.rows.map(r => `Paid: AED ${r.amount_paid} | Due: AED ${r.amount_due} | Status: ${r.payment_status}`) },
      ];
    }

    if (type === 'purchase') {
      const items = await query(`
        SELECT p.name, p.serial_number, pi.qty, pi.unit_cost, sh.name as shop
        FROM purchase_items pi
        JOIN products p ON p.id = pi.product_id
        LEFT JOIN shops sh ON sh.id = pi.shop_id
        WHERE pi.purchase_id = $1
      `, [id]);
      details = [
        { section: 'Items Purchased', rows: items.rows.map(r => `${r.name}${r.serial_number?' ('+r.serial_number+')':''} → ${r.shop} | Qty:${r.qty} | Cost:AED ${r.unit_cost}`) },
      ];
    }

    res.json({ success: true, data: details });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
