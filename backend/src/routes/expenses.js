// src/routes/expenses.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const checkRegisterLock = require('../middleware/checkRegisterLock');
// GET /api/v1/expenses/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM expense_categories WHERE is_active = true ORDER BY category, sub_category`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
// GET /api/v1/expenses
router.get('/', async (req, res) => {
  try {
    const { from, to, category, category_id, shop_id } = req.query;
    let sql = `
      SELECT e.*, s.name as shop_name, ec.category as category_name, ec.sub_category as sub_category_name
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
router.post('/', checkRegisterLock, async (req, res) => {
  try {
    const {
      category, sub_category, category_id, description, amount, payment_method,
      expense_date, receipt_number, notes, payee,
      expense_type, status, shop_id
    } = req.body;
    if (!amount)  return res.status(400).json({ success: false, message: 'Amount required' });
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });
    const result = await query(
      `INSERT INTO expenses
        (category, sub_category, category_id, description, amount, payment_method,
         expense_date, receipt_number, notes, payee, expense_type, status, shop_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        category || null, sub_category || null, category_id || null, description, amount,
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
      category, sub_category, category_id, description, amount, payment_method,
      expense_date, receipt_number, notes, payee,
      expense_type, status, shop_id
    } = req.body;
    const result = await query(
      `UPDATE expenses SET
        category=$1, sub_category=$2, category_id=$3, description=$4, amount=$5, payment_method=$6,
        expense_date=$7, receipt_number=$8, notes=$9, payee=$10,
        expense_type=$11, status=$12, shop_id=$13
       WHERE id=$14 RETURNING *`,
      [
        category || null, sub_category || null, category_id || null, description, amount, payment_method,
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
