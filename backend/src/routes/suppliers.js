const express = require("express");
const router = express.Router();
const pool = require("../config/database"); // your existing pg pool

// ─── SETUP: Run once to create the payments table ────────────────────────────
// Call GET /api/v1/suppliers/setup to create the table if it doesn't exist
router.get("/setup", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id            SERIAL PRIMARY KEY,
        supplier_id   INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        amount        INTEGER NOT NULL CHECK (amount > 0),
        payment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_method VARCHAR(50) DEFAULT 'cash',   -- cash | bank | cheque
        cheque_no     VARCHAR(100),
        note          TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
 
      CREATE INDEX IF NOT EXISTS idx_sp_supplier ON supplier_payments(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_sp_date     ON supplier_payments(payment_date);
    `);
    res.json({ ok: true, message: "supplier_payments table ready" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/suppliers — list with outstanding balance ───────────────────
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id,
        s.name,
        s.phone,
        s.email,
        s.address,
        COALESCE(p.total_purchased, 0)  AS total_purchased,
        COALESCE(py.total_paid, 0)      AS total_paid,
        COALESCE(p.total_purchased, 0) - COALESCE(py.total_paid, 0) AS balance
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount) AS total_purchased
        FROM purchases
        GROUP BY supplier_id
      ) p  ON p.supplier_id  = s.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS total_paid
        FROM supplier_payments
        GROUP BY supplier_id
      ) py ON py.supplier_id = s.id
      ORDER BY s.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/suppliers/:id — single supplier with balance ────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT
        s.*,
        COALESCE(p.total_purchased, 0)  AS total_purchased,
        COALESCE(py.total_paid, 0)      AS total_paid,
        COALESCE(p.total_purchased, 0) - COALESCE(py.total_paid, 0) AS balance
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount) AS total_purchased
        FROM purchases WHERE supplier_id = $1
        GROUP BY supplier_id
      ) p  ON p.supplier_id  = s.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS total_paid
        FROM supplier_payments WHERE supplier_id = $1
        GROUP BY supplier_id
      ) py ON py.supplier_id = s.id
      WHERE s.id = $1
    `, [id]);

    if (!rows.length) return res.status(404).json({ error: "Supplier not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/suppliers/:id/ledger — full ledger (purchases + payments) ───
router.get("/:id/ledger", async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query; // optional date filters

    // Verify supplier exists
    const sup = await pool.query("SELECT id, name FROM suppliers WHERE id = $1", [id]);
    if (!sup.rows.length) return res.status(404).json({ error: "Supplier not found" });

    let dateFilter = "";
    const params = [id];

    if (from && to) {
      dateFilter = `AND entry_date BETWEEN $2 AND $3`;
      params.push(from, to);
    } else if (from) {
      dateFilter = `AND entry_date >= $2`;
      params.push(from);
    } else if (to) {
      dateFilter = `AND entry_date <= $2`;
      params.push(to);
    }

    const { rows } = await pool.query(`
      SELECT * FROM (
        -- Purchases: money we OWE supplier (debit our payable)
        SELECT
          'purchase'          AS type,
          p.id                AS ref_id,
          p.invoice_no        AS reference,
          p.purchase_date     AS entry_date,
          p.total_amount      AS debit,    -- increases what we owe
          0                   AS credit,
          NULL                AS note,
          NULL                AS payment_method,
          p.created_at
        FROM purchases p
        WHERE p.supplier_id = $1

        UNION ALL

        -- Payments: money we PAID supplier (credit our payable)
        SELECT
          'payment'           AS type,
          sp.id               AS ref_id,
          COALESCE(sp.cheque_no, CAST(sp.id AS VARCHAR)) AS reference,
          sp.payment_date     AS entry_date,
          0                   AS debit,
          sp.amount           AS credit,   -- reduces what we owe
          sp.note,
          sp.payment_method,
          sp.created_at
        FROM supplier_payments sp
        WHERE sp.supplier_id = $1
      ) ledger
      WHERE 1=1 ${dateFilter}
      ORDER BY entry_date ASC, created_at ASC
    `, params);

    // Calculate running balance
    let running = 0;
    const ledger = rows.map(row => {
      running += (Number(row.debit) - Number(row.credit));
      return { ...row, balance: running };
    });

    res.json({
      supplier: sup.rows[0],
      ledger,
      summary: {
        total_debit:  ledger.reduce((s, r) => s + Number(r.debit),  0),
        total_credit: ledger.reduce((s, r) => s + Number(r.credit), 0),
        closing_balance: running
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/suppliers/:id/payments — list payments ─────────────────────
router.get("/:id/payments", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT * FROM supplier_payments
      WHERE supplier_id = $1
      ORDER BY payment_date DESC, created_at DESC
    `, [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/v1/suppliers/:id/payments — record a payment ─────────────────
router.post("/:id/payments", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { amount, payment_date, payment_method = "cash", cheque_no, note } = req.body;

    // Validate
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Amount must be greater than 0" });
    }

    // Check supplier exists
    const sup = await client.query("SELECT id FROM suppliers WHERE id = $1", [id]);
    if (!sup.rows.length) return res.status(404).json({ error: "Supplier not found" });

    await client.query("BEGIN");

    const { rows } = await client.query(`
      INSERT INTO supplier_payments
        (supplier_id, amount, payment_date, payment_method, cheque_no, note)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      id,
      Math.round(Number(amount)),
      payment_date || new Date().toISOString().split("T")[0],
      payment_method,
      cheque_no || null,
      note || null
    ]);

    await client.query("COMMIT");
    res.status(201).json({ ok: true, payment: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── DELETE /api/v1/suppliers/:id/payments/:pid — delete a payment ───────────
router.delete("/:id/payments/:pid", async (req, res) => {
  try {
    const { id, pid } = req.params;
    const result = await pool.query(
      "DELETE FROM supplier_payments WHERE id = $1 AND supplier_id = $2 RETURNING id",
      [pid, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Payment not found" });
    res.json({ ok: true, deleted: pid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
