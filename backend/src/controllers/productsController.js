const pool = require('../config/database');

// GET all products
const getProducts = async (req, res) => {
  try {
    const { search, category, is_active } = req.query;
    let query = `SELECT * FROM products WHERE 1=1`;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length}
                   OR brand ILIKE $${params.length}
                   OR model ILIKE $${params.length}
                   OR barcode ILIKE $${params.length})`;
    }
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (is_active !== undefined && is_active !== '') {
      params.push(is_active === 'true');
      query += ` AND is_active = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getProducts error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching products' });
  }
};

// GET single product
const getProductById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST create product
const createProduct = async (req, res) => {
  try {
    const { name, brand, model, category, storage, color, condition, description, base_cost, selling_price, barcode, is_active = true } = req.body;

    if (!name)
      return res.status(400).json({ success: false, message: 'Product name is required' });

    if (barcode) {
      const dup = await pool.query('SELECT 1 FROM products WHERE barcode = $1', [barcode]);
      if (dup.rows.length > 0)
        return res.status(400).json({ success: false, message: 'Barcode already exists' });
    }

    const result = await pool.query(
      `INSERT INTO products (name, brand, model, category, storage, color, condition, description, base_cost, selling_price, barcode, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, brand, model, category, storage, color, condition, description, base_cost || 0, selling_price || 0, barcode, is_active]
    );
    res.status(201).json({ success: true, data: result.rows[0], message: 'Product created' });
  } catch (err) {
    console.error('createProduct error:', err);
    res.status(500).json({ success: false, message: 'Server error creating product' });
  }
};

// PUT update product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, brand, model, category, storage, color, condition, description, base_cost, selling_price, barcode, is_active } = req.body;

    const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Product not found' });

    if (barcode) {
      const dup = await pool.query('SELECT 1 FROM products WHERE barcode = $1 AND id != $2', [barcode, id]);
      if (dup.rows.length > 0)
        return res.status(400).json({ success: false, message: 'Barcode already used by another product' });
    }

    const result = await pool.query(
      `UPDATE products SET
        name          = COALESCE($1,  name),
        brand         = COALESCE($2,  brand),
        model         = COALESCE($3,  model),
        category      = COALESCE($4,  category),
        storage       = COALESCE($5,  storage),
        color         = COALESCE($6,  color),
        condition     = COALESCE($7,  condition),
        description   = COALESCE($8,  description),
        base_cost     = COALESCE($9,  base_cost),
        selling_price = COALESCE($10, selling_price),
        barcode       = COALESCE($11, barcode),
        is_active     = COALESCE($12, is_active),
        updated_at    = NOW()
       WHERE id = $13 RETURNING *`,
      [name, brand, model, category, storage, color, condition, description, base_cost, selling_price, barcode, is_active, id]
    );
    res.json({ success: true, data: result.rows[0], message: 'Product updated' });
  } catch (err) {
    console.error('updateProduct error:', err);
    res.status(500).json({ success: false, message: 'Server error updating product' });
  }
};

// DELETE product
const deleteProduct = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error deleting product' });
  }
};

// GET distinct categories
const getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category');
    res.json({ success: true, data: result.rows.map(r => r.category) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, deleteProduct, getCategories };