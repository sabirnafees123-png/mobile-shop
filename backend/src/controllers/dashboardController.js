// src/controllers/dashboardController.js

const { query } = require('../config/database');

// GET /api/v1/dashboard/summary
exports.getSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7); // YYYY-MM

    const [
      salesToday, salesMonth, stockCount, lowStock,
      supplierOwed, customerOwed, topProducts
    ] = await Promise.all([
      // Today's sales
      query(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count 
             FROM sales_invoices WHERE sale_date = $1`, [today]),
      // This month's sales
      query(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count 
             FROM sales_invoices WHERE TO_CHAR(sale_date,'YYYY-MM') = $1`, [thisMonth]),
      // Total stock items
      query(`SELECT COUNT(*) as total, COALESCE(SUM(qty_remaining),0) as qty 
             FROM inventory_stock WHERE status = 'in_stock'`),
      // Low stock (<=2 remaining)
      query(`SELECT COUNT(*) as count FROM (
               SELECT product_id, SUM(qty_remaining) as total_qty 
               FROM inventory_stock WHERE status='in_stock' 
               GROUP BY product_id HAVING SUM(qty_remaining) <= 2
             ) sub`),
      // Total owed to suppliers
      query(`SELECT COALESCE(SUM(balance),0) as total FROM suppliers WHERE balance > 0`),
      // Total owed by customers
      query(`SELECT COALESCE(SUM(balance),0) as total FROM customers WHERE balance > 0`),
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
    ]);

    res.json({
      success: true,
      data: {
        sales: {
          today: { total: parseFloat(salesToday.rows[0].total), count: parseInt(salesToday.rows[0].count) },
          this_month: { total: parseFloat(salesMonth.rows[0].total), count: parseInt(salesMonth.rows[0].count) },
        },
        inventory: {
          total_lines: parseInt(stockCount.rows[0].total),
          total_units: parseInt(stockCount.rows[0].qty),
          low_stock_alerts: parseInt(lowStock.rows[0].count),
        },
        financials: {
          owed_to_suppliers: parseFloat(supplierOwed.rows[0].total),
          owed_by_customers: parseFloat(customerOwed.rows[0].total),
          currency: process.env.SHOP_CURRENCY || 'AED',
        },
        top_products: topProducts.rows,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
