const express = require("express");
const router = express.Router();
const { query, getClient } = require("../config/database");

// ─── GET /api/v1/suppliers — list with outstanding balance ───────────────────
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        s.id,
        s.name,
        s.phone,
        s.email,
        s.address,
        COALESCE(s.balance, 0) AS balance,
        COALESCE(p.total_purchased, 0) AS total_purchased,
        COALESCE(p.total_purchased, 0) - COALESCE(s.balance, 0) AS total_paid
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount) AS total_purchased
        FROM purchases
        GROUP BY supplier_id
      ) p ON p.supplier_id = s.id
      ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/suppliers/:id — single supplier ─────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        s.id, s.name, s.phone, s.email, s.address,
        COALESCE(s.balance, 0) AS balance,
        COALESCE(p.total_purchased, 0) AS total_purchased,
        COALESCE(p.total_purchased, 0) - COALESCE(s.balance, 0) AS total_paid
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount) AS total_purchased
        FROM purchases WHERE supplier_id = $1
        GROUP BY supplier_id
      ) p ON p.supplier_id = s.id
      WHERE s.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: "Supplier not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/suppliers/:id/ledger ────────────────────────────────────────
router.get("/:id/ledger", async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    const sup = await query("SELECT id, name, balance FROM suppliers WHERE id = $1", [id]);
    if (!sup.rows.length) return res.status(404).json({ error: "Supplier not found" });

    let dateFilter = "";
    const params = [id];

    if (from && to) {
      dateFilter = `AND sl.transaction_date BETWEEN $2 AND $3`;
      params.push(from, to);
    } else if (from) {
      dateFilter = `AND sl.transaction_date >= $2`;
      params.push(from);
    } else if (to) {
      dateFilter = `AND sl.transaction_date <= $2`;
      params.push(to);
    }

    const result = await query(`
      SELECT
        sl.id,
        sl.transaction_type  AS type,
        sl.transaction_date  AS entry_date,
        sl.description       AS note,
        sl.amount,
        sl.balance_after     AS balance,
        CASE
          WHEN sl.transaction_type = 'purchase' THEN sl.amount
          ELSE 0
        END AS debit,
        CASE
          WHEN sl.transaction_type = 'payment' THEN ABS(sl.amount)
          ELSE 0
        END AS credit,
        COALESCE(p.purchase_number, '') AS reference,
        NULL AS payment_method
      FROM supplier_ledger sl
      LEFT JOIN purchases p ON p.id = sl.reference_id AND sl.reference_type = 'purchase'
      WHERE sl.supplier_id = $1
      ${dateFilter}
      ORDER BY sl.transaction_date ASC, sl.created_at ASC
    `, params);

    const ledger = result.rows;
    const total_debit  = ledger.reduce((s, r) => s + Number(r.debit),  0);
    const total_credit = ledger.reduce((s, r) => s + Number(r.credit), 0);

    res.json({
      supplier: sup.rows[0],
      ledger,
      summary: {
        total_debit,
        total_credit,
        closing_balance: Number(sup.rows[0].balance)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/suppliers/:id/payments ──────────────────────────────────────
router.get("/:id/payments", async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM supplier_ledger
      WHERE supplier_id = $1 AND transaction_type = 'payment'
      ORDER BY transaction_date DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/v1/suppliers/:id/payments ─────────────────────────────────────
router.post("/:id/payments", async (req, res) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { amount, payment_date, payment_method = "cash", cheque_no, note } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Amount must be greater than 0" });
    }

    const sup = await client.query("SELECT id, balance FROM suppliers WHERE id = $1", [id]);
    if (!sup.rows.length) return res.status(404).json({ error: "Supplier not found" });

    await client.query("BEGIN");

    const payAmount = Math.round(Number(amount));
    const newBalance = parseFloat(sup.rows[0].balance) - payAmount;

    // Update supplier balance
    await client.query("UPDATE suppliers SET balance = $1 WHERE id = $2", [newBalance, id]);

    // Log in supplier_ledger
    const description = note
      ? note
      : `Payment via ${payment_method}${cheque_no ? " - Cheque: " + cheque_no : ""}`;

    const result = await client.query(`
      INSERT INTO supplier_ledger
        (supplier_id, transaction_type, reference_id, reference_type, amount, balance_after, description, transaction_date)
      VALUES ($1, 'payment', NULL, 'manual', $2, $3, $4, $5)
      RETURNING *
    `, [
      id,
      -payAmount,
      newBalance,
      description,
      payment_date || new Date().toISOString().split("T")[0]
    ]);

    await client.query("COMMIT");
    res.status(201).json({ ok: true, payment: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── DELETE /api/v1/suppliers/:id/payments/:pid ───────────────────────────────
router.delete("/:id/payments/:pid", async (req, res) => {
  const client = await getClient();
  try {
    const { id, pid } = req.params;

    const entry = await client.query(
      "SELECT * FROM supplier_ledger WHERE id = $1 AND supplier_id = $2 AND transaction_type = 'payment'",
      [pid, id]
    );
    if (!entry.rows.length) return res.status(404).json({ error: "Payment not found" });

    await client.query("BEGIN");

    // Reverse the balance
    const reverseAmount = Math.abs(Number(entry.rows[0].amount));
    await client.query(
      "UPDATE suppliers SET balance = balance + $1 WHERE id = $2",
      [reverseAmount, id]
    );

    await client.query("DELETE FROM supplier_ledger WHERE id = $1", [pid]);

    await client.query("COMMIT");
    res.json({ ok: true, deleted: pid });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
