// src/routes/expenses.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

// GET /api/v1/expenses/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM expense_categories WHERE is_active = true ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/v1/expenses/categories
router.post('/categories', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const result = await query(
      `INSERT INTO expense_categories (name, description) VALUES ($1, $2) RETURNING *`,
      [name, description || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/v1/expenses
router.get('/', async (req, res) => {
  try {
    const { from, to, category, category_id, shop_id } = req.query;
    let sql = `
      SELECT e.*, s.name as shop_name, ec.name as category_name
      FROM expenses e
      LEFT JOIN shops s ON s.id = e.shop_id
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (from)        { sql += ` AND e.expense_date >= $${idx++}`; params.push(from); }
    if (to)          { sql += ` AND e.expense_date <= $${idx++}`; params.push(to); }
    if (category)    { sql += ` AND e.category = $${idx++}`;      params.push(category); }
    if (category_id) { sql += ` AND e.category_id = $${idx++}`;   params.push(category_id); }
    if (shop_id)     { sql += ` AND e.shop_id = $${idx++}`;       params.push(shop_id); }
    sql += ` ORDER BY e.expense_date DESC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/v1/expenses
router.post('/', async (req, res) => {
  try {
    const {
      category, category_id, description, amount, payment_method,
      expense_date, receipt_number, notes, payee,
      expense_type, status, shop_id
    } = req.body;
    if (!amount)  return res.status(400).json({ success: false, message: 'Amount required' });
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });
    const result = await query(
      `INSERT INTO expenses
        (category, category_id, description, amount, payment_method,
         expense_date, receipt_number, notes, payee, expense_type, status, shop_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        category || null, category_id || null, description, amount,
        payment_method || 'cash',
        expense_date || new Date().toISOString().split('T')[0],
        receipt_number, notes, payee,
        expense_type || 'one-time', status || 'paid', shop_id
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/v1/expenses/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      category, category_id, description, amount, payment_method,
      expense_date, receipt_number, notes, payee,
      expense_type, status, shop_id
    } = req.body;
    const result = await query(
      `UPDATE expenses SET
        category=$1, category_id=$2, description=$3, amount=$4, payment_method=$5,
        expense_date=$6, receipt_number=$7, notes=$8, payee=$9,
        expense_type=$10, status=$11, shop_id=$12
       WHERE id=$13 RETURNING *`,
      [
        category || null, category_id || null, description, amount, payment_method,
        expense_date, receipt_number, notes, payee,
        expense_type || 'one-time', status || 'paid', shop_id, req.params.id
      ]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/v1/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM expenses WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;