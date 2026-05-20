// src/pages/CashRegister.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

const INCOME_CATEGORIES  = ['Rent Received', 'Loan Received', 'Refund Received', 'Other Income'];
const EXPENSE_CATEGORIES = ['Rent Paid', 'Utilities', 'Maintenance', 'Transport', 'Miscellaneous'];

export default function CashRegister() {
  const [data, setData]             = useState(null);
  const [history, setHistory]       = useState([]);
  const [shops, setShops]           = useState([]);
  const [shopId, setShopId]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [showOpen, setShowOpen]     = useState(false);
  const [showClose, setShowClose]   = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [openingBal, setOpeningBal] = useState('');
  const [closingBal, setClosingBal] = useState('');
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [variance, setVariance]     = useState(null);
  const [manualForm, setManualForm] = useState({ entry_type: 'in', amount: '', category: '', description: '' });

  useEffect(() => {
    api.get('/shops').then(r => {
      const list = r.data?.data || [];
      setShops(list);
      if (list.length === 1) setShopId(list[0].id.toString());
    });
  }, []);

  const load = async (sid) => {
    if (!sid) return;
    setLoading(true); setData(null);
    try {
      const [today, hist] = await Promise.all([
        api.get(`/cash-register/today?shop_id=${sid}`),
        api.get(`/cash-register/history?shop_id=${sid}`),
      ]);
      setData(today.data?.data);
      setHistory(hist.data?.data || []);
    } catch { toast.error('Failed to load cash register'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (shopId) load(shopId); }, [shopId]);

  const handleOpen = async () => {
    setSaving(true);
    try {
      await api.post('/cash-register/open', { opening_balance: parseFloat(openingBal) || 0, notes, shop_id: shopId });
      toast.success('Register opened!');
      setShowOpen(false); setOpeningBal(''); setNotes('');
      load(shopId);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleClose = async () => {
    setSaving(true);
    try {
      const res = await api.post('/cash-register/close', { closing_balance: parseFloat(closingBal) || 0, notes, shop_id: shopId });
      if (res.data?.summary) setVariance(res.data.summary);
      toast.success('Register closed!');
      setShowClose(false); setClosingBal(''); setNotes('');
      load(shopId);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleManualEntry = async () => {
    if (!manualForm.amount) return toast.error('Enter amount');
    setSaving(true);
    try {
      await api.post('/cash-register/manual-entry', { ...manualForm, shop_id: shopId });
      toast.success(`Cash ${manualForm.entry_type === 'in' ? 'IN' : 'OUT'} recorded!`);
      setShowManual(false);
      setManualForm({ entry_type: 'in', amount: '', category: '', description: '' });
      load(shopId);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteManualEntry = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await api.delete(`/cash-register/manual-entry/${id}`);
      toast.success('Deleted');
      load(shopId);
    } catch { toast.error('Failed'); }
  };

  const today    = data?.today    || {};
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
          {shopId && isOpen && (
            <button className="btn btn-ghost" onClick={() => setShowManual(true)}>+ Cash Entry</button>
          )}
          {shopId && !register && (
            <button className="btn btn-primary" onClick={() => setShowOpen(true)}>🔓 Open Register</button>
          )}
          {shopId && isOpen && (
            <button className="btn btn-primary" style={{background:'var(--accent-red)'}} onClick={() => setShowClose(true)}>🔒 Close Register</button>
          )}
          {shopId && isClosed && (
            <span className="badge badge-gray" style={{padding:'8px 16px',fontSize:'.9rem'}}>🔒 Closed</span>
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
                { label:'Opening', val: today.opening_balance, color:'var(--accent-green)', sign: null },
                { label:'Cash Sales', val: today.cash_sales, color:'var(--accent-green)', sign: '+' },
                { label:'Cash In', val: today.manual_in, color:'#059669', sign: '+' },
                { label:'Expenses', val: today.expenses, color:'var(--accent-red)', sign: '−' },
                { label:'Supplier Paid', val: today.supplier_paid, color:'var(--accent-red)', sign: '−' },
                { label:'Cash Out', val: today.manual_out, color:'#dc2626', sign: '−' },
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
                <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--accent)'}}>{fmt(today.expected_cash)}</div>
                <div style={{color:'var(--text-muted)',fontSize:'.75rem'}}>Expected Cash</div>
              </div>
            </div>
          </div>

          {/* Sales breakdown */}
          <div className="cr-section-label">Sales Breakdown</div>
          <div className="stat-grid" style={{marginBottom:'24px'}}>
            <div className="stat-card green">
              <div className="label">Gross Sales</div>
              <div className="value">{fmt(today.gross_sales)}</div>
              <div className="sub">{today.invoice_count} invoices</div>
            </div>
            <div className="stat-card yellow">
              <div className="label">Trade-in Value</div>
              <div className="value">{fmt(today.trade_in)}</div>
              <div className="sub">Exchange deductions</div>
            </div>
            <div className="stat-card blue">
              <div className="label">Net Sales</div>
              <div className="value">{fmt(today.net_sales)}</div>
              <div className="sub">Gross − Trade-in</div>
            </div>
            <div className="stat-card blue">
              <div className="label">Cash Sales</div>
              <div className="value">{fmt(today.cash_sales)}</div>
              <div className="sub">Cash only</div>
            </div>
            <div className="stat-card red">
              <div className="label">Cash Expenses</div>
              <div className="value">{fmt(today.expenses)}</div>
              <div className="sub">Paid in cash</div>
            </div>
            <div className="stat-card red">
              <div className="label">Supplier Payments</div>
              <div className="value">{fmt(today.supplier_paid)}</div>
              <div className="sub">Cash to suppliers</div>
            </div>
          </div>

          {/* Manual Cash Entries */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <div className="cr-section-label" style={{margin:0}}>Manual Cash Entries</div>
            {isOpen && <button className="btn btn-ghost btn-sm" onClick={() => setShowManual(true)}>+ Add Entry</button>}
          </div>
          <div className="card" style={{padding:'12px',marginBottom:'24px'}}>
            {manualEntries.length === 0 ? (
              <div style={{textAlign:'center',padding:'20px',color:'var(--text-muted)',fontSize:'13px'}}>
                No manual entries today. Use "+ Cash Entry" to record rent received, etc.
              </div>
            ) : manualEntries.map(e => (
              <div key={e.id} className="manual-entry-row"
                style={{background: e.entry_type==='in'?'#f0fdf4':'#fff5f5', border:`1px solid ${e.entry_type==='in'?'#bbf7d0':'#fecaca'}`}}>
                <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                  <span style={{fontSize:'16px'}}>{e.entry_type==='in'?'⬇️':'⬆️'}</span>
                  <div>
                    <div style={{fontWeight:700,color:e.entry_type==='in'?'#059669':'#dc2626'}}>
                      {e.entry_type==='in'?'+ Cash In':'− Cash Out'} — {fmt(e.amount)}
                    </div>
                    <div style={{fontSize:'12px',color:'#64748b'}}>{e.category || '—'}{e.description ? ` · ${e.description}` : ''}</div>
                  </div>
                </div>
                {isOpen && <button className="btn btn-ghost btn-sm" style={{color:'#dc2626'}} onClick={() => deleteManualEntry(e.id)}>🗑️</button>}
              </div>
            ))}
            {manualEntries.length > 0 && (
              <div style={{display:'flex',justifyContent:'flex-end',gap:'16px',marginTop:'8px',padding:'8px 0',borderTop:'1px solid var(--border)',fontSize:'13px',fontWeight:700}}>
                <span style={{color:'#059669'}}>Total In: {fmt(today.manual_in)}</span>
                <span style={{color:'#dc2626'}}>Total Out: {fmt(today.manual_out)}</span>
              </div>
            )}
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
          <div className="cr-section-label">Register History — {shopName}</div>
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Date</th><th>Opening</th><th>Cash Sales</th><th>Expenses</th><th>Closing</th><th>Variance</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr><td colSpan={7}><div className="empty-state">No register history yet</div></td></tr>
                  ) : history.map(h => {
                    const expected = parseFloat(h.opening_balance||0) + parseFloat(h.total_sales_cash||0) - parseFloat(h.total_expenses||0);
                    const actual   = parseFloat(h.closing_balance||0);
                    const vari     = h.closing_balance !== null ? actual - expected : null;
                    return (
                      <tr key={h.id}>
                        <td>{fmtDate(h.register_date)}</td>
                        <td>{fmt(h.opening_balance)}</td>
                        <td style={{color:'var(--accent-green)'}}>{fmt(h.total_sales_cash)}</td>
                        <td style={{color:'var(--accent-red)'}}>{fmt(h.total_expenses)}</td>
                        <td><strong>{fmt(h.closing_balance)}</strong></td>
                        <td style={{color:vari===null?'var(--text-muted)':Math.abs(vari)<1?'var(--accent-green)':'var(--accent-red)',fontWeight:600}}>
                          {vari===null?'—':`${vari>0?'+':''}${fmt(vari)}`}
                        </td>
                        <td><span className={`badge ${h.status==='open'?'badge-green':'badge-gray'}`}>{h.status}</span></td>
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
      {showOpen && (
        <div className="modal-overlay" onClick={() => setShowOpen(false)}>
          <div className="modal" style={{maxWidth:'400px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><strong>🔓 Open Register — {shopName}</strong><button className="modal-close" onClick={() => setShowOpen(false)}>✕</button></div>
            <div className="modal-body">
              <div style={{padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                Yesterday's closing: <strong>{fmt(data?.yesterday_closing)}</strong>
                <div style={{fontSize:'.8rem',color:'var(--text-muted)',marginTop:'4px'}}>Enter actual cash counted in drawer.</div>
              </div>
              <div className="form-group" style={{marginBottom:'12px'}}>
                <label className="form-label">Opening Balance (AED)</label>
                <input type="number" className="form-control" value={openingBal} onChange={e => setOpeningBal(e.target.value)} placeholder={Math.round(data?.yesterday_closing || 0).toString()} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleOpen} disabled={saving}>{saving?'Opening...':'Open Register'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Register Modal */}
      {showClose && (
        <div className="modal-overlay" onClick={() => setShowClose(false)}>
          <div className="modal" style={{maxWidth:'440px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><strong>🔒 Close Register — {shopName}</strong><button className="modal-close" onClick={() => setShowClose(false)}>✕</button></div>
            <div className="modal-body">
              <div style={{padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                <div style={{fontWeight:600,marginBottom:'8px',color:'var(--text-muted)',textTransform:'uppercase',fontSize:'.75rem'}}>System Calculation</div>
                {[
                  ['Opening Balance', today.opening_balance, null],
                  ['+ Cash Sales', today.cash_sales, 'green'],
                  ['+ Cash In (Manual)', today.manual_in, 'green'],
                  ['− Cash Expenses', today.expenses, 'red'],
                  ['− Supplier Payments', today.supplier_paid, 'red'],
                  ['− Cash Out (Manual)', today.manual_out, 'red'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                    <span>{label}:</span>
                    <strong style={{color:color==='green'?'var(--accent-green)':color==='red'?'var(--accent-red)':undefined}}>{fmt(val)}</strong>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:'8px',fontWeight:700}}>
                  <span>Expected Cash in Drawer:</span>
                  <strong style={{color:'var(--accent)',fontSize:'1.05rem'}}>{fmt(today.expected_cash)}</strong>
                </div>
              </div>
              <div className="form-group" style={{marginBottom:'12px'}}>
                <label className="form-label">Actual Cash Counted (AED)</label>
                <input type="number" className="form-control" value={closingBal} onChange={e => setClosingBal(e.target.value)} placeholder={Math.round(today.expected_cash||0).toString()} />
                {closingBal && (
                  <div style={{marginTop:'6px',fontSize:'.85rem',fontWeight:600,color:Math.abs(parseFloat(closingBal)-today.expected_cash)<1?'var(--accent-green)':'var(--accent-red)'}}>
                    {Math.abs(parseFloat(closingBal)-today.expected_cash)<1?'✅ Balanced!':'⚠️ Variance: '+((parseFloat(closingBal)-today.expected_cash)>0?'+':'')+fmt(parseFloat(closingBal)-today.expected_cash)}
                  </div>
                )}
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
      {showManual && (
        <div className="modal-overlay" onClick={() => setShowManual(false)}>
          <div className="modal" style={{maxWidth:'420px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><strong>💰 Manual Cash Entry</strong><button className="modal-close" onClick={() => setShowManual(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Type</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  {['in','out'].map(t => (
                    <button key={t} onClick={() => setManualForm({...manualForm, entry_type: t, category:''})}
                      style={{padding:'12px',border:`2px solid ${manualForm.entry_type===t?(t==='in'?'#059669':'#dc2626'):'#e2e8f0'}`,borderRadius:'8px',background:manualForm.entry_type===t?(t==='in'?'#f0fdf4':'#fff5f5'):'#fff',cursor:'pointer',fontWeight:700,color:manualForm.entry_type===t?(t==='in'?'#059669':'#dc2626'):'#64748b',fontSize:'14px'}}>
                      {t==='in'?'⬇️ Cash IN':'⬆️ Cash OUT'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Amount (AED) *</label>
                <input type="number" className="form-control" value={manualForm.amount} onChange={e => setManualForm({...manualForm, amount:e.target.value})} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={manualForm.category} onChange={e => setManualForm({...manualForm, category:e.target.value})}>
                  <option value="">— Select Category —</option>
                  {(manualForm.entry_type==='in'?INCOME_CATEGORIES:EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-control" placeholder="e.g. Room 2 rent from Ahmed — May" value={manualForm.description} onChange={e => setManualForm({...manualForm, description:e.target.value})} />
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
