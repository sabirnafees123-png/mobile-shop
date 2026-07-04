// src/routes/cashRegister.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const checkRegisterLock = require('../middleware/checkRegisterLock');

// ── GET /api/v1/cash-register/detail?shop_id=X&date=Y ───────────────────────
router.get('/detail', async (req, res) => {
  try {
    const { shop_id, date } = req.query;
    if (!shop_id || !date) return res.status(400).json({ success: false, message: 'shop_id and date required' });

    const [sales, returns, expenses, purchases, manualEntries, regRow, bankReceipts] = await Promise.all([
      query(`SELECT invoice_number, total_amount, amount_paid, COALESCE(exchange_trade_in_value,0) as exchange_trade_in_value, is_exchange FROM sales_invoices WHERE shop_id=$1 AND sale_date=$2 AND payment_method='cash' AND payment_status!='returned' ORDER BY invoice_number`, [shop_id, date]),
      query(`SELECT invoice_number, amount_paid FROM sales_invoices WHERE shop_id=$1 AND sale_date=$2 AND payment_method='cash' AND payment_status='returned' ORDER BY invoice_number`, [shop_id, date]),
      query(`SELECT COALESCE(e.category, 'Uncategorized') as category_name, e.amount, e.description FROM expenses e WHERE e.shop_id=$1 AND e.expense_date=$2 AND e.payment_method='cash' ORDER BY e.amount DESC`, [shop_id, date]),
      query(`
        SELECT COALESCE(p.purchase_number, sl.description) as reference, ABS(sl.amount) as amount
        FROM supplier_ledger sl LEFT JOIN purchases p ON p.id = sl.reference_id
        WHERE sl.shop_id=$1 AND sl.transaction_date=$2 AND sl.transaction_type='payment' AND sl.amount<0
        ORDER BY amount DESC`, [shop_id, date]),
      query(`SELECT entry_type, amount, category, description FROM cash_manual_entries WHERE shop_id=$1 AND entry_date=$2 ORDER BY entry_type, amount DESC`, [shop_id, date]),
      query(`SELECT opening_balance FROM cash_register WHERE shop_id=$1 AND register_date=$2 LIMIT 1`, [shop_id, date]),
      query(`
        SELECT ft.amount, ft.description, fa.name as account_name, fa.type as account_type
        FROM finance_transactions ft
        JOIN finance_accounts fa ON fa.id = ft.account_id
        WHERE ft.transaction_date=$1
          AND ft.transaction_type='in'
          AND (fa.shop_id=$2 OR fa.shop_id IS NULL)
          AND fa.type IN ('bank','investor','fund')
        ORDER BY ft.amount DESC`, [date, shop_id]),
    ]);

    const totalSales     = sales.rows.reduce((s, r) => s + parseFloat(r.amount_paid), 0);
    const totalReturns   = returns.rows.reduce((s, r) => s + parseFloat(r.amount_paid), 0);
    const totalExpenses  = expenses.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    const totalPurchases = purchases.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    const manualIn       = manualEntries.rows.filter(r => r.entry_type==='in'  && r.category!=='Shop Transfer').reduce((s,r) => s+parseFloat(r.amount), 0);
    const manualOut      = manualEntries.rows.filter(r => r.entry_type==='out' && r.category!=='Shop Transfer').reduce((s,r) => s+parseFloat(r.amount), 0);
    const transferIn     = manualEntries.rows.filter(r => r.entry_type==='in'  && r.category==='Shop Transfer').reduce((s,r) => s+parseFloat(r.amount), 0);
    const transferOut    = manualEntries.rows.filter(r => r.entry_type==='out' && r.category==='Shop Transfer').reduce((s,r) => s+parseFloat(r.amount), 0);
    const totalBank      = bankReceipts.rows.reduce((s,r) => s+parseFloat(r.amount), 0);
    const opening        = parseFloat(regRow.rows[0]?.opening_balance || 0);
    const closing        = opening + totalSales - totalReturns + transferIn + manualIn + totalBank - totalExpenses - totalPurchases - manualOut - transferOut;

    res.json({ success: true, data: {
      date, shop_id, opening,
      sales:        { total: totalSales,     items: sales.rows },
      returns:      { total: totalReturns,   items: returns.rows },
      expenses:     { total: totalExpenses,  items: expenses.rows },
      purchases:    { total: totalPurchases, items: purchases.rows },
      manual_in:    { total: manualIn,       items: manualEntries.rows.filter(r => r.entry_type==='in'  && r.category!=='Shop Transfer') },
      manual_out:   { total: manualOut,      items: manualEntries.rows.filter(r => r.entry_type==='out' && r.category!=='Shop Transfer') },
      transfer_in:  { total: transferIn,     items: manualEntries.rows.filter(r => r.entry_type==='in'  && r.category==='Shop Transfer') },
      transfer_out: { total: transferOut,    items: manualEntries.rows.filter(r => r.entry_type==='out' && r.category==='Shop Transfer') },
      bank_receipts:{ total: totalBank,      items: bankReceipts.rows },
      closing,
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

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
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_paid ELSE 0 END), 0) as cash_sales,
          COALESCE(SUM(CASE WHEN payment_status='returned' AND payment_method='cash' THEN amount_paid ELSE 0 END), 0) as cash_returns,
          COALESCE(SUM(CASE WHEN payment_method = 'bank' THEN total_amount ELSE 0 END), 0) as bank_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
          COALESCE(SUM(CASE WHEN payment_status!='returned' THEN total_amount ELSE 0 END), 0) as gross_sales,
          COALESCE(SUM(COALESCE(exchange_trade_in_value,0)), 0) as total_trade_in,
          COALESCE(SUM(CASE WHEN payment_status!='returned' THEN total_amount - COALESCE(exchange_trade_in_value,0) ELSE 0 END), 0) as net_sales,
          COUNT(*) as invoice_count
        FROM sales_invoices
        WHERE sale_date = $1 AND payment_status != 'returned' AND shop_id = $2
      `, [today, shop_id]),
      query(`SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE expense_date = $1 AND shop_id = $2 AND payment_method = 'cash'`, [today, shop_id]),
      query(`SELECT COALESCE(SUM(ABS(amount)), 0) as total_paid FROM supplier_ledger WHERE transaction_type = 'payment' AND transaction_date = $1 AND amount < 0 AND shop_id = $2`, [today, shop_id]),
      query(`SELECT COALESCE(SUM(CASE WHEN type='inbound' AND status='pending' THEN amount ELSE 0 END),0) as pending_inbound, COALESCE(SUM(CASE WHEN type='outbound' AND status='pending' THEN amount ELSE 0 END),0) as pending_outbound FROM cheques WHERE shop_id = $1`, [shop_id]),
      // Manual cash entries for today
      query(`SELECT * FROM cash_manual_entries WHERE entry_date = $1 AND shop_id = $2 ORDER BY created_at DESC`, [today, shop_id]).catch(() => ({ rows: [] })),
    ]);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split('T')[0];

    // Get yesterday's live closing by calculating from May 1st anchor
    const anchorRow = await query(`SELECT opening_balance FROM cash_register WHERE shop_id=$1 AND register_date='2026-05-01' LIMIT 1`, [shop_id]);
    const anchorOpening = anchorRow.rows.length ? parseFloat(anchorRow.rows[0].opening_balance) : 0;

    const [allSales, allExp, allPur, allMan] = await Promise.all([
      query(`SELECT sale_date::text as d, COALESCE(SUM(CASE WHEN payment_method='cash' THEN amount_paid ELSE 0 END),0) as cs, COALESCE(SUM(CASE WHEN payment_status='returned' AND payment_method='cash' THEN amount_paid ELSE 0 END),0) as cr FROM sales_invoices WHERE shop_id=$1 AND sale_date BETWEEN '2026-05-01' AND $2 GROUP BY sale_date`, [shop_id, today]),
      query(`SELECT expense_date::text as d, COALESCE(SUM(amount),0) as total FROM expenses WHERE shop_id=$1 AND expense_date BETWEEN '2026-05-01' AND $2 AND payment_method='cash' GROUP BY expense_date`, [shop_id, today]),
      query(`SELECT transaction_date::text as d, COALESCE(SUM(ABS(amount)),0) as total FROM supplier_ledger WHERE transaction_type='payment' AND amount<0 AND shop_id=$2 AND transaction_date BETWEEN '2026-05-01' AND $1 GROUP BY transaction_date`, [today, shop_id]),
      query(`SELECT entry_date::text as d, entry_type, category, COALESCE(SUM(amount),0) as total FROM cash_manual_entries WHERE shop_id=$1 AND entry_date BETWEEN '2026-05-01' AND $2 GROUP BY entry_date, entry_type, category`, [shop_id, today]),
    ]);

    const sm = {}; allSales.rows.forEach(r => sm[r.d] = r);
    const em = {}; allExp.rows.forEach(r => em[r.d] = r);
    const pm = {}; allPur.rows.forEach(r => pm[r.d] = r);
    const mm = {};
    allMan.rows.forEach(r => {
      if (!mm[r.d]) mm[r.d] = { ti:0, to:0, mi:0, mo:0 };
      if (r.entry_type==='in'  && r.category==='Shop Transfer') mm[r.d].ti += parseFloat(r.total);
      if (r.entry_type==='out' && r.category==='Shop Transfer') mm[r.d].to += parseFloat(r.total);
      if (r.entry_type==='in'  && r.category!=='Shop Transfer') mm[r.d].mi += parseFloat(r.total);
      if (r.entry_type==='out' && r.category!=='Shop Transfer') mm[r.d].mo += parseFloat(r.total);
    });

    // Get all anchor openings from May 1st
    const anchorRows2 = await query(
      `SELECT register_date::text as d, opening_balance FROM cash_register WHERE shop_id=$1 AND register_date >= '2026-05-01' ORDER BY register_date ASC`,
      [shop_id]
    );
    const anchorMap2 = {};
    anchorRows2.rows.forEach(r => { anchorMap2[r.d] = parseFloat(r.opening_balance); });
    const firstAnchor2 = anchorMap2['2026-05-01'] ?? 0;

    let runningBal = firstAnchor2;
    const cur = new Date('2026-05-01');
    const todayD = new Date(today);
    while (cur <= todayD) {
      const d = cur.toISOString().split('T')[0];
      if (d === today) break;
      // Reset to anchor if set for this date
      if (anchorMap2[d] !== undefined) runningBal = anchorMap2[d];
      const s = sm[d] || {}; const e = em[d] || {}; const p = pm[d] || {}; const m = mm[d] || {ti:0,to:0,mi:0,mo:0};
      runningBal = runningBal + parseFloat(s.cs||0) - parseFloat(s.cr||0) + m.ti + m.mi - parseFloat(e.total||0) - parseFloat(p.total||0) - m.to - m.mo;
      cur.setDate(cur.getDate() + 1);
    }
    // For today, check if there's a manual anchor
    const openingBalance = (anchorMap2[today] !== undefined) ? anchorMap2[today] : runningBal;
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
        yesterday_closing: openingBalance,
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
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });

    const toDate = to || new Date().toISOString().split('T')[0];
    const calcFrom = '2026-05-01';

    // Get ALL manually set opening balances — these are anchor points
    // A date is an anchor if opening_balance is explicitly set in cash_register
    const anchorRows = await query(
      `SELECT register_date::text as d, opening_balance, closing_balance, status FROM cash_register WHERE shop_id=$1 AND register_date >= $2 ORDER BY register_date ASC`,
      [shop_id, calcFrom]
    );
    // Build anchor map: date -> opening_balance
    const anchorMap = {};
    const regMap = {};
    anchorRows.rows.forEach(r => {
      anchorMap[r.d] = parseFloat(r.opening_balance);
      regMap[r.d] = r;
    });

    // Get first anchor opening
    const firstAnchor = anchorMap[calcFrom] ?? 0;

    // Get all transaction data from May 1st to toDate in bulk
    const [salesData, expensesData, purchasesData, manualData] = await Promise.all([
      query(`
        SELECT sale_date::text as d,
          COALESCE(SUM(CASE WHEN payment_method='cash' AND payment_status!='returned' THEN amount_paid ELSE 0 END),0) as cash_sales,
          COALESCE(SUM(CASE WHEN payment_status='returned' AND payment_method='cash' THEN amount_paid ELSE 0 END),0) as cash_returns,
          COALESCE(SUM(CASE WHEN payment_status!='returned' THEN total_amount - COALESCE(exchange_trade_in_value,0) ELSE 0 END),0) as gross_sales,
          COALESCE(SUM(CASE WHEN payment_status!='returned' THEN COALESCE(exchange_trade_in_value,0) ELSE 0 END),0) as trade_in
        FROM sales_invoices WHERE shop_id=$1 AND sale_date BETWEEN $2 AND $3 GROUP BY sale_date`,
        [shop_id, calcFrom, toDate]),
      query(`
        SELECT expense_date::text as d, COALESCE(SUM(amount),0) as total
        FROM expenses WHERE shop_id=$1 AND expense_date BETWEEN $2 AND $3 AND payment_method='cash' GROUP BY expense_date`,
        [shop_id, calcFrom, toDate]),
      query(`
        SELECT transaction_date::text as d, COALESCE(SUM(ABS(amount)),0) as total
        FROM supplier_ledger WHERE transaction_type='payment' AND amount<0 AND shop_id=$3 AND transaction_date BETWEEN $1 AND $2
        GROUP BY transaction_date`,
        [calcFrom, toDate, shop_id]),
      query(`
        SELECT entry_date::text as d, entry_type, category, COALESCE(SUM(amount),0) as total
        FROM cash_manual_entries WHERE shop_id=$1 AND entry_date BETWEEN $2 AND $3 GROUP BY entry_date, entry_type, category`,
        [shop_id, calcFrom, toDate]),
    ]);

    const salesMap = {}; salesData.rows.forEach(r => salesMap[r.d] = r);
    const expMap   = {}; expensesData.rows.forEach(r => expMap[r.d] = r);
    const purMap   = {}; purchasesData.rows.forEach(r => purMap[r.d] = r);
    const manMap   = {};
    manualData.rows.forEach(r => {
      if (!manMap[r.d]) manMap[r.d] = { transfer_in:0, transfer_out:0, manual_in:0, manual_out:0 };
      if (r.entry_type==='in'  && r.category==='Shop Transfer') manMap[r.d].transfer_in  += parseFloat(r.total);
      if (r.entry_type==='out' && r.category==='Shop Transfer') manMap[r.d].transfer_out += parseFloat(r.total);
      if (r.entry_type==='in'  && r.category!=='Shop Transfer') manMap[r.d].manual_in    += parseFloat(r.total);
      if (r.entry_type==='out' && r.category!=='Shop Transfer') manMap[r.d].manual_out   += parseFloat(r.total);
    });

    // Calculate day by day — if a day has a manual anchor, reset to that value
    const allResult = [];
    let prevClosing = firstAnchor;
    const cur = new Date(calcFrom);
    const end = new Date(toDate);

    while (cur <= end) {
      const d = cur.toISOString().split('T')[0];
      // If this date has a manual anchor set, use it as opening (overrides chain)
      const opening = (anchorMap[d] !== undefined) ? anchorMap[d] : prevClosing;
      const cashSales = parseFloat(salesMap[d]?.cash_sales || 0);
      const returns   = parseFloat(salesMap[d]?.cash_returns || 0);
      const expenses  = parseFloat(expMap[d]?.total || 0);
      const purchases = parseFloat(purMap[d]?.total || 0);
      const man       = manMap[d] || { transfer_in:0, transfer_out:0, manual_in:0, manual_out:0 };
      const liveClosing = opening + cashSales - returns + man.transfer_in + man.manual_in - expenses - purchases - man.transfer_out - man.manual_out;
      const reg = regMap[d];
      const isLocked = reg?.status === 'closed';
      // Locked days use stored closing; open/no-row days use live calculation
      const closing = isLocked ? parseFloat(reg.closing_balance) : liveClosing;

      allResult.push({
        register_date:    d,
        shop_id:          parseInt(shop_id),
        opening_balance:  opening,
        total_sales_cash: cashSales,
        gross_sales:      parseFloat(salesMap[d]?.gross_sales || 0),
        trade_in:         parseFloat(salesMap[d]?.trade_in || 0),
        cash_returns:     returns,
        total_expenses:   expenses,
        total_purchases:  purchases,
        transfer_in:      man.transfer_in,
        transfer_out:     man.transfer_out,
        manual_in:        man.manual_in,
        manual_out:       man.manual_out,
        closing_balance:  closing,
        status:           reg?.status || 'open',
        is_locked:        isLocked,
      });

      prevClosing = closing;
      cur.setDate(cur.getDate() + 1);
    }

    // Filter to requested from date for display
    const fromDate = from || calcFrom;
    const filtered = allResult.filter(r => r.register_date >= fromDate);

    res.json({ success: true, data: filtered.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/v1/cash-register/recalculate ───────────────────────────────────
// Recalculates closing balance for a specific date based on actual transactions
router.post('/recalculate', async (req, res) => {
  try {
    const { shop_id, date } = req.body;
    if (!shop_id || !date) return res.status(400).json({ success: false, message: 'shop_id and date required' });

    const [reg, sales, expenses, supplierPayments, manualEntries] = await Promise.all([
      query(`SELECT * FROM cash_register WHERE register_date = $1 AND shop_id = $2 LIMIT 1`, [date, shop_id]),
      query(`SELECT COALESCE(SUM(CASE WHEN payment_method='cash' THEN amount_paid ELSE 0 END),0) as cash_sales FROM sales_invoices WHERE sale_date=$1 AND payment_status!='returned' AND shop_id=$2`, [date, shop_id]),
      query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date=$1 AND shop_id=$2 AND payment_method='cash'`, [date, shop_id]),
      query(`SELECT COALESCE(SUM(ABS(amount)),0) as total FROM supplier_ledger WHERE transaction_type='payment' AND transaction_date=$1 AND amount<0 AND shop_id=$2`, [date, shop_id]),
      query(`SELECT entry_type, COALESCE(SUM(amount),0) as total FROM cash_manual_entries WHERE entry_date=$1 AND shop_id=$2 GROUP BY entry_type`, [date, shop_id]).catch(() => ({ rows: [] })),
    ]);

    if (!reg.rows.length) return res.status(404).json({ success: false, message: 'No register entry for this date' });

    const opening     = parseFloat(reg.rows[0].opening_balance);
    const cashSales   = parseFloat(sales.rows[0].cash_sales);
    const exps        = parseFloat(expenses.rows[0].total);
    const purchases   = parseFloat(supplierPayments.rows[0].total);
    const manualIn    = parseFloat(manualEntries.rows.find(r => r.entry_type==='in')?.total || 0);
    const manualOut   = parseFloat(manualEntries.rows.find(r => r.entry_type==='out')?.total || 0);
    const newClosing  = opening + cashSales + manualIn - exps - purchases - manualOut;

    await query(`UPDATE cash_register SET closing_balance=$1, total_sales_cash=$2, total_expenses=$3, updated_at=NOW() WHERE register_date=$4 AND shop_id=$5`,
      [newClosing, cashSales, exps, date, shop_id]);

    // Update next day's opening balance
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];
    await query(`UPDATE cash_register SET opening_balance=$1 WHERE register_date=$2 AND shop_id=$3`,
      [newClosing, nextDateStr, shop_id]);

    res.json({ success: true, data: { opening, cash_sales: cashSales, expenses: exps, purchases, manual_in: manualIn, manual_out: manualOut, closing: newClosing } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/v1/cash-register/manual-entry ──────────────────────────────────
router.post('/manual-entry', checkRegisterLock, async (req, res) => {
  try {
    const { shop_id, entry_type, amount, category, description, entry_date } = req.body;
    if (!shop_id || !entry_type || !amount) return res.status(400).json({ success: false, message: 'shop_id, entry_type, amount required' });
    if (!['in', 'out'].includes(entry_type)) return res.status(400).json({ success: false, message: 'entry_type must be in or out' });

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
    const { opening_balance, notes, shop_id, date } = req.body;
    const registerDate = date || new Date().toISOString().split('T')[0];
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });
    const existing = await query(`SELECT id FROM cash_register WHERE register_date = $1 AND shop_id = $2`, [registerDate, shop_id]);
    if (existing.rows.length) {
      // If opening_balance missing/undefined, use null so COALESCE keeps existing DB value
      const newOpening = (opening_balance !== undefined && opening_balance !== null && opening_balance !== '')
        ? parseFloat(opening_balance)
        : null;
      await query(`UPDATE cash_register SET opening_balance=COALESCE($1, opening_balance), status='open', notes=COALESCE($2,notes), updated_at=NOW() WHERE register_date=$3 AND shop_id=$4`,
        [newOpening, notes || null, registerDate, shop_id]);
      const updated = await query(`SELECT * FROM cash_register WHERE register_date=$1 AND shop_id=$2`, [registerDate, shop_id]);
      return res.status(200).json({ success: true, data: updated.rows[0] });
    }
    const result = await query(`INSERT INTO cash_register (register_date, shop_id, opening_balance, status, opened_by, notes) VALUES ($1, $2, $3, 'open', $4, $5) RETURNING *`,
      [registerDate, shop_id, opening_balance || 0, req.user?.id, notes || null]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/v1/cash-register/close ────────────────────────────────────────
router.post('/close', async (req, res) => {
  try {
    const { closing_balance, notes, shop_id, date } = req.body;
    const registerDate = date || new Date().toISOString().split('T')[0];
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });

    const [sales, expenses, supplierPayments, manualEntries] = await Promise.all([
      query(`SELECT COALESCE(SUM(CASE WHEN payment_method='cash' AND payment_status!='returned' THEN amount_paid ELSE 0 END),0) as cash_sales FROM sales_invoices WHERE sale_date=$1 AND shop_id=$2`, [registerDate, shop_id]),
      query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date=$1 AND shop_id=$2 AND payment_method='cash'`, [registerDate, shop_id]),
      query(`SELECT COALESCE(SUM(ABS(amount)),0) as total_paid FROM supplier_ledger WHERE transaction_type='payment' AND transaction_date=$1 AND amount<0 AND shop_id=$2`, [registerDate, shop_id]),
      query(`SELECT entry_type, COALESCE(SUM(amount),0) as total FROM cash_manual_entries WHERE entry_date=$1 AND shop_id=$2 GROUP BY entry_type`, [registerDate, shop_id]).catch(() => ({ rows: [] })),
    ]);

    const manualIn  = parseFloat(manualEntries.rows.find(r => r.entry_type === 'in')?.total || 0);
    const manualOut = parseFloat(manualEntries.rows.find(r => r.entry_type === 'out')?.total || 0);
    const cashSales = parseFloat(sales.rows[0].cash_sales);
    const exps      = parseFloat(expenses.rows[0].total);
    const supPaid   = parseFloat(supplierPayments.rows[0].total_paid);

    // Upsert — update if exists, insert if not
    const existing = await query(`SELECT * FROM cash_register WHERE register_date=$1 AND shop_id=$2`, [registerDate, shop_id]);
    let result;
    if (existing.rows.length) {
      result = await query(`UPDATE cash_register SET status='closed', closing_balance=$1, closed_by=$2, total_sales_cash=$3, total_expenses=$4, notes=COALESCE($5,notes), updated_at=NOW() WHERE register_date=$6 AND shop_id=$7 RETURNING *`,
        [closing_balance || 0, req.user?.id, cashSales, exps, notes || null, registerDate, shop_id]);
    } else {
      result = await query(`INSERT INTO cash_register (register_date, shop_id, opening_balance, closing_balance, total_sales_cash, total_expenses, status, notes) VALUES ($1, $2, 0, $3, $4, $5, 'closed', $6) RETURNING *`,
        [registerDate, shop_id, closing_balance || 0, cashSales, exps, notes || null]);
    }

    const reg = result.rows[0];
    const opening = parseFloat(reg.opening_balance || 0);
    const expectedCash = opening + cashSales + manualIn - exps - supPaid - manualOut;

    res.json({
      success: true,
      data: reg,
      summary: {
        opening, cash_sales: cashSales, manual_in: manualIn, manual_out: manualOut,
        expenses: exps, supplier_paid: supPaid, expected_cash: expectedCash,
        actual_closing: parseFloat(closing_balance || 0),
        variance: parseFloat(closing_balance || 0) - expectedCash,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/v1/cash-register/transfer ──────────────────────────────────────
// Transfer cash from one shop to another (works for past dates too)
router.post('/transfer', async (req, res) => {
  try {
    const { from_shop_id, to_shop_id, amount, date, description } = req.body;
    if (!from_shop_id || !to_shop_id || !amount || !date)
      return res.status(400).json({ success: false, message: 'from_shop_id, to_shop_id, amount, date required' });
    if (from_shop_id === to_shop_id)
      return res.status(400).json({ success: false, message: 'Cannot transfer to same shop' });

    const transferAmt = parseFloat(amount);
    const desc = description || `Cash transfer to shop`;

    // Record as Cash OUT from source shop
    await query(
      `INSERT INTO cash_manual_entries (shop_id, entry_date, entry_type, amount, category, description, created_by)
       VALUES ($1, $2, 'out', $3, 'Shop Transfer', $4, $5)`,
      [from_shop_id, date, transferAmt, `Transfer OUT → ${desc}`, req.user?.id]
    );

    // Record as Cash IN to destination shop
    await query(
      `INSERT INTO cash_manual_entries (shop_id, entry_date, entry_type, amount, category, description, created_by)
       VALUES ($1, $2, 'in', $3, 'Shop Transfer', $4, $5)`,
      [to_shop_id, date, transferAmt, `Transfer IN ← ${desc}`, req.user?.id]
    );

    // Recalculate both shops from transfer date to today
    const recalcShop = async (sid) => {
      const rows = await query(
        `SELECT register_date FROM cash_register WHERE shop_id=$1 AND register_date >= $2 ORDER BY register_date ASC`,
        [sid, date]
      );
      for (const row of rows.rows) {
        const d = row.register_date.toISOString ? row.register_date.toISOString().split('T')[0] : row.register_date;
        const [reg, sales, expenses, supplierPayments, manualEntries] = await Promise.all([
          query(`SELECT * FROM cash_register WHERE register_date=$1 AND shop_id=$2 LIMIT 1`, [d, sid]),
          query(`SELECT COALESCE(SUM(CASE WHEN payment_method='cash' THEN amount_paid ELSE 0 END),0) as cash_sales FROM sales_invoices WHERE sale_date=$1 AND payment_status!='returned' AND shop_id=$2`, [d, sid]),
          query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date=$1 AND shop_id=$2 AND payment_method='cash'`, [d, sid]),
          query(`SELECT COALESCE(SUM(ABS(amount)),0) as total FROM supplier_ledger WHERE transaction_type='payment' AND transaction_date=$1 AND amount<0 AND shop_id=$2`, [d, sid]),
          query(`SELECT entry_type, COALESCE(SUM(amount),0) as total FROM cash_manual_entries WHERE entry_date=$1 AND shop_id=$2 GROUP BY entry_type`, [d, sid]).catch(() => ({ rows: [] })),
        ]);
        if (!reg.rows.length) continue;
        const opening   = parseFloat(reg.rows[0].opening_balance);
        const cashSales = parseFloat(sales.rows[0].cash_sales);
        const exps      = parseFloat(expenses.rows[0].total);
        const purchases = parseFloat(supplierPayments.rows[0].total);
        const manualIn  = parseFloat(manualEntries.rows.find(r => r.entry_type==='in')?.total || 0);
        const manualOut = parseFloat(manualEntries.rows.find(r => r.entry_type==='out')?.total || 0);
        const newClosing = opening + cashSales + manualIn - exps - purchases - manualOut;
        await query(`UPDATE cash_register SET closing_balance=$1, total_sales_cash=$2, total_expenses=$3 WHERE register_date=$4 AND shop_id=$5`,
          [newClosing, cashSales, exps, d, sid]);
        // Update next day opening
        const nextD = new Date(d); nextD.setDate(nextD.getDate()+1);
        const nextStr = nextD.toISOString().split('T')[0];
        await query(`UPDATE cash_register SET opening_balance=$1 WHERE register_date=$2 AND shop_id=$3`, [newClosing, nextStr, sid]);
      }
    };

    await recalcShop(from_shop_id);
    await recalcShop(to_shop_id);

    res.json({ success: true, message: `AED ${transferAmt} transferred successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
