// src/controllers/salesReturn.js

const { getClient } = require('../config/database');

// POST /api/v1/sales/:id/return
exports.returnSale = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { note } = req.body;
    const invoiceId = req.params.id;

    // Get invoice
    const invoice = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [invoiceId]);
    if (!invoice.rows.length) throw new Error('Invoice not found');
    const inv = invoice.rows[0];
    if (inv.payment_status === 'returned') throw new Error('Invoice already returned');

    const shopId = parseInt(inv.shop_id);
    const saleDate = inv.sale_date ? inv.sale_date.toISOString ? inv.sale_date.toISOString().split('T')[0] : String(inv.sale_date).split('T')[0] : new Date().toISOString().split('T')[0];

    // Get items
    const items = await client.query('SELECT si.*, p.is_service FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE si.invoice_id = $1', [invoiceId]);

    // Restore inventory for each non-service item — filtered by correct shop
    for (const item of items.rows) {
      const isService = item.is_service || false;
      if (!isService) {
        await client.query(
          `UPDATE inventory SET quantity = quantity + $1, last_updated = NOW()
           WHERE product_id = $2 AND shop_id = $3`,
          [item.qty, item.product_id, shopId]
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, type, quantity, note, created_by)
           VALUES ($1, 'in', $2, $3, $4)`,
          [item.product_id, item.qty, `Return: ${inv.invoice_number} — ${note || 'Customer return'}`, req.user?.id]
        );
      }
    }

    // If exchange was done, remove traded-in device from inventory
    if (inv.is_exchange && inv.exchange_serial_number) {
      const exProd = await client.query(`SELECT id FROM products WHERE serial_number = $1 LIMIT 1`, [inv.exchange_serial_number]);
      if (exProd.rows.length) {
        await client.query(
          `UPDATE inventory SET quantity = GREATEST(quantity - 1, 0), last_updated = NOW()
           WHERE product_id = $1 AND shop_id = $2`,
          [exProd.rows[0].id, shopId]
        );
      }
    }

    // Reverse customer balance
    if (inv.customer_id && inv.amount_due > 0) {
      await client.query(`UPDATE customers SET balance = balance - $1 WHERE id = $2`, [inv.amount_due, inv.customer_id]);
    }

    // Cash refund is handled by salesController.js returnSale — no entry here

    // Mark invoice as returned
    await client.query(
      `UPDATE sales_invoices SET payment_status = 'returned', notes = CONCAT(COALESCE(notes,''), ' | RETURNED: ', $1) WHERE id = $2`,
      [note || 'Customer return', invoiceId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Return processed successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};
