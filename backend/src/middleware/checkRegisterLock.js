// middleware/checkRegisterLock.js
// Checks if the register for a given date+shop is closed (locked)
// If locked, blocks the request with a 423 error

const { query } = require('../config/database');

const checkRegisterLock = async (req, res, next) => {
  try {
    const shop_id = req.body.shop_id || req.query.shop_id;
    const date    = req.body.sale_date || req.body.expense_date || req.body.purchase_date || req.body.date || new Date().toISOString().split('T')[0];

    if (!shop_id || !date) return next(); // no shop/date = skip check

    const reg = await query(
      `SELECT status FROM cash_register WHERE shop_id=$1 AND register_date=$2 LIMIT 1`,
      [shop_id, date]
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
    next(); // on error, allow the request through
  }
};

module.exports = checkRegisterLock;
