// src/controllers/dashboardController.js
const { query } = require('../config/database');

exports.getSummary = async (req, res) => {
  try {
    const { shop_id } = req.query;
    const today      = new Date().toISOString().split('T')[0];
    const thisMonth  = today.substring(0, 7);

    // Build shop filter clauses
    const shopSales    = shop_id ? `AND si.shop_id = '${shop_id}'`   : '';
    const shopPurchase = shop_id ? `AND p.shop_id  = '${shop_id}'`   : '';
    const shopInv      = shop_id ? `AND i.shop_id  = '${shop_id}'`   : '';
    const shopExp      = shop_id ? `AND shop_id    = '${shop_id}'`   : '';
    const shopCheque   = shop_id ? `AND shop_id    = '${shop_id}'`   : '';

    const [
      salesToday, salesMonth, stockCount, lowStock,
      supplierOwed, customerOwed, topProducts,
      inventoryValue, pendingCheques,
      expensesMonth, shopsList, salesByShop,
    ] = await Promise.all([
      // Today's sales
      query(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count
             FROM sales_invoices si
             WHERE sale_date = $1 AND payment_status != 'returned' ${shopSales}`, [today]),

      // This month's sales
      query(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count
             FROM sales_invoices si
             WHERE TO_CHAR(sale_date,'YYYY-MM') = $1 AND payment_status != 'returned' ${shopSales}`, [thisMonth]),

      // Stock count (shop-filtered)
      query(`SELECT COUNT(*) as total, COALESCE(SUM(i.quantity),0) as qty
             FROM inventory i WHERE 1=1 ${shopInv}`),

      // Low stock
      query(`SELECT COUNT(*) as count FROM inventory i
             WHERE i.quantity <= i.min_stock AND i.quantity > 0 ${shopInv}`),

      // Owed to suppliers
      query(`SELECT COALESCE(SUM(balance),0) as total FROM suppliers WHERE balance > 0 AND is_active = true`),

      // Owed by customers
      query(`SELECT COALESCE(SUM(balance),0) as total FROM customers WHERE balance > 0 AND is_active = true`),

      // Top 5 products this month
      query(`
        SELECT p.name, p.brand, SUM(si2.qty) as units_sold, SUM(si2.total_price) as revenue
        FROM sale_items si2
        JOIN products p    ON p.id   = si2.product_id
        JOIN sales_invoices inv ON inv.id = si2.invoice_id
        WHERE TO_CHAR(inv.sale_date,'YYYY-MM') = $1
          AND inv.payment_status != 'returned'
          ${shopSales.replace('si.', 'inv.')}
        GROUP BY p.id, p.name, p.brand
        ORDER BY units_sold DESC LIMIT 5
      `, [thisMonth]),

      // Inventory value
      query(`
        SELECT
          COALESCE(SUM(i.quantity * p.base_cost),    0) AS cost_value,
          COALESCE(SUM(i.quantity * p.selling_price), 0) AS retail_value
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        WHERE i.quantity > 0 ${shopInv}
      `),

      // Pending cheques
      query(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
             FROM cheques WHERE status = 'pending' ${shopCheque}`),

      // Expenses this month
      query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count
             FROM expenses
             WHERE TO_CHAR(expense_date,'YYYY-MM') = $1 ${shopExp}`, [thisMonth]),

      // All shops for breakdown
      query(`SELECT id, name FROM shops WHERE is_active = true ORDER BY name`),

      // Sales breakdown per shop (this month)
      query(`
        SELECT sh.name as shop_name, sh.id as shop_id,
               COALESCE(SUM(si.total_amount),0) as total,
               COUNT(si.id) as count
        FROM shops sh
        LEFT JOIN sales_invoices si
          ON si.shop_id = sh.id
          AND TO_CHAR(si.sale_date,'YYYY-MM') = $1
          AND si.payment_status != 'returned'
        WHERE sh.is_active = true
        GROUP BY sh.id, sh.name
        ORDER BY sh.name
      `, [thisMonth]),
    ]);

    res.json({
      success: true,
      data: {
        filtered_shop: shop_id || null,
        shops: shopsList.rows,
        sales: {
          today:      { total: parseFloat(salesToday.rows[0].total),  count: parseInt(salesToday.rows[0].count) },
          this_month: { total: parseFloat(salesMonth.rows[0].total),  count: parseInt(salesMonth.rows[0].count) },
          by_shop:    salesByShop.rows,
        },
        inventory: {
          total_lines:      parseInt(stockCount.rows[0].total),
          total_units:      parseInt(stockCount.rows[0].qty),
          low_stock_alerts: parseInt(lowStock.rows[0].count),
          cost_value:       parseFloat(inventoryValue.rows[0].cost_value),
          retail_value:     parseFloat(inventoryValue.rows[0].retail_value),
        },
        financials: {
          owed_to_suppliers: parseFloat(supplierOwed.rows[0].total),
          owed_by_customers: parseFloat(customerOwed.rows[0].total),
          expenses_this_month: parseFloat(expensesMonth.rows[0].total),
          currency: 'AED',
        },
        cheques: {
          pending_count: parseInt(pendingCheques.rows[0].count),
          pending_total: parseFloat(pendingCheques.rows[0].total),
        },
        top_products: topProducts.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
