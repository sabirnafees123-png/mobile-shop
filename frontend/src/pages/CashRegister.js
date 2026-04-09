// src/pages/CashRegister.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

export default function CashRegister() {
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

  // Load shops first
  useEffect(() => {
    api.get('/shops').then(r => {
      const list = r.data?.data || [];
      setShops(list);
      if (list.length === 1) setShopId(list[0].id.toString());
    });
  }, []);

  const load = async (sid) => {
    if (!sid) return;
    setLoading(true);
    setData(null);
    try {
      const [today, hist] = await Promise.all([
        api.get(`/cash-register/today?shop_id=${sid}`),
        api.get(`/cash-register/history?shop_id=${sid}`),
      ]);
      setData(today.data?.data);
      setHistory(hist.data?.data || []);
    } catch {
      toast.error('Failed to load cash register');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (shopId) load(shopId); }, [shopId]);

  const handleOpen = async () => {
    setSaving(true);
    try {
      await api.post('/cash-register/open', {
        opening_balance: parseFloat(openingBal) || 0,
        notes,
        shop_id: shopId,
      });
      toast.success('Register opened!');
      setShowOpen(false);
      setOpeningBal('');
      setNotes('');
      load(shopId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const handleClose = async () => {
    setSaving(true);
    try {
      const res = await api.post('/cash-register/close', {
        closing_balance: parseFloat(closingBal) || 0,
        notes,
        shop_id: shopId,
      });
      // Show variance result
      if (res.data?.summary) setVariance(res.data.summary);
      toast.success('Register closed!');
      setShowClose(false);
      setClosingBal('');
      setNotes('');
      load(shopId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const today    = data?.today    || {};
  const register = data?.register;
  const isOpen   = register?.status === 'open';
  const isClosed = register?.status === 'closed';
  const shopName = shops.find(s => s.id.toString() === shopId.toString())?.name || '';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">💵 Cash Register</div>
          <div className="page-subtitle">
            {new Date().toLocaleDateString('en-AE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {/* Shop selector — required */}
          <select
            className="form-control" style={{width:'auto'}}
            value={shopId} onChange={e => { setShopId(e.target.value); setVariance(null); }}
          >
            <option value="">— Select Shop —</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {shopId && !register && (
            <button className="btn btn-primary" onClick={() => setShowOpen(true)}>
              🔓 Open Register
            </button>
          )}
          {shopId && isOpen && (
            <button className="btn btn-primary" style={{background:'var(--accent-red)'}} onClick={() => setShowClose(true)}>
              🔒 Close Register
            </button>
          )}
          {shopId && isClosed && (
            <span className="badge badge-gray" style={{padding:'8px 16px',fontSize:'.9rem'}}>
              🔒 Closed
            </span>
          )}
        </div>
      </div>

      {/* No shop selected */}
      {!shopId && (
        <div style={{padding:'48px',textAlign:'center',color:'var(--text-muted)'}}>
          ← Select a shop to view its cash register
        </div>
      )}

      {shopId && loading && <div className="loading" style={{padding:'48px',textAlign:'center'}}>Loading...</div>}

      {shopId && !loading && data && (
        <>
          {/* Register Status Banner */}
          {register && (
            <div style={{
              padding:'12px 16px', borderRadius:'8px', marginBottom:'20px', fontSize:'.9rem',
              background: isOpen ? '#d1fae5' : '#f1f2f6',
              color: isOpen ? '#065f46' : '#6b7280',
              border: `1px solid ${isOpen ? '#a7f3d0' : '#e8eaf0'}`
            }}>
              {isOpen
                ? `✅ ${shopName} register opened — Opening balance: ${fmt(register.opening_balance)}`
                : `🔒 ${shopName} register closed — Closing balance: ${fmt(register.closing_balance)}`}
              {register.notes && <span style={{marginLeft:'12px',opacity:.7}}>· {register.notes}</span>}
            </div>
          )}

          {/* Variance result after closing */}
          {variance && (
            <div style={{
              padding:'16px', borderRadius:'8px', marginBottom:'20px',
              background: Math.abs(variance.variance) < 1 ? '#d1fae5' : '#fef3c7',
              border: `1px solid ${Math.abs(variance.variance) < 1 ? '#a7f3d0' : '#fde68a'}`
            }}>
              <div style={{fontWeight:700,marginBottom:'8px'}}>
                {Math.abs(variance.variance) < 1 ? '✅ Register Balanced!' : '⚠️ Variance Detected'}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',fontSize:'.9rem'}}>
                <div>Expected Cash: <strong>{fmt(variance.expected_cash)}</strong></div>
                <div>Actual Closing: <strong>{fmt(variance.actual_closing)}</strong></div>
                <div style={{color: Math.abs(variance.variance) < 1 ? '#065f46' : '#92400e'}}>
                  Variance: <strong>{variance.variance > 0 ? '+' : ''}{fmt(variance.variance)}</strong>
                </div>
              </div>
            </div>
          )}

          {/* ── Cash Flow Breakdown ── */}
          <div style={{marginBottom:'8px',fontWeight:600,fontSize:'.8rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
            Today's Cash Flow — {shopName}
          </div>

          {/* Visual breakdown card */}
          <div className="card" style={{padding:'20px',marginBottom:'20px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr auto 1fr auto 1fr auto 1fr',alignItems:'center',gap:'8px',fontSize:'.9rem'}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'1.4rem',fontWeight:700,color:'var(--accent-green)'}}>{fmt(today.opening_balance)}</div>
                <div style={{color:'var(--text-muted)',fontSize:'.8rem'}}>Opening</div>
              </div>
              <div style={{fontSize:'1.4rem',color:'var(--accent-green)',fontWeight:700}}>+</div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'1.4rem',fontWeight:700,color:'var(--accent-green)'}}>{fmt(today.cash_sales)}</div>
                <div style={{color:'var(--text-muted)',fontSize:'.8rem'}}>Cash Sales</div>
              </div>
              <div style={{fontSize:'1.4rem',color:'var(--accent-red)',fontWeight:700}}>−</div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'1.4rem',fontWeight:700,color:'var(--accent-red)'}}>{fmt(today.expenses)}</div>
                <div style={{color:'var(--text-muted)',fontSize:'.8rem'}}>Expenses</div>
              </div>
              <div style={{fontSize:'1.4rem',color:'var(--accent-red)',fontWeight:700}}>−</div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'1.4rem',fontWeight:700,color:'var(--accent-red)'}}>{fmt(today.supplier_paid)}</div>
                <div style={{color:'var(--text-muted)',fontSize:'.8rem'}}>Supplier Paid</div>
              </div>
              <div style={{fontSize:'1.4rem',color:'var(--text-muted)',fontWeight:700}}>=</div>
              <div style={{textAlign:'center',background:'var(--bg-secondary)',borderRadius:'8px',padding:'8px'}}>
                <div style={{fontSize:'1.4rem',fontWeight:700,color:'var(--accent)'}}>{fmt(today.expected_cash)}</div>
                <div style={{color:'var(--text-muted)',fontSize:'.8rem'}}>Expected Cash</div>
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="stat-grid" style={{marginBottom:'24px'}}>
            <div className="stat-card blue">
              <div className="label">Yesterday Closing</div>
              <div className="value">{fmt(data?.yesterday_closing)}</div>
              <div className="sub">Carried forward</div>
            </div>
            <div className="stat-card green">
              <div className="label">Cash Sales</div>
              <div className="value">{fmt(today.cash_sales)}</div>
              <div className="sub">{today.invoice_count} invoices</div>
            </div>
            <div className="stat-card blue">
              <div className="label">Bank / Card Sales</div>
              <div className="value">{fmt((today.bank_sales||0) + (today.card_sales||0))}</div>
              <div className="sub">Non-cash</div>
            </div>
            <div className="stat-card yellow">
              <div className="label">Total Sales</div>
              <div className="value">{fmt(today.total_sales)}</div>
              <div className="sub">All methods</div>
            </div>
            <div className="stat-card red">
              <div className="label">Cash Expenses</div>
              <div className="value">{fmt(today.expenses)}</div>
              <div className="sub">Paid in cash today</div>
            </div>
            <div className="stat-card red">
              <div className="label">Supplier Payments</div>
              <div className="value">{fmt(today.supplier_paid)}</div>
              <div className="sub">Cash paid to suppliers</div>
            </div>
          </div>

          {/* Cheques */}
          <div style={{marginBottom:'8px',fontWeight:600,fontSize:'.8rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
            Pending Cheques — {shopName}
          </div>
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
          <div style={{marginBottom:'8px',fontWeight:600,fontSize:'.8rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
            Register History — {shopName}
          </div>
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Opening</th><th>Cash Sales</th>
                    <th>Expenses</th><th>Closing</th><th>Variance</th><th>Status</th>
                  </tr>
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
                        <td style={{color: vari === null ? 'var(--text-muted)' : Math.abs(vari) < 1 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight:600}}>
                          {vari === null ? '—' : `${vari > 0 ? '+' : ''}${fmt(vari)}`}
                        </td>
                        <td>
                          <span className={`badge ${h.status==='open'?'badge-green':'badge-gray'}`}>
                            {h.status}
                          </span>
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

      {/* ── Open Register Modal ── */}
      {showOpen && (
        <div className="modal-overlay" onClick={() => setShowOpen(false)}>
          <div className="modal" style={{maxWidth:'400px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔓 Open Register — {shopName}</strong>
              <button className="modal-close" onClick={() => setShowOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                Yesterday's closing: <strong>{fmt(data?.yesterday_closing)}</strong>
                <div style={{fontSize:'.8rem',color:'var(--text-muted)',marginTop:'4px'}}>
                  This is the suggested opening balance. Enter actual cash counted in drawer.
                </div>
              </div>
              <div className="form-group" style={{marginBottom:'12px'}}>
                <label className="form-label">Opening Balance (AED) — Physical cash in drawer</label>
                <input type="number" className="form-control" value={openingBal}
                  onChange={e => setOpeningBal(e.target.value)}
                  placeholder={Math.round(data?.yesterday_closing || 0).toString()} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={notes}
                  onChange={e => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleOpen} disabled={saving}>
                {saving ? 'Opening...' : 'Open Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Register Modal ── */}
      {showClose && (
        <div className="modal-overlay" onClick={() => setShowClose(false)}>
          <div className="modal" style={{maxWidth:'440px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔒 Close Register — {shopName}</strong>
              <button className="modal-close" onClick={() => setShowClose(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* System calculated breakdown */}
              <div style={{padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                <div style={{fontWeight:600,marginBottom:'8px',color:'var(--text-muted)',textTransform:'uppercase',fontSize:'.75rem'}}>
                  System Calculation
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                  <span>Opening Balance:</span><strong>{fmt(today.opening_balance)}</strong>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                  <span>+ Cash Sales:</span><strong style={{color:'var(--accent-green)'}}>{fmt(today.cash_sales)}</strong>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                  <span>− Cash Expenses:</span><strong style={{color:'var(--accent-red)'}}>{fmt(today.expenses)}</strong>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                  <span>− Supplier Payments:</span><strong style={{color:'var(--accent-red)'}}>{fmt(today.supplier_paid)}</strong>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:'8px',fontWeight:700}}>
                  <span>Expected Cash in Drawer:</span>
                  <strong style={{color:'var(--accent)',fontSize:'1.05rem'}}>{fmt(today.expected_cash)}</strong>
                </div>
              </div>

              <div className="form-group" style={{marginBottom:'12px'}}>
                <label className="form-label">Actual Cash Counted in Drawer (AED)</label>
                <input type="number" className="form-control" value={closingBal}
                  onChange={e => setClosingBal(e.target.value)}
                  placeholder={Math.round(today.expected_cash || 0).toString()} />
                {closingBal && (
                  <div style={{
                    marginTop:'6px', fontSize:'.85rem', fontWeight:600,
                    color: Math.abs(parseFloat(closingBal) - today.expected_cash) < 1 ? 'var(--accent-green)' : 'var(--accent-red)'
                  }}>
                    {Math.abs(parseFloat(closingBal) - today.expected_cash) < 1
                      ? '✅ Matches! Register balanced.'
                      : `⚠️ Variance: ${parseFloat(closingBal) - today.expected_cash > 0 ? '+' : ''}${fmt(parseFloat(closingBal) - today.expected_cash)}`}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={notes}
                  onChange={e => setNotes(e.target.value)} placeholder="Optional — explain any variance" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowClose(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:'var(--accent-red)'}} onClick={handleClose} disabled={saving}>
                {saving ? 'Closing...' : 'Close Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
