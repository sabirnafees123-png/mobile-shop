// src/routes/inventory.js
const express = require('express');
const router  = express.Router();
const {
  getInventory, getInventoryByProduct, adjustStock,
  updateMinStock, getMovements, getInventoryStats
} = require('../controllers/inventoryController');

router.get('/',           getInventory);
router.get('/stats',      getInventoryStats);
router.get('/movements',  getMovements);

// ── EXPORT inventory as CSV ──────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const { query } = require('../config/database');
    const result = await query(`
      SELECT p.name, p.brand, p.model, p.category, p.color,
             p.storage, p.condition, p.selling_price, p.base_cost,
             i.quantity, i.min_stock, i.last_updated
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE p.is_active = true
      ORDER BY p.name
    `);

    const headers = ['Name','Brand','Model','Category','Color','Storage','Condition','Selling Price','Cost Price','Quantity','Min Stock','Last Updated'];
    const rows = result.rows.map(r => [
      r.name, r.brand, r.model, r.category, r.color,
      r.storage, r.condition,
      Math.round(r.selling_price || 0),
      Math.round(r.base_cost || 0),
      r.quantity, r.min_stock,
      r.last_updated ? new Date(r.last_updated).toLocaleDateString('en-AE') : ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${(cell||'').toString().replace(/"/g,'""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inventory_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── IMPORT inventory from CSV ────────────────────────────────────────────────
router.post('/import', async (req, res) => {
  try {
    const { query } = require('../config/database');
    const { rows } = req.body; // Array of objects from parsed CSV

    if (!rows || !Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ success: false, message: 'No data provided' });

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.name) { skipped++; continue; }

      // Find product by name + brand
      const product = await query(
        `SELECT id FROM products WHERE name ILIKE $1 AND (brand ILIKE $2 OR $2 IS NULL) AND is_active=true LIMIT 1`,
        [row.name, row.brand || null]
      );

      if (!product.rows.length) { skipped++; continue; }

      const productId = product.rows[0].id;
      const qty = parseInt(row.quantity) || 0;
      const minStock = parseInt(row.min_stock) || 5;

      // Update inventory quantity
      await query(`
        UPDATE inventory SET quantity=$1, min_stock=$2, last_updated=NOW()
        WHERE product_id=$3
      `, [qty, minStock, productId]);

      // Update selling price if provided
      if (row.selling_price && parseFloat(row.selling_price) > 0) {
        await query(`UPDATE products SET selling_price=$1 WHERE id=$2`, [parseFloat(row.selling_price), productId]);
      }

      updated++;
    }

    res.json({ success: true, message: `Updated ${updated} products, skipped ${skipped}`, updated, skipped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:productId',  getInventoryByProduct);
router.post('/adjust',     adjustStock);
router.put('/settings',    updateMinStock);

module.exports = router;
