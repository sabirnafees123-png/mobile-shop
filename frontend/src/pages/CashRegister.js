// src/pages/CashRegister.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');


export default function CashRegister() {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const isAdmin = currentUser?.role === 'admin';
  const [data, setData]             = useState(null);
  const [history, setHistory]       = useState([]);
  const [shops, setShops]           = useState([]);
  const [shopId, setShopId]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [showOpen, setShowOpen]     = useState(false);
  const [showClose, setShowClose]   = useState(false);
  const [openingBal, setOpeningBal] = useState('');
  const [closingBal, setClosingBal] = useState('');
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [variance, setVariance]     = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ entry_type:'in', amount:'', category:'', description:'', entry_date:'' });


  useEffect(() => {
    api.get('/shops').then(r => {
      const list = r.data?.data || [];
      setShops(list);
      if (list.length === 1) setShopId(list[0].id.toString());
    });
    api.get('/expenses/categories').then(r => setExpenseCategories(r.data?.data || [])).catch(() => {});
  }, []);

  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo]     = useState('');

  const loadHistory = async (sid, from, to) => {
    try {
      let url = `/cash-register/history?shop_id=${sid}`;
      if (from) url += `&from=${from}`;
      if (to)   url += `&to=${to}`;
      const hist = await api.get(url);
      setHistory(hist.data?.data || []);
    } catch {}
  };

  const load = async (sid) => {
    if (!sid) return;
    setLoading(true); setData(null);
    try {
      const today = await api.get(`/cash-register/today?shop_id=${sid}`);
      setData(today.data?.data);
      await loadHistory(sid, histFrom, histTo);
    } catch { toast.error('Failed to load cash register'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (shopId) load(shopId); }, [shopId]);

  const today = new Date().toISOString().split('T')[0];
  const [registerDate, setRegisterDate] = useState(today);

  const handleManualEntry = async () => {
    if (!manualForm.amount) return toast.error('Enter amount');
    setSaving(true);
    try {
      const entryDate = manualForm.entry_date || new Date().toISOString().split('T')[0];
      await api.post('/cash-register/manual-entry', { ...manualForm, entry_date: entryDate, shop_id: shopId });
      toast.success(`Cash ${manualForm.entry_type === 'in' ? 'IN' : 'OUT'} recorded!`);
      setShowManual(false);
      setManualForm({ entry_type:'in', amount:'', category:'', description:'', entry_date:'' });
      load(shopId);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleOpen = async () => {
    setSaving(true);
    try {
      await api.post('/cash-register/open', { opening_balance: parseFloat(openingBal) || 0, notes, shop_id: shopId, date: registerDate });
      toast.success('Register opened!');
      setShowOpen(false); setOpeningBal(''); setNotes('');
      load(shopId);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleClose = async () => {
    setSaving(true);
    try {
      const res = await api.post('/cash-register/close', { closing_balance: parseFloat(closingBal) || 0, notes, shop_id: shopId, date: registerDate });
      if (res.data?.summary) setVariance(res.data.summary);
      toast.success('Register closed!');
      setShowClose(false); setClosingBal(''); setNotes('');
      load(shopId);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };


  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({ from_shop_id: '', to_shop_id: '', amount: '', date: '', description: '' });

  const handleTransfer = async () => {
    if (!transferForm.from_shop_id || !transferForm.to_shop_id || !transferForm.amount || !transferForm.date)
      return toast.error('Fill all required fields');
    if (transferForm.from_shop_id === transferForm.to_shop_id)
      return toast.error('Cannot transfer to same shop');
    setSaving(true);
    try {
      await api.post('/cash-register/transfer', transferForm);
      toast.success('Cash transferred and register recalculated!');
      setShowTransfer(false);
      setTransferForm({ from_shop_id: '', to_shop_id: '', amount: '', date: '', description: '' });
      load(shopId);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = async (date) => {
    setDetailLoading(true);
    setShowDetail(true);
    setDetailData(null);
    try {
      const res = await api.get(`/cash-register/detail?shop_id=${shopId}&date=${date}`);
      setDetailData(res.data?.data);
    } catch { toast.error('Failed to load detail'); }
    finally { setDetailLoading(false); }
  };

  const deleteManualEntry = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await api.delete(`/cash-register/manual-entry/${id}`);
      toast.success('Deleted');
      load(shopId);
    } catch { toast.error('Failed'); }
  };

  const todayData = data?.today    || {};
  const register = data?.register;
  const isOpen   = register?.status === 'open';
  const isClosed = register?.status === 'closed';
  const shopName = shops.find(s => s.id.toString() === shopId.toString())?.name || '';
  const manualEntries = data?.manual_entries || [];

  return (
    <div>
      <style>{`
        .cr-section-label{margin-bottom:8px;font-weight:600;font-size:.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
        .manual-entry-row{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:8px;margin-bottom:6px;font-size:13px}
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">💵 Cash Register</div>
          <div className="page-subtitle">{new Date().toLocaleDateString('en-AE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <select className="form-control" style={{width:'auto'}} value={shopId} onChange={e => { setShopId(e.target.value); setVariance(null); }}>
            <option value="">— Select Shop —</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {shopId && (
            <>
              <button className="btn btn-ghost" onClick={() => { setTransferForm({...transferForm, from_shop_id: shopId}); setShowTransfer(true); }}>🔄 Transfer Cash</button>
              {isAdmin && <button className="btn btn-ghost" onClick={() => setShowManual(true)}>+ Cash Entry</button>}
            </>
          )}
          {shopId && !isOpen && (
            <button className="btn btn-primary" onClick={() => setShowOpen(true)}>🔓 Open Register</button>
          )}
          {shopId && isOpen && (
            <button className="btn btn-ghost" onClick={() => setShowOpen(true)}>🔓 Reopen</button>
          )}
          {shopId && (
            <button className="btn btn-primary" style={{background: isOpen ? 'var(--accent-red)' : '#6b7280'}} onClick={() => setShowClose(true)}>🔒 Close Register</button>
          )}
        </div>
      </div>

      {!shopId && <div style={{padding:'48px',textAlign:'center',color:'var(--text-muted)'}}>← Select a shop to view its cash register</div>}
      {shopId && loading && <div style={{padding:'48px',textAlign:'center'}}>Loading...</div>}

      {shopId && !loading && data && (
        <>
          {register && (
            <div style={{padding:'12px 16px',borderRadius:'8px',marginBottom:'20px',fontSize:'.9rem',background:isOpen?'#d1fae5':'#f1f2f6',color:isOpen?'#065f46':'#6b7280',border:`1px solid ${isOpen?'#a7f3d0':'#e8eaf0'}`}}>
              {isOpen ? `✅ ${shopName} register opened — Opening balance: ${fmt(register.opening_balance)}` : `🔒 ${shopName} register closed — Closing balance: ${fmt(register.closing_balance)}`}
              {register.notes && <span style={{marginLeft:'12px',opacity:.7}}>· {register.notes}</span>}
            </div>
          )}

          {variance && (
            <div style={{padding:'16px',borderRadius:'8px',marginBottom:'20px',background:Math.abs(variance.variance)<1?'#d1fae5':'#fef3c7',border:`1px solid ${Math.abs(variance.variance)<1?'#a7f3d0':'#fde68a'}`}}>
              <div style={{fontWeight:700,marginBottom:'8px'}}>{Math.abs(variance.variance)<1?'✅ Register Balanced!':'⚠️ Variance Detected'}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',fontSize:'.9rem'}}>
                <div>Expected Cash: <strong>{fmt(variance.expected_cash)}</strong></div>
                <div>Actual Closing: <strong>{fmt(variance.actual_closing)}</strong></div>
                <div style={{color:Math.abs(variance.variance)<1?'#065f46':'#92400e'}}>Variance: <strong>{variance.variance>0?'+':''}{fmt(variance.variance)}</strong></div>
              </div>
            </div>
          )}

          {/* Cash Flow Formula */}
          <div className="cr-section-label">Today's Cash Flow — {shopName}</div>
          <div className="card" style={{padding:'20px',marginBottom:'20px',overflowX:'auto'}}>
            <div style={{display:'flex',gap:'8px',alignItems:'center',fontSize:'.85rem',flexWrap:'wrap'}}>
              {[
                { label:'Opening', val: todayData.opening_balance, color:'var(--accent-green)', sign: null },
                { label:'Cash Sales', val: todayData.cash_sales, color:'var(--accent-green)', sign: '+' },
                { label:'Cash In', val: todayData.manual_in, color:'#059669', sign: '+' },
                { label:'Expenses', val: todayData.expenses, color:'var(--accent-red)', sign: '−' },
                { label:'Supplier Paid', val: todayData.supplier_paid, color:'var(--accent-red)', sign: '−' },
                { label:'Cash Out', val: todayData.manual_out, color:'#dc2626', sign: '−' },
              ].map((item, i) => (
                <React.Fragment key={i}>
                  {item.sign && <div style={{fontSize:'1.2rem',fontWeight:700,color:item.sign==='+'?'var(--accent-green)':'var(--accent-red)'}}>{item.sign}</div>}
                  <div style={{textAlign:'center',minWidth:'80px'}}>
                    <div style={{fontSize:'1.1rem',fontWeight:700,color:item.color}}>{fmt(item.val)}</div>
                    <div style={{color:'var(--text-muted)',fontSize:'.75rem'}}>{item.label}</div>
                  </div>
                </React.Fragment>
              ))}
              <div style={{fontSize:'1.2rem',fontWeight:700,color:'var(--text-muted)'}}>=</div>
              <div style={{textAlign:'center',background:'var(--bg-secondary)',borderRadius:'8px',padding:'8px 12px'}}>
                <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--accent)'}}>{fmt(todayData.expected_cash)}</div>
                <div style={{color:'var(--text-muted)',fontSize:'.75rem'}}>Expected Cash</div>
              </div>
            </div>
          </div>

          {/* Sales breakdown */}
          <div className="cr-section-label">Sales Breakdown</div>
          <div className="stat-grid" style={{marginBottom:'24px'}}>
            <div className="stat-card green">
              <div className="label">Gross Sales</div>
              <div className="value">{fmt(todayData.gross_sales)}</div>
              <div className="sub">{todayData.invoice_count} invoices</div>
            </div>
            <div className="stat-card yellow">
              <div className="label">Trade-in Value</div>
              <div className="value">{fmt(todayData.trade_in)}</div>
              <div className="sub">Exchange deductions</div>
            </div>
            <div className="stat-card blue">
              <div className="label">Net Sales</div>
              <div className="value">{fmt(todayData.net_sales)}</div>
              <div className="sub">Gross − Trade-in</div>
            </div>
            <div className="stat-card blue">
              <div className="label">Cash Sales</div>
              <div className="value">{fmt(todayData.cash_sales)}</div>
              <div className="sub">Cash only</div>
            </div>
            <div className="stat-card red">
              <div className="label">Cash Expenses</div>
              <div className="value">{fmt(todayData.expenses)}</div>
              <div className="sub">Paid in cash</div>
            </div>
            <div className="stat-card red">
              <div className="label">Supplier Payments</div>
              <div className="value">{fmt(todayData.supplier_paid)}</div>
              <div className="sub">Cash to suppliers</div>
            </div>
          </div>



          {/* Cheques */}
          <div className="cr-section-label">Pending Cheques — {shopName}</div>
          <div className="stat-grid" style={{marginBottom:'24px',gridTemplateColumns:'1fr 1fr'}}>
            <div className="stat-card green">
              <div className="label">Inbound (To Receive)</div>
              <div className="value">{fmt(data?.cheques?.pending_inbound)}</div>
              <div className="sub">Pending collection</div>
            </div>
            <div className="stat-card red">
              <div className="label">Outbound (To Pay)</div>
              <div className="value">{fmt(data?.cheques?.pending_outbound)}</div>
              <div className="sub">Pending payment</div>
            </div>
          </div>

          {/* History */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px',flexWrap:'wrap',gap:'8px'}}>
            <div className="cr-section-label" style={{margin:0}}>Register History — {shopName}</div>
            <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
              <input type="date" className="form-control" style={{width:'auto'}} value={histFrom} onChange={e => setHistFrom(e.target.value)} />
              <span style={{color:'#94a3b8',fontSize:'12px'}}>to</span>
              <input type="date" className="form-control" style={{width:'auto'}} value={histTo} onChange={e => setHistTo(e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={() => loadHistory(shopId, histFrom, histTo)}>🔍 Filter</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setHistFrom(''); setHistTo(''); loadHistory(shopId,'',''); }}>✕ Clear</button>
            </div>
          </div>
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{textAlign:'right'}}>Opening</th>
                    <th style={{textAlign:'right',color:'#059669'}}>+ Cash Sales</th>
                    <th style={{textAlign:'right',color:'#059669'}}>Gross Sales</th>
                    <th style={{textAlign:'right',color:'#f59e0b'}}>Exchange</th>
                    <th style={{textAlign:'right',color:'#dc2626'}}>− Returns</th>
                    <th style={{textAlign:'right',color:'#6366f1'}}>+ Transfer In</th>
                    <th style={{textAlign:'right',color:'#f59e0b'}}>+ Cash In</th>
                    <th style={{textAlign:'right',color:'#dc2626'}}>− Purchases</th>
                    <th style={{textAlign:'right',color:'#dc2626'}}>− Expenses</th>
                    <th style={{textAlign:'right',color:'#dc2626'}}>− Cash Out</th>
                    <th style={{textAlign:'right',color:'#7c3aed'}}>− Transfer Out</th>
                    <th style={{textAlign:'right'}}>Closing</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr><td colSpan={9}><div className="empty-state">No register history yet</div></td></tr>
                  ) : history.map(h => {
                    const closing = parseFloat(h.opening_balance||0) + parseFloat(h.total_sales_cash||0) - parseFloat(h.cash_returns||0) + parseFloat(h.transfer_in||0) + parseFloat(h.manual_in||0) - parseFloat(h.total_purchases||0) - parseFloat(h.total_expenses||0) - parseFloat(h.manual_out||0) - parseFloat(h.transfer_out||0);
                    return (
                      <tr key={h.register_date} style={{background: h.is_locked ? '#f0fdf4' : undefined, opacity: h.is_locked ? 0.85 : 1}}>
                        <td><strong>{fmtDate(h.register_date)}</strong></td>
                        <td style={{textAlign:'right'}}>{fmt(h.opening_balance)}</td>
                        <td style={{textAlign:'right',color:'#059669',fontWeight:600}}>{fmt(h.total_sales_cash)}</td>
                        <td style={{textAlign:'right',color:'#059669',fontWeight:700}}>{fmt(h.gross_sales)}</td>
                        <td style={{textAlign:'right',color:'#f59e0b',fontWeight:600}}>{parseFloat(h.trade_in||0)>0?`− ${fmt(h.trade_in)}`:'—'}</td>
                        <td style={{textAlign:'right',color:'#dc2626',fontWeight:600}}>{parseFloat(h.cash_returns||0)>0?`− ${fmt(h.cash_returns)}`:'—'}</td>
                        <td style={{textAlign:'right',color:'#6366f1',fontWeight:600}}>{parseFloat(h.transfer_in||0)>0?fmt(h.transfer_in):'—'}</td>
                        <td style={{textAlign:'right',color:'#f59e0b',fontWeight:600}}>{parseFloat(h.manual_in||0)>0?fmt(h.manual_in):'—'}</td>
                        <td style={{textAlign:'right',color:'#dc2626',fontWeight:600}}>{parseFloat(h.total_purchases||0)>0?`− ${fmt(h.total_purchases)}`:'—'}</td>
                        <td style={{textAlign:'right',color:'#dc2626',fontWeight:600}}>{parseFloat(h.total_expenses||0)>0?`− ${fmt(h.total_expenses)}`:'—'}</td>
                        <td style={{textAlign:'right',color:'#dc2626',fontWeight:600}}>{parseFloat(h.manual_out||0)>0?`− ${fmt(h.manual_out)}`:'—'}</td>
                        <td style={{textAlign:'right',color:'#7c3aed',fontWeight:600}}>{parseFloat(h.transfer_out||0)>0?`− ${fmt(h.transfer_out)}`:'—'}</td>
                        <td style={{textAlign:'right'}}><strong style={{color: h.is_locked ? '#0f172a' : '#6366f1'}}>{fmt(h.closing_balance)}</strong></td>
                        <td>
                          <div style={{display:'flex',gap:'4px'}}>
                            {h.is_locked ? (
                              <button className="btn btn-sm" title="Locked — click to reopen"
                                style={{background:'#fee2e2',color:'#dc2626',border:'1px solid #fca5a5',fontSize:'12px',padding:'3px 8px',borderRadius:'6px',fontWeight:600}}
                                onClick={() => { setRegisterDate(h.register_date); setShowOpen(true); }}>
                                🔒 Locked
                              </button>
                            ) : (
                              <button className="btn btn-sm" title="Open — click to close & lock"
                                style={{background:'#d1fae5',color:'#059669',border:'1px solid #6ee7b7',fontSize:'12px',padding:'3px 8px',borderRadius:'6px',fontWeight:600}}
                                onClick={() => { setRegisterDate(h.register_date); setClosingBal(Math.round(h.closing_balance).toString()); setShowClose(true); }}>
                                🔓 Open
                              </button>
                            )}
                            <button className="btn btn-ghost btn-sm" title="Add manual entry for this date"
                              style={{display:"none"}}>
                              + Entry
                            </button>
                            <button className="btn btn-ghost btn-sm" title="View full breakdown"
                              onClick={() => loadDetail(h.register_date)}
                              style={{color:'#6366f1'}}>
                              📋 Detail
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Open Register Modal */}
      {showOpen && (() => {
        const isReopen = registerDate !== today || history.some(h => h.register_date === registerDate && h.is_locked);
        const histRow  = history.find(h => h.register_date === registerDate);
        return (
        <div className="modal-overlay" onClick={() => setShowOpen(false)}>
          <div className="modal" style={{maxWidth:'420px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{isReopen ? `🔓 Reopen Register — ${registerDate}` : `🔓 Open Register — ${shopName}`}</strong>
              <button className="modal-close" onClick={() => setShowOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {isReopen && histRow && (
                <div style={{padding:'12px',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'8px',marginBottom:'16px',fontSize:'.88rem',color:'#92400e'}}>
                  ⚠️ <strong>Reopening a locked day.</strong> This will set the register status back to <strong>Open</strong> and allow edits for <strong>{registerDate}</strong>.
                  <div style={{marginTop:'6px',display:'flex',justifyContent:'space-between'}}>
                    <span>Stored opening:</span><strong>{fmt(histRow.opening_balance)}</strong>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span>Stored closing:</span><strong>{fmt(histRow.closing_balance)}</strong>
                  </div>
                </div>
              )}
              {!isReopen && (
                <>
                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input type="date" className="form-control" value={registerDate} onChange={e => setRegisterDate(e.target.value)} />
                  </div>
                  <div style={{padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                    Yesterday's closing: <strong>{fmt(data?.yesterday_closing)}</strong>
                    <div style={{fontSize:'.8rem',color:'var(--text-muted)',marginTop:'4px'}}>Enter actual cash counted in drawer.</div>
                  </div>
                </>
              )}
              <div className="form-group" style={{marginBottom:'12px'}}>
                <label className="form-label">{isReopen ? 'Corrected Opening Balance (AED)' : 'Opening Balance (AED)'}</label>
                <input type="number" className="form-control" value={openingBal}
                  onChange={e => setOpeningBal(e.target.value)}
                  placeholder={isReopen && histRow ? Math.round(histRow.opening_balance).toString() : Math.round(data?.yesterday_closing || 0).toString()} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder={isReopen ? 'Reason for reopening...' : 'Optional'} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleOpen} disabled={saving}>
                {saving ? 'Processing...' : isReopen ? '🔓 Reopen Register' : 'Open Register'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Close Register Modal */}
      {showClose && (
        <div className="modal-overlay" onClick={() => setShowClose(false)}>
          <div className="modal" style={{maxWidth:'440px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><strong>🔒 Close Register — {shopName}</strong><button className="modal-close" onClick={() => setShowClose(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" className="form-control" value={registerDate} onChange={e => setRegisterDate(e.target.value)} />
              </div>
              <div style={{padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                <div style={{fontWeight:600,marginBottom:'8px',color:'var(--text-muted)',textTransform:'uppercase',fontSize:'.75rem'}}>System Calculation</div>
                {(() => {
                  const hRow = history.find(h => h.register_date === registerDate);
                  const op  = hRow ? parseFloat(hRow.opening_balance||0)  : parseFloat(todayData.opening_balance||0);
                  const cs  = hRow ? parseFloat(hRow.total_sales_cash||0) : parseFloat(todayData.cash_sales||0);
                  const mi  = hRow ? parseFloat(hRow.manual_in||0)        : parseFloat(todayData.manual_in||0);
                  const exp = hRow ? parseFloat(hRow.total_expenses||0)   : parseFloat(todayData.expenses||0);
                  const sup = hRow ? parseFloat(hRow.total_purchases||0)  : parseFloat(todayData.supplier_paid||0);
                  const mo  = hRow ? parseFloat(hRow.manual_out||0)       : parseFloat(todayData.manual_out||0);
                  const expCash = op + cs + mi - exp - sup - mo;
                  return (<>
                    {[['Opening Balance',op,null],['+ Cash Sales',cs,'green'],['+ Cash In (Manual)',mi,'green'],['− Cash Expenses',exp,'red'],['− Supplier Payments',sup,'red'],['− Cash Out (Manual)',mo,'red']].map(([label,val,color]) => (
                      <div key={label} style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                        <span>{label}:</span>
                        <strong style={{color:color==='green'?'var(--accent-green)':color==='red'?'var(--accent-red)':undefined}}>{fmt(val)}</strong>
                      </div>
                    ))}
                    <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:'8px',fontWeight:700}}>
                      <span>Expected Cash in Drawer:</span>
                      <strong style={{color:'var(--accent)',fontSize:'1.05rem'}}>{fmt(expCash)}</strong>
                    </div>
                  </>);
                })()}
              </div>
              <div className="form-group" style={{marginBottom:'12px'}}>
                <label className="form-label">Actual Cash Counted (AED)</label>
                {(() => {
                  const hRow = history.find(h => h.register_date === registerDate);
                  const op  = hRow ? parseFloat(hRow.opening_balance||0)  : parseFloat(todayData.opening_balance||0);
                  const cs  = hRow ? parseFloat(hRow.total_sales_cash||0) : parseFloat(todayData.cash_sales||0);
                  const mi  = hRow ? parseFloat(hRow.manual_in||0)        : parseFloat(todayData.manual_in||0);
                  const exp = hRow ? parseFloat(hRow.total_expenses||0)   : parseFloat(todayData.expenses||0);
                  const sup = hRow ? parseFloat(hRow.total_purchases||0)  : parseFloat(todayData.supplier_paid||0);
                  const mo  = hRow ? parseFloat(hRow.manual_out||0)       : parseFloat(todayData.manual_out||0);
                  const expCash = op + cs + mi - exp - sup - mo;
                  return (<>
                    <input type="number" className="form-control" value={closingBal} onChange={e => setClosingBal(e.target.value)} placeholder={Math.round(expCash).toString()} />
                    {closingBal && (
                      <div style={{marginTop:'6px',fontSize:'.85rem',fontWeight:600,color:Math.abs(parseFloat(closingBal)-expCash)<1?'var(--accent-green)':'var(--accent-red)'}}>
                        {Math.abs(parseFloat(closingBal)-expCash)<1?'✅ Balanced!':'⚠️ Variance: '+((parseFloat(closingBal)-expCash)>0?'+':'')+fmt(parseFloat(closingBal)-expCash)}
                      </div>
                    )}
                  </>);
                })()}
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional — explain any variance" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowClose(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:'var(--accent-red)'}} onClick={handleClose} disabled={saving}>{saving?'Closing...':'Close Register'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {/* Transfer Modal */}
      {showTransfer && (
        <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
          <div className="modal" style={{maxWidth:'440px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔄 Cash Transfer Between Shops</strong>
              <button className="modal-close" onClick={() => setShowTransfer(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{padding:'10px 14px',background:'#eef2ff',borderRadius:'8px',marginBottom:'16px',fontSize:'13px',color:'#6366f1'}}>
                Records Cash OUT from source shop and Cash IN to destination shop, then recalculates both registers from that date forward.
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">From Shop *</label>
                  <select className="form-control" value={transferForm.from_shop_id}
                    onChange={e => setTransferForm({...transferForm, from_shop_id: e.target.value})}>
                    <option value="">— Select —</option>
                    {shops.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">To Shop *</label>
                  <select className="form-control" value={transferForm.to_shop_id}
                    onChange={e => setTransferForm({...transferForm, to_shop_id: e.target.value})}>
                    <option value="">— Select —</option>
                    {shops.filter(s => String(s.id) !== transferForm.from_shop_id).map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-control" value={transferForm.date}
                    onChange={e => setTransferForm({...transferForm, date: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (AED) *</label>
                  <input type="number" className="form-control" value={transferForm.amount} placeholder="0.00"
                    onChange={e => setTransferForm({...transferForm, amount: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-control" placeholder="e.g. End of day cash transfer"
                  value={transferForm.description} onChange={e => setTransferForm({...transferForm, description: e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowTransfer(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleTransfer} disabled={saving||!transferForm.amount||!transferForm.date||!transferForm.from_shop_id||!transferForm.to_shop_id}>
                {saving ? 'Transferring...' : '🔄 Transfer & Recalculate'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Detail Modal */}
      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(false)}>
          <div className="modal" style={{maxWidth:'560px',maxHeight:'80vh',overflow:'hidden',display:'flex',flexDirection:'column'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>📋 {detailData?.date ? new Date(detailData.date).toLocaleDateString('en-AE',{day:'numeric',month:'long',year:'numeric'}) : 'Loading...'} — {shopName}</strong>
              <button className="modal-close" onClick={() => setShowDetail(false)}>✕</button>
            </div>
            <div className="modal-body" style={{overflowY:'auto'}}>
              {detailLoading ? (
                <div style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>Loading...</div>
              ) : detailData ? (
                <div style={{fontSize:'13px'}}>
                  {/* Opening */}
                  <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'2px solid #e2e8f0',marginBottom:'8px',fontWeight:700}}>
                    <span>Opening Balance</span><span>{fmt(detailData.opening)}</span>
                  </div>

                  {/* Sales */}
                  {detailData.sales.items.length > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#059669',marginBottom:'4px'}}>
                        <span>💰 Cash Sales</span><span>+ {fmt(detailData.sales.total)}</span>
                      </div>
                      {detailData.sales.items.map(i => (
                        <div key={i.invoice_number} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.invoice_number}{i.is_exchange?' 🔄':''}</span><span>{fmt(i.amount_paid)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Returns */}
                  {detailData.returns.items.length > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#dc2626',marginBottom:'4px'}}>
                        <span>↩️ Returns</span><span>− {fmt(detailData.returns.total)}</span>
                      </div>
                      {detailData.returns.items.map(i => (
                        <div key={i.invoice_number} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.invoice_number}</span><span>{fmt(i.amount_paid)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Transfer In */}
                  {detailData.transfer_in.total > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#6366f1',marginBottom:'4px'}}>
                        <span>🔄 Transfer In</span><span>+ {fmt(detailData.transfer_in.total)}</span>
                      </div>
                      {detailData.transfer_in.items.map((i,idx) => (
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.description||i.category}</span><span>{fmt(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bank / Finance Receipts */}
                  {detailData.bank_receipts?.total > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#0369a1',marginBottom:'4px'}}>
                        <span>🏦 Bank / Finance</span><span>+ {fmt(detailData.bank_receipts.total)}</span>
                      </div>
                      {detailData.bank_receipts.items.map((i,idx) => (
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.account_name}{i.description?` — ${i.description}`:''}</span><span>{fmt(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cash In Manual */}
                  {detailData.manual_in.total > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#f59e0b',marginBottom:'4px'}}>
                        <span>⬇️ Cash In</span><span>+ {fmt(detailData.manual_in.total)}</span>
                      </div>
                      {detailData.manual_in.items.map((i,idx) => (
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.description||i.category}</span><span>{fmt(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Purchases */}
                  {detailData.purchases.items.length > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#dc2626',marginBottom:'4px'}}>
                        <span>📦 Purchases Paid</span><span>− {fmt(detailData.purchases.total)}</span>
                      </div>
                      {detailData.purchases.items.map((i,idx) => (
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.reference}</span><span>{fmt(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expenses */}
                  {detailData.expenses.items.length > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#dc2626',marginBottom:'4px'}}>
                        <span>🧾 Expenses</span><span>− {fmt(detailData.expenses.total)}</span>
                      </div>
                      {detailData.expenses.items.map((i,idx) => (
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.category_name}{i.description?` — ${i.description}`:''}</span><span>{fmt(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cash Out Manual */}
                  {detailData.manual_out.total > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#dc2626',marginBottom:'4px'}}>
                        <span>⬆️ Cash Out</span><span>− {fmt(detailData.manual_out.total)}</span>
                      </div>
                      {detailData.manual_out.items.map((i,idx) => (
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.description||i.category}</span><span>{fmt(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Transfer Out */}
                  {detailData.transfer_out.total > 0 && (
                    <div style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,color:'#7c3aed',marginBottom:'4px'}}>
                        <span>🔄 Transfer Out</span><span>− {fmt(detailData.transfer_out.total)}</span>
                      </div>
                      {detailData.transfer_out.items.map((i,idx) => (
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',paddingLeft:'16px',color:'#64748b',marginBottom:'2px'}}>
                          <span>{i.description||i.category}</span><span>{fmt(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Closing */}
                  <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderTop:'2px solid #e2e8f0',marginTop:'8px',fontWeight:800,fontSize:'15px'}}>
                    <span>Closing Balance</span>
                    <span style={{color:'#6366f1'}}>{fmt(detailData.closing)}</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDetail(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Manual Cash Entry Modal — Admin Only */}
      {showManual && isAdmin && (
        <div className="modal-overlay" onClick={() => setShowManual(false)}>
          <div className="modal" style={{maxWidth:'420px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>💰 Manual Cash Entry</strong>
              <button className="modal-close" onClick={() => setShowManual(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Type</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  {['in','out'].map(t => (
                    <button key={t} type="button" onClick={() => setManualForm({...manualForm, entry_type:t})}
                      style={{padding:'12px',border:`2px solid ${manualForm.entry_type===t?(t==='in'?'#059669':'#dc2626'):'#e2e8f0'}`,
                        borderRadius:'8px',background:manualForm.entry_type===t?(t==='in'?'#f0fdf4':'#fff5f5'):'#fff',
                        cursor:'pointer',fontWeight:700,color:manualForm.entry_type===t?(t==='in'?'#059669':'#dc2626'):'#64748b'}}>
                      {t==='in'?'⬇️ Cash IN':'⬆️ Cash OUT'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" className="form-control" value={manualForm.entry_date}
                  onChange={e => setManualForm({...manualForm, entry_date:e.target.value})}
                  max={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (AED) *</label>
                <input type="number" className="form-control" value={manualForm.amount}
                  onChange={e => setManualForm({...manualForm, amount:e.target.value})} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <input className="form-control" value={manualForm.category}
                  onChange={e => setManualForm({...manualForm, category:e.target.value})}
                  placeholder="e.g. Rent, Salary, Other Income..." />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-control" value={manualForm.description}
                  onChange={e => setManualForm({...manualForm, description:e.target.value})}
                  placeholder="e.g. Blessing shop rent received" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowManual(false)}>Cancel</button>
              <button className="btn btn-primary"
                style={{background:manualForm.entry_type==='in'?'#059669':'#dc2626'}}
                onClick={handleManualEntry} disabled={saving||!manualForm.amount}>
                {saving?'Saving...':`Record Cash ${manualForm.entry_type==='in'?'IN':'OUT'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
