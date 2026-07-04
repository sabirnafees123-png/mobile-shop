import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const STATUS_OPTIONS = [
  { value: 'present',      label: 'Present',       color: '#059669', bg: '#d1fae5' },
  { value: 'absent',       label: 'Absent',        color: '#dc2626', bg: '#fee2e2' },
  { value: 'annual_leave', label: 'Annual Leave',  color: '#7c3aed', bg: '#ede9fe' },
  { value: 'half_day',     label: 'Half Day',      color: '#d97706', bg: '#fef3c7' },
  { value: 'wfh',          label: 'WFH',           color: '#0369a1', bg: '#e0f2fe' },
];

const TIME_OPTIONS = (() => {
  const opts = [{ value: '', label: '— —' }];
  for (let h = 6; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2,'0'), mm = String(m).padStart(2,'0');
      const h12 = h > 12 ? h-12 : h === 0 ? 12 : h;
      opts.push({ value:`${hh}:${mm}`, label:`${h12}:${mm} ${h<12?'AM':'PM'}` });
    }
  }
  return opts;
})();

const toMins = t => { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; };
const fmtTime = t => { if (!t) return '—'; const [h,m] = t.split(':').map(Number); const h12=h>12?h-12:h===0?12:h; return `${h12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`; };
const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-AE',{day:'numeric',month:'short',year:'numeric'}) : '—';

