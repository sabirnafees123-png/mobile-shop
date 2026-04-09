// src/routes/cheques.js
const router = require('express').Router();
const { query } = require('../config/database');

// GET /api/v1/cheques
router.get('/', async (req, res) => {
  try {
    const { shop_id, status, type } = req.query;
    let sql = `
      SELECT c.*, s.name as shop_name
      FROM cheques c
      LEFT JOIN shops s ON s.id = c.shop_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shop_id) { sql += ` AND c.shop_id = $${idx++}`; params.push(shop_id); }
    if (status)  { sql += ` AND c.status = $${idx++}`;  params.push(status); }
    if (type)    { sql += ` AND c.type = $${idx++}`;    params.push(type); }
    sql += ` ORDER BY c.due_date ASC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/v1/cheques
router.post('/', async (req, res) => {
  try {
    const { type, cheque_number, bank, payee_payer, amount, due_date, notes, shop_id } = req.body;
    if (!type || !amount)  return res.status(400).json({ success: false, message: 'Type and amount required' });
    if (!shop_id)          return res.status(400).json({ success: false, message: 'shop_id required' });
    const result = await query(
      `INSERT INTO cheques (type, cheque_number, bank, payee_payer, amount, due_date, notes, shop_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [type, cheque_number, bank, payee_payer, amount, due_date, notes, shop_id, req.user?.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/v1/cheques/:id
router.put('/:id', async (req, res) => {
  try {
    const { type, cheque_number, bank, payee_payer, amount, due_date, status, notes, shop_id } = req.body;
    const result = await query(
      `UPDATE cheques SET type=$1, cheque_number=$2, bank=$3, payee_payer=$4,
       amount=$5, due_date=$6, status=$7, notes=$8, shop_id=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [type, cheque_number, bank, payee_payer, amount, due_date, status, notes, shop_id, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/v1/cheques/:id
router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM cheques WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Cheque deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
