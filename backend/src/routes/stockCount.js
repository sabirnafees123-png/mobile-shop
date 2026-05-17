// src/routes/stockCount.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

// ── GET /api/v1/stock-count?shop_id=X ────────────────────────────────────────
// Get current inventory for counting (grouped by category)
router.get('/', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.status(400).json({ success: false, message: 'shop_id required' });

    const result = await query(`
      SELECT
        p.id as product_id,
        p.name, p.brand,
        COALESCE(p.category, 'Uncategorized')     as category,
        COALESCE(p.sub_category, 'Uncategorized') as sub_category,
        COALESCE(i.quantity, 0) as system_qty
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE i.shop_id = $1
        AND p.is_active = true
        AND i.quantity > 0
      ORDER BY p.category, p.sub_category, p.name
    `, [shop_id]);

    // Category summary
    const summary = {};
    result.rows.forEach(r => {
      if (!summary[r.category]) summary[r.category] = { count: 0, units: 0 };
      summary[r.category].count++;
      summary[r.category].units += parseInt(r.system_qty);
    });

    res.json({ success: true, data: result.rows, summary });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/stock-count/history?shop_id=X ────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { shop_id } = req.query;
    const shopFilter = shop_id ? `WHERE sc.shop_id = $1` : '';
    const params = shop_id ? [shop_id] : [];

    const result = await query(`
      SELECT
        sc.*,
        s.name as shop_name,
        u.name as counted_by_name,
        COUNT(sci.id) as item_count,
        COUNT(CASE WHEN sci.variance < 0 THEN 1 END) as items_missing,
        SUM(CASE WHEN sci.variance < 0 THEN ABS(sci.variance) ELSE 0 END) as total_missing_units
      FROM stock_counts sc
      LEFT JOIN shops s ON s.id = sc.shop_id
      LEFT JOIN users u ON u.id = sc.created_by
      LEFT JOIN stock_count_items sci ON sci.stock_count_id = sc.id
      ${shopFilter}
      GROUP BY sc.id, s.name, u.name
      ORDER BY sc.created_at DESC
      LIMIT 20
    `, params);

    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/stock-count/:id ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        sci.*,
        p.name as product_name, p.brand,
        p.category, p.sub_category
      FROM stock_count_items sci
      JOIN products p ON p.id = sci.product_id
      WHERE sci.stock_count_id = $1
      ORDER BY p.category, p.name
    `, [req.params.id]);

    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/v1/stock-count ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { shop_id, count_date, items, notes, created_by } = req.body;
    if (!shop_id || !items?.length) return res.status(400).json({ success: false, message: 'Shop and items required' });

    // Create header
    const header = await query(`
      INSERT INTO stock_counts (shop_id, count_date, status, notes, created_by)
      VALUES ($1, $2, 'completed', $3, $4) RETURNING *
    `, [shop_id, count_date || new Date().toISOString().split('T')[0], notes || '', created_by || null]);

    const countId = header.rows[0].id;

    // Insert items
    for (const item of items) {
      await query(`
        INSERT INTO stock_count_items (stock_count_id, product_id, system_qty, actual_qty, notes)
        VALUES ($1, $2, $3, $4, $5)
      `, [countId, item.product_id, item.system_qty, item.actual_qty, item.notes || '']);
    }

    res.json({ success: true, data: header.rows[0], message: 'Stock count saved!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
