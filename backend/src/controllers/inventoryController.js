// src/controllers/inventoryController.js
const { query, getClient } = require('../config/database');

// GET all inventory with pagination and filters
const getInventory = async (req, res) => {
  try {
    const { search, status, shop_id, type, from, to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = ['p.is_active = true'];
    const params = [];

    if (shop_id) { params.push(shop_id); whereClauses.push(`i.shop_id = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR p.serial_number ILIKE $${params.length} OR p.color ILIKE $${params.length})`);
    }
    if (type)  { params.push(type); whereClauses.push(`p.type = $${params.length}`); }
    if (from)  { params.push(from); whereClauses.push(`i.last_updated >= $${params.length}`); }
    if (to)    { params.push(to);   whereClauses.push(`i.last_updated <= $${params.length}`); }
    if (status === 'in_stock')     whereClauses.push(`i.quantity > i.min_stock`);
    if (status === 'low_stock')    whereClauses.push(`i.quantity <= i.min_stock AND i.quantity > 0`);
    if (status === 'out_of_stock') whereClauses.push(`i.quantity = 0`);

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) as total FROM inventory i JOIN products p ON i.product_id = p.id LEFT JOIN shops s ON s.id = i.shop_id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get page
    params.push(parseInt(limit));
    params.push(offset);
    const sql = `
      SELECT i.*, p.name, p.brand, p.model, p.category, p.color, p.serial_number, p.type,
             p.base_cost, p.selling_price, p.is_active,
             s.name as shop_name,
             CASE WHEN i.quantity = 0 THEN 'out_of_stock'
                  WHEN i.quantity <= i.min_stock THEN 'low_stock'
                  ELSE 'in_stock' END as stock_status
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN shops s ON s.id = i.shop_id
      ${where}
      ORDER BY s.name, i.last_updated DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (err) {
    console.error('getInventory error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single inventory item
const getInventoryByProduct = async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, p.name, p.brand, p.category, p.base_cost, p.selling_price
       FROM inventory i JOIN products p ON i.product_id = p.id
       WHERE i.product_id = $1`,
      [req.params.productId]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST adjust stock
const adjustStock = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { product_id, shop_id, type, quantity, note, cost_price } = req.body;

    if (!product_id || !shop_id || !type || quantity === undefined)
      return res.status(400).json({ success: false, message: 'product_id, shop_id, type and quantity required' });

    if (!['in', 'out', 'adjustment'].includes(type))
      return res.status(400).json({ success: false, message: 'type must be in, out, or adjustment' });

    const current = await client.query(
      'SELECT * FROM inventory WHERE product_id = $1 AND shop_id = $2',
      [product_id, shop_id]
    );
    if (!current.rows.length)
      return res.status(404).json({ success: false, message: 'Product not in inventory for this shop' });

    let newQty;
    if (type === 'in')       newQty = current.rows[0].quantity + quantity;
    else if (type === 'out') newQty = current.rows[0].quantity - quantity;
    else                     newQty = quantity;

    if (newQty < 0)
      return res.status(400).json({ success: false, message: 'Stock cannot go below 0' });

    const updated = await client.query(
      `UPDATE inventory SET quantity = $1, last_updated = NOW()
       WHERE product_id = $2 AND shop_id = $3 RETURNING *`,
      [newQty, product_id, shop_id]
    );

    // Update cost price if provided
    if (cost_price && parseFloat(cost_price) > 0) {
      await client.query(
        `UPDATE products SET base_cost = $1 WHERE id = $2`,
        [parseFloat(cost_price), product_id]
      );
    }

    await client.query(
      `INSERT INTO stock_movements (product_id, type, quantity, note, created_by) VALUES ($1,$2,$3,$4,$5)`,
      [product_id, type, quantity, note, req.user?.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: updated.rows[0], message: 'Stock updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

// PUT update cost price directly
const updateCostPrice = async (req, res) => {
  try {
    const { product_id, cost_price, selling_price } = req.body;
    if (!product_id) return res.status(400).json({ success: false, message: 'product_id required' });
    await query(
      `UPDATE products SET
        base_cost     = CASE WHEN $1 > 0 THEN $1 ELSE base_cost END,
        selling_price = CASE WHEN $2 > 0 THEN $2 ELSE selling_price END,
        updated_at    = NOW()
       WHERE id = $3`,
      [parseFloat(cost_price) || 0, parseFloat(selling_price) || 0, product_id]
    );
    res.json({ success: true, message: 'Price updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateMinStock = async (req, res) => {
  try {
    const { product_id, shop_id, min_stock } = req.body;
    const result = await query(
      `UPDATE inventory SET min_stock = COALESCE($1, min_stock), last_updated = NOW()
       WHERE product_id = $2 AND shop_id = $3 RETURNING *`,
      [min_stock, product_id, shop_id]
    );
    res.json({ success: true, data: result.rows[0], message: 'Updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getMovements = async (req, res) => {
  try {
    const { product_id, limit = 50 } = req.query;
    let sql = `
      SELECT sm.*, p.name as product_name, p.brand
      FROM stock_movements sm JOIN products p ON sm.product_id = p.id WHERE 1=1
    `;
    const params = [];
    if (product_id) { params.push(product_id); sql += ` AND sm.product_id = $${params.length}`; }
    params.push(limit);
    sql += ` ORDER BY sm.created_at DESC LIMIT $${params.length}`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getInventoryStats = async (req, res) => {
  try {
    const { shop_id } = req.query;
    let sql = `
      SELECT
        COUNT(*)                                                              AS total_products,
        COALESCE(SUM(i.quantity), 0)                                         AS total_units,
        COUNT(*) FILTER (WHERE i.quantity = 0)                               AS out_of_stock,
        COUNT(*) FILTER (WHERE i.quantity <= i.min_stock AND i.quantity > 0) AS low_stock,
        COALESCE(SUM(i.quantity * COALESCE(p.base_cost, 0)), 0)             AS total_cost_value,
        COALESCE(SUM(i.quantity * COALESCE(p.selling_price, 0)), 0)         AS total_sell_value
      FROM inventory i JOIN products p ON i.product_id = p.id WHERE p.is_active = true
    `;
    const params = [];
    if (shop_id) { sql += ` AND i.shop_id = $1`; params.push(shop_id); }
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getInventory, getInventoryByProduct, adjustStock, updateMinStock,
  updateCostPrice, getMovements, getInventoryStats
};
