// src/pages/Attendance.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const STATUS_OPTIONS = [
  { value: 'present',      label: 'Present',       color: '#059669', bg: '#d1fae5' },
  { value: 'absent',       label: 'Absent',        color: '#dc2626', bg: '#fee2e2' },
  { value: 'annual_leave', label: 'Annual Leave',  color: '#7c3aed', bg: '#ede9fe' },
  { value: 'half_day',     label: 'Half Day',      color: '#d97706', bg: '#fef3c7' },
  { value: 'wfh',          label: 'Work From Home',color: '#0369a1', bg: '#e0f2fe' },
];

// Generate time options in 15-min increments (06:00 to 23:45)
const TIME_OPTIONS = (() => {
  const opts = [{ value: '', label: '— Time —' }];
  for (let h = 6; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const val = `${hh}:${mm}`;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h < 12 ? 'AM' : 'PM';
      opts.push({ value: val, label: `${hour12}:${mm} ${ampm}` });
    }
  }
  return opts;
})();

const calcHours = (clock_in, break_out, break_in, clock_out) => {
  if (!clock_in || !clock_out) return null;
  const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let mins = toMins(clock_out) - toMins(clock_in);
  if (break_out && break_in) mins -= (toMins(break_in) - toMins(break_out));
  return Math.max(0, mins / 60).toFixed(2);
};

const statusStyle = (val) => STATUS_OPTIONS.find(s => s.value === val) || STATUS_OPTIONS[0];

