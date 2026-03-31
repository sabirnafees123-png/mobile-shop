const pool = require('../config/database');

// GET all inventory with product details
const getInventory = async (req, res) => {
  try {
    const { search, low_stock } = req.query;
    let query = `
      SELECT i.*, p.name, p.brand, p.model, p.category, p.is_active,
             CASE WHEN i.quantity <= i.min_stock THEN true ELSE false END as is_low_stock
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.is_active = true
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR p.model ILIKE $${params.length})`;
    }
    if (low_stock === 'true') {
      query += ` AND i.quantity <= i.min_stock`;
    }

    query += ` ORDER BY i.quantity ASC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getInventory error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET single inventory item
const getInventoryByProduct = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, p.name, p.brand, p.category
       FROM inventory i JOIN products p ON i.product_id = p.id
       WHERE i.product_id = $1`,
      [req.params.productId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST adjust stock (add/remove/set)
const adjustStock = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { product_id, type, quantity, note } = req.body;

    if (!product_id || !type || quantity === undefined)
      return res.status(400).json({ success: false, message: 'product_id, type and quantity are required' });

    if (!['in', 'out', 'adjustment'].includes(type))
      return res.status(400).json({ success: false, message: 'type must be in, out, or adjustment' });

    if (quantity < 0)
      return res.status(400).json({ success: false, message: 'Quantity must be positive' });

    // Get current stock
    const current = await client.query(
      'SELECT * FROM inventory WHERE product_id = $1', [product_id]
    );
    if (current.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Product not in inventory' });

    let newQty;
    if (type === 'in')         newQty = current.rows[0].quantity + quantity;
    else if (type === 'out')   newQty = current.rows[0].quantity - quantity;
    else                       newQty = quantity; // adjustment = set absolute value

    if (newQty < 0)
      return res.status(400).json({ success: false, message: 'Stock cannot go below 0' });

    // Update inventory
    const updated = await client.query(
      `UPDATE inventory SET quantity = $1, last_updated = NOW()
       WHERE product_id = $2 RETURNING *`,
      [newQty, product_id]
    );

    // Log movement
    await client.query(
      `INSERT INTO stock_movements (product_id, type, quantity, note, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [product_id, type, quantity, note, req.user?.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: updated.rows[0], message: 'Stock updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('adjustStock error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
};

// PUT update min stock level
const updateMinStock = async (req, res) => {
  try {
    const { product_id, min_stock, location } = req.body;
    const result = await pool.query(
      `UPDATE inventory SET min_stock = COALESCE($1, min_stock),
        location = COALESCE($2, location), last_updated = NOW()
       WHERE product_id = $3 RETURNING *`,
      [min_stock, location, product_id]
    );
    res.json({ success: true, data: result.rows[0], message: 'Updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET stock movements log
const getMovements = async (req, res) => {
  try {
    const { product_id, limit = 50 } = req.query;
    let query = `
      SELECT sm.*, p.name as product_name, p.brand
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (product_id) {
      params.push(product_id);
      query += ` AND sm.product_id = $${params.length}`;
    }
    params.push(limit);
    query += ` ORDER BY sm.created_at DESC LIMIT $${params.length}`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET summary stats
const getInventoryStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                         as total_products,
        SUM(i.quantity)                                  as total_units,
        COUNT(*) FILTER (WHERE i.quantity = 0)           as out_of_stock,
        COUNT(*) FILTER (WHERE i.quantity <= i.min_stock AND i.quantity > 0) as low_stock,
        SUM(i.quantity * p.base_cost)                   as total_cost_value,
        SUM(i.quantity * p.selling_price)               as total_sell_value
      FROM inventory i JOIN products p ON i.product_id = p.id
      WHERE p.is_active = true
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getInventory, getInventoryByProduct, adjustStock,
  updateMinStock, getMovements, getInventoryStats
};