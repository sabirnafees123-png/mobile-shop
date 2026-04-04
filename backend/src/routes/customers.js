// src/routes/customers.js
const express = require('express');
const router  = express.Router();
const { query, getClient } = require('../config/database');

// GET all customers with balance
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        c.id, c.name, c.phone, c.email, c.address, c.city,
        c.id_number, c.notes,
        COALESCE(c.balance, 0) AS balance,
        COALESCE(s.total_sales, 0) AS total_sales,
        COALESCE(s.total_sales, 0) - COALESCE(c.balance, 0) AS total_received
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, SUM(total_amount) AS total_sales
        FROM sales_invoices WHERE payment_status != 'returned'
        GROUP BY customer_id
      ) s ON s.customer_id = c.id
      WHERE c.is_active = true
      ORDER BY c.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST — add new customer
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, address, city, id_number, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    const result = await query(`
      INSERT INTO customers (name, phone, email, address, city, id_number, notes, balance, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,0,true) RETURNING *
    `, [name, phone||null, email||null, address||null, city||null, id_number||null, notes||null]);
    res.status(201).json({ ok: true, customer: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT — update customer
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, address, city, id_number, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    const result = await query(`
      UPDATE customers SET name=$1, phone=$2, email=$3, address=$4, city=$5,
      id_number=$6, notes=$7, updated_at=NOW()
      WHERE id=$8 RETURNING *
    `, [name, phone||null, email||null, address||null, city||null, id_number||null, notes||null, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json({ ok: true, customer: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single customer
router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT c.*, COALESCE(c.balance,0) AS balance,
        COALESCE(s.total_sales,0) AS total_sales,
        COALESCE(s.total_sales,0) - COALESCE(c.balance,0) AS total_received
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, SUM(total_amount) AS total_sales
        FROM sales_invoices WHERE customer_id=$1 AND payment_status!='returned'
        GROUP BY customer_id
      ) s ON s.customer_id = c.id
      WHERE c.id=$1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET customer ledger
router.get('/:id/ledger', async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    const cust = await query('SELECT id, name, balance FROM customers WHERE id=$1', [id]);
    if (!cust.rows.length) return res.status(404).json({ error: 'Customer not found' });

    let dateFilter = '';
    const params = [id];
    if (from && to) { dateFilter = `AND entry_date BETWEEN $2 AND $3`; params.push(from, to); }
    else if (from)  { dateFilter = `AND entry_date >= $2`; params.push(from); }
    else if (to)    { dateFilter = `AND entry_date <= $2`; params.push(to); }

    const result = await query(`
      SELECT * FROM (
        SELECT 'sale' AS type, CAST(si.id AS VARCHAR) AS ref_id,
          si.invoice_number AS reference, si.sale_date AS entry_date,
          si.total_amount AS debit, 0 AS credit,
          si.notes AS note, si.payment_method, si.created_at
        FROM sales_invoices si WHERE si.customer_id=$1 AND si.payment_status!='returned'
        UNION ALL
        SELECT 'receipt' AS type, CAST(cr.id AS VARCHAR) AS ref_id,
          CAST(cr.id AS VARCHAR) AS reference, cr.receipt_date AS entry_date,
          0 AS debit, cr.amount AS credit,
          cr.note, cr.payment_method, cr.created_at
        FROM customer_receipts cr WHERE cr.customer_id=$1
      ) ledger WHERE 1=1 ${dateFilter}
      ORDER BY entry_date ASC, created_at ASC
    `, params);

    let running = 0;
    const ledger = result.rows.map(row => {
      running += (Number(row.debit) - Number(row.credit));
      return { ...row, balance: running };
    });

    res.json({
      customer: cust.rows[0],
      ledger,
      summary: {
        total_debit:  ledger.reduce((s,r) => s+Number(r.debit), 0),
        total_credit: ledger.reduce((s,r) => s+Number(r.credit), 0),
        closing_balance: Number(cust.rows[0].balance)
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST receipt
router.post('/:id/receipts', async (req, res) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { amount, receipt_date, payment_method='cash', note } = req.body;
    if (!amount || Number(amount)<=0) return res.status(400).json({ error: 'Amount must be > 0' });
    const cust = await client.query('SELECT id, balance FROM customers WHERE id=$1', [id]);
    if (!cust.rows.length) return res.status(404).json({ error: 'Customer not found' });
    await client.query('BEGIN');
    const payAmount = Math.round(Number(amount));
    const newBalance = parseFloat(cust.rows[0].balance) - payAmount;
    await client.query('UPDATE customers SET balance=$1 WHERE id=$2', [newBalance, id]);
    const result = await client.query(`
      INSERT INTO customer_receipts (customer_id, amount, receipt_date, payment_method, note)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [id, payAmount, receipt_date||new Date().toISOString().split('T')[0], payment_method, note||null]);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, receipt: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// DELETE receipt
router.delete('/:id/receipts/:rid', async (req, res) => {
  const client = await getClient();
  try {
    const { id, rid } = req.params;
    const entry = await client.query('SELECT * FROM customer_receipts WHERE id=$1 AND customer_id=$2', [rid, id]);
    if (!entry.rows.length) return res.status(404).json({ error: 'Receipt not found' });
    await client.query('BEGIN');
    await client.query('UPDATE customers SET balance=balance+$1 WHERE id=$2', [Number(entry.rows[0].amount), id]);
    await client.query('DELETE FROM customer_receipts WHERE id=$1', [rid]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
