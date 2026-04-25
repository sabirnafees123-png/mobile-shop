// src/controllers/salesController.js
const { query, getClient } = require('../config/database');

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) as count FROM sales_invoices WHERE EXTRACT(YEAR FROM sale_date) = $1`, [year]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `INV-${year}-${String(count).padStart(4, '0')}`;
}

// GET /api/v1/sales
exports.getAllSales = async (req, res) => {
  try {
    const { from, to, payment_status, shop_id } = req.query;

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.max(1, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    let where = `WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (from)           { where += ` AND si.sale_date >= $${idx++}`;     params.push(from); }
    if (to)             { where += ` AND si.sale_date <= $${idx++}`;     params.push(to); }
    if (payment_status) { where += ` AND si.payment_status = $${idx++}`; params.push(payment_status); }
    if (shop_id)        { where += ` AND si.shop_id = $${idx++}`;        params.push(parseInt(shop_id)); }

    const countSql = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT si.id
        FROM sales_invoices si
        LEFT JOIN customers c  ON c.id  = si.customer_id
        LEFT JOIN shops sh     ON sh.id = si.shop_id
        LEFT JOIN users u      ON u.id  = si.user_id
        LEFT JOIN sale_items s ON s.invoice_id = si.id
        ${where}
        GROUP BY si.id, c.name, c.phone, sh.name, u.name
      ) sub
    `;
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].total);

    const dataSql = `
      SELECT si.*, c.name as customer_name, c.phone as customer_phone,
             sh.name as shop_name, u.name as sold_by,
             COUNT(s.id) as item_count
      FROM sales_invoices si
      LEFT JOIN customers c  ON c.id  = si.customer_id
      LEFT JOIN shops sh     ON sh.id = si.shop_id
      LEFT JOIN users u      ON u.id  = si.user_id
      LEFT JOIN sale_items s ON s.invoice_id = si.id
      ${where}
      GROUP BY si.id, c.name, c.phone, sh.name, u.name
      ORDER BY si.sale_date DESC, si.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const result = await query(dataSql, [...params, limit, offset]);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/sales/search-serial?q=
