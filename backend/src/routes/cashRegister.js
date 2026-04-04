// src/routes/cashRegister.js
const express = require('express');
const router  = express.Router();
const { query, getClient } = require('../config/database');

// ── GET /api/v1/cash-register/today ─────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [register, sales, expenses, cheques] = await Promise.all([
      query(`SELECT * FROM cash_register WHERE register_date = $1 LIMIT 1`, [today]),
      query(`
        SELECT 
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'bank' THEN total_amount ELSE 0 END), 0) as bank_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
          COALESCE(SUM(total_amount), 0) as total_sales,
          COUNT(*) as invoice_count
        FROM sales_invoices 
        WHERE sale_date = $1 AND payment_status != 'returned'
      `, [today]),
      query(`
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses WHERE expense_date = $1
      `, [today]),
      query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type='inbound' AND status='pending' THEN amount ELSE 0 END), 0) as pending_inbound,
          COALESCE(SUM(CASE WHEN type='outbound' AND status='pending' THEN amount ELSE 0 END), 0) as pending_outbound
        FROM cheques
      `),
    ]);

    // Yesterday closing balance
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split('T')[0];
    const prevRegister = await query(
      `SELECT closing_balance FROM cash_register WHERE register_date = $1 LIMIT 1`, [yDate]
    );

    const yesterdayClosing = prevRegister.rows.length
      ? parseFloat(prevRegister.rows[0].closing_balance)
      : 0;

    const todayCashSales  = parseFloat(sales.rows[0].cash_sales);
    const todayExpenses   = parseFloat(expenses.rows[0].total_expenses);
    const cashInHand      = yesterdayClosing + todayCashSales - todayExpenses;

    res.json({
      success: true,
      data: {
        register:          register.rows[0] || null,
        yesterday_closing: yesterdayClosing,
        today: {
          cash_sales:    todayCashSales,
          bank_sales:    parseFloat(sales.rows[0].bank_sales),
          card_sales:    parseFloat(sales.rows[0].card_sales),
          total_sales:   parseFloat(sales.rows[0].total_sales),
          invoice_count: parseInt(sales.rows[0].invoice_count),
          expenses:      todayExpenses,
          cash_in_hand:  cashInHand,
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

// ── GET /api/v1/cash-register/history?from=&to= ──────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = `SELECT * FROM cash_register WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (from) { sql += ` AND register_date >= $${idx++}`; params.push(from); }
    if (to)   { sql += ` AND register_date <= $${idx++}`; params.push(to); }
    sql += ` ORDER BY register_date DESC LIMIT 30`;
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
    const { opening_balance, notes } = req.body;

    const existing = await query(`SELECT id FROM cash_register WHERE register_date = $1`, [today]);
    if (existing.rows.length)
      return res.status(400).json({ success: false, message: 'Register already opened today' });

    const result = await query(`
      INSERT INTO cash_register (register_date, opening_balance, status, opened_by, notes)
      VALUES ($1, $2, 'open', $3, $4) RETURNING *
    `, [today, opening_balance || 0, req.user?.id, notes || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/v1/cash-register/close ────────────────────────────────────────
router.post('/close', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { closing_balance, notes } = req.body;

    const [sales, expenses] = await Promise.all([
      query(`SELECT COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_amount ELSE 0 END),0) as cash_sales FROM sales_invoices WHERE sale_date=$1 AND payment_status!='returned'`, [today]),
      query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date=$1`, [today]),
    ]);

    const result = await query(`
      UPDATE cash_register 
      SET status='closed', closing_balance=$1, closed_by=$2,
          total_sales_cash=$3, total_expenses=$4, notes=COALESCE($5, notes), updated_at=NOW()
      WHERE register_date=$6 RETURNING *
    `, [
      closing_balance || 0,
      req.user?.id,
      parseFloat(sales.rows[0].cash_sales),
      parseFloat(expenses.rows[0].total),
      notes || null,
      today
    ]);

    if (!result.rows.length)
      return res.status(400).json({ success: false, message: 'No open register found for today' });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
