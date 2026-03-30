// src/routes/customers.js
const router = require('express').Router();
const { query } = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM customers WHERE is_active = true ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM customers WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, phone, email, address, city, country, id_number, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Customer name required' });
    const result = await query(
      `INSERT INTO customers (name, phone, email, address, city, country, id_number, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, phone, email, address, city, country || 'UAE', id_number, notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, address, city, country, id_number, notes } = req.body;
    const result = await query(
      `UPDATE customers SET name=$1, phone=$2, email=$3, address=$4, city=$5, country=$6, id_number=$7, notes=$8 WHERE id=$9 RETURNING *`,
      [name, phone, email, address, city, country, id_number, notes, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
