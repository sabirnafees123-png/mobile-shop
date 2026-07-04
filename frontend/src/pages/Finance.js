import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n||0)).toLocaleString()}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AE',{day:'numeric',month:'short',year:'numeric'}) : '—';

const TYPE_LABELS = { bank: '🏦 Bank Account', investor: '💼 Investor', card: '💳 Credit Card', fund: '🔄 Fund' };
const TYPE_COLORS = { bank: '#0369a1', investor: '#2563eb', card: '#7c3aed', fund: '#059669' };
const SUB_TYPES = {
  bank:     ['Current Account','Savings Account','Business Account'],
  investor: ['Business Investment','Short Term Loan'],
  card:     ['Credit Card','Debit Card'],
  fund:     ['Committee','Savings Box','Exchange Float','Other'],
};

const EMPTY_ACC  = { name:'', type:'bank', sub_type:'', opening_balance:'', notes:'', shop_id:'' };
const EMPTY_TXN  = { transaction_type:'out', amount:'', description:'', transaction_date: new Date().toISOString().split('T')[0], affects_cash: true };

export default function Finance() {
  const [shops, setShops]               = useState([]);
  const [shopId, setShopId]             = useState('');
  const [accounts, setAccounts]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showAccModal, setShowAccModal] = useState(false);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [accForm, setAccForm]           = useState(EMPTY_ACC);
  const [txnForm, setTxnForm]           = useState(EMPTY_TXN);
  const [saving, setSaving]             = useState(false);
  const [filterType, setFilterType]     = useState('all');

  useEffect(() => {
    api.get('/shops').then(r => {
      const s = r.data?.data || [];
      setShops(s);
      if (s.length) setShopId(String(s[0].id));
    });
  }, []);

  useEffect(() => { if (shopId) loadAccounts(); }, [shopId, filterType]);

  const loadAccounts = async () => {
    try {
      const params = `shop_id=${shopId}${filterType!=='all'?`&type=${filterType}`:''}`;
      const r = await api.get(`/finance/accounts?${params}`);
      setAccounts(r.data?.data || []);
    } catch { toast.error('Failed to load accounts'); }
  };

  const loadTransactions = async (acc) => {
    setSelected(acc);
    try {
      const r = await api.get(`/finance/accounts/${acc.id}/transactions`);
      setTransactions(r.data?.data || []);
    } catch { toast.error('Failed to load transactions'); }
  };

  const handleSaveAccount = async () => {
    if (!accForm.name)    return toast.error('Name required');
    if (!accForm.shop_id) return toast.error('Shop required');
    setSaving(true);
    try {
      await api.post('/finance/accounts', accForm);
      toast.success('Account created!');
      setShowAccModal(false);
      setAccForm(EMPTY_ACC);
      loadAccounts();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleSaveTxn = async () => {
    if (!txnForm.amount) return toast.error('Amount required');
    setSaving(true);
    try {
      await api.post(`/finance/accounts/${selected.id}/transactions`, { ...txnForm, shop_id: shopId });
      toast.success('Transaction recorded!');
      setShowTxnModal(false);
      setTxnForm(EMPTY_TXN);
      loadTransactions(selected);
      loadAccounts();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteTxn = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/finance/transactions/${id}`);
      toast.success('Deleted');
      loadTransactions(selected);
      loadAccounts();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const grouped = { bank: [], investor: [], card: [], fund: [] };
  accounts.forEach(a => { if (grouped[a.type]) grouped[a.type].push(a); });

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <h1 style={{fontSize:'1.5rem',fontWeight:700,margin:0}}>Finance</h1>
          <p style={{color:'var(--text-muted)',fontSize:'.88rem',margin:0}}>Investors · Credit Cards · Funds</p>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <select className="form-control" style={{width:'140px'}} value={shopId} onChange={e=>setShopId(e.target.value)}>
            {shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="form-control" style={{width:'130px'}} value={filterType} onChange={e=>setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="bank">🏦 Bank</option>
            <option value="investor">💼 Investors</option>
            <option value="card">💳 Cards</option>
            <option value="fund">🔄 Funds</option>
          </select>
          <button className="btn btn-primary" onClick={()=>{ setAccForm({...EMPTY_ACC, shop_id: shopId}); setShowAccModal(true); }}>+ Add Account</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns: selected ? '1fr 1fr' : '1fr',gap:'1.5rem'}}>
        {/* ── Accounts List ── */}
        <div>
          {Object.entries(grouped).map(([type, accs]) => (
            (filterType === 'all' || filterType === type) && accs.length > 0 && (
              <div key={type} style={{marginBottom:'1.5rem'}}>
                <div style={{fontSize:'.8rem',fontWeight:700,color:TYPE_COLORS[type],textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'8px',padding:'0 4px'}}>
                  {TYPE_LABELS[type]}
                </div>
                {accs.map(acc => (
                  <div key={acc.id}
                    onClick={() => loadTransactions(acc)}
                    style={{
                      padding:'14px 16px', borderRadius:'10px', marginBottom:'8px', cursor:'pointer',
                      background: selected?.id===acc.id ? 'var(--bg-secondary)' : 'var(--bg-card)',
                      border: `1.5px solid ${selected?.id===acc.id ? TYPE_COLORS[acc.type] : 'var(--border)'}`,
                      transition:'all .15s'
                    }}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:'.95rem'}}>{acc.name}</div>
                        {acc.sub_type && <div style={{fontSize:'.78rem',color:'var(--text-muted)',marginTop:'2px'}}>{acc.sub_type}</div>}
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontWeight:700,fontSize:'1rem',color: parseFloat(acc.balance||0) < 0 ? '#dc2626' : parseFloat(acc.balance||0) > 0 ? TYPE_COLORS[acc.type] : 'var(--text-muted)'}}>
                          {fmt(acc.balance)}
                        </div>
                        <div style={{fontSize:'.72rem',color:'var(--text-muted)'}}>balance</div>
                      </div>
                    </div>
                    {parseFloat(acc.opening_balance||0) > 0 && (
                      <div style={{marginTop:'6px',fontSize:'.75rem',color:'var(--text-muted)',borderTop:'1px solid var(--border)',paddingTop:'6px'}}>
                        Opening: {fmt(acc.opening_balance)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ))}
          {accounts.length === 0 && (
            <div style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
              <div style={{fontSize:'2rem',marginBottom:'8px'}}>💼</div>
              <div>No accounts yet — click "+ Add Account"</div>
            </div>
          )}
        </div>

        {/* ── Transactions Panel ── */}
        {selected && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <div>
                <strong style={{fontSize:'1rem'}}>{selected.name}</strong>
                <div style={{fontSize:'.78rem',color:'var(--text-muted)'}}>{selected.sub_type || TYPE_LABELS[selected.type]}</div>
              </div>
              <div style={{display:'flex',gap:'8px'}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>✕ Close</button>
                <button className="btn btn-primary btn-sm" onClick={()=>{ setTxnForm(EMPTY_TXN); setShowTxnModal(true); }}>+ Transaction</button>
              </div>
            </div>

            {/* Balance summary */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'16px'}}>
              {[
                ['Total IN',  transactions.filter(t=>t.transaction_type==='in').reduce((s,t)=>s+parseFloat(t.amount||0),0),  '#059669'],
                ['Total OUT', transactions.filter(t=>t.transaction_type==='out').reduce((s,t)=>s+parseFloat(t.amount||0),0), '#dc2626'],
                ['Balance',   parseFloat(selected.balance||0), TYPE_COLORS[selected.type]],
              ].map(([label, val, color]) => (
                <div key={label} style={{padding:'10px',background:'var(--bg-secondary)',borderRadius:'8px',textAlign:'center'}}>
                  <div style={{fontSize:'.72rem',color:'var(--text-muted)',marginBottom:'2px'}}>{label}</div>
                  <div style={{fontWeight:700,color,fontSize:'.9rem'}}>{fmt(val)}</div>
                </div>
              ))}
            </div>

            {/* Transaction list */}
            <div style={{maxHeight:'500px',overflowY:'auto'}}>
              {transactions.length === 0 ? (
                <div style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>No transactions yet</div>
              ) : transactions.map(t => (
                <div key={t.id} style={{
                  display:'flex',justifyContent:'space-between',alignItems:'center',
                  padding:'10px 12px',borderRadius:'8px',marginBottom:'6px',
                  background: t.transaction_type==='in' ? '#f0fdf4' : '#fff5f5',
                  border: `1px solid ${t.transaction_type==='in' ? '#bbf7d0' : '#fecaca'}`
                }}>
                  <div>
                    <div style={{fontWeight:600,fontSize:'.88rem',color: t.transaction_type==='in'?'#059669':'#dc2626'}}>
                      {t.transaction_type==='in'?'⬇ IN':'⬆ OUT'} — {fmt(t.amount)}
                    </div>
                    <div style={{fontSize:'.78rem',color:'var(--text-muted)',marginTop:'2px'}}>
                      {fmtDate(t.transaction_date)}{t.description ? ` — ${t.description}` : ''}
                    </div>
                    {!t.affects_cash && <div style={{fontSize:'.72rem',color:'#d97706',marginTop:'2px'}}>⚠️ Cash register not affected</div>}
                  </div>
                  <button onClick={()=>deleteTxn(t.id)} style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:'1rem',padding:'4px'}}>🗑️</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Add Account Modal ── */}
      {showAccModal && (
        <div className="modal-overlay" onClick={()=>setShowAccModal(false)}>
          <div className="modal" style={{maxWidth:'460px'}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <strong>+ New Account</strong>
              <button className="modal-close" onClick={()=>setShowAccModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Shop *</label>
                <select className="form-control" value={accForm.shop_id} onChange={e=>setAccForm({...accForm,shop_id:e.target.value})}>
                  <option value="">— Select —</option>
                  {shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type *</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
                  {Object.entries(TYPE_LABELS).map(([val,label])=>(
                    <button key={val} type="button"
                      onClick={()=>setAccForm({...accForm,type:val,sub_type:''})}
                      style={{padding:'10px',borderRadius:'8px',border:`2px solid ${accForm.type===val?TYPE_COLORS[val]:'var(--border)'}`,background:accForm.type===val?TYPE_COLORS[val]+'15':'transparent',cursor:'pointer',fontSize:'.82rem',fontWeight:600,color:accForm.type===val?TYPE_COLORS[val]:'var(--text-muted)'}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Sub Type</label>
                <select className="form-control" value={accForm.sub_type} onChange={e=>setAccForm({...accForm,sub_type:e.target.value})}>
                  <option value="">— Select —</option>
                  {(SUB_TYPES[accForm.type]||[]).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-control" value={accForm.name} onChange={e=>setAccForm({...accForm,name:e.target.value})} placeholder="e.g. Ahmad Investor, ENBD Card, Monthly Committee" />
              </div>
              <div className="form-group">
                <label className="form-label">Opening Balance (AED)</label>
                <input type="number" className="form-control" value={accForm.opening_balance} onChange={e=>setAccForm({...accForm,opening_balance:e.target.value})} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={accForm.notes} onChange={e=>setAccForm({...accForm,notes:e.target.value})} placeholder="e.g. 450K at 1.8% monthly" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setShowAccModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveAccount} disabled={saving}>{saving?'Saving...':'Create Account'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Transaction Modal ── */}
      {showTxnModal && selected && (
        <div className="modal-overlay" onClick={()=>setShowTxnModal(false)}>
          <div className="modal" style={{maxWidth:'420px'}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <strong>💰 New Transaction — {selected.name}</strong>
              <button className="modal-close" onClick={()=>setShowTxnModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Type *</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  {[['out','⬆ OUT (Cash Paid)','#dc2626'],['in','⬇ IN (Cash Received)','#059669']].map(([val,label,color])=>(
                    <button key={val} type="button"
                      onClick={()=>setTxnForm({...txnForm,transaction_type:val})}
                      style={{padding:'12px',borderRadius:'8px',border:`2px solid ${txnForm.transaction_type===val?color:'var(--border)'}`,background:txnForm.transaction_type===val?color+'15':'transparent',cursor:'pointer',fontWeight:700,color:txnForm.transaction_type===val?color:'var(--text-muted)',fontSize:'.85rem'}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input type="date" className="form-control" value={txnForm.transaction_date} onChange={e=>setTxnForm({...txnForm,transaction_date:e.target.value})} max={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (AED) *</label>
                <input type="number" className="form-control" value={txnForm.amount} onChange={e=>setTxnForm({...txnForm,amount:e.target.value})} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-control" value={txnForm.description} onChange={e=>setTxnForm({...txnForm,description:e.target.value})} placeholder="e.g. Monthly profit — June 2026" />
              </div>
              <div className="form-group">
                <label className="form-label" style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}>
                  <input type="checkbox" checked={txnForm.affects_cash} onChange={e=>setTxnForm({...txnForm,affects_cash:e.target.checked})} />
                  <span>Affects Cash Register (uncheck if non-cash transaction)</span>
                </label>
              </div>
              {txnForm.affects_cash && (
                <div style={{padding:'10px 12px',background:'#eff6ff',borderRadius:'8px',fontSize:'.82rem',color:'#1e40af'}}>
                  ℹ️ This will update today's cash register — make sure register is open.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setShowTxnModal(false)}>Cancel</button>
              <button className="btn btn-primary"
                style={{background:txnForm.transaction_type==='in'?'#059669':'#dc2626'}}
                onClick={handleSaveTxn} disabled={saving}>
                {saving?'Saving...':'Record Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