exports.searchBySerial = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const result = await query(`
      SELECT si.id, si.invoice_number, si.sale_date, si.total_amount, si.payment_status,
             si.payment_method, c.name as customer_name,
             string_agg(s.serial_number, ', ') as serials
      FROM sales_invoices si
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN sale_items s ON s.invoice_id = si.id
      WHERE s.serial_number ILIKE $1
         OR si.invoice_number ILIKE $1
      GROUP BY si.id, c.name
      ORDER BY si.sale_date DESC LIMIT 20
    `, [`%${q}%`]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/sales/:id
exports.getSale = async (req, res) => {
  try {
    const invoice = await query(
      `SELECT si.*, c.name as customer_name, c.phone as customer_phone,
              sh.name as shop_name, u.name as sold_by
       FROM sales_invoices si
       LEFT JOIN customers c ON c.id = si.customer_id
       LEFT JOIN shops sh    ON sh.id = si.shop_id
       LEFT JOIN users u     ON u.id  = si.user_id
       WHERE si.id = $1`, [req.params.id]
    );
    if (!invoice.rows.length)
      return res.status(404).json({ success: false, message: 'Invoice not found' });

    const items = await query(
      `SELECT s.*, p.name as product_name, p.brand, p.model, p.color, p.serial_number as product_serial
       FROM sale_items s JOIN products p ON p.id = s.product_id
       WHERE s.invoice_id = $1`, [req.params.id]
    );
    res.json({ success: true, data: { ...invoice.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/sales
exports.createSale = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      customer_id, customer_name, customer_phone,
      sale_date, discount = 0, payment_method = 'cash',
      amount_paid = 0, notes, items, shop_id,
      pending_amount = 0,
      is_exchange = false,
      exchange_product_name, exchange_serial_number, exchange_trade_in_value = 0,
    } = req.body;

    if (!items || !items.length) throw new Error('At least one sale item is required');
    if (!shop_id) throw new Error('shop_id is required');

    let finalCustomerId = customer_id || null;
    if (customer_phone) {
      const phone = customer_phone.startsWith('+971') ? customer_phone : `+971${customer_phone}`;
      const existing = await client.query('SELECT id FROM customers WHERE phone = $1', [phone]);
      if (existing.rows.length) {
        finalCustomerId = existing.rows[0].id;
      } else if (customer_name) {
        const newCust = await client.query(
          `INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id`,
          [customer_name, phone]
        );
        finalCustomerId = newCust.rows[0].id;
      }
    } else if (!customer_id && customer_name) {
      const newCust = await client.query(
        `INSERT INTO customers (name) VALUES ($1) RETURNING id`, [customer_name]
      );
      finalCustomerId = newCust.rows[0].id;
    }

    const subtotal    = items.reduce((sum, i) => sum + ((i.qty || 1) * i.unit_price), 0);
    const tradeIn     = is_exchange ? parseFloat(exchange_trade_in_value) : 0;
    const totalAmount = subtotal - parseFloat(discount) - tradeIn;
    const paid        = parseFloat(amount_paid);
    const amountDue   = totalAmount - paid;

    let paymentStatus;
    if (payment_method === 'pending') {
      paymentStatus = 'unpaid';
    } else if (['tabby', 'tamara', 'card', 'bank_transfer'].includes(payment_method)) {
      paymentStatus = 'payment_pending';
    } else {
      paymentStatus = paid >= totalAmount ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    }

    const invoiceNumber = await generateInvoiceNumber();
    const userId = req.user?.id || null;

    const invoice = await client.query(
      `INSERT INTO sales_invoices
        (invoice_number, customer_id, sale_date, subtotal, discount, total_amount,
         amount_paid, amount_due, payment_method, payment_status, notes, user_id, shop_id,
         pending_amount, is_exchange, exchange_product_name, exchange_serial_number, exchange_trade_in_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        invoiceNumber, finalCustomerId,
        sale_date || new Date().toISOString().split('T')[0],
        subtotal, discount, totalAmount, paid, amountDue,
        payment_method, paymentStatus, notes, userId, parseInt(shop_id),
        parseFloat(pending_amount),
        is_exchange, exchange_product_name || null,
        exchange_serial_number || null, tradeIn,
      ]
    );
    const invoiceId = invoice.rows[0].id;

    for (const item of items) {
      if (!item.product_id) throw new Error('Each item needs a product');
      const qty = parseInt(item.qty) || 1;
      await client.query(
        `INSERT INTO sale_items (invoice_id, product_id, qty, unit_cost, unit_price, discount, serial_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [invoiceId, item.product_id, qty, item.unit_cost || 0, item.unit_price, item.discount || 0, item.serial_number || null]
      );
      await client.query(
        `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW()
         WHERE product_id = $2 AND shop_id = $3 AND quantity >= $1`,
        [qty, item.product_id, parseInt(shop_id)]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, note, created_by)
         VALUES ($1, 'out', $2, $3, $4)`,
        [item.product_id, qty, `Sale ${invoiceNumber}`, userId]
      );
    }

    if (is_exchange && exchange_serial_number) {
      const exProd = await client.query(
        `SELECT id FROM products WHERE serial_number = $1 LIMIT 1`, [exchange_serial_number]
      );
      if (exProd.rows.length) {
        await client.query(
          `INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
           VALUES ($1, $2, 1, 0)
           ON CONFLICT (product_id, shop_id)
           DO UPDATE SET quantity = inventory.quantity + 1, last_updated = NOW()`,
          [exProd.rows[0].id, parseInt(shop_id)]
        );
      }
    }

    if (finalCustomerId && amountDue > 0 && payment_method !== 'tabby' && payment_method !== 'tamara') {
      await client.query(
        `UPDATE customers SET balance = balance + $1 WHERE id = $2`, [amountDue, finalCustomerId]
      );
    }

    if (payment_method === 'cash' && paid > 0) {
      await client.query(
        `UPDATE cash_register SET total_sales_cash = total_sales_cash + $1
         WHERE register_date = $2 AND shop_id = $3 AND status = 'open'`,
        [paid, sale_date || new Date().toISOString().split('T')[0], parseInt(shop_id)]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: `Invoice ${invoiceNumber} created successfully`,
      data: invoice.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

// POST /api/v1/sales/:id/mark-received
exports.markPaymentReceived = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const invoiceId = req.params.id;
    const { received_date, partial_amount } = req.body;

    const inv = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [invoiceId]);
    if (!inv.rows.length) throw new Error('Invoice not found');
    const invoice = inv.rows[0];

    if (invoice.payment_status === 'returned') throw new Error('Invoice is returned');
    if (invoice.payment_status === 'paid')     throw new Error('Already marked as paid');

    const recDate   = received_date || new Date().toISOString().split('T')[0];
    const amountNow = partial_amount
      ? parseFloat(partial_amount)
      : parseFloat(invoice.amount_due);

    const newAmountPaid = parseFloat(invoice.amount_paid) + amountNow;
    const newAmountDue  = parseFloat(invoice.total_amount) - newAmountPaid;

    let newStatus;
    if (newAmountDue <= 0) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'unpaid';
    }

    await client.query(
      `UPDATE sales_invoices SET
         payment_status        = $1,
         amount_paid           = $2,
         amount_due            = $3,
         payment_received_date = $4,
         payment_received_by   = $5
       WHERE id = $6`,
      [newStatus, newAmountPaid, Math.max(newAmountDue, 0), recDate, req.user?.id || null, invoiceId]
    );

    if (amountNow > 0) {
      await client.query(
        `UPDATE cash_register
         SET total_sales_cash = total_sales_cash + $1
         WHERE register_date = $2 AND shop_id = $3 AND status = 'open'`,
        [amountNow, recDate, invoice.shop_id]
      );
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: newStatus === 'paid'
        ? 'Payment fully received — invoice marked as paid'
        : `Partial payment of AED ${amountNow} recorded — AED ${Math.max(newAmountDue, 0)} still due`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

// POST /api/v1/sales/:id/return
exports.returnSale = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { note, return_amount } = req.body;
    const invoiceId = req.params.id;

    const inv = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [invoiceId]);
    if (!inv.rows.length) throw new Error('Invoice not found');
    const invoice = inv.rows[0];
    if (invoice.payment_status === 'returned') throw new Error('Invoice already returned');

    const items = await client.query('SELECT * FROM sale_items WHERE invoice_id = $1', [invoiceId]);

    for (const item of items.rows) {
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, last_updated = NOW()
         WHERE product_id = $2 AND shop_id = $3`,
        [item.qty, item.product_id, invoice.shop_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, note, created_by)
         VALUES ($1, 'in', $2, $3, $4)`,
        [item.product_id, item.qty, `Return: ${invoice.invoice_number} — ${note || 'Customer return'}`, req.user?.id]
      );
    }

    const returnAmt = parseFloat(return_amount || invoice.amount_paid || 0);
    const deduction = parseFloat(invoice.amount_paid || 0) - returnAmt;

    if (invoice.customer_id) {
      if (invoice.amount_due > 0) {
        await client.query(
          `UPDATE customers SET balance = balance - $1 WHERE id = $2`,
          [invoice.amount_due, invoice.customer_id]
        );
      }
      if (returnAmt > 0) {
        await client.query(
          `INSERT INTO customer_receipts (customer_id, amount, receipt_date, payment_method, note)
           VALUES ($1, $2, $3, 'refund', $4)`,
          [invoice.customer_id, returnAmt,
           new Date().toISOString().split('T')[0],
           `Refund for ${invoice.invoice_number}${deduction > 0 ? ` (deducted AED ${deduction})` : ''}`]
        );
      }
    }

    await client.query(
      `UPDATE sales_invoices SET
         payment_status = 'returned',
         notes = CONCAT(COALESCE(notes,''), ' | RETURNED: ', $1::text,
                        ' | Return paid: AED ', $2::text)
       WHERE id = $3`,
      [note || 'Customer return', returnAmt, invoiceId]
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