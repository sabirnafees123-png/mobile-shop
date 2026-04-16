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
    const { shop_id } = req.query;

    let sql = `
      SELECT p.serial_number, p.name, p.brand, p.color, p.type,
             p.category, p.selling_price, p.base_cost,
             i.quantity, s.name as shop_name, i.last_updated
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      LEFT JOIN shops s ON s.id = i.shop_id
      WHERE p.is_active = true
    `;
    const params = [];
    if (shop_id) { sql += ` AND i.shop_id = $1`; params.push(parseInt(shop_id)); }
    sql += ` ORDER BY s.name, p.name`;

    const result = await query(sql, params);

    const headers = ['Serial Number','Product Name','Brand','Color','Type','Category','Selling Price','Cost Price','Quantity','Shop','Last Updated'];
    const rows = result.rows.map(r => [
      r.serial_number || '',
      r.name,
      r.brand || '',
      r.color || '',
      r.type || '',
      r.category || '',
      Math.round(r.selling_price || 0),
      Math.round(r.base_cost || 0),
      r.quantity,
      r.shop_name || '',
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
    const { rows, shop_id } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ success: false, message: 'No data provided' });

    // Load all shops
    const shopsResult = await query(`SELECT id, name FROM shops WHERE is_active = true`);
    const shops = shopsResult.rows;

    const resolveShopId = (shopName) => {
      if (!shopName) return shop_id ? parseInt(shop_id) : null;
      const found = shops.find(s => s.name.toLowerCase().trim() === shopName.toLowerCase().trim());
      return found ? found.id : (shop_id ? parseInt(shop_id) : null);
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const productName = row.product_name || row.name || row.serial_number;
        if (!productName) { skipped++; continue; }

        // Resolve shop
        const rowShopId = resolveShopId(row.shop || row.shop_name);
        if (!rowShopId) {
          errors.push(`"${productName}": shop "${row.shop}" not found`);
          skipped++;
          continue;
        }

        let productId = null;

        // 1. Find by serial number
        if (row.serial_number && row.serial_number.trim()) {
          const bySerial = await query(
            `SELECT id FROM products WHERE serial_number = $1 LIMIT 1`,
            [row.serial_number.trim()]
          );
          if (bySerial.rows.length) productId = bySerial.rows[0].id;
        }

        // 2. Find by name
        if (!productId) {
          const byName = await query(
            `SELECT id FROM products WHERE name ILIKE $1 AND is_active = true LIMIT 1`,
            [productName.trim()]
          );
          if (byName.rows.length) productId = byName.rows[0].id;
        }

        // 3. Create new product — NO type/condition constraint issues
        if (!productId) {
          const newProduct = await query(
            `INSERT INTO products
              (name, brand, color, serial_number, category, selling_price, base_cost, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
            [
              productName,
              row.brand || null,
              row.color || null,
              row.serial_number || null,
              row.category || 'Mobile Phone',
              parseFloat(row.selling_price) || 0,
              parseFloat(row.cost_price) || parseFloat(row.base_cost) || 0,
            ]
          );
          productId = newProduct.rows[0].id;

          // Update type separately — safe even if column doesn't exist
          try {
            await query(`UPDATE products SET type = $1 WHERE id = $2`,
              [row.type || 'Used', productId]);
          } catch(e) { /* type column may not exist — ignore */ }

          created++;
        } else {
          // Update existing
          await query(
            `UPDATE products SET
              selling_price = CASE WHEN $1 > 0 THEN $1 ELSE selling_price END,
              base_cost     = CASE WHEN $2 > 0 THEN $2 ELSE base_cost END,
              color         = COALESCE(NULLIF($3,''), color),
              brand         = COALESCE(NULLIF($4,''), brand),
              updated_at    = NOW()
             WHERE id = $5`,
            [
              parseFloat(row.selling_price) || 0,
              parseFloat(row.cost_price) || parseFloat(row.base_cost) || 0,
              row.color || '',
              row.brand || '',
              productId,
            ]
          );
          updated++;
        }

        // Upsert inventory
        const qty = parseInt(row.quantity) || 0;
        await query(
          `INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
           VALUES ($1,$2,$3,5)
           ON CONFLICT (product_id, shop_id)
           DO UPDATE SET quantity = $3, last_updated = NOW()`,
          [productId, rowShopId, qty]
        );

      } catch (rowErr) {
        console.error('Import row error:', rowErr.message, row);
        errors.push(`"${row.product_name||row.name}": ${rowErr.message}`);
        skipped++;
      }
    }

    res.json({
      success: true,
      message: `Import complete — ${created} created, ${updated} updated, ${skipped} skipped`,
      created, updated, skipped,
      errors: errors.length ? errors : undefined,
    });

  } catch (err) {
    console.error('Import fatal error:', err);
    res.status(500).json({ success: false, message: err.message, stack: err.stack });
  }
});

router.post('/adjust',     adjustStock);
router.put('/settings',    updateMinStock);
router.get('/:productId',  getInventoryByProduct);

module.exports = router;
