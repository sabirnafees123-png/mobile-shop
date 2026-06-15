// src/controllers/salesController.js
const { query, getClient } = require('../config/database');

async function generateInvoiceNumber(client) {
  // Use a sequence-safe approach: MAX on invoice_number for this year (index-friendly)
  const year = new Date().getFullYear();
  const result = await client.query(
    `SELECT invoice_number FROM sales_invoices
     WHERE invoice_number LIKE $1
     ORDER BY invoice_number DESC LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [`INV-${year}-%`]
  );
  let next = 1;
  if (result.rows.length) {
    const last = result.rows[0].invoice_number; // INV-2026-0371
    next = parseInt(last.split('-')[2]) + 1;
  }
  return `INV-${year}-${String(next).padStart(4, '0')}`;
}

// GET /api/v1/sales
exports.getAllSales = async (req, res) => {
  try {
    const { from, to, payment_status, payment_method, shop_id, search } = req.query;

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.max(1, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    let where = `WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (from)            { where += ` AND si.sale_date >= $${idx++}`;              params.push(from); }
    if (to)              { where += ` AND si.sale_date <= $${idx++}`;              params.push(to); }
    if (payment_status)  { where += ` AND si.payment_status = $${idx++}`;          params.push(payment_status); }
    if (payment_method)  { where += ` AND si.payment_method = $${idx++}`;          params.push(payment_method); }
    if (shop_id)         { where += ` AND si.shop_id = $${idx++}`;                 params.push(parseInt(shop_id)); }
    if (search)          { where += ` AND (si.invoice_number ILIKE $${idx} OR c.name ILIKE $${idx} OR c.phone ILIKE $${idx++})`; params.push(`%${search}%`); }

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

    // ── Customer lookup/create ─────────────────────────────────────────
    let finalCustomerId = customer_id || null;
    if (customer_phone) {
      const phone = customer_phone.startsWith('+971') ? customer_phone : `+971${customer_phone}`;
      const existing = await client.query('SELECT id FROM customers WHERE phone = $1', [phone]);
      if (existing.rows.length) {
        finalCustomerId = existing.rows[0].id;
      } else if (customer_name) {
        const newCust = await client.query(
          `INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id`, [customer_name, phone]
        );
        finalCustomerId = newCust.rows[0].id;
      }
    } else if (!customer_id && customer_name) {
      const newCust = await client.query(
        `INSERT INTO customers (name) VALUES ($1) RETURNING id`, [customer_name]
      );
      finalCustomerId = newCust.rows[0].id;
    }

    // ── Amounts ───────────────────────────────────────────────────────
    const subtotal    = items.reduce((sum, i) => sum + ((i.qty || 1) * i.unit_price), 0);
    const tradeIn     = is_exchange ? parseFloat(exchange_trade_in_value) : 0;
    const totalAmount = subtotal - parseFloat(discount);
    const paid        = parseFloat(amount_paid);
    const amountDue   = (totalAmount - tradeIn) - paid;

    // Invoice balance validation
    if (!is_exchange && paid > 0) {
      const reconstructed = paid + Math.max(amountDue, 0);
      if (Math.abs(reconstructed - totalAmount) > 0.5) {
        throw new Error(
          `Invoice mismatch: amount_paid (${paid}) + amount_due (${Math.max(amountDue,0)}) = ${reconstructed} ≠ total (${totalAmount}). Check your figures.`
        );
      }
    }

    let paymentStatus;
    if (payment_method === 'pending') {
      paymentStatus = 'unpaid';
    } else if (['tabby', 'tamara', 'card', 'bank_transfer'].includes(payment_method)) {
      paymentStatus = 'payment_pending';
    } else {
      paymentStatus = paid >= totalAmount ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    }

    // ── Batch ALL pre-flight queries in parallel ───────────────────────
    const productIds = items.map(i => i.product_id).filter(Boolean);

    const [serviceCheck, stockCheck, invoiceNumber] = await Promise.all([
      client.query(
        `SELECT id, COALESCE(is_service, false) as is_service, name, brand
         FROM products WHERE id = ANY($1)`,
        [productIds]
      ),
      client.query(
        `SELECT product_id, quantity FROM inventory
         WHERE product_id = ANY($1) AND shop_id = $2`,
        [productIds, parseInt(shop_id)]
      ),
      generateInvoiceNumber(client),
    ]);

    const serviceMap = {};
    const nameMap    = {};
    serviceCheck.rows.forEach(r => {
      serviceMap[r.id] = r.is_service;
      nameMap[r.id]    = `${r.brand ? r.brand + ' ' : ''}${r.name}`;
    });
    const stockMap = {};
    stockCheck.rows.forEach(r => { stockMap[r.product_id] = parseInt(r.quantity); });

    // ── Stock validation (all items, zero extra queries) ──────────────
    for (const item of items) {
      if (!item.product_id) throw new Error('Each item needs a product');
      const qty       = parseInt(item.qty) || 1;
      const isService = serviceMap[item.product_id] || false;
      if (!isService) {
        const available = stockMap[item.product_id] ?? 0;
        if (available < qty) {
          const label = nameMap[item.product_id] || `Product #${item.product_id}`;
          throw new Error(
            available === 0
              ? `"${label}" is out of stock`
              : `Insufficient stock for "${label}" — only ${available} available, requested ${qty}`
          );
        }
      }
    }

    const userId = req.user?.id || null;

    // ── Insert invoice ─────────────────────────────────────────────────
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

    // ── Batch INSERT sale_items ────────────────────────────────────────
    const itemValues = items.map((_, i) => {
      const b = i * 7;
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`;
    }).join(',');
    const itemParams = items.flatMap(item => [
      invoiceId, item.product_id, parseInt(item.qty) || 1,
      item.unit_cost || 0, item.unit_price, item.discount || 0, item.serial_number || null,
    ]);
    await client.query(
      `INSERT INTO sale_items (invoice_id, product_id, qty, unit_cost, unit_price, discount, serial_number)
       VALUES ${itemValues}`,
      itemParams
    );

    // ── Batch inventory deductions + stock movements ───────────────────
    const inventoryItems = items.filter(i => !serviceMap[i.product_id]);
    if (inventoryItems.length) {
      // Single UPDATE with CASE WHEN for all products
      const caseWhen    = inventoryItems.map((item, i) =>
        `WHEN product_id = $${i * 2 + 1} THEN quantity - $${i * 2 + 2}`
      ).join(' ');
      const caseParams  = inventoryItems.flatMap(item => [item.product_id, parseInt(item.qty) || 1]);
      const idPlaceholders = inventoryItems.map((_, i) => `$${i * 2 + 1}`).join(',');
      await client.query(
        `UPDATE inventory
         SET quantity = CASE ${caseWhen} ELSE quantity END, last_updated = NOW()
         WHERE product_id IN (${idPlaceholders}) AND shop_id = $${caseParams.length + 1}`,
        [...caseParams, parseInt(shop_id)]
      );

      // Batch INSERT stock_movements
      const mvValues = inventoryItems.map((_, i) => {
        const b = i * 4;
        return `($${b+1},'out',$${b+2},$${b+3},$${b+4})`;
      }).join(',');
      const mvParams = inventoryItems.flatMap(item => [
        item.product_id, parseInt(item.qty) || 1, `Sale ${invoiceNumber}`, userId,
      ]);
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, note, created_by) VALUES ${mvValues}`,
        mvParams
      );
    }

    // ── Exchange product handling ──────────────────────────────────────
    if (is_exchange && exchange_product_name) {
      let exchangeProductId;
      if (exchange_serial_number) {
        const exProd = await client.query(
          `SELECT id FROM products WHERE serial_number = $1 LIMIT 1`, [exchange_serial_number]
        );
        if (exProd.rows.length) {
          exchangeProductId = exProd.rows[0].id;
          if (tradeIn > 0) {
            await client.query(`UPDATE products SET base_cost=$1, updated_at=NOW() WHERE id=$2`, [tradeIn, exchangeProductId]);
          }
        }
      }
      if (!exchangeProductId) {
        const newProd = await client.query(
          `INSERT INTO products (name, serial_number, base_cost, category, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, 'Exchange', true, NOW(), NOW()) RETURNING id`,
          [exchange_product_name, exchange_serial_number || null, tradeIn || 0]
        );
        exchangeProductId = newProd.rows[0].id;
      }
      await client.query(
        `INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
         VALUES ($1, $2, 1, 0)
         ON CONFLICT (product_id, shop_id)
         DO UPDATE SET quantity = inventory.quantity + 1, last_updated = NOW()`,
        [exchangeProductId, parseInt(shop_id)]
      );
    }

    // ── Customer balance, cash register, exchange cash out ────────────
    const [,,] = await Promise.all([
      finalCustomerId && amountDue > 0 && payment_method !== 'tabby' && payment_method !== 'tamara'
        ? client.query(`UPDATE customers SET balance = balance + $1 WHERE id = $2`, [amountDue, finalCustomerId])
        : Promise.resolve(),
      payment_method === 'cash' && paid > 0
        ? client.query(
            `UPDATE cash_register SET total_sales_cash = total_sales_cash + $1
             WHERE register_date = $2 AND shop_id = $3 AND status = 'open'`,
            [paid, sale_date || new Date().toISOString().split('T')[0], parseInt(shop_id)]
          )
        : Promise.resolve(),
      is_exchange && tradeIn > 0 && amountDue < 0
        ? client.query(
            `INSERT INTO cash_manual_entries (shop_id, entry_date, entry_type, amount, category, description)
             VALUES ($1, $2, 'out', $3, 'Exchange', $4) ON CONFLICT DO NOTHING`,
            [parseInt(shop_id), sale_date || new Date().toISOString().split('T')[0],
             Math.abs(amountDue), `Cash paid to customer - exchange ${invoiceNumber}`]
          )
        : Promise.resolve(),
    ]);

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

exports.markPaymentReceived = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const invoiceId = req.params.id;
    const { received_date, partial_amount, received_method } = req.body;

    const inv = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [invoiceId]);
    if (!inv.rows.length) throw new Error('Invoice not found');
    const invoice = inv.rows[0];

    if (invoice.payment_status === 'returned') throw new Error('Invoice is returned');
    if (invoice.payment_status === 'paid')     throw new Error('Already marked as paid');

    const recDate   = received_date || new Date().toISOString().split('T')[0];
    const amountNow = partial_amount
      ? parseFloat(partial_amount)
      : parseFloat(invoice.amount_due);

    // How customer is paying NOW (cash/card/tabby/tamara/bank_transfer)
    const method = received_method || 'cash';

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
      if (method === 'cash') {
        // Cash payment — update cash register directly
        const regUpdate = await client.query(
          `UPDATE cash_register
           SET total_sales_cash = total_sales_cash + $1
           WHERE register_date = $2 AND shop_id = $3 AND status = 'open'`,
          [amountNow, recDate, invoice.shop_id]
        );
        if (regUpdate.rowCount === 0) {
          // Register closed or not found — fallback to manual entry
          await client.query(
            `INSERT INTO cash_manual_entries (shop_id, entry_date, entry_type, amount, category, description)
             VALUES ($1, $2, 'in', $3, 'Cash', $4)`,
            [invoice.shop_id, recDate, amountNow,
             `Payment received (cash) — ${invoice.invoice_number} (register was closed)`]
          );
        }
      } else {
        // Non-cash (card/tabby/tamara/bank_transfer) — record as manual entry for tracking/reconciliation
        // Does NOT go into cash_register as these are digital payments
        const methodLabel = method.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        await client.query(
          `INSERT INTO cash_manual_entries (shop_id, entry_date, entry_type, amount, category, description)
           VALUES ($1, $2, 'in', $3, $4, $5)`,
          [invoice.shop_id, recDate, amountNow,
           methodLabel,
           `Payment received (${method}) — ${invoice.invoice_number}`]
        );
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: newStatus === 'paid'
        ? `Payment fully received via ${method} — invoice marked as paid`
        : `Partial payment of AED ${amountNow} via ${method} recorded — AED ${Math.max(newAmountDue, 0)} still due`,
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

    // Fetch service flags for all returned items in one query
    const retProductIds = items.rows.map(i => i.product_id);
    const retServiceCheck = await client.query(
      `SELECT id, COALESCE(is_service, false) as is_service FROM products WHERE id = ANY($1)`,
      [retProductIds]
    );
    const retServiceMap = {};
    retServiceCheck.rows.forEach(r => { retServiceMap[r.id] = r.is_service; });

    for (const item of items.rows) {
      // Skip service products — they have no inventory to restore
      if (retServiceMap[item.product_id]) continue;

      // Upsert: if inventory row missing for this shop, create it instead of silently doing nothing
      await client.query(
        `INSERT INTO inventory (product_id, shop_id, quantity, min_stock)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (product_id, shop_id)
         DO UPDATE SET quantity = inventory.quantity + $3, last_updated = NOW()`,
        [item.product_id, invoice.shop_id, item.qty]
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

    // Record cash impact in register
    if (invoice.payment_method === 'cash') {
      const today = new Date().toISOString().split('T')[0];
      const saleDate = invoice.sale_date instanceof Date
        ? invoice.sale_date.toISOString().split('T')[0]
        : String(invoice.sale_date).split('T')[0];

      // 1. Remove original sale from sale date register
      const salePaid = parseFloat(invoice.amount_paid || 0);
      if (salePaid > 0) {
        const saleRegUpdate = await client.query(
          `UPDATE cash_register SET total_sales_cash = total_sales_cash - $1
           WHERE register_date = $2 AND shop_id = $3 AND status = 'open'`,
          [salePaid, saleDate, invoice.shop_id]
        );
        if (saleRegUpdate.rowCount === 0) {
          await client.query(
            `INSERT INTO cash_manual_entries (shop_id, entry_date, entry_type, amount, category, description)
             VALUES ($1, $2, 'out', $3, 'Cash', $4)`,
            [invoice.shop_id, today, salePaid, `Sale reversed — ${invoice.invoice_number} returned`]
          );
        }
      }

      // 2. Record cash refund to customer on today
      if (returnAmt > 0) {
        const refundRegUpdate = await client.query(
          `UPDATE cash_register SET total_sales_cash = total_sales_cash - $1
           WHERE register_date = $2 AND shop_id = $3 AND status = 'open'`,
          [returnAmt, today, invoice.shop_id]
        );
        if (refundRegUpdate.rowCount === 0) {
          await client.query(
            `INSERT INTO cash_manual_entries (shop_id, entry_date, entry_type, amount, category, description)
             VALUES ($1, $2, 'out', $3, 'Cash', $4)`,
            [invoice.shop_id, today, returnAmt, `Cash refund — ${invoice.invoice_number} return`]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Return processed successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};