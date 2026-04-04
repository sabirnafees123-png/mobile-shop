// src/routes/shops.js
const express = require('express');
const router  = express.Router();
const { query, getClient } = require('../config/database');

// GET all shops
router.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM shops WHERE is_active = true ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET inventory by shop
router.get('/:shopId/inventory', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { search, status } = req.query;
    let sql = `
      SELECT i.*, p.name, p.brand, p.model, p.category, p.color,
             p.selling_price, p.base_cost,
             s.name as shop_name
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      JOIN shops s ON s.id = i.shop_id
      WHERE i.shop_id = $1 AND p.is_active = true
    `;
    const params = [shopId];
    let idx = 2;
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (p.name ILIKE $${idx} OR p.brand ILIKE $${idx} OR p.model ILIKE $${idx})`;
      idx++;
    }
    if (status === 'in_stock')     sql += ` AND i.quantity > i.min_stock`;
    if (status === 'low_stock')    sql += ` AND i.quantity <= i.min_stock AND i.quantity > 0`;
    if (status === 'out_of_stock') sql += ` AND i.quantity = 0`;
    sql += ` ORDER BY p.name`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET transfers
router.get('/transfers', async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = `
      SELECT st.*, 
        p.name as product_name, p.brand,
        fs.name as from_shop_name,
        ts.name as to_shop_name
      FROM stock_transfers st
      JOIN products p ON p.id = st.product_id
      JOIN shops fs ON fs.id = st.from_shop_id
      JOIN shops ts ON ts.id = st.to_shop_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (from) { sql += ` AND st.transfer_date >= $${idx++}`; params.push(from); }
    if (to)   { sql += ` AND st.transfer_date <= $${idx++}`; params.push(to); }
    sql += ` ORDER BY st.created_at DESC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST internal transfer
router.post('/transfers', async (req, res) => {
  const client = await getClient();
  try {
    const { from_shop_id, to_shop_id, product_id, quantity, transfer_date, notes } = req.body;
    if (!from_shop_id || !to_shop_id || !product_id || !quantity)
      return res.status(400).json({ success: false, message: 'All fields required' });
    if (from_shop_id === to_shop_id)
      return res.status(400).json({ success: false, message: 'Cannot transfer to same shop' });

    await client.query('BEGIN');

    // Check source inventory
    const src = await client.query(
      `SELECT * FROM inventory WHERE product_id = $1 AND shop_id = $2`,
      [product_id, from_shop_id]
    );
    if (!src.rows.length || src.rows[0].quantity < quantity)
      throw new Error('Insufficient stock in source shop');

    // Deduct from source
    await client.query(
      `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW()
       WHERE product_id = $2 AND shop_id = $3`,
      [quantity, product_id, from_shop_id]
    );

    // Add to destination (upsert)
    await client.query(`
      INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
      VALUES ($1, $2, $3, 5)
      ON CONFLICT (product_id, shop_id)
      DO UPDATE SET quantity = inventory.quantity + $3, last_updated = NOW()
    `, [product_id, to_shop_id, quantity]);

    // Log transfer
    const result = await client.query(`
      INSERT INTO stock_transfers (from_shop_id, to_shop_id, product_id, quantity, transfer_date, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [from_shop_id, to_shop_id, product_id, quantity,
        transfer_date || new Date().toISOString().split('T')[0],
        notes || null, req.user?.id]);

    // Log stock movements
    await client.query(
      `INSERT INTO stock_movements (product_id, type, quantity, note, created_by) VALUES ($1, 'out', $2, $3, $4)`,
      [product_id, quantity, `Transfer to shop ${to_shop_id}`, req.user?.id]
    );
    await client.query(
      `INSERT INTO stock_movements (product_id, type, quantity, note, created_by) VALUES ($1, 'in', $2, $3, $4)`,
      [product_id, quantity, `Transfer from shop ${from_shop_id}`, req.user?.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally { client.release(); }
});

module.exports = router;
