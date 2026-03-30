// src/routes/inventory.js
const router = require('express').Router();
const { query } = require('../config/database');

// GET all stock with product details
router.get('/', async (req, res) => {
  try {
    const { status, product_id, imei } = req.query;
    let sql = `
      SELECT i.*, p.name as product_name, p.brand, p.model, p.condition, p.storage, p.color,
             pu.purchase_number
      FROM inventory_stock i
      JOIN products p ON p.id = i.product_id
      JOIN purchases pu ON pu.id = i.purchase_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (status) { sql += ` AND i.status = $${idx++}`; params.push(status); }
    else { sql += ` AND i.status = 'in_stock'`; } // default: show in-stock
    if (product_id) { sql += ` AND i.product_id = $${idx++}`; params.push(product_id); }
    if (imei) { sql += ` AND i.imei ILIKE $${idx++}`; params.push(`%${imei}%`); }
    sql += ` ORDER BY i.received_at DESC`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET single stock item
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, p.name as product_name, p.brand, p.model FROM inventory_stock i JOIN products p ON p.id = i.product_id WHERE i.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Stock item not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH update selling price or status
router.patch('/:id', async (req, res) => {
  try {
    const { selling_price, status, notes, location } = req.body;
    const result = await query(
      `UPDATE inventory_stock SET selling_price=COALESCE($1,selling_price), status=COALESCE($2,status), notes=COALESCE($3,notes), location=COALESCE($4,location) WHERE id=$5 RETURNING *`,
      [selling_price, status, notes, location, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
