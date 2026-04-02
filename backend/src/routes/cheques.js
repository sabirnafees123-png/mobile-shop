const router = require('express').Router();
const { query } = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM cheques ORDER BY due_date ASC`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { type, cheque_number, bank, payee_payer, amount, due_date, notes } = req.body;
    if (!type || !amount) return res.status(400).json({ success: false, message: 'Type and amount required' });
    const result = await query(
      `INSERT INTO cheques (type, cheque_number, bank, payee_payer, amount, due_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [type, cheque_number, bank, payee_payer, amount, due_date, notes, req.user?.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { type, cheque_number, bank, payee_payer, amount, due_date, status, notes } = req.body;
    const result = await query(
      `UPDATE cheques SET type=$1, cheque_number=$2, bank=$3, payee_payer=$4,
       amount=$5, due_date=$6, status=$7, notes=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [type, cheque_number, bank, payee_payer, amount, due_date, status, notes, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM cheques WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Cheque deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;