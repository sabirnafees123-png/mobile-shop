// src/routes/products.js  — add serial search endpoint
const router = require('express').Router();
const ctrl   = require('../controllers/productsController');

router.get('/',                    ctrl.getProducts);
router.get('/categories',          ctrl.getCategories);
router.get('/serial/:serial',      ctrl.getProductBySerial);
router.get('/:id',                 ctrl.getProductById);
router.post('/',                   ctrl.createProduct);
router.put('/:id',                 ctrl.updateProduct);
router.delete('/:id',              ctrl.deleteProduct);

module.exports = router;

// GET /products/:id/transactions — all in/out history
router.get('/:id/transactions', async (req, res) => {
  const { query } = require('../config/database');
  try {
    const { id } = req.params;
    const [sales, purchases, movements, inventory] = await Promise.all([
      query(`
        SELECT 'sale' as type, si.invoice_number as reference,
               si.sale_date as date, sit.qty as quantity,
               si.shop_id, s.name as shop_name,
               sit.unit_price as price, si.payment_status
        FROM sale_items sit
        JOIN sales_invoices si ON si.id = sit.invoice_id
        JOIN shops s ON s.id = si.shop_id
        WHERE sit.product_id = $1
        ORDER BY si.sale_date DESC`, [id]),
      query(`
        SELECT 'purchase' as type, p.purchase_number as reference,
               p.purchase_date as date, pi.qty as quantity,
               p.shop_id, s.name as shop_name,
               pi.unit_cost as price, p.payment_status
        FROM purchase_items pi
        JOIN purchases p ON p.id = pi.purchase_id
        JOIN shops s ON s.id = p.shop_id
        WHERE pi.product_id = $1
        ORDER BY p.purchase_date DESC`, [id]),
      query(`
        SELECT type as movement_type, quantity, note, created_at as date
        FROM stock_movements WHERE product_id = $1
        ORDER BY created_at DESC`, [id]),
      query(`
        SELECT i.quantity, i.min_stock, i.last_updated,
               s.name as shop_name, i.shop_id
        FROM inventory i
        JOIN shops s ON s.id = i.shop_id
        WHERE i.product_id = $1`, [id]),
    ]);
    res.json({
      success: true,
      data: {
        sales:     sales.rows,
        purchases: purchases.rows,
        movements: movements.rows,
        inventory: inventory.rows,
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /products/:id/adjust — stock adjustment (works even if no inventory row)
router.post('/:id/adjust', async (req, res) => {
  const { query } = require('../config/database');
  try {
    const { id } = req.params;
    const { shop_id, quantity, reason, note } = req.body;
    if (!shop_id)  return res.status(400).json({ success: false, message: 'shop_id required' });
    if (!quantity) return res.status(400).json({ success: false, message: 'quantity required' });
    const qty = parseInt(quantity);
    // Upsert inventory
    await query(`
      INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (product_id, shop_id)
      DO UPDATE SET quantity = GREATEST(0, inventory.quantity + $3), last_updated = NOW()`,
      [id, shop_id, qty]
    );
    // Log movement
    const direction = qty > 0 ? 'in' : 'out';
    await query(`
      INSERT INTO stock_movements (product_id, type, quantity, note)
      VALUES ($1, $2, $3, $4)`,
      [id, direction, Math.abs(qty), note || reason || `Manual adjustment: ${qty > 0 ? '+' : ''}${qty}`]
    );
    // Return updated inventory
    const inv = await query(`
      SELECT i.quantity, s.name as shop_name
      FROM inventory i JOIN shops s ON s.id = i.shop_id
      WHERE i.product_id = $1 AND i.shop_id = $2`, [id, shop_id]);
    res.json({ success: true, data: inv.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
