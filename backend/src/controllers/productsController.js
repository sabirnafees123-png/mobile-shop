// src/controllers/productsController.js
const { query } = require('../config/database');

// GET /api/v1/products
exports.getAllProducts = async (req, res) => {
  try {
    const { brand, category, condition, search } = req.query;
    
    let sql = `SELECT * FROM products WHERE is_active = true`;
    const params = [];
    let idx = 1;

    if (brand) { sql += ` AND brand ILIKE $${idx++}`; params.push(`%${brand}%`); }
    if (category) { sql += ` AND category = $${idx++}`; params.push(category); }
    if (condition) { sql += ` AND condition = $${idx++}`; params.push(condition); }
    if (search) { sql += ` AND (name ILIKE $${idx++} OR model ILIKE $${idx - 1})`; params.push(`%${search}%`); }

    sql += ` ORDER BY brand, name`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/products/:id
exports.getProduct = async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, 
        COALESCE(SUM(i.qty_remaining), 0) as stock_qty,
        MIN(i.unit_cost) as min_cost,
        MAX(i.unit_cost) as max_cost
       FROM products p
       LEFT JOIN inventory_stock i ON i.product_id = p.id AND i.status = 'in_stock'
       WHERE p.id = $1 AND p.is_active = true
       GROUP BY p.id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/products
exports.createProduct = async (req, res) => {
  try {
    const { name, brand, model, category, storage, color, condition, description, imei_required } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Product name is required' });

    const result = await query(
      `INSERT INTO products (name, brand, model, category, storage, color, condition, description, imei_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, brand, model, category || 'Mobile Phone', storage, color, condition || 'Used', description, imei_required !== false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/v1/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const { name, brand, model, category, storage, color, condition, description } = req.body;
    const result = await query(
      `UPDATE products SET name=$1, brand=$2, model=$3, category=$4, storage=$5, color=$6, condition=$7, description=$8
       WHERE id=$9 RETURNING *`,
      [name, brand, model, category, storage, color, condition, description, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/products/stock/low - products with low or zero stock
exports.getLowStock = async (req, res) => {
  try {
    const result = await query(`
      SELECT p.id, p.name, p.brand, p.model, p.condition,
             COALESCE(SUM(i.qty_remaining), 0) as stock_qty
      FROM products p
      LEFT JOIN inventory_stock i ON i.product_id = p.id AND i.status = 'in_stock'
      WHERE p.is_active = true
      GROUP BY p.id
      HAVING COALESCE(SUM(i.qty_remaining), 0) <= 2
      ORDER BY stock_qty ASC
    `);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
