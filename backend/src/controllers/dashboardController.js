// src/controllers/dashboardController.js
const { query } = require('../config/database');

exports.getSummary = async (req, res) => {
  try {
    const today     = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);

    const [
      salesToday, salesMonth, stockCount, lowStock,
      supplierOwed, customerOwed, topProducts,
      inventoryValue, pendingCheques
    ] = await Promise.all([
      // Today's sales
      query(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count 
             FROM sales_invoices WHERE sale_date = $1`, [today]),
      // This month's sales
      query(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count 
             FROM sales_invoices WHERE TO_CHAR(sale_date,'YYYY-MM') = $1`, [thisMonth]),
      // Stock count
      query(`SELECT COUNT(*) as total, COALESCE(SUM(quantity),0) as qty 
             FROM inventory`),
      // Low stock
      query(`SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_stock AND quantity > 0`),
      // Owed to suppliers
      query(`SELECT COALESCE(SUM(balance),0) as total FROM suppliers WHERE balance > 0 AND is_active = true`),
      // Owed by customers
      query(`SELECT COALESCE(SUM(balance),0) as total FROM customers WHERE balance > 0 AND is_active = true`),
      // Top 5 products this month
      query(`
        SELECT p.name, p.brand, SUM(si.qty) as units_sold, SUM(si.total_price) as revenue
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        JOIN sales_invoices inv ON inv.id = si.invoice_id
        WHERE TO_CHAR(inv.sale_date,'YYYY-MM') = $1
        GROUP BY p.id, p.name, p.brand
        ORDER BY units_sold DESC LIMIT 5
      `, [thisMonth]),
      // Inventory value (cost vs retail)
      query(`
        SELECT 
          COALESCE(SUM(i.quantity * p.base_cost), 0)     AS cost_value,
          COALESCE(SUM(i.quantity * p.selling_price), 0)  AS retail_value
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        WHERE i.quantity > 0
      `),
      // Pending cheques
      query(`
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) as total
        FROM cheques
        WHERE status = 'pending'
      `),
    ]);

    res.json({
      success: true,
      data: {
        sales: {
          today:      { total: parseFloat(salesToday.rows[0].total),  count: parseInt(salesToday.rows[0].count) },
          this_month: { total: parseFloat(salesMonth.rows[0].total),  count: parseInt(salesMonth.rows[0].count) },
        },
        inventory: {
          total_lines:       parseInt(stockCount.rows[0].total),
          total_units:       parseInt(stockCount.rows[0].qty),
          low_stock_alerts:  parseInt(lowStock.rows[0].count),
          cost_value:        parseFloat(inventoryValue.rows[0].cost_value),
          retail_value:      parseFloat(inventoryValue.rows[0].retail_value),
        },
        financials: {
          owed_to_suppliers:  parseFloat(supplierOwed.rows[0].total),
          owed_by_customers:  parseFloat(customerOwed.rows[0].total),
          currency: 'AED',
        },
        cheques: {
          pending_count: parseInt(pendingCheques.rows[0].count),
          pending_total: parseFloat(pendingCheques.rows[0].total),
        },
        top_products: topProducts.rows,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
