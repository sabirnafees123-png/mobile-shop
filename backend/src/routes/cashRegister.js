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

    const [register, sales, expenses, supplierPayments, cheques, manualEntries] = await Promise.all([
      query(`SELECT * FROM cash_register WHERE register_date = $1 AND shop_id = $2 LIMIT 1`, [today, shop_id]),
      query(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount - COALESCE(exchange_trade_in_value,0) ELSE 0 END), 0) as cash_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'bank' THEN total_amount ELSE 0 END), 0) as bank_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
          COALESCE(SUM(total_amount), 0) as gross_sales,
          COALESCE(SUM(COALESCE(exchange_trade_in_value,0)), 0) as total_trade_in,
          COALESCE(SUM(total_amount - COALESCE(exchange_trade_in_value,0)), 0) as net_sales,
          COUNT(*) as invoice_count
        FROM sales_invoices
        WHERE sale_date = $1 AND payment_status != 'returned' AND shop_id = $2
      `, [today, shop_id]),
      query(`SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE expense_date = $1 AND shop_id = $2 AND payment_method = 'cash'`, [today, shop_id]),
      query(`SELECT COALESCE(SUM(ABS(amount)), 0) as total_paid FROM supplier_ledger WHERE transaction_type = 'payment' AND transaction_date = $1 AND amount < 0`, [today]),
      query(`SELECT COALESCE(SUM(CASE WHEN type='inbound' AND status='pending' THEN amount ELSE 0 END),0) as pending_inbound, COALESCE(SUM(CASE WHEN type='outbound' AND status='pending' THEN amount ELSE 0 END),0) as pending_outbound FROM cheques WHERE shop_id = $1`, [shop_id]),
      // Manual cash entries for today
      query(`SELECT * FROM cash_manual_entries WHERE entry_date = $1 AND shop_id = $2 ORDER BY created_at DESC`, [today, shop_id]).catch(() => ({ rows: [] })),
    ]);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split('T')[0];
    const prevRegister = await query(`SELECT closing_balance FROM cash_register WHERE register_date = $1 AND shop_id = $2 LIMIT 1`, [yDate, shop_id]);

    const yesterdayClosing  = prevRegister.rows.length ? parseFloat(prevRegister.rows[0].closing_balance) : 0;
    const openingBalance    = register.rows[0] ? parseFloat(register.rows[0].opening_balance) : yesterdayClosing;
    const todayCashSales    = parseFloat(sales.rows[0].cash_sales);
    const todayExpenses     = parseFloat(expenses.rows[0].total_expenses);
    const todaySupplierPaid = parseFloat(supplierPayments.rows[0].total_paid);
    const manualIn          = manualEntries.rows.filter(e => e.entry_type === 'in').reduce((s, e) => s + parseFloat(e.amount), 0);
    const manualOut         = manualEntries.rows.filter(e => e.entry_type === 'out').reduce((s, e) => s + parseFloat(e.amount), 0);
    const expectedCash      = openingBalance + todayCashSales + manualIn - todayExpenses - todaySupplierPaid - manualOut;

    res.json({
      success: true,
      data: {
        register:          register.rows[0] || null,
        yesterday_closing: yesterdayClosing,
        today: {
          cash_sales:      todayCashSales,
          gross_sales:     parseFloat(sales.rows[0].gross_sales),
          trade_in:        parseFloat(sales.rows[0].total_trade_in),
          net_sales:       parseFloat(sales.rows[0].net_sales),
          bank_sales:      parseFloat(sales.rows[0].bank_sales),
          card_sales:      parseFloat(sales.rows[0].card_sales),
          invoice_count:   parseInt(sales.rows[0].invoice_count),
          expenses:        todayExpenses,
          supplier_paid:   todaySupplierPaid,
          manual_in:       manualIn,
          manual_out:      manualOut,
          expected_cash:   expectedCash,
          opening_balance: openingBalance,
        },
        cheques: {
          pending_inbound:  parseFloat(cheques.rows[0].pending_inbound),
          pending_outbound: parseFloat(cheques.rows[0].pending_outbound),
        },
        manual_entries: manualEntries.rows,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/v1/cash-register/history ───────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { from, to, shop_id } = req.query;
    let sql = `SELECT cr.*, s.name as shop_name FROM cash_register cr LEFT JOIN shops s ON s.id = cr.shop_id WHERE 1=1`;
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

// ── POST /api/v1/cash-register/manual-entry ──────────────────────────────────
router.post('/manual-entry', async (req, res) => {
  try {
    const { shop_id, entry_type, amount, category, description, entry_date } = req.body;
    if (!shop_id || !entry_type || !amount) return res.status(400).json({ success: false, message: 'shop_id, entry_type, amount required' });
    if (!['in', 'out'].includes(entry_type)) return res.status(400).json({ success: false, message: 'entry_type must be in or out' });

    // Create table if not exists (first time)
    await query(`
      CREATE TABLE IF NOT EXISTS cash_manual_entries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        shop_id INTEGER REFERENCES shops(id),
        entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
        entry_type VARCHAR(3) NOT NULL CHECK (entry_type IN ('in','out')),
        amount NUMERIC(12,2) NOT NULL,
        category VARCHAR(100),
        description TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const result = await query(
      `INSERT INTO cash_manual_entries (shop_id, entry_date, entry_type, amount, category, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [shop_id, entry_date || new Date().toISOString().split('T')[0], entry_type, parseFloat(amount), category || null, description || null, req.user?.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/v1/cash-register/manual-entry/:id ────────────────────────────
router.delete('/manual-entry/:id', async (req, res) => {
  try {
    await query(`DELETE FROM cash_manual_entries WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
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
    const existing = await query(`SELECT id FROM cash_register WHERE register_date = $1 AND shop_id = $2`, [today, shop_id]);
    if (existing.rows.length) return res.status(400).json({ success: false, message: 'Register already opened today for this shop' });
    const result = await query(`INSERT INTO cash_register (register_date, shop_id, opening_balance, status, opened_by, notes) VALUES ($1, $2, $3, 'open', $4, $5) RETURNING *`,
      [today, shop_id, opening_balance || 0, req.user?.id, notes || null]);
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

    const [sales, expenses, supplierPayments, manualEntries] = await Promise.all([
      query(`SELECT COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_amount - COALESCE(exchange_trade_in_value,0) ELSE 0 END),0) as cash_sales FROM sales_invoices WHERE sale_date=$1 AND payment_status!='returned' AND shop_id=$2`, [today, shop_id]),
      query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date=$1 AND shop_id=$2 AND payment_method='cash'`, [today, shop_id]),
      query(`SELECT COALESCE(SUM(ABS(amount)),0) as total_paid FROM supplier_ledger WHERE transaction_type='payment' AND transaction_date=$1 AND amount < 0`, [today]),
      query(`SELECT entry_type, COALESCE(SUM(amount),0) as total FROM cash_manual_entries WHERE entry_date=$1 AND shop_id=$2 GROUP BY entry_type`, [today, shop_id]).catch(() => ({ rows: [] })),
    ]);

    const manualIn  = manualEntries.rows.find(r => r.entry_type === 'in')?.total || 0;
    const manualOut = manualEntries.rows.find(r => r.entry_type === 'out')?.total || 0;

    const result = await query(`UPDATE cash_register SET status='closed', closing_balance=$1, closed_by=$2, total_sales_cash=$3, total_expenses=$4, notes=COALESCE($5, notes), updated_at=NOW() WHERE register_date=$6 AND shop_id=$7 RETURNING *`,
      [closing_balance || 0, req.user?.id, parseFloat(sales.rows[0].cash_sales), parseFloat(expenses.rows[0].total), notes || null, today, shop_id]);

    if (!result.rows.length) return res.status(400).json({ success: false, message: 'No open register found for today' });

    const reg = result.rows[0];
    const expectedCash = parseFloat(reg.opening_balance) + parseFloat(sales.rows[0].cash_sales) + parseFloat(manualIn) - parseFloat(expenses.rows[0].total) - parseFloat(supplierPayments.rows[0].total_paid) - parseFloat(manualOut);

    res.json({
      success: true,
      data: result.rows[0],
      summary: {
        opening:        parseFloat(reg.opening_balance),
        cash_sales:     parseFloat(sales.rows[0].cash_sales),
        manual_in:      parseFloat(manualIn),
        manual_out:     parseFloat(manualOut),
        expenses:       parseFloat(expenses.rows[0].total),
        supplier_paid:  parseFloat(supplierPayments.rows[0].total_paid),
        expected_cash:  expectedCash,
        actual_closing: parseFloat(closing_balance || 0),
        variance:       parseFloat(closing_balance || 0) - expectedCash,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