function TimePicker({ value, onChange, disabled }) {
  const allOpts = [...TIME_OPTIONS];
  if (value && !allOpts.find(o => o.value === value)) {
    const [h, m] = value.split(':').map(Number);
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const ampm = h < 12 ? 'AM' : 'PM';
    allOpts.push({ value, label: `${hour12}:${String(m).padStart(2,'0')} ${ampm}` });
  }
  return (
    <select className="time-select" value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {allOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function Attendance({ user }) {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date().toISOString().slice(0, 7);

  const [tab, setTab]           = useState('daily');
  const [date, setDate]         = useState(today);
  const [month, setMonth]       = useState(thisMonth);
  const [records, setRecords]   = useState([]);
  const [monthly, setMonthly]   = useState([]);
  const [lateReport, setLateReport] = useState([]);
  const [shifts, setShifts]     = useState([]);
  const [leaves, setLeaves]     = useState([]);
  const [shops, setShops]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [savingShift, setSavingShift] = useState(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    user_id: '', from_date: today, to_date: today, leave_type: 'annual_leave', reason: ''
  });
  const [users, setUsers]       = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || []));
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const r = await api.get('/auth/users');
      const data = r.data?.data || r.data || [];
      setUsers(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to load staff list'); }
    finally { setUsersLoading(false); }
  };

  useEffect(() => { if (tab === 'daily')       loadDaily();      }, [date, tab]);
  useEffect(() => { if (tab === 'monthly')     loadMonthly();    }, [month, tab]);
  useEffect(() => { if (tab === 'leaves')      loadLeaves();     }, [tab]);
  useEffect(() => { if (tab === 'shifts')      loadShifts();     }, [tab]);
  useEffect(() => { if (tab === 'late-report') loadLateReport(); }, [month, tab]);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const r = await api.get('/attendance/shifts');
      setShifts(r.data?.data || []);
    } catch { toast.error('Failed to load shifts'); }
    finally { setLoading(false); }
  };

  const saveShift = async (shift) => {
    setSavingShift(shift.user_id);
    try {
      await api.post('/attendance/shifts', {
        user_id: shift.user_id,
        shift_start: shift.shift_start,
        shift_end: shift.shift_end,
        grace_minutes: shift.grace_minutes,
      });
      toast.success(`Shift updated for ${shift.name}`);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSavingShift(null); }
  };

  const updateShift = (userId, field, value) => {
    setShifts(prev => prev.map(s => s.user_id === userId ? { ...s, [field]: value } : s));
  };

  const loadLateReport = async () => {
    setLoading(true);
    try {
      const r = await api.get('/attendance/late-report', { params: { month } });
      setLateReport(r.data?.data || []);
    } catch { toast.error('Failed to load late report'); }
    finally { setLoading(false); }
  };

  const loadDaily = async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance', { params: { date } });
      setRecords((res.data?.data || []).map(r => ({ ...r })));
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const loadMonthly = async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/monthly', { params: { month } });
      setMonthly(res.data?.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const loadLeaves = async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/leaves');
      setLeaves(res.data?.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const updateRecord = (idx, field, value) => {
    setRecords(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      await api.post('/attendance', { date, records, created_by: user?.id });
      toast.success('Attendance saved!');
      loadDaily();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const submitLeave = async () => {
    if (!leaveForm.user_id) return toast.error('Select a staff member');
    if (!leaveForm.from_date || !leaveForm.to_date) return toast.error('Select dates');
    try {
      await api.post('/attendance/leaves', leaveForm);
      toast.success('Leave request submitted!');
      setShowLeaveForm(false);
      setLeaveForm({ user_id: '', from_date: today, to_date: today, leave_type: 'annual_leave', reason: '' });
      loadLeaves();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const deleteLeave = async (id) => {
    if (!window.confirm('Delete this leave request?')) return;
    try {
      await api.delete(`/attendance/leaves/${id}`);
      toast.success('Deleted');
      loadLeaves();
    } catch { toast.error('Failed'); }
  };

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AE') : '—';

  const monthlyByUser = {};
  monthly.forEach(r => {
    if (!monthlyByUser[r.user_name]) monthlyByUser[r.user_name] = { role: r.role, days: {} };
    if (r.date) monthlyByUser[r.user_name].days[r.date] = r;
  });

  return (
    <div>
      <style>{`
        .att-tabs { display:flex; gap:4px; margin-bottom:20px; background:#f1f5f9; padding:4px; border-radius:10px; width:fit-content; }
        .att-tab { padding:8px 18px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:600; color:#64748b; background:transparent; transition:all .15s; }
        .att-tab.active { background:#fff; color:#6366f1; box-shadow:0 1px 4px rgba(0,0,0,.08); }
        .att-table { width:100%; border-collapse:collapse; font-size:13px; }
        .att-table th { padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.5px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
        .att-table td { padding:10px 12px; border-bottom:1px solid #f8fafc; vertical-align:middle; }
        .att-table tr:hover td { background:#f8fafc; }
        .time-select { padding:6px 8px; border:1.5px solid #e2e8f0; border-radius:6px; font-size:12px; width:110px; font-family:inherit; background:#fff; cursor:pointer; color:#0f172a; }
        .time-select:focus { outline:none; border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.1); }
        .time-select:disabled { background:#f8fafc; color:#cbd5e1; cursor:default; }
        .status-select { padding:5px 8px; border:1.5px solid #e2e8f0; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .hours-badge { background:#eef2ff; color:#6366f1; padding:3px 8px; border-radius:6px; font-size:12px; font-weight:700; font-family:monospace; }
        .leave-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; }
        .staff-select { width:100%; padding:10px 12px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:14px; font-family:inherit; color:#0f172a; background:#fff; cursor:pointer; }
        .staff-select:focus { outline:none; border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.12); }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">📅 Attendance</div>
          <div className="page-subtitle">Track daily attendance and leave requests</div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          {tab === 'daily' && (
            <button className="btn btn-primary" onClick={saveAttendance} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Attendance'}
            </button>
          )}
          {tab === 'leaves' && (
            <button className="btn btn-primary" onClick={() => setShowLeaveForm(true)}>+ Add Leave Request</button>
          )}
        </div>
      </div>

      <div className="att-tabs">
        {['daily', 'monthly', 'late-report', 'shifts', 'leaves'].map(t => (
          <button key={t} className={`att-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'daily' ? '📋 Daily' : t === 'monthly' ? '📆 Monthly' : t === 'late-report' ? '⏰ Late Report' : t === 'shifts' ? '🕐 Shift Settings' : '🏖️ Leave Requests'}
          </button>
        ))}
      </div>

      {/* DAILY TAB */}
      {tab === 'daily' && (
        <div>
          <div className="card" style={{ padding:'1rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap' }}>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Date</label>
                <input type="date" className="form-control" style={{ width:'auto' }} value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div style={{ marginTop:'20px', color:'var(--text-muted)', fontSize:'13px' }}>{records.length} staff members</div>
            </div>
          </div>
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            {loading ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>Loading...</div>
            ) : (
              <div className="table-wrapper">
                <table className="att-table">
                  <thead>
                    <tr>
                      <th>Staff Member</th><th>Role</th><th>Shop</th>
                      <th>Clock In</th><th>Break Out</th><th>Break In</th><th>Clock Out</th>
                      <th>Hours</th><th>Status</th><th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => {
                      const hours = calcHours(r.clock_in, r.break_out, r.break_in, r.clock_out);
                      const isAbsent = ['absent', 'annual_leave'].includes(r.status);
                      const ss = statusStyle(r.status);
                      return (
                        <tr key={r.user_id}>
                          <td>
                            <strong>{r.user_name}</strong>
                            <div style={{fontSize:'.72rem',color:'var(--text-muted)'}}>
                              {r.shift_start} — {r.shift_end}
                              {r.is_late && <span style={{marginLeft:'6px',color:'#dc2626',fontWeight:700}}>⏰ Late {r.late_minutes}min</span>}
                            </div>
                          </td>
                          <td><span style={{ fontSize:'11px', fontWeight:600, color:'#64748b', textTransform:'uppercase' }}>{r.role}</span></td>
                          <td>
                            <select className="status-select" value={r.shop_id || ''} onChange={e => updateRecord(i, 'shop_id', e.target.value)} disabled={isAbsent}>
                              <option value="">— Shop —</option>
                              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </td>
                          <td><TimePicker value={r.clock_in || ''} disabled={isAbsent} onChange={v => updateRecord(i, 'clock_in', v)} /></td>
                          <td><TimePicker value={r.break_out || ''} disabled={isAbsent} onChange={v => updateRecord(i, 'break_out', v)} /></td>
                          <td><TimePicker value={r.break_in || ''} disabled={isAbsent} onChange={v => updateRecord(i, 'break_in', v)} /></td>
                          <td><TimePicker value={r.clock_out || ''} disabled={isAbsent} onChange={v => updateRecord(i, 'clock_out', v)} /></td>
                          <td>{hours ? <span className="hours-badge">{hours}h</span> : <span style={{ color:'#cbd5e1' }}>—</span>}</td>
                          <td>
                            <select className="status-select" style={{ background:ss.bg, color:ss.color, border:`1.5px solid ${ss.color}33` }}
                              value={r.status || 'present'} onChange={e => updateRecord(i, 'status', e.target.value)}>
                              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </td>
                          <td>
                            <input className="time-select" style={{ width:'120px' }} placeholder="Notes..."
                              value={r.notes || ''} onChange={e => updateRecord(i, 'notes', e.target.value)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MONTHLY TAB */}
      {tab === 'monthly' && (
        <div>
          <div className="card" style={{ padding:'1rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Month</label>
                <input type="month" className="form-control" style={{ width:'auto' }} value={month} onChange={e => setMonth(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            {loading ? <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>Loading...</div> : (
              <div className="table-wrapper">
                <table className="att-table">
                  <thead>
                    <tr>
                      <th>Staff</th><th>Role</th>
                      <th style={{ textAlign:'center' }}>Present</th><th style={{ textAlign:'center' }}>Absent</th>
                      <th style={{ textAlign:'center' }}>Leave</th><th style={{ textAlign:'center' }}>Half Day</th>
                      <th style={{ textAlign:'right' }}>Total Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(monthlyByUser).map(([name, info]) => {
                      const days = Object.values(info.days);
                      const present = days.filter(d => d.status === 'present').length;
                      const absent  = days.filter(d => d.status === 'absent').length;
                      const leave   = days.filter(d => d.status === 'annual_leave').length;
                      const halfDay = days.filter(d => d.status === 'half_day').length;
                      const totalHrs = days.reduce((s, d) => s + parseFloat(d.total_hours || 0), 0);
                      return (
                        <tr key={name}>
                          <td><strong>{name}</strong></td>
                          <td><span style={{ fontSize:'11px', fontWeight:600, color:'#64748b', textTransform:'uppercase' }}>{info.role}</span></td>
                          <td style={{ textAlign:'center' }}><span style={{ background:'#d1fae5', color:'#065f46', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:700 }}>{present}</span></td>
                          <td style={{ textAlign:'center' }}><span style={{ background:'#fee2e2', color:'#991b1b', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:700 }}>{absent}</span></td>
                          <td style={{ textAlign:'center' }}><span style={{ background:'#ede9fe', color:'#5b21b6', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:700 }}>{leave}</span></td>
                          <td style={{ textAlign:'center' }}><span style={{ background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:700 }}>{halfDay}</span></td>
                          <td style={{ textAlign:'right', fontWeight:700, fontFamily:'monospace' }}>{totalHrs.toFixed(1)}h</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEAVES TAB */}
      {tab === 'leaves' && (
        <div>
          {loading ? <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>Loading...</div> : (
            leaves.length === 0 ? (
              <div className="card" style={{ textAlign:'center', padding:'3rem', color:'var(--text-muted)' }}>
                <div style={{ fontSize:'2rem', marginBottom:'8px' }}>🏖️</div>
                <div style={{ fontWeight:600 }}>No leave requests yet</div>
                <div style={{ fontSize:'13px', marginTop:'4px' }}>Click + Add Leave Request to submit one</div>
              </div>
            ) : leaves.map(l => {
              const lt = STATUS_OPTIONS.find(s => s.value === l.leave_type) || STATUS_OPTIONS[2];
              return (
                <div key={l.id} className="leave-card">
                  <div style={{ display:'flex', gap:'16px', alignItems:'center' }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:lt.bg, color:lt.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>🏖️</div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'14px' }}>{l.user_name}</div>
                      <div style={{ fontSize:'12px', color:'#64748b', marginTop:'2px' }}>
                        {fmtDate(l.from_date)} → {fmtDate(l.to_date)}
                        <span style={{ marginLeft:'8px', background:lt.bg, color:lt.color, padding:'1px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:600 }}>{lt.label}</span>
                      </div>
                      {l.reason && <div style={{ fontSize:'12px', color:'#94a3b8', marginTop:'2px' }}>📝 {l.reason}</div>}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ color:'#dc2626' }} onClick={() => deleteLeave(l.id)}>🗑️</button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* LEAVE REQUEST MODAL */}
      {showLeaveForm && (
        <div className="modal-overlay" onClick={() => setShowLeaveForm(false)}>
          <div className="modal" style={{ maxWidth:'480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🏖️ Add Leave Request</strong>
              <button className="modal-close" onClick={() => setShowLeaveForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Staff Member *</label>
                {usersLoading ? (
                  <div style={{ padding:'10px 12px', background:'#f8fafc', borderRadius:'8px', fontSize:'13px', color:'#94a3b8' }}>Loading staff list...</div>
                ) : users.length === 0 ? (
                  <div style={{ padding:'10px 12px', background:'#fff5f5', borderRadius:'8px', fontSize:'13px', color:'#dc2626', border:'1px solid #fecaca' }}>
                    ⚠️ No staff found.{' '}
                    <button style={{ background:'none', border:'none', color:'#6366f1', cursor:'pointer', textDecoration:'underline', fontSize:'13px' }} onClick={loadUsers}>Retry</button>
                  </div>
                ) : (
                  <>
                    <select className="staff-select" value={leaveForm.user_id}
                      onChange={e => setLeaveForm({ ...leaveForm, user_id: e.target.value })}>
                      <option value="">— Select Staff Member —</option>
                      {users.map(u => (
                        <option key={u.id} value={String(u.id)}>
                          {u.name}{u.role ? ` (${u.role})` : ''}
                        </option>
                      ))}
                    </select>
                    {leaveForm.user_id && (
                      <div style={{ marginTop:'6px', fontSize:'12px', color:'#059669', fontWeight:600 }}>
                        ✓ {users.find(u => String(u.id) === String(leaveForm.user_id))?.name} selected
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">From Date *</label>
                  <input type="date" className="form-control" value={leaveForm.from_date} onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">To Date *</label>
                  <input type="date" className="form-control" value={leaveForm.to_date} onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Leave Type</label>
                <select className="form-control" value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                  <option value="annual_leave">Annual Leave</option>
                  <option value="sick_leave">Sick Leave</option>
                  <option value="emergency">Emergency</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input className="form-control" placeholder="Optional reason..." value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowLeaveForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitLeave} disabled={!leaveForm.user_id}>Submit Leave Request</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Shift Settings ── */}
      {tab === 'shifts' && (
        <div>
          <div style={{marginBottom:'16px',color:'var(--text-muted)',fontSize:'.88rem'}}>
            Set base shift timing for each staff member. Grace period = minutes after shift start before marking as late.
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.88rem'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--border)'}}>
                  {['Staff','Shift Start','Shift End','Grace (mins)',''].map(h => (
                    <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.78rem',textTransform:'uppercase'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.user_id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px'}}>
                      <div style={{fontWeight:600}}>{s.name}</div>
                      <div style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{s.role}</div>
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      <input type="time" className="form-control" style={{width:'120px'}}
                        value={s.shift_start} onChange={e => updateShift(s.user_id,'shift_start',e.target.value)} />
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      <input type="time" className="form-control" style={{width:'120px'}}
                        value={s.shift_end} onChange={e => updateShift(s.user_id,'shift_end',e.target.value)} />
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      <input type="number" className="form-control" style={{width:'80px'}}
                        value={s.grace_minutes} min="0" max="60"
                        onChange={e => updateShift(s.user_id,'grace_minutes',e.target.value)} />
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      <button className="btn btn-primary btn-sm"
                        onClick={() => saveShift(s)}
                        disabled={savingShift === s.user_id}>
                        {savingShift === s.user_id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Late Report ── */}
      {tab === 'late-report' && (
        <div>
          <div style={{display:'flex',gap:'8px',marginBottom:'16px',alignItems:'center'}}>
            <label className="form-label" style={{margin:0}}>Month:</label>
            <input type="month" className="form-control" style={{width:'160px'}}
              value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          {loading ? <div style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>Loading...</div> : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.88rem'}}>
            <thead>
              <tr style={{borderBottom:'2px solid var(--border)'}}>
                {['Staff','Present','Late Days','Avg Late (mins)','Max Late (mins)','Absent'].map(h => (
                  <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.78rem',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lateReport.map((r,i) => (
                <tr key={i} style={{borderBottom:'1px solid var(--border)',background: r.late_days > 0 ? '#fff7f7' : ''}}>
                  <td style={{padding:'10px 12px',fontWeight:600}}>{r.user_name}</td>
                  <td style={{padding:'10px 12px',color:'#059669'}}>{r.present_days || 0}</td>
                  <td style={{padding:'10px 12px'}}>
                    {r.late_days > 0
                      ? <span style={{color:'#dc2626',fontWeight:700}}>{r.late_days} days</span>
                      : <span style={{color:'#059669'}}>0</span>}
                  </td>
                  <td style={{padding:'10px 12px',color: r.avg_late_minutes > 30 ? '#dc2626' : '#d97706'}}>
                    {r.avg_late_minutes ? `${r.avg_late_minutes} min` : '—'}
                  </td>
                  <td style={{padding:'10px 12px',color:'#dc2626'}}>
                    {r.max_late_minutes ? `${r.max_late_minutes} min` : '—'}
                  </td>
                  <td style={{padding:'10px 12px',color: r.absent_days > 0 ? '#dc2626' : 'var(--text-muted)'}}>
                    {r.absent_days || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      )}

    </div>
  );
}
