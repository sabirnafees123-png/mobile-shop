// src/routes/cashRegister.js
const express = require('express');
const router  = express.Router();
const { query, getClient } = require('../config/database');

// ── GET /api/v1/cash-register/today?shop_id= ────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });

    const today = new Date().toISOString().split('T')[0];

    const [register, sales, expenses, supplierPayments, cheques] = await Promise.all([

      // Today's register for this shop
      query(`SELECT * FROM cash_register WHERE register_date = $1 AND shop_id = $2 LIMIT 1`, [today, shop_id]),

      // Today's sales for this shop
      query(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'bank' THEN total_amount ELSE 0 END), 0) as bank_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
          COALESCE(SUM(total_amount), 0) as total_sales,
          COUNT(*) as invoice_count
        FROM sales_invoices
        WHERE sale_date = $1 AND payment_status != 'returned' AND shop_id = $2
      `, [today, shop_id]),

      // Today's cash expenses for this shop
      query(`
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses
        WHERE expense_date = $1 AND shop_id = $2 AND payment_method = 'cash'
      `, [today, shop_id]),

      // Today's supplier payments made in cash (from supplier_ledger)
      query(`
        SELECT COALESCE(SUM(ABS(amount)), 0) as total_paid
        FROM supplier_ledger
        WHERE transaction_type = 'payment'
          AND transaction_date = $1
          AND amount < 0
      `, [today]),

      // Pending cheques for this shop
      query(`
        SELECT
          COALESCE(SUM(CASE WHEN type='inbound'  AND status='pending' THEN amount ELSE 0 END), 0) as pending_inbound,
          COALESCE(SUM(CASE WHEN type='outbound' AND status='pending' THEN amount ELSE 0 END), 0) as pending_outbound
        FROM cheques WHERE shop_id = $1
      `, [shop_id]),
    ]);

    // Yesterday's closing balance for this shop
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split('T')[0];
    const prevRegister = await query(
      `SELECT closing_balance FROM cash_register WHERE register_date = $1 AND shop_id = $2 LIMIT 1`,
      [yDate, shop_id]
    );

    const yesterdayClosing   = prevRegister.rows.length ? parseFloat(prevRegister.rows[0].closing_balance) : 0;
    const openingBalance     = register.rows[0] ? parseFloat(register.rows[0].opening_balance) : yesterdayClosing;
    const todayCashSales     = parseFloat(sales.rows[0].cash_sales);
    const todayExpenses      = parseFloat(expenses.rows[0].total_expenses);
    const todaySupplierPaid  = parseFloat(supplierPayments.rows[0].total_paid);

    // The core formula
    const expectedCash = openingBalance + todayCashSales - todayExpenses - todaySupplierPaid;

    res.json({
      success: true,
      data: {
        register:          register.rows[0] || null,
        yesterday_closing: yesterdayClosing,
        today: {
          cash_sales:      todayCashSales,
          bank_sales:      parseFloat(sales.rows[0].bank_sales),
          card_sales:      parseFloat(sales.rows[0].card_sales),
          total_sales:     parseFloat(sales.rows[0].total_sales),
          invoice_count:   parseInt(sales.rows[0].invoice_count),
          expenses:        todayExpenses,
          supplier_paid:   todaySupplierPaid,
          expected_cash:   expectedCash,
          opening_balance: openingBalance,
        },
        cheques: {
          pending_inbound:  parseFloat(cheques.rows[0].pending_inbound),
          pending_outbound: parseFloat(cheques.rows[0].pending_outbound),
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/v1/cash-register/history?shop_id=&from=&to= ────────────────────
router.get('/history', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let sql = `
      SELECT cr.*, s.name as shop_name
      FROM cash_register cr
      LEFT JOIN shops s ON s.id = cr.shop_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shop_id) { sql += ` AND cr.shop_id = $${idx++}`;       params.push(shop_id); }
    if (from)    { sql += ` AND cr.register_date >= $${idx++}`; params.push(from); }
    if (to)      { sql += ` AND cr.register_date <= $${idx++}`; params.push(to); }
    sql += ` ORDER BY cr.register_date DESC LIMIT 30`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/v1/cash-register/open ─────────────────────────────────────────
router.post('/open', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { opening_balance, notes, shop_id } = req.body;
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });

    const existing = await query(
      `SELECT id FROM cash_register WHERE register_date = $1 AND shop_id = $2`,
      [today, shop_id]
    );
    if (existing.rows.length)
      return res.status(400).json({ success: false, message: 'Register already opened today for this shop' });

    const result = await query(`
      INSERT INTO cash_register (register_date, shop_id, opening_balance, status, opened_by, notes)
      VALUES ($1, $2, $3, 'open', $4, $5) RETURNING *
    `, [today, shop_id, opening_balance || 0, req.user?.id, notes || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/v1/cash-register/close ────────────────────────────────────────
router.post('/close', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { closing_balance, notes, shop_id } = req.body;
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });

    const [sales, expenses, supplierPayments] = await Promise.all([
      query(`
        SELECT COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_amount ELSE 0 END),0) as cash_sales
        FROM sales_invoices WHERE sale_date=$1 AND payment_status!='returned' AND shop_id=$2
      `, [today, shop_id]),
      query(`
        SELECT COALESCE(SUM(amount),0) as total
        FROM expenses WHERE expense_date=$1 AND shop_id=$2 AND payment_method='cash'
      `, [today, shop_id]),
      query(`
        SELECT COALESCE(SUM(ABS(amount)),0) as total_paid
        FROM supplier_ledger WHERE transaction_type='payment' AND transaction_date=$1 AND amount < 0
      `, [today]),
    ]);

    const result = await query(`
      UPDATE cash_register
      SET status='closed', closing_balance=$1, closed_by=$2,
          total_sales_cash=$3, total_expenses=$4, notes=COALESCE($5, notes), updated_at=NOW()
      WHERE register_date=$6 AND shop_id=$7 RETURNING *
    `, [
      closing_balance || 0,
      req.user?.id,
      parseFloat(sales.rows[0].cash_sales),
      parseFloat(expenses.rows[0].total),
      notes || null,
      today,
      shop_id,
    ]);

    if (!result.rows.length)
      return res.status(400).json({ success: false, message: 'No open register found for today for this shop' });

    // Calculate variance
    const register = await query(`SELECT * FROM cash_register WHERE id=$1`, [result.rows[0].id]);
    const reg = register.rows[0];

    res.json({
      success: true,
      data: result.rows[0],
      summary: {
        opening:        parseFloat(reg.opening_balance),
        cash_sales:     parseFloat(sales.rows[0].cash_sales),
        expenses:       parseFloat(expenses.rows[0].total),
        supplier_paid:  parseFloat(supplierPayments.rows[0].total_paid),
        expected_cash:  parseFloat(reg.opening_balance) + parseFloat(sales.rows[0].cash_sales) - parseFloat(expenses.rows[0].total) - parseFloat(supplierPayments.rows[0].total_paid),
        actual_closing: parseFloat(closing_balance || 0),
        variance:       parseFloat(closing_balance || 0) - (parseFloat(reg.opening_balance) + parseFloat(sales.rows[0].cash_sales) - parseFloat(expenses.rows[0].total) - parseFloat(supplierPayments.rows[0].total_paid)),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
