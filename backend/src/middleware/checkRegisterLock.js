// middleware/checkRegisterLock.js
const { query } = require('../config/database');

const checkRegisterLock = async (req, res, next) => {
  try {
    const shop_id = req.body.shop_id || req.query.shop_id;
    const date = req.body.sale_date   || req.body.expense_date ||
                 req.body.purchase_date || req.body.transfer_date ||
                 req.body.entry_date  || req.body.received_date ||
                 req.body.payment_date || req.body.date        || new Date().toISOString().split('T')[0];

    // For routes with :id, look up the shop from the existing record
    let effectiveShopId = shop_id;
    if (!effectiveShopId && req.params?.id) {
      const tables = [
        'SELECT shop_id FROM sales_invoices WHERE id = $1 LIMIT 1',
        'SELECT shop_id FROM expenses WHERE id = $1 LIMIT 1',
        'SELECT shop_id FROM purchases WHERE id = $1 LIMIT 1',
      ];
      for (const sql of tables) {
        try {
          const r = await query(sql, [req.params.id]);
          if (r.rows.length && r.rows[0].shop_id) { effectiveShopId = r.rows[0].shop_id; break; }
        } catch {}
      }
    }

    if (!effectiveShopId || !date) return next();

    const reg = await query(
      `SELECT status FROM cash_register WHERE shop_id = $1 AND register_date = $2 LIMIT 1`,
      [effectiveShopId, date]
    );

    // ── Block if register is explicitly closed ────────────────────────
    if (reg.rows.length && reg.rows[0].status === 'closed') {
      return res.status(423).json({
        success: false,
        locked: true,
        message: `Register for ${date} is closed and locked. Reopen the register to make changes.`,
      });
    }

    // ── For past dates: block if no register row exists ───────────────
    const today = new Date().toISOString().split('T')[0];
    if (!reg.rows.length && date < today) {
      return res.status(423).json({
        success: false,
        locked: true,
        message: `No register found for ${date}. Please open the register for that date first.`,
      });
    }

    // Today with no register row = allow (register will be created on first open)

    next();
  } catch (err) {
    next(); // on DB error, allow through to avoid blocking legitimate ops
  }
};

module.exports = checkRegisterLock;
