// src/controllers/productsController.js
const pool = require('../config/database');

const PRODUCT_TYPES = ['New (Box Pack)', 'Used', 'Refurbished', 'Parts', 'Accessories', 'Wholesale'];

const getProducts = async (req, res) => {
  try {
    const { search, category, type, is_active } = req.query;

    // Pagination params
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    let whereClause = `WHERE 1=1`;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (name ILIKE $${params.length}
                       OR brand ILIKE $${params.length}
                       OR model ILIKE $${params.length}
                       OR serial_number ILIKE $${params.length}
                       OR color ILIKE $${params.length})`;
    }
    if (category) { params.push(category); whereClause += ` AND category = $${params.length}`; }
    if (type)     { params.push(type);     whereClause += ` AND type = $${params.length}`; }
    if (is_active !== undefined && is_active !== '') {
      params.push(is_active === 'true');
      whereClause += ` AND is_active = $${params.length}`;
    }

    // COUNT query — same filters, no LIMIT/OFFSET
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // DATA query — append LIMIT/OFFSET after freezing param positions
    const dataParams = [...params, limit, offset];
    const dataResult = await pool.query(
      `SELECT * FROM products ${whereClause} ORDER BY created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({
      success: true,
      count: dataResult.rows.length,
      data: dataResult.rows,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET product by serial number — for barcode scanner lookup
const getProductBySerial = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE serial_number ILIKE $1 AND is_active = true LIMIT 10`,
      [`%${req.params.serial}%`]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single product
const getProductById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST create product
const createProduct = async (req, res) => {
  try {
    const {
      name, brand, color, serial_number,
      type = 'Used',
      // keep old fields for backward compat
      model, category, storage, condition, description,
      base_cost, selling_price, barcode, is_active = true
    } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'Product name is required' });

    // Check duplicate serial number
    if (serial_number) {
      const dup = await pool.query('SELECT 1 FROM products WHERE serial_number = $1', [serial_number]);
      if (dup.rows.length > 0)
        return res.status(400).json({ success: false, message: 'Serial number already exists' });
    }

    const result = await pool.query(
      `INSERT INTO products
        (name, brand, color, serial_number, type,
         model, category, storage, condition, description,
         base_cost, selling_price, barcode, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [name, brand, color, serial_number || null, type,
       model, category || 'Mobile Phone', storage, condition || type,
       description, base_cost || 0, selling_price || 0, barcode, is_active]
    );
    res.status(201).json({ success: true, data: result.rows[0], message: 'Product created' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT update product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, brand, color, serial_number, type,
      model, category, storage, condition, description,
      base_cost, selling_price, barcode, is_active
    } = req.body;

    const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (!existing.rows.length)
      return res.status(404).json({ success: false, message: 'Product not found' });

    if (serial_number) {
      const dup = await pool.query('SELECT 1 FROM products WHERE serial_number = $1 AND id != $2', [serial_number, id]);
      if (dup.rows.length > 0)
        return res.status(400).json({ success: false, message: 'Serial number already used' });
    }

    const result = await pool.query(
      `UPDATE products SET
        name          = COALESCE($1,  name),
        brand         = COALESCE($2,  brand),
        color         = COALESCE($3,  color),
        serial_number = COALESCE($4,  serial_number),
        type          = COALESCE($5,  type),
        model         = COALESCE($6,  model),
        category      = COALESCE($7,  category),
        storage       = COALESCE($8,  storage),
        condition     = COALESCE($9,  condition),
        description   = COALESCE($10, description),
        base_cost     = COALESCE($11, base_cost),
        selling_price = COALESCE($12, selling_price),
        barcode       = COALESCE($13, barcode),
        is_active     = COALESCE($14, is_active),
        updated_at    = NOW()
       WHERE id = $15 RETURNING *`,
      [name, brand, color, serial_number, type,
       model, category, storage, condition, description,
       base_cost, selling_price, barcode, is_active, id]
    );
    res.json({ success: true, data: result.rows[0], message: 'Product updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE product
const deleteProduct = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category');
    res.json({ success: true, data: result.rows.map(r => r.category) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getProducts, getProductById, getProductBySerial, createProduct, updateProduct, deleteProduct, getCategories };