function TP({ value, onChange, disabled }) {
  return (
    <select value={value||''} disabled={disabled} onChange={e=>onChange(e.target.value)}
      style={{padding:'5px 6px',border:'1px solid var(--border)',borderRadius:'6px',fontSize:'.8rem',background:disabled?'var(--bg-secondary)':'var(--bg-card)',color:'var(--text-primary)',cursor:disabled?'default':'pointer',minWidth:'90px'}}>
      {TIME_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function Attendance({ user }) {
  const today = new Date().toISOString().split('T')[0];
  const [tab, setTab]         = useState('daily');
  const [date, setDate]       = useState(today);
  const [records, setRecords] = useState([]);
  const [shifts, setShifts]   = useState([]);
  const [shops, setShops]     = useState([]);
  const [report, setReport]   = useState([]);
  const [leaves, setLeaves]   = useState([]);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate]     = useState(today);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [savingShift, setSavingShift] = useState(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [users, setUsers]     = useState([]);
  const [leaveForm, setLeaveForm] = useState({ user_id:'', from_date:today, to_date:today, leave_type:'annual_leave', reason:'' });

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data||[]));
    api.get('/auth/users').then(r => setUsers(Array.isArray(r.data?.data||r.data) ? (r.data?.data||r.data) : [])).catch(()=>{});
  }, []);

  useEffect(() => {
    if (tab === 'daily')   loadDaily();
    if (tab === 'shifts')  loadShifts();
    if (tab === 'leaves')  loadLeaves();
  }, [tab, date]);

  const loadDaily = async () => {
    setLoading(true);
    try { const r = await api.get('/attendance', {params:{date}}); setRecords(r.data?.data||[]); }
    catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  const loadShifts = async () => {
    setLoading(true);
    try { const r = await api.get('/attendance/shifts'); setShifts(r.data?.data||[]); }
    catch { toast.error('Failed to load shifts'); } finally { setLoading(false); }
  };

  const loadLeaves = async () => {
    setLoading(true);
    try { const r = await api.get('/attendance/leaves'); setLeaves(r.data?.data||[]); }
    catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  const loadReport = async () => {
    if (!fromDate || !toDate) return toast.error('Select date range');
    setLoading(true);
    try { const r = await api.get('/attendance/report', {params:{from:fromDate,to:toDate}}); setReport(r.data?.data||[]); }
    catch { toast.error('Failed to load report'); } finally { setLoading(false); }
  };

  const updateRecord = (i, field, val) => setRecords(prev => prev.map((r,idx) => idx===i ? {...r,[field]:val} : r));
  const updateShift  = (uid, field, val) => setShifts(prev => prev.map(s => s.user_id===uid ? {...s,[field]:val} : s));

  const saveAttendance = async () => {
    setSaving(true);
    try { await api.post('/attendance', {date, records, created_by:user?.id}); toast.success('Saved!'); loadDaily(); }
    catch (err) { toast.error(err.response?.data?.message||'Failed'); } finally { setSaving(false); }
  };

  const saveShift = async (s) => {
    setSavingShift(s.user_id);
    try {
      await api.post('/attendance/shifts', {
        user_id:s.user_id, shift_start:s.shift_start||null, shift_end:s.shift_end||null,
        break_start:s.break_start||null, break_end:s.break_end||null, grace_minutes:s.grace_minutes||15
      });
      toast.success(`Shift saved — ${s.name}`);
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSavingShift(null); }
  };

  const submitLeave = async () => {
    if (!leaveForm.user_id) return toast.error('Select staff');
    try {
      await api.post('/attendance/leaves', leaveForm);
      toast.success('Leave submitted!');
      setShowLeaveForm(false);
      loadLeaves();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
  };

  const deleteLeave = async (id) => {
    if (!window.confirm('Delete?')) return;
    try { await api.delete(`/attendance/leaves/${id}`); loadLeaves(); } catch { toast.error('Failed'); }
  };

  const statusOpt = v => STATUS_OPTIONS.find(s=>s.value===v)||STATUS_OPTIONS[0];

  // Group report by date then user
  const reportByDate = {};
  report.forEach(r => {
    if (!r.date) return;
    if (!reportByDate[r.date]) reportByDate[r.date] = [];
    reportByDate[r.date].push(r);
  });

  return (
    <div className="page-container">
      <style>{`
        .att-tab{padding:8px 18px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;font-size:.88rem;color:var(--text-muted);font-weight:500;transition:all .15s}
        .att-tab.active{color:var(--accent-blue,#2563eb);border-bottom-color:var(--accent-blue,#2563eb);font-weight:600}
        .att-tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:1.5rem;gap:4px;overflow-x:auto}
        .att-table{width:100%;border-collapse:collapse;font-size:.83rem}
        .att-table th{padding:8px 10px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.75rem;text-transform:uppercase;border-bottom:2px solid var(--border);white-space:nowrap}
        .att-table td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle}
        .att-table tr:hover td{background:var(--bg-secondary)}
        .late-badge{display:inline-block;padding:2px 7px;background:#fee2e2;color:#dc2626;border-radius:99px;font-size:.72rem;font-weight:700;margin-left:6px}
        .shift-input{width:100px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-card);color:var(--text-primary)}
        .shift-input:focus{outline:none;border-color:#2563eb}
      `}</style>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <h1 style={{fontSize:'1.5rem',fontWeight:700,margin:0}}>Attendance</h1>
          <p style={{color:'var(--text-muted)',fontSize:'.88rem',margin:0}}>Daily tracking · Shift settings · Reports</p>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {tab==='daily' && <button className="btn btn-primary" onClick={saveAttendance} disabled={saving}>{saving?'Saving...':'💾 Save'}</button>}
          {tab==='leaves' && <button className="btn btn-primary" onClick={()=>setShowLeaveForm(true)}>+ Leave Request</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="att-tabs">
        {[['daily','📋 Daily'],['report','📊 Report'],['shifts','🕐 Shift Settings'],['leaves','🏖️ Leave Requests']].map(([t,l])=>(
          <button key={t} className={`att-tab${tab===t?' active':''}`} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>

      {/* ── DAILY TAB ── */}
      {tab==='daily' && (
        <div>
          <div style={{display:'flex',gap:'8px',marginBottom:'16px',alignItems:'center'}}>
            <label style={{fontWeight:600,fontSize:'.88rem'}}>Date:</label>
            <input type="date" className="form-control" style={{width:'160px'}} value={date} onChange={e=>{setDate(e.target.value);}} max={today} />
          </div>
          {loading ? <div style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>Loading...</div> : (
          <div style={{overflowX:'auto'}}>
            <table className="att-table">
              <thead>
                <tr>
                  <th>Staff</th>
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
                {records.map((r,i) => {
                  const isAbsent = ['absent','annual_leave','half_day','wfh'].includes(r.status);
                  const hours = r.clock_in && r.clock_out ? Math.max(0,(toMins(r.clock_out)-toMins(r.clock_in)-((r.break_out&&r.break_in)?toMins(r.break_in)-toMins(r.break_out):0))/60).toFixed(1) : null;
                  const s = statusOpt(r.status);
                  return (
                    <tr key={r.user_id}>
                      <td>
                        <div style={{fontWeight:600}}>{r.user_name}</div>
                        {r.shift_start ? (
                          <div style={{fontSize:'.72rem',color:'var(--text-muted)',marginTop:'2px'}}>
                            🕐 {fmtTime(r.shift_start)} — {fmtTime(r.shift_end)}
                            {r.break_start && ` · ☕ ${fmtTime(r.break_start)}–${fmtTime(r.break_end)}`}
                          </div>
                        ) : (
                          <div style={{fontSize:'.72rem',color:'#f59e0b',marginTop:'2px'}}>⚠️ No shift set</div>
                        )}
                        {r.is_late && <span className="late-badge">⏰ Late {r.late_minutes}m</span>}
                      </td>
                      <td>
                        <select style={{padding:'4px 6px',border:'1px solid var(--border)',borderRadius:'6px',fontSize:'.8rem',background:'var(--bg-card)'}}
                          value={r.shop_id||''} disabled={isAbsent} onChange={e=>updateRecord(i,'shop_id',e.target.value)}>
                          <option value="">—</option>
                          {shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td><TP value={r.clock_in} disabled={isAbsent} onChange={v=>updateRecord(i,'clock_in',v)} /></td>
                      <td><TP value={r.break_out} disabled={isAbsent} onChange={v=>updateRecord(i,'break_out',v)} /></td>
                      <td><TP value={r.break_in} disabled={isAbsent} onChange={v=>updateRecord(i,'break_in',v)} /></td>
                      <td><TP value={r.clock_out} disabled={isAbsent} onChange={v=>updateRecord(i,'clock_out',v)} /></td>
                      <td>{hours ? <span style={{fontWeight:700,color:'#2563eb'}}>{hours}h</span> : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                      <td>
                        <select style={{padding:'4px 6px',border:`1.5px solid ${s.color}`,borderRadius:'6px',fontSize:'.8rem',background:s.bg,color:s.color,fontWeight:600}}
                          value={r.status||'present'} onChange={e=>updateRecord(i,'status',e.target.value)}>
                          {STATUS_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input style={{padding:'4px 6px',border:'1px solid var(--border)',borderRadius:'6px',fontSize:'.8rem',width:'120px',background:'var(--bg-card)'}}
                          value={r.notes||''} placeholder="Notes..." onChange={e=>updateRecord(i,'notes',e.target.value)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* ── REPORT TAB ── */}
      {tab==='report' && (
        <div>
          <div style={{display:'flex',gap:'8px',marginBottom:'16px',alignItems:'center',flexWrap:'wrap'}}>
            <label style={{fontWeight:600,fontSize:'.88rem'}}>From:</label>
            <input type="date" className="form-control" style={{width:'155px'}} value={fromDate} onChange={e=>setFromDate(e.target.value)} />
            <label style={{fontWeight:600,fontSize:'.88rem'}}>To:</label>
            <input type="date" className="form-control" style={{width:'155px'}} value={toDate} onChange={e=>setToDate(e.target.value)} />
            <button className="btn btn-primary" onClick={loadReport} disabled={loading}>{loading?'Loading...':'Show Report'}</button>
          </div>

          {report.length > 0 && (
            <div style={{overflowX:'auto'}}>
              <table className="att-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Staff</th>
                    <th>Shop</th>
                    <th>Shift</th>
                    <th>Clock In</th>
                    <th>Break</th>
                    <th>Clock Out</th>
                    <th>Hours</th>
                    <th>Status</th>
                    <th>Late</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(reportByDate).sort((a,b)=>b.localeCompare(a)).map(date => (
                    reportByDate[date].map((r,i) => {
                      const s = statusOpt(r.status);
                      return (
                        <tr key={`${date}-${r.user_name}-${i}`} style={{background: r.is_late?'#fff7f7':''}}>
                          {i===0 && (
                            <td rowSpan={reportByDate[date].length}
                              style={{fontWeight:700,fontSize:'.85rem',verticalAlign:'top',paddingTop:'12px',whiteSpace:'nowrap',borderRight:'2px solid var(--border)'}}>
                              {fmtDate(date)}
                            </td>
                          )}
                          <td style={{fontWeight:600}}>{r.user_name}</td>
                          <td style={{color:'var(--text-muted)',fontSize:'.8rem'}}>{r.shop_name||'—'}</td>
                          <td style={{fontSize:'.78rem',color:'var(--text-muted)',whiteSpace:'nowrap'}}>
                            {r.shift_start ? `${fmtTime(r.shift_start)}–${fmtTime(r.shift_end)}` : '—'}
                            {r.break_start && <div>{fmtTime(r.break_start)}–{fmtTime(r.break_end)}</div>}
                          </td>
                          <td style={{whiteSpace:'nowrap'}}>{fmtTime(r.clock_in)}</td>
                          <td style={{fontSize:'.78rem',color:'var(--text-muted)',whiteSpace:'nowrap'}}>
                            {r.break_out ? `${fmtTime(r.break_out)} – ${fmtTime(r.break_in)}` : '—'}
                          </td>
                          <td style={{whiteSpace:'nowrap'}}>{fmtTime(r.clock_out)}</td>
                          <td style={{fontWeight:700,color:'#2563eb'}}>{r.total_hours ? `${parseFloat(r.total_hours).toFixed(1)}h` : '—'}</td>
                          <td><span style={{padding:'2px 8px',borderRadius:'99px',fontSize:'.75rem',fontWeight:600,background:s.bg,color:s.color}}>{s.label}</span></td>
                          <td>{r.is_late ? <span className="late-badge">{r.late_minutes}m late</span> : <span style={{color:'#059669',fontSize:'.78rem'}}>On time</span>}</td>
                          <td style={{color:'var(--text-muted)',fontSize:'.8rem'}}>{r.notes||'—'}</td>
                        </tr>
                      );
                    })
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div style={{marginTop:'16px',padding:'12px 16px',background:'var(--bg-secondary)',borderRadius:'10px',display:'flex',gap:'24px',flexWrap:'wrap',fontSize:'.85rem'}}>
                <div><strong style={{color:'#059669'}}>{report.filter(r=>r.status==='present').length}</strong> Present</div>
                <div><strong style={{color:'#dc2626'}}>{report.filter(r=>r.status==='absent').length}</strong> Absent</div>
                <div><strong style={{color:'#dc2626'}}>{report.filter(r=>r.is_late).length}</strong> Late</div>
                <div><strong style={{color:'#7c3aed'}}>{report.filter(r=>r.status==='annual_leave').length}</strong> Leave</div>
                <div><strong style={{color:'#d97706'}}>{report.filter(r=>r.status==='half_day').length}</strong> Half Day</div>
              </div>
            </div>
          )}
          {report.length === 0 && !loading && (
            <div style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>Select date range and click "Show Report"</div>
          )}
        </div>
      )}

      {/* ── SHIFT SETTINGS TAB ── */}
      {tab==='shifts' && (
        <div>
          <div style={{marginBottom:'12px',color:'var(--text-muted)',fontSize:'.85rem'}}>
            Set base timing per staff. Leave blank if no fixed shift. Grace = allowed late minutes before marking as late.
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="att-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Shift Start</th>
                  <th>Shift End</th>
                  <th>Break Start</th>
                  <th>Break End</th>
                  <th>Grace (min)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.user_id}>
                    <td>
                      <div style={{fontWeight:600}}>{s.name}</div>
                      <div style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{s.role}</div>
                    </td>
                    <td><input type="time" className="shift-input" value={s.shift_start||''} onChange={e=>updateShift(s.user_id,'shift_start',e.target.value)} /></td>
                    <td><input type="time" className="shift-input" value={s.shift_end||''} onChange={e=>updateShift(s.user_id,'shift_end',e.target.value)} /></td>
                    <td><input type="time" className="shift-input" value={s.break_start||''} onChange={e=>updateShift(s.user_id,'break_start',e.target.value)} /></td>
                    <td><input type="time" className="shift-input" value={s.break_end||''} onChange={e=>updateShift(s.user_id,'break_end',e.target.value)} /></td>
                    <td><input type="number" className="shift-input" style={{width:'70px'}} value={s.grace_minutes||15} min="0" max="120" onChange={e=>updateShift(s.user_id,'grace_minutes',parseInt(e.target.value))} /></td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={()=>saveShift(s)} disabled={savingShift===s.user_id}>
                        {savingShift===s.user_id?'...':'Save'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LEAVES TAB ── */}
      {tab==='leaves' && (
        <div>
          {leaves.length===0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>No leave requests</div>
          ) : leaves.map(l => {
            const s = STATUS_OPTIONS.find(o=>o.value===l.leave_type)||STATUS_OPTIONS[0];
            return (
              <div key={l.id} style={{padding:'14px 16px',borderRadius:'10px',marginBottom:'8px',background:'var(--bg-card)',border:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:700}}>{l.user_name} <span style={{padding:'2px 8px',borderRadius:'99px',fontSize:'.75rem',background:s.bg,color:s.color,marginLeft:'6px'}}>{l.leave_type?.replace('_',' ')}</span></div>
                  <div style={{fontSize:'.82rem',color:'var(--text-muted)',marginTop:'3px'}}>{fmtDate(l.from_date)} → {fmtDate(l.to_date)}{l.reason?` · ${l.reason}`:''}</div>
                </div>
                <button onClick={()=>deleteLeave(l.id)} style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:'1rem'}}>🗑️</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Leave Modal */}
      {showLeaveForm && (
        <div className="modal-overlay" onClick={()=>setShowLeaveForm(false)}>
          <div className="modal" style={{maxWidth:'420px'}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><strong>+ Leave Request</strong><button className="modal-close" onClick={()=>setShowLeaveForm(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Staff *</label>
                <select className="form-control" value={leaveForm.user_id} onChange={e=>setLeaveForm({...leaveForm,user_id:e.target.value})}>
                  <option value="">— Select —</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                <div className="form-group">
                  <label className="form-label">From</label>
                  <input type="date" className="form-control" value={leaveForm.from_date} onChange={e=>setLeaveForm({...leaveForm,from_date:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">To</label>
                  <input type="date" className="form-control" value={leaveForm.to_date} onChange={e=>setLeaveForm({...leaveForm,to_date:e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-control" value={leaveForm.leave_type} onChange={e=>setLeaveForm({...leaveForm,leave_type:e.target.value})}>
                  <option value="annual_leave">Annual Leave</option>
                  <option value="sick_leave">Sick Leave</option>
                  <option value="emergency">Emergency</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input className="form-control" value={leaveForm.reason} placeholder="Optional..." onChange={e=>setLeaveForm({...leaveForm,reason:e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setShowLeaveForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitLeave} disabled={!leaveForm.user_id}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
