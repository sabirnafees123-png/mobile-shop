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

const calcHours = (clock_in, break_out, break_in, clock_out) => {
  if (!clock_in || !clock_out) return null;
  const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let mins = toMins(clock_out) - toMins(clock_in);
  if (break_out && break_in) mins -= (toMins(break_in) - toMins(break_out));
  return Math.max(0, mins / 60).toFixed(2);
};

const statusStyle = (val) => STATUS_OPTIONS.find(s => s.value === val) || STATUS_OPTIONS[0];

export default function Attendance({ user }) {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date().toISOString().slice(0, 7);

  const [tab, setTab]           = useState('daily');
  const [date, setDate]         = useState(today);
  const [month, setMonth]       = useState(thisMonth);
  const [records, setRecords]   = useState([]);
  const [monthly, setMonthly]   = useState([]);
  const [leaves, setLeaves]     = useState([]);
  const [shops, setShops]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    user_id: '', from_date: today, to_date: today, leave_type: 'annual_leave', reason: ''
  });
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || []));
    api.get('/users').then(r => setUsers(r.data?.data || r.data || []));
  }, []);

  useEffect(() => { if (tab === 'daily') loadDaily(); }, [date, tab]);
  useEffect(() => { if (tab === 'monthly') loadMonthly(); }, [month, tab]);
  useEffect(() => { if (tab === 'leaves') loadLeaves(); }, [tab]);

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
  const fmtTime = t => t ? t.slice(0, 5) : '—';

  // Group monthly data by user
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
        .time-input { padding:6px 8px; border:1.5px solid #e2e8f0; border-radius:6px; font-size:13px; width:110px; font-family:inherit; }
        .time-input:focus { outline:none; border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.1); }
        .status-select { padding:5px 8px; border:1.5px solid #e2e8f0; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .hours-badge { background:#eef2ff; color:#6366f1; padding:3px 8px; border-radius:6px; font-size:12px; font-weight:700; font-family:monospace; }
        .leave-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; }
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

      {/* Tabs */}
      <div className="att-tabs">
        {['daily', 'monthly', 'leaves'].map(t => (
          <button key={t} className={`att-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'daily' ? '📋 Daily' : t === 'monthly' ? '📆 Monthly' : '🏖️ Leave Requests'}
          </button>
        ))}
      </div>

      {/* ── DAILY TAB ── */}
      {tab === 'daily' && (
        <div>
          <div className="card" style={{ padding:'1rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap' }}>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Date</label>
                <input type="date" className="form-control" style={{ width:'auto' }} value={date}
                  onChange={e => setDate(e.target.value)} />
              </div>
              <div style={{ marginTop:'20px', color:'var(--text-muted)', fontSize:'13px' }}>
                {records.length} staff members
              </div>
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
                      <th>Staff Member</th>
                      <th>Role</th>
                      <th>Shop</th>
                      <th>Clock In</th>
                      <th>Break Out</th>
                      <th>Break In</th>
                      <th>Clock Out</th>
                      <th>Hours</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => {
                      const hours = calcHours(r.clock_in, r.break_out, r.break_in, r.clock_out);
                      const isAbsent = ['absent', 'annual_leave'].includes(r.status);
                      const ss = statusStyle(r.status);
                      return (
                        <tr key={r.user_id}>
                          <td><strong>{r.user_name}</strong></td>
                          <td><span style={{ fontSize:'11px', fontWeight:600, color:'#64748b', textTransform:'uppercase' }}>{r.role}</span></td>
                          <td>
                            <select className="status-select" value={r.shop_id || ''}
                              onChange={e => updateRecord(i, 'shop_id', e.target.value)}
                              disabled={isAbsent}>
                              <option value="">— Shop —</option>
                              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </td>
                          <td><input type="time" className="time-input" value={r.clock_in || ''} disabled={isAbsent} onChange={e => updateRecord(i, 'clock_in', e.target.value)} /></td>
                          <td><input type="time" className="time-input" value={r.break_out || ''} disabled={isAbsent} onChange={e => updateRecord(i, 'break_out', e.target.value)} /></td>
                          <td><input type="time" className="time-input" value={r.break_in || ''} disabled={isAbsent} onChange={e => updateRecord(i, 'break_in', e.target.value)} /></td>
                          <td><input type="time" className="time-input" value={r.clock_out || ''} disabled={isAbsent} onChange={e => updateRecord(i, 'clock_out', e.target.value)} /></td>
                          <td>{hours ? <span className="hours-badge">{hours}h</span> : <span style={{ color:'#cbd5e1' }}>—</span>}</td>
                          <td>
                            <select className="status-select"
                              style={{ background: ss.bg, color: ss.color, border:`1.5px solid ${ss.color}33` }}
                              value={r.status || 'present'}
                              onChange={e => updateRecord(i, 'status', e.target.value)}>
                              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </td>
                          <td>
                            <input className="time-input" style={{ width:'120px' }} placeholder="Notes..."
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

      {/* ── MONTHLY TAB ── */}
      {tab === 'monthly' && (
        <div>
          <div className="card" style={{ padding:'1rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Month</label>
                <input type="month" className="form-control" style={{ width:'auto' }} value={month}
                  onChange={e => setMonth(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            {loading ? <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>Loading...</div> : (
              <div className="table-wrapper">
                <table className="att-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Role</th>
                      <th style={{ textAlign:'center' }}>Present</th>
                      <th style={{ textAlign:'center' }}>Absent</th>
                      <th style={{ textAlign:'center' }}>Leave</th>
                      <th style={{ textAlign:'center' }}>Half Day</th>
                      <th style={{ textAlign:'right' }}>Total Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(monthlyByUser).map(([name, info]) => {
                      const days = Object.values(info.days);
                      const present  = days.filter(d => d.status === 'present').length;
                      const absent   = days.filter(d => d.status === 'absent').length;
                      const leave    = days.filter(d => d.status === 'annual_leave').length;
                      const halfDay  = days.filter(d => d.status === 'half_day').length;
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

      {/* ── LEAVES TAB ── */}
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
                    <div style={{ width:42, height:42, borderRadius:10, background:lt.bg, color:lt.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>
                      🏖️
                    </div>
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

      {/* Leave Request Modal */}
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
                <select className="form-control" value={leaveForm.user_id}
                  onChange={e => setLeaveForm({ ...leaveForm, user_id: e.target.value })}>
                  <option value="">— Select Staff —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">From Date *</label>
                  <input type="date" className="form-control" value={leaveForm.from_date}
                    onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">To Date *</label>
                  <input type="date" className="form-control" value={leaveForm.to_date}
                    onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Leave Type</label>
                <select className="form-control" value={leaveForm.leave_type}
                  onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                  <option value="annual_leave">Annual Leave</option>
                  <option value="sick_leave">Sick Leave</option>
                  <option value="emergency">Emergency</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input className="form-control" placeholder="Optional reason..."
                  value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowLeaveForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitLeave}>Submit Leave Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
