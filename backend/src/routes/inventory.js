// src/routes/inventory.js
const express = require('express');
const router  = express.Router();
const {
  getInventory, getInventoryByProduct, adjustStock,
  updateMinStock, updateCostPrice, getMovements, getInventoryStats
} = require('../controllers/inventoryController');

router.get('/',              getInventory);
router.get('/stats',         getInventoryStats);
router.get('/movements',     getMovements);
router.post('/update-price', updateCostPrice);

// ── EXPORT ──────────────────────────────────────────────────────────────────
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
      r.serial_number||'', r.name, r.brand||'', r.color||'', r.type||'',
      r.category||'', Math.round(r.selling_price||0), Math.round(r.base_cost||0),
      r.quantity, r.shop_name||'',
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

// ── IMPORT ──────────────────────────────────────────────────────────────────
router.post('/import', async (req, res) => {
  try {
    const { query } = require('../config/database');
    const { rows, shop_id } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ success: false, message: 'No data provided' });

    const shopsResult = await query(`SELECT id, name FROM shops WHERE is_active = true`);
    const shops = shopsResult.rows;

    const existingProducts = await query(`SELECT id, name, serial_number FROM products WHERE is_active = true`);
    const bySerial = {};
    const byName   = {};
    for (const p of existingProducts.rows) {
      if (p.serial_number) bySerial[p.serial_number.toLowerCase()] = p.id;
      byName[p.name.toLowerCase()] = p.id;
    }

    const resolveShopId = (shopName) => {
      if (!shopName || !shopName.trim()) return shop_id ? parseInt(shop_id) : null;
      const clean = shopName.trim().toLowerCase().replace(/\s+/g, '');
      const found = shops.find(s => s.name.trim().toLowerCase().replace(/\s+/g, '') === clean);
      return found ? found.id : (shop_id ? parseInt(shop_id) : null);
    };

    let created = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const productName = row.product_name || row.name || row.serial_number;
        if (!productName) { skipped++; continue; }

        const finalShopId = resolveShopId(row.shop || row.shop_name);
        if (!finalShopId) { errors.push(`"${productName}": shop not found`); skipped++; continue; }

        let productId =
          (row.serial_number?.trim() ? bySerial[row.serial_number.trim().toLowerCase()] : null) ||
          byName[productName.trim().toLowerCase()] || null;

        if (!productId) {
          const newProduct = await query(
            `INSERT INTO products (name, brand, color, serial_number, category, selling_price, base_cost, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
            [productName, row.brand||null, row.color||null, row.serial_number||null,
             row.category||'Mobile Phone', parseFloat(row.selling_price)||0,
             parseFloat(row.cost_price)||parseFloat(row.base_cost)||0]
          );
          productId = newProduct.rows[0].id;
          try { await query(`UPDATE products SET type=$1 WHERE id=$2`, [row.type||'Used', productId]); } catch(e) {}
          if (row.serial_number) bySerial[row.serial_number.toLowerCase()] = productId;
          byName[productName.toLowerCase()] = productId;
          created++;
        } else {
          await query(
            `UPDATE products SET
              selling_price = CASE WHEN $1 > 0 THEN $1 ELSE selling_price END,
              base_cost     = CASE WHEN $2 > 0 THEN $2 ELSE base_cost END,
              color         = COALESCE(NULLIF($3,''), color),
              updated_at    = NOW()
             WHERE id = $4`,
            [parseFloat(row.selling_price)||0, parseFloat(row.cost_price)||parseFloat(row.base_cost)||0,
             row.color||'', productId]
          );
          updated++;
        }

        const qty = parseInt(row.quantity) || 0;
        await query(
          `INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
           VALUES ($1,$2,$3,5)
           ON CONFLICT (product_id, shop_id)
           DO UPDATE SET quantity = $3, last_updated = NOW()`,
          [productId, finalShopId, qty]
        );
      } catch (rowErr) {
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
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/adjust',     adjustStock);
router.put('/settings',    updateMinStock);
router.get('/:productId',  getInventoryByProduct);

module.exports = router;
