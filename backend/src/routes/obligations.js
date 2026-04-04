// src/routes/obligations.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

// GET all obligations
router.get('/', async (req, res) => {
  try {
    const { shop_id, type, status } = req.query;
    let sql = `
      SELECT o.*, s.name as shop_name
      FROM obligations o
      LEFT JOIN shops s ON s.id = o.shop_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shop_id) { sql += ` AND o.shop_id = $${idx++}`; params.push(shop_id); }
    if (type)    { sql += ` AND o.type = $${idx++}`;    params.push(type); }
    if (status)  { sql += ` AND o.status = $${idx++}`;  params.push(status); }
    sql += ` ORDER BY o.due_date ASC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST new obligation
router.post('/', async (req, res) => {
  try {
    const { shop_id, type, title, person_name, due_date, amount, status, notes } = req.body;
    if (!title || !due_date || !type)
      return res.status(400).json({ success: false, message: 'Title, type and due date are required' });
    const result = await query(`
      INSERT INTO obligations (shop_id, type, title, person_name, due_date, amount, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [shop_id||null, type, title, person_name||null, due_date,
        amount||0, status||'pending', notes||null]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT update obligation
router.put('/:id', async (req, res) => {
  try {
    const { shop_id, type, title, person_name, due_date, amount, status, notes } = req.body;
    const result = await query(`
      UPDATE obligations SET shop_id=$1, type=$2, title=$3, person_name=$4,
      due_date=$5, amount=$6, status=$7, notes=$8
      WHERE id=$9 RETURNING *
    `, [shop_id||null, type, title, person_name||null, due_date,
        amount||0, status||'pending', notes||null, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE obligation
router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM obligations WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET upcoming summary (next 30 days)
router.get('/upcoming', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const next30 = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
    const result = await query(`
      SELECT o.*, s.name as shop_name,
        CASE 
          WHEN o.due_date < $1 THEN 'overdue'
          WHEN o.due_date <= $2 THEN 'due_soon'
          ELSE 'upcoming'
        END as urgency
      FROM obligations o
      LEFT JOIN shops s ON s.id = o.shop_id
      WHERE o.status = 'pending'
      ORDER BY o.due_date ASC
      LIMIT 50
    `, [today, next30]);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
