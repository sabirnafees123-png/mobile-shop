// middleware/checkRegisterLock.js
const { query } = require('../config/database');

const checkRegisterLock = async (req, res, next) => {
  try {
    const shop_id = req.body.shop_id || req.query.shop_id;
    const date = req.body.sale_date || req.body.expense_date || 
                 req.body.purchase_date || req.body.date || 
                 new Date().toISOString().split('T')[0];

    // If no shop_id provided, try to get it from an existing record (for returns/updates)
    let effectiveShopId = shop_id;
    if (!effectiveShopId && req.params?.id) {
      // Try to find shop from invoice/expense/purchase
      const tables = [
        `SELECT shop_id FROM sales_invoices WHERE id = '${req.params.id}' LIMIT 1`,
        `SELECT shop_id FROM expenses WHERE id = '${req.params.id}' LIMIT 1`,
        `SELECT shop_id FROM purchases WHERE id = '${req.params.id}' LIMIT 1`,
      ];
      for (const sql of tables) {
        try {
          const r = await query(sql);
          if (r.rows.length && r.rows[0].shop_id) { effectiveShopId = r.rows[0].shop_id; break; }
        } catch {}
      }
    }

    if (!effectiveShopId || !date) return next();

    const reg = await query(
      `SELECT status FROM cash_register WHERE shop_id=$1 AND register_date=$2 LIMIT 1`,
      [effectiveShopId, date]
    );

    if (reg.rows.length && reg.rows[0].status === 'closed') {
      return res.status(423).json({
        success: false,
        locked: true,
        message: `Register for ${date} is closed and locked. Please reopen the register to make changes.`
      });
    }

    next();
  } catch (err) {
    next(); // on error, allow through
  }
};

module.exports = checkRegisterLock;
