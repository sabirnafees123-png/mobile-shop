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
             CONCAT(ec.category, ' / ', COALESCE(ec.sub_category,'')) as category_name
      FROM obligations o
      LEFT JOIN shops s               ON s.id  = o.shop_id
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
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
             CASE
               WHEN o.due_date < $1 THEN 'overdue'
               WHEN o.due_date <= $2 THEN 'due_soon'
               ELSE 'upcoming'
             END as urgency
      FROM obligations o
      LEFT JOIN shops s               ON s.id  = o.shop_id
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
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
      obligation_model, category_id, is_recurring, recurrence_period,
      cheque_number, bank, payee_payer, shop_allocation,
    } = req.body;

    if (!title || !due_date || !type)
      return res.status(400).json({ success: false, message: 'Title, type and due_date required' });

    const model = obligation_model || 'confirmed';
    const allocation = shop_allocation || 'single';
    // shop_id is optional — null when allocation covers both shops or is split
    const finalShopId = (allocation === 'both' || allocation === 'split_equal') ? null : (shop_id || null);

    const result = await query(`
      INSERT INTO obligations
        (shop_id, type, title, person_name, due_date, amount, status, notes,
         obligation_model, category_id, is_recurring, recurrence_period,
         cheque_number, bank, payee_payer, shop_allocation)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *
    `, [
      finalShopId, type, title, person_name || null, due_date,
      amount || 0, status || 'pending', notes || null,
      model,
      category_id || null,
      is_recurring || false,
      recurrence_period || null,
      model === 'cheque' ? (cheque_number || null) : null,
      model === 'cheque' ? (bank || null) : null,
      model === 'cheque' ? (payee_payer || null) : null,
      allocation,
    ]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/v1/obligations/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      shop_id, type, title, person_name, due_date, amount, status, notes,
      obligation_model, category_id, is_recurring, recurrence_period,
      cheque_number, bank, payee_payer, shop_allocation,
    } = req.body;
    const model = obligation_model || 'confirmed';
    const allocation = shop_allocation || 'single';
    const finalShopId = (allocation === 'both' || allocation === 'split_equal') ? null : (shop_id || null);

    const result = await query(`
      UPDATE obligations SET
        shop_id=$1, type=$2, title=$3, person_name=$4,
        due_date=$5, amount=$6, status=$7, notes=$8,
        obligation_model=$9, category_id=$10,
        is_recurring=$11, recurrence_period=$12,
        cheque_number=$13, bank=$14, payee_payer=$15, shop_allocation=$16
      WHERE id=$17 RETURNING *
    `, [
      finalShopId, type, title, person_name || null,
      due_date, amount || 0, status || 'pending', notes || null,
      model,
      category_id || null,
      is_recurring || false,
      recurrence_period || null,
      model === 'cheque' ? (cheque_number || null) : null,
      model === 'cheque' ? (bank || null) : null,
      model === 'cheque' ? (payee_payer || null) : null,
      allocation,
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
