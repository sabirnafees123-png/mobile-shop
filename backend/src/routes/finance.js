const express = require('express');
const router  = express.Router();
const { query, getClient } = require('../config/database');

// ── Accounts ─────────────────────────────────────────────────────────────────

// GET all accounts
router.get('/accounts', async (req, res) => {
  try {
    const { shop_id, type } = req.query;
    let sql = `SELECT * FROM finance_accounts WHERE is_active = true`;
    const params = [];
    if (shop_id) { sql += ` AND shop_id = $${params.length+1}`; params.push(shop_id); }
    if (type)    { sql += ` AND type = $${params.length+1}`;    params.push(type); }
    sql += ` ORDER BY type, name`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST create account
router.post('/accounts', async (req, res) => {
  try {
    const { name, type, sub_type, opening_balance, notes, shop_id } = req.body;
    if (!name)    return res.status(400).json({ success: false, message: 'Name required' });
    if (!type)    return res.status(400).json({ success: false, message: 'Type required' });
    if (['card','fund'].includes(type) && !shop_id) return res.status(400).json({ success: false, message: 'Shop required for this account type' });
    const ob = parseFloat(opening_balance) || 0;
    const result = await query(
      `INSERT INTO finance_accounts (name, type, sub_type, opening_balance, balance, notes, shop_id)
       VALUES ($1,$2,$3,$4,$4,$5,$6) RETURNING *`,
      [name, type, sub_type||null, ob, notes||null, shop_id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT update account
router.put('/accounts/:id', async (req, res) => {
  try {
    const { name, sub_type, notes, is_active } = req.body;
    const result = await query(
      `UPDATE finance_accounts SET name=$1, sub_type=$2, notes=$3, is_active=$4 WHERE id=$5 RETURNING *`,
      [name, sub_type||null, notes||null, is_active!==false, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Transactions ──────────────────────────────────────────────────────────────

// GET transactions for an account
router.get('/accounts/:id/transactions', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM finance_transactions WHERE account_id=$1 ORDER BY transaction_date DESC, created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST record transaction
router.post('/accounts/:id/transactions', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { transaction_type, amount, description, transaction_date, affects_cash, shop_id } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) throw new Error('Valid amount required');
    if (!transaction_type) throw new Error('Transaction type required');

    // Insert transaction
    const txn = await client.query(
      `INSERT INTO finance_transactions (account_id, transaction_type, amount, description, transaction_date, affects_cash, shop_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, transaction_type, amt, description||null,
       transaction_date || new Date().toISOString().split('T')[0],
       affects_cash !== false, shop_id, req.user?.id||null]
    );

    // Update account balance
    const balChange = transaction_type === 'in' ? amt : -amt;
    const acc = await client.query(
      `UPDATE finance_accounts SET balance = balance + $1 WHERE id=$2 RETURNING *`,
      [balChange, req.params.id]
    );

    // If affects_cash → update cash register
    if (affects_cash !== false) {
      const txnDate = transaction_date || new Date().toISOString().split('T')[0];
      const regCheck = await client.query(
        `SELECT status FROM cash_register WHERE register_date=$1 AND shop_id=$2 LIMIT 1`,
        [txnDate, shop_id]
      );
      const regStatus = regCheck.rows[0]?.status;
      if (regStatus === 'closed') throw new Error(`Register for ${txnDate} is closed. Please reopen first.`);
      if (!regStatus)             throw new Error(`Register for ${txnDate} is not open. Please open the register first.`);

      if (transaction_type === 'in') {
        await client.query(
          `UPDATE cash_register SET total_sales_cash = total_sales_cash + $1 WHERE register_date=$2 AND shop_id=$3 AND status='open'`,
          [amt, txnDate, shop_id]
        );
      } else {
        await client.query(
          `UPDATE cash_register SET total_expenses = total_expenses + $1 WHERE register_date=$2 AND shop_id=$3 AND status='open'`,
          [amt, txnDate, shop_id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: txn.rows[0], account: acc.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally { client.release(); }
});

// DELETE transaction
router.delete('/transactions/:id', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const txn = await client.query(`SELECT * FROM finance_transactions WHERE id=$1`, [req.params.id]);
    if (!txn.rows.length) throw new Error('Transaction not found');
    const t = txn.rows[0];

    // Reverse balance
    const balChange = t.transaction_type === 'in' ? -t.amount : t.amount;
    await client.query(`UPDATE finance_accounts SET balance = balance + $1 WHERE id=$2`, [balChange, t.account_id]);
    await client.query(`DELETE FROM finance_transactions WHERE id=$1`, [req.params.id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally { client.release(); }
});

module.exports = router;
