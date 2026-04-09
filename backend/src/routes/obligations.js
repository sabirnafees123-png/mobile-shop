// src/routes/obligations.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

// GET /api/v1/obligations
router.get('/', async (req, res) => {
  try {
    const { shop_id, type, status, obligation_model } = req.query;
    let sql = `
      SELECT o.*, s.name as shop_name,
             ec.name as category_name,
             ch.cheque_number, ch.bank
      FROM obligations o
      LEFT JOIN shops s               ON s.id  = o.shop_id
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      LEFT JOIN cheques ch             ON ch.id = o.cheque_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shop_id)          { sql += ` AND o.shop_id = $${idx++}`;           params.push(shop_id); }
    if (type)             { sql += ` AND o.type = $${idx++}`;              params.push(type); }
    if (status)           { sql += ` AND o.status = $${idx++}`;            params.push(status); }
    if (obligation_model) { sql += ` AND o.obligation_model = $${idx++}`;  params.push(obligation_model); }
    sql += ` ORDER BY o.due_date ASC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/v1/obligations/upcoming
router.get('/upcoming', async (req, res) => {
  try {
    const { shop_id } = req.query;
    const today  = new Date().toISOString().split('T')[0];
    const next30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    let sql = `
      SELECT o.*, s.name as shop_name,
             ec.name as category_name,
             ch.cheque_number, ch.bank,
             CASE
               WHEN o.due_date < $1 THEN 'overdue'
               WHEN o.due_date <= $2 THEN 'due_soon'
               ELSE 'upcoming'
             END as urgency
      FROM obligations o
      LEFT JOIN shops s               ON s.id  = o.shop_id
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      LEFT JOIN cheques ch             ON ch.id = o.cheque_id
      WHERE o.status = 'pending'
    `;
    const params = [today, next30];
    let idx = 3;
    if (shop_id) { sql += ` AND o.shop_id = $${idx++}`; params.push(shop_id); }
    sql += ` ORDER BY o.due_date ASC LIMIT 50`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/v1/obligations
router.post('/', async (req, res) => {
  try {
    const {
      shop_id, type, title, person_name, due_date, amount, status, notes,
      obligation_model, cheque_id, category_id, is_recurring, recurrence_period,
    } = req.body;

    if (!title || !due_date || !type)
      return res.status(400).json({ success: false, message: 'Title, type and due_date required' });

    const model = obligation_model || 'confirmed';

    const result = await query(`
      INSERT INTO obligations
        (shop_id, type, title, person_name, due_date, amount, status, notes,
         obligation_model, cheque_id, category_id, is_recurring, recurrence_period)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      shop_id || null, type, title, person_name || null, due_date,
      amount || 0, status || 'pending', notes || null,
      model,
      model === 'cheque' ? (cheque_id || null) : null,
      category_id || null,
      is_recurring || false,
      recurrence_period || null,
    ]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/v1/obligations/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      shop_id, type, title, person_name, due_date, amount, status, notes,
      obligation_model, cheque_id, category_id, is_recurring, recurrence_period,
    } = req.body;
    const model = obligation_model || 'confirmed';
    const result = await query(`
      UPDATE obligations SET
        shop_id=$1, type=$2, title=$3, person_name=$4,
        due_date=$5, amount=$6, status=$7, notes=$8,
        obligation_model=$9, cheque_id=$10, category_id=$11,
        is_recurring=$12, recurrence_period=$13
      WHERE id=$14 RETURNING *
    `, [
      shop_id || null, type, title, person_name || null,
      due_date, amount || 0, status || 'pending', notes || null,
      model,
      model === 'cheque' ? (cheque_id || null) : null,
      category_id || null,
      is_recurring || false,
      recurrence_period || null,
      req.params.id,
    ]);
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Obligation not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/v1/obligations/:id
router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM obligations WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
