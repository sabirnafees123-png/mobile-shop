// Add this to backend/src/controllers/salesController.js

// POST /api/v1/sales/:id/return
exports.returnSale = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { note } = req.body;
    const invoiceId = req.params.id;

    // Get invoice
    const invoice = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [invoiceId]);
    if (!invoice.rows.length)
      throw new Error('Invoice not found');

    const inv = invoice.rows[0];

    if (inv.payment_status === 'returned')
      throw new Error('Invoice already returned');

    // Get items
    const items = await client.query('SELECT * FROM sale_items WHERE invoice_id = $1', [invoiceId]);

    // Restore inventory for each item
    for (const item of items.rows) {
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, last_updated = NOW() WHERE product_id = $2`,
        [item.qty, item.product_id]
      );
      // Log movement
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, note, created_by)
         VALUES ($1, 'in', $2, $3, $4)`,
        [item.product_id, item.qty, `Return: ${inv.invoice_number} — ${note || 'Customer return'}`, req.user?.id]
      );
    }

    // Reverse customer balance if any was added
    if (inv.customer_id && inv.amount_due > 0) {
      await client.query(
        `UPDATE customers SET balance = balance - $1 WHERE id = $2`,
        [inv.amount_due, inv.customer_id]
      );
    }

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
