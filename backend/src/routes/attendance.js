const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');

const toMins = t => { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m; };

// ── SHIFTS ────────────────────────────────────────────────────────────────────

router.get('/shifts', async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id as user_id, u.name, u.role, u.is_active,
        us.shift_start, us.shift_end, us.break_start, us.break_end,
        us.grace_minutes, us.updated_at
      FROM users u
      LEFT JOIN user_shifts us ON us.user_id = u.id
      WHERE u.is_active = true
      ORDER BY u.name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/shifts', async (req, res) => {
  try {
    const { user_id, shift_start, shift_end, break_start, break_end, grace_minutes } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id required' });
    const result = await query(`
      INSERT INTO user_shifts (user_id, shift_start, shift_end, break_start, break_end, grace_minutes, updated_by, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        shift_start=EXCLUDED.shift_start, shift_end=EXCLUDED.shift_end,
        break_start=EXCLUDED.break_start, break_end=EXCLUDED.break_end,
        grace_minutes=EXCLUDED.grace_minutes, updated_by=EXCLUDED.updated_by, updated_at=NOW()
      RETURNING *
    `, [user_id, shift_start||null, shift_end||null, break_start||null, break_end||null, grace_minutes||15, req.user?.id||null]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── DAILY ATTENDANCE ──────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const users = await query(`
      SELECT u.id, u.name, u.role,
        us.shift_start, us.shift_end, us.break_start, us.break_end,
        COALESCE(us.grace_minutes, 15) as grace_minutes
      FROM users u
      LEFT JOIN user_shifts us ON us.user_id = u.id
      WHERE u.is_active = true ORDER BY u.name
    `);
    const attendance = await query(`
      SELECT a.*, s.name as shop_name FROM attendance a
      LEFT JOIN shops s ON s.id = a.shop_id WHERE a.date = $1
    `, [targetDate]);

    const result = users.rows.map(u => {
      const att = attendance.rows.find(a => a.user_id === u.id);
      return {
        user_id: u.id, user_name: u.name, role: u.role,
        shift_start: u.shift_start, shift_end: u.shift_end,
        break_start: u.break_start, break_end: u.break_end,
        grace_minutes: u.grace_minutes,
        attendance_id: att?.id||null, shop_id: att?.shop_id||null, shop_name: att?.shop_name||null,
        clock_in: att?.clock_in||null, break_out: att?.break_out||null,
        break_in: att?.break_in||null, clock_out: att?.clock_out||null,
        total_hours: att?.total_hours||null, late_minutes: att?.late_minutes||0,
        is_late: att?.is_late||false, status: att?.status||null, notes: att?.notes||'',
      };
    });
    res.json({ success: true, data: result, date: targetDate });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { date, records, created_by } = req.body;
    if (!date || !records?.length) return res.status(400).json({ success: false, message: 'Date and records required' });

    const shifts = await query(`SELECT user_id, shift_start, grace_minutes FROM user_shifts`);
    const shiftMap = {};
    shifts.rows.forEach(s => { shiftMap[s.user_id] = s; });

    for (const r of records) {
      let total_hours = null, late_minutes = 0, is_late = false;

      if (r.clock_in && r.clock_out) {
        let mins = toMins(r.clock_out) - toMins(r.clock_in);
        if (r.break_out && r.break_in) mins -= (toMins(r.break_in) - toMins(r.break_out));
        total_hours = Math.max(0, mins / 60).toFixed(2);
      }

      if (r.clock_in && shiftMap[r.user_id]?.shift_start) {
        const shift = shiftMap[r.user_id];
        const diff = toMins(r.clock_in) - toMins(shift.shift_start);
        const grace = parseInt(shift.grace_minutes) || 15;
        if (diff > grace) { late_minutes = diff; is_late = true; }
      }

      if (['absent','annual_leave','half_day','wfh'].includes(r.status)) {
        await query(`
          INSERT INTO attendance (user_id, shop_id, date, clock_in, break_out, break_in, clock_out, total_hours, late_minutes, is_late, status, notes, created_by)
          VALUES ($1,$2,$3,NULL,NULL,NULL,NULL,NULL,0,false,$4,$5,$6)
          ON CONFLICT (user_id, date) DO UPDATE SET
            shop_id=EXCLUDED.shop_id, clock_in=NULL, break_out=NULL, break_in=NULL,
            clock_out=NULL, total_hours=NULL, late_minutes=0, is_late=false,
            status=EXCLUDED.status, notes=EXCLUDED.notes
        `, [r.user_id, r.shop_id||null, date, r.status, r.notes||'', created_by||null]);
      } else {
        await query(`
          INSERT INTO attendance (user_id, shop_id, date, clock_in, break_out, break_in, clock_out, total_hours, late_minutes, is_late, status, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'present',$11,$12)
          ON CONFLICT (user_id, date) DO UPDATE SET
            shop_id=EXCLUDED.shop_id, clock_in=EXCLUDED.clock_in, break_out=EXCLUDED.break_out,
            break_in=EXCLUDED.break_in, clock_out=EXCLUDED.clock_out, total_hours=EXCLUDED.total_hours,
            late_minutes=EXCLUDED.late_minutes, is_late=EXCLUDED.is_late, status='present', notes=EXCLUDED.notes
        `, [r.user_id, r.shop_id||null, date, r.clock_in||null, r.break_out||null,
            r.break_in||null, r.clock_out||null, total_hours, late_minutes, is_late, r.notes||'', created_by||null]);
      }
    }
    res.json({ success: true, message: 'Attendance saved!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── DATE RANGE REPORT ─────────────────────────────────────────────────────────

router.get('/report', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'from and to dates required' });
    const result = await query(`
      SELECT
        u.name as user_name, u.role,
        us.shift_start, us.shift_end, us.break_start, us.break_end,
        COALESCE(us.grace_minutes,15) as grace_minutes,
        a.date, a.clock_in, a.clock_out, a.break_out, a.break_in,
        a.total_hours, a.late_minutes, a.is_late, a.status, a.notes,
        s.name as shop_name
      FROM users u
      LEFT JOIN attendance a ON a.user_id = u.id AND a.date BETWEEN $1 AND $2
      LEFT JOIN shops s ON s.id = a.shop_id
      LEFT JOIN user_shifts us ON us.user_id = u.id
      WHERE u.is_active = true
      ORDER BY a.date DESC, u.name
    `, [from, to]);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── LEAVES ────────────────────────────────────────────────────────────────────

router.get('/leaves', async (req, res) => {
  try {
    const result = await query(`
      SELECT lr.*, u.name as user_name, u.role FROM leave_requests lr
      JOIN users u ON u.id = lr.user_id ORDER BY lr.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/leaves', async (req, res) => {
  try {
    const { user_id, from_date, to_date, leave_type, reason } = req.body;
    if (!user_id || !from_date || !to_date) return res.status(400).json({ success: false, message: 'User, from date and to date required' });
    const result = await query(`
      INSERT INTO leave_requests (user_id, from_date, to_date, leave_type, reason)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [user_id, from_date, to_date, leave_type||'annual_leave', reason||'']);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/leaves/:id', async (req, res) => {
  try {
    await query(`DELETE FROM leave_requests WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
