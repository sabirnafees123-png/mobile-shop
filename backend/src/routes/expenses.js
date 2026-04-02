// src/routes/expenses.js
const router = require('express').Router();
const { query } = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const { from, to, category } = req.query;
    let sql = `SELECT * FROM expenses WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (from) { sql += ` AND expense_date >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND expense_date <= $${idx++}`; params.push(to); }
    if (category) { sql += ` AND category = $${idx++}`; params.push(category); }
    sql += ` ORDER BY expense_date DESC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { category, description, amount, payment_method, expense_date, receipt_number, notes, payee, expense_type, status } = req.body;
    if (!category || !amount) return res.status(400).json({ success: false, message: 'Category and amount required' });
    const result = await query(
      `INSERT INTO expenses (category, description, amount, payment_method, expense_date, receipt_number, notes, payee, expense_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [category, description, amount, payment_method || 'cash', expense_date || new Date().toISOString().split('T')[0], receipt_number, notes, payee, expense_type || 'one-time', status || 'paid']
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM expenses WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
