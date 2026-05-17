// src/routes/attendance.js
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

// ── GET /api/v1/attendance?date=YYYY-MM-DD ────────────────────────────────────
// Returns all users with their attendance for the given date
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get all active users
    const users = await query(`
      SELECT id, name, role FROM users WHERE is_active = true ORDER BY name
    `);

    // Get attendance for that date
    const attendance = await query(`
      SELECT a.*, s.name as shop_name
      FROM attendance a
      LEFT JOIN shops s ON s.id = a.shop_id
      WHERE a.date = $1
    `, [targetDate]);

    // Map attendance to users
    const result = users.rows.map(u => {
      const att = attendance.rows.find(a => a.user_id === u.id);
      return {
        user_id:     u.id,
        user_name:   u.name,
        role:        u.role,
        attendance_id: att?.id || null,
        shop_id:     att?.shop_id || null,
        shop_name:   att?.shop_name || null,
        clock_in:    att?.clock_in || null,
        break_out:   att?.break_out || null,
        break_in:    att?.break_in || null,
        clock_out:   att?.clock_out || null,
        total_hours: att?.total_hours || null,
        status:      att?.status || 'present',
        notes:       att?.notes || '',
      };
    });

    res.json({ success: true, data: result, date: targetDate });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/v1/attendance ───────────────────────────────────────────────────
// Save entire day attendance for all staff
router.post('/', async (req, res) => {
  try {
    const { date, records, created_by } = req.body;
    if (!date || !records?.length) return res.status(400).json({ success: false, message: 'Date and records required' });

    for (const r of records) {
      // Calculate total hours
      let total_hours = null;
      if (r.clock_in && r.clock_out) {
        const toMins = t => { const [h,m] = t.split(':').map(Number); return h * 60 + m; };
        let mins = toMins(r.clock_out) - toMins(r.clock_in);
        if (r.break_out && r.break_in) mins -= (toMins(r.break_in) - toMins(r.break_out));
        total_hours = Math.max(0, mins / 60).toFixed(2);
      }

      // Auto-mark leave dates
      if (['absent', 'annual_leave', 'half_day', 'wfh'].includes(r.status)) {
        // upsert
        await query(`
          INSERT INTO attendance (user_id, shop_id, date, clock_in, break_out, break_in, clock_out, total_hours, status, notes, created_by)
          VALUES ($1,$2,$3,NULL,NULL,NULL,NULL,NULL,$4,$5,$6)
          ON CONFLICT (user_id, date) DO UPDATE SET
            shop_id=EXCLUDED.shop_id, clock_in=NULL, break_out=NULL, break_in=NULL,
            clock_out=NULL, total_hours=NULL, status=EXCLUDED.status, notes=EXCLUDED.notes
        `, [r.user_id, r.shop_id || null, date, r.status, r.notes || '', created_by || null]);
      } else {
        await query(`
          INSERT INTO attendance (user_id, shop_id, date, clock_in, break_out, break_in, clock_out, total_hours, status, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'present',$9,$10)
          ON CONFLICT (user_id, date) DO UPDATE SET
            shop_id=EXCLUDED.shop_id, clock_in=EXCLUDED.clock_in, break_out=EXCLUDED.break_out,
            break_in=EXCLUDED.break_in, clock_out=EXCLUDED.clock_out, total_hours=EXCLUDED.total_hours,
            status='present', notes=EXCLUDED.notes
        `, [r.user_id, r.shop_id || null, date,
            r.clock_in || null, r.break_out || null, r.break_in || null, r.clock_out || null,
            total_hours, r.notes || '', created_by || null]);
      }
    }

    res.json({ success: true, message: 'Attendance saved!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/attendance/monthly?month=YYYY-MM ──────────────────────────────
router.get('/monthly', async (req, res) => {
  try {
    const { month } = req.query;
    const m = month || new Date().toISOString().slice(0, 7);

    const result = await query(`
      SELECT
        u.name as user_name, u.role,
        a.date, a.status, a.clock_in, a.clock_out,
        a.total_hours, a.shop_id, s.name as shop_name
      FROM users u
      LEFT JOIN attendance a ON a.user_id = u.id AND TO_CHAR(a.date,'YYYY-MM') = $1
      LEFT JOIN shops s ON s.id = a.shop_id
      WHERE u.is_active = true
      ORDER BY u.name, a.date
    `, [m]);

    res.json({ success: true, data: result.rows, month: m });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/v1/attendance/leaves ─────────────────────────────────────────────
router.get('/leaves', async (req, res) => {
  try {
    const result = await query(`
      SELECT lr.*, u.name as user_name, u.role
      FROM leave_requests lr
      JOIN users u ON u.id = lr.user_id
      ORDER BY lr.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/v1/attendance/leaves ───────────────────────────────────────────
router.post('/leaves', async (req, res) => {
  try {
    const { user_id, from_date, to_date, leave_type, reason } = req.body;
    if (!user_id || !from_date || !to_date) return res.status(400).json({ success: false, message: 'User, from date and to date required' });

    const result = await query(`
      INSERT INTO leave_requests (user_id, from_date, to_date, leave_type, reason)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [user_id, from_date, to_date, leave_type || 'annual_leave', reason || '']);

    res.json({ success: true, data: result.rows[0], message: 'Leave request submitted!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── DELETE /api/v1/attendance/leaves/:id ─────────────────────────────────────
router.delete('/leaves/:id', async (req, res) => {
  try {
    await query(`DELETE FROM leave_requests WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Leave request deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
