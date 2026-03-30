// src/controllers/suppliersController.js
const { query } = require('../config/database');

exports.getAll = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM suppliers WHERE is_active = true ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getOne = async (req, res) => {
  try {
    const supplier = await query(`SELECT * FROM suppliers WHERE id = $1`, [req.params.id]);
    if (!supplier.rows.length) return res.status(404).json({ success: false, message: 'Supplier not found' });
    
    const ledger = await query(
      `SELECT * FROM supplier_ledger WHERE supplier_id = $1 ORDER BY transaction_date DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...supplier.rows[0], ledger: ledger.rows } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name, phone, email, address, city, country, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Supplier name required' });
    const result = await query(
      `INSERT INTO suppliers (name, phone, email, address, city, country, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, phone, email, address, city || 'Sharjah', country || 'UAE', notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { name, phone, email, address, city, country, notes } = req.body;
    const result = await query(
      `UPDATE suppliers SET name=$1, phone=$2, email=$3, address=$4, city=$5, country=$6, notes=$7 WHERE id=$8 RETURNING *`,
      [name, phone, email, address, city, country, notes, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
