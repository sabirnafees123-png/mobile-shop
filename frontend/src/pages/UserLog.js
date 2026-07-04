import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n||0)).toLocaleString()}`;
const fmtTime = d => d ? new Date(d).toLocaleString('en-AE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';

const TYPE_CONFIG = {
  sale:     { label:'Sale',     color:'#059669', bg:'#d1fae5', icon:'🧾' },
  purchase: { label:'Purchase', color:'#2563eb', bg:'#dbeafe', icon:'📦' },
  expense:  { label:'Expense',  color:'#dc2626', bg:'#fee2e2', icon:'💸' },
  finance:  { label:'Finance',  color:'#7c3aed', bg:'#ede9fe', icon:'💼' },
};

export default function UserLog() {
  const today = new Date().toISOString().split('T')[0];
  const [from, setFrom]       = useState(today);
  const [to, setTo]           = useState(today);
  const [userId, setUserId]   = useState('');
  const [users, setUsers]     = useState([]);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [details, setDetails]   = useState({});
  const [loadingDetail, setLoadingDetail] = useState({});

  useEffect(() => {
    api.get('/user-log', { params: { from: today, to: today } })
      .then(r => { setUsers(r.data?.users||[]); setLogs(r.data?.data||[]); })
      .catch(() => {});
  }, []);

  const loadLog = async () => {
    setLoading(true);
    try {
      const r = await api.get('/user-log', { params: { from, to, user_id: userId||undefined } });
      setLogs(r.data?.data||[]);
      setUsers(r.data?.users||[]);
      setExpanded({});
      setDetails({});
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setLoading(false); }
  };

  const toggleDetail = async (log) => {
    if (!['sale','purchase'].includes(log.type)) return;
    const key = `${log.type}-${log.record_id}`;
    if (expanded[key]) { setExpanded(p=>({...p,[key]:false})); return; }
    setExpanded(p=>({...p,[key]:true}));
    if (details[key]) return;
    setLoadingDetail(p=>({...p,[key]:true}));
    try {
      const r = await api.get(`/user-log/detail/${log.type}/${log.record_id}`);
      setDetails(p=>({...p,[key]:r.data?.data||[]}));
    } catch { setDetails(p=>({...p,[key]:[]})); }
    finally { setLoadingDetail(p=>({...p,[key]:false})); }
  };

  // Summary counts
  const summary = logs.reduce((acc, l) => {
    acc[l.type] = (acc[l.type]||0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-container">
      <div style={{marginBottom:'1.5rem'}}>
        <h1 style={{fontSize:'1.5rem',fontWeight:700,margin:0}}>User Activity Log</h1>
        <p style={{color:'var(--text-muted)',fontSize:'.88rem',margin:0}}>Track every transaction by user</p>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',marginBottom:'1.5rem',padding:'14px 16px',background:'var(--bg-card)',borderRadius:'10px',border:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
          <label style={{fontWeight:600,fontSize:'.85rem',whiteSpace:'nowrap'}}>From:</label>
          <input type="date" className="form-control" style={{width:'150px'}} value={from} onChange={e=>setFrom(e.target.value)} />
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
          <label style={{fontWeight:600,fontSize:'.85rem',whiteSpace:'nowrap'}}>To:</label>
          <input type="date" className="form-control" style={{width:'150px'}} value={to} onChange={e=>setTo(e.target.value)} />
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
          <label style={{fontWeight:600,fontSize:'.85rem',whiteSpace:'nowrap'}}>User:</label>
          <select className="form-control" style={{width:'160px'}} value={userId} onChange={e=>setUserId(e.target.value)}>
            <option value="">All Users</option>
            {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={loadLog} disabled={loading}>
          {loading ? 'Loading...' : '🔍 Check Report'}
        </button>
      </div>

      {/* Summary */}
      {logs.length > 0 && (
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap',marginBottom:'1.5rem'}}>
          {Object.entries(TYPE_CONFIG).map(([type,cfg]) => (
            summary[type] ? (
              <div key={type} style={{padding:'10px 16px',borderRadius:'8px',background:cfg.bg,border:`1px solid ${cfg.color}30`,display:'flex',alignItems:'center',gap:'8px'}}>
                <span style={{fontSize:'1.1rem'}}>{cfg.icon}</span>
                <div>
                  <div style={{fontWeight:700,color:cfg.color,fontSize:'1.1rem'}}>{summary[type]}</div>
                  <div style={{fontSize:'.72rem',color:cfg.color}}>{cfg.label}s</div>
                </div>
              </div>
            ) : null
          ))}
          <div style={{padding:'10px 16px',borderRadius:'8px',background:'var(--bg-secondary)',display:'flex',alignItems:'center',gap:'8px'}}>
            <div>
              <div style={{fontWeight:700,fontSize:'1.1rem'}}>{logs.length}</div>
              <div style={{fontSize:'.72rem',color:'var(--text-muted)'}}>Total</div>
            </div>
          </div>
        </div>
      )}

      {/* Log Table */}
      {logs.length === 0 && !loading && (
        <div style={{textAlign:'center',padding:'4rem',color:'var(--text-muted)'}}>
          <div style={{fontSize:'2.5rem',marginBottom:'8px'}}>📋</div>
          Select date range and click "Check Report"
        </div>
      )}

      {logs.length > 0 && (
        <div style={{background:'var(--bg-card)',borderRadius:'12px',border:'1px solid var(--border)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}}>
            <thead>
              <tr style={{background:'var(--bg-secondary)',borderBottom:'2px solid var(--border)'}}>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>Created At</th>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>Txn Date</th>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>User</th>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>Type</th>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>Reference</th>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>Extra</th>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>Shop</th>
                <th style={{padding:'10px 14px',textAlign:'right',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>Amount</th>
                <th style={{padding:'10px 14px',textAlign:'center',fontWeight:600,color:'var(--text-muted)',fontSize:'.75rem',textTransform:'uppercase'}}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const cfg = TYPE_CONFIG[log.type] || TYPE_CONFIG.expense;
                const key = `${log.type}-${log.record_id}`;
                const isExpanded = expanded[key];
                const canExpand = ['sale','purchase'].includes(log.type);
                return (
                  <React.Fragment key={i}>
                    <tr style={{borderBottom:'1px solid var(--border)',background: i%2===0 ? 'transparent' : 'var(--bg-secondary)'}}>
                      <td style={{padding:'10px 14px',whiteSpace:'nowrap',color:'var(--text-muted)',fontSize:'.8rem'}}>{fmtTime(log.time)}</td>
                      <td style={{padding:'10px 14px',whiteSpace:'nowrap',fontSize:'.82rem',fontWeight:600,color:'#d97706'}}>{log.transaction_date||'—'}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{fontWeight:600}}>{log.user_name || '—'}</span>
                      </td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{padding:'3px 10px',borderRadius:'99px',fontSize:'.75rem',fontWeight:600,background:cfg.bg,color:cfg.color}}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td style={{padding:'10px 14px',fontWeight:600,fontFamily:'monospace',fontSize:'.82rem'}}>{log.reference||'—'}</td>
                      <td style={{padding:'10px 14px',color:'var(--text-muted)',fontSize:'.8rem',maxWidth:'180px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{log.extra||'—'}</td>
                      <td style={{padding:'10px 14px',fontSize:'.82rem',color:'var(--text-muted)'}}>{log.shop_name||'—'}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',fontWeight:700,color:log.type==='expense'?'#dc2626':log.type==='sale'?'#059669':'#2563eb'}}>
                        {log.type==='finance' ? (log.payment_method==='out'?'- ':'+ ') : ''}{fmt(log.amount)}
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'center'}}>
                        {canExpand ? (
                          <button onClick={()=>toggleDetail(log)}
                            style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',padding:'3px 10px',cursor:'pointer',fontSize:'1rem',color:'var(--text-muted)',transition:'all .15s'}}
                            title="Show details">
                            {loadingDetail[key] ? '...' : isExpanded ? '−' : '+'}
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                    {/* Expanded detail rows */}
                    {isExpanded && details[key] && details[key].map((section, si) => (
                      <tr key={`detail-${i}-${si}`} style={{background:'#f8fafc',borderBottom:'1px solid var(--border)'}}>
                        <td colSpan={8} style={{padding:'8px 14px 8px 40px'}}>
                          <div style={{fontSize:'.8rem',color:'var(--text-muted)',fontWeight:600,marginBottom:'4px',textTransform:'uppercase',letterSpacing:'.04em'}}>{section.section}</div>
                          {section.rows.map((row,ri) => (
                            <div key={ri} style={{fontSize:'.82rem',color:'var(--text-primary)',padding:'2px 0',borderLeft:'2px solid #2563eb30',paddingLeft:'10px',marginBottom:'2px'}}>
                              {row}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
