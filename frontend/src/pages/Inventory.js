// src/pages/Inventory.js
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(Number(n || 0)).toLocaleString()}`;

// ── Adjust Stock Modal ───────────────────────────────────────────────────────
function AdjustModal({ item, onClose, onDone }) {
  const [type, setType]     = useState('in');
  const [qty, setQty]       = useState('');
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);

  if (!item) return null;

  const handleSubmit = async () => {
    if (!qty || isNaN(qty) || Number(qty) <= 0) return toast.error('Enter a valid quantity');
    setSaving(true);
    try {
      await api.post('/inventory/adjust', { product_id: item.product_id, type, quantity: Number(qty), note });
      toast.success('Stock updated!');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const typeConfig = {
    in:         { label: 'Stock In',  icon: '📥', desc: 'Add stock' },
    out:        { label: 'Stock Out', icon: '📤', desc: 'Remove stock' },
    adjustment: { label: 'Set Exact', icon: '🔧', desc: 'Set absolute count' },
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxWidth:'420px'}} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <strong>📦 Adjust Stock — {item.name}</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{textAlign:'center',padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px'}}>
            <div style={{fontSize:'2rem',fontWeight:700}}>{item.quantity}</div>
            <div style={{fontSize:'.8rem',color:'var(--text-muted)'}}>Current Stock</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'12px'}}>
            {Object.entries(typeConfig).map(([k, v]) => (
              <button key={k} onClick={() => setType(k)}
                style={{padding:'10px',borderRadius:'8px',border:`2px solid ${type===k?'var(--accent)':'var(--border)'}`,
                  background: type===k ? 'var(--bg-secondary)' : 'transparent',cursor:'pointer',textAlign:'center'}}>
                <div style={{fontSize:'1.2rem'}}>{v.icon}</div>
                <div style={{fontSize:'.75rem',fontWeight:600}}>{v.label}</div>
              </button>
            ))}
          </div>
          <div className="form-group" style={{marginBottom:'12px'}}>
            <label className="form-label">Quantity</label>
            <input type="number" min="0" className="form-control" value={qty}
              onChange={e => setQty(e.target.value)} placeholder="Enter quantity" />
          </div>
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Received from supplier" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Update Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Movements Modal ──────────────────────────────────────────────────────────
function MovementsModal({ productId, productName, onClose }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    api.get('/inventory/movements', { params: { product_id: productId, limit: 30 } })
      .then(r => setMovements(r.data.data))
      .catch(() => toast.error('Failed to load movements'))
      .finally(() => setLoading(false));
  }, [productId]);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxWidth:'500px'}} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <strong>📋 Stock History — {productName}</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{maxHeight:'60vh',overflowY:'auto'}}>
          {loading ? <div className="loading">Loading…</div>
          : movements.length === 0 ? <div className="empty-state">No movements yet</div>
          : movements.map(m => (
            <div key={m.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'10px 12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'8px'}}>
              <div>
                <span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'.75rem',fontWeight:600,
                  background: m.type==='in'?'#d1fae5': m.type==='out'?'#fee2e2':'#dbeafe',
                  color: m.type==='in'?'#065f46': m.type==='out'?'#dc2626':'#1e40af'}}>
                  {m.type.toUpperCase()}
                </span>
                {m.note && <div style={{fontSize:'.8rem',color:'var(--text-muted)',marginTop:'2px'}}>{m.note}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:700,color: m.type==='out'?'#dc2626':'#059669'}}>
                  {m.type==='out'?'-':'+'}{m.quantity}
                </div>
                <div style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{new Date(m.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Inventory() {
  const [inventory, setInventory]     = useState([]);
  const [stats, setStats]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | in_stock | low_stock | out_of_stock
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [adjustItem, setAdjustItem]   = useState(null);
  const [movementItem, setMovementItem] = useState(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterStatus !== 'all') params.status = filterStatus;
      if (dateFrom) params.from = dateFrom;
      if (dateTo)   params.to   = dateTo;

      const [invRes, statsRes] = await Promise.all([
        api.get('/inventory', { params }),
        api.get('/inventory/stats'),
      ]);
      setInventory(invRes.data.data || []);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load inventory');
    } finally { setLoading(false); }
  }, [search, filterStatus, dateFrom, dateTo]);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const stockStatus = (qty, min) => {
    if (qty === 0)  return { label: 'Out of Stock', color: '#dc2626', bg: '#fee2e2' };
    if (qty <= min) return { label: 'Low Stock',    color: '#d97706', bg: '#fef3c7' };
    return            { label: 'In Stock',          color: '#059669', bg: '#d1fae5' };
  };

  const clearFilters = () => { setSearch(''); setFilterStatus('all'); setDateFrom(''); setDateTo(''); };

  return (
    <div style={{padding:'24px',background:'#f8f9fc',minHeight:'100vh'}}>
      {adjustItem   && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onDone={fetchInventory} />}
      {movementItem && <MovementsModal productId={movementItem.product_id} productName={movementItem.name} onClose={() => setMovementItem(null)} />}

      {/* Header */}
      <div className="page-header" style={{background:'transparent',padding:'0 0 20px 0',border:'none'}}>
        <div>
          <div className="page-title">🏪 Inventory</div>
          <div className="page-subtitle">Track stock levels across all products</div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'12px',marginBottom:'20px'}}>
          {[
            { label: 'Total Products', value: stats.total_products,  icon: '📦' },
            { label: 'Total Units',    value: stats.total_units || 0, icon: '🔢' },
            { label: 'Out of Stock',   value: stats.out_of_stock,    icon: '❌' },
            { label: 'Low Stock',      value: stats.low_stock,       icon: '⚠️' },
            { label: 'Stock Value',    value: fmt(stats.total_cost_value),  icon: '💵' },
            { label: 'Retail Value',   value: fmt(stats.total_sell_value),  icon: '💰' },
          ].map(s => (
            <div key={s.label} style={{background:'#fff',borderRadius:'10px',padding:'16px',border:'1px solid #e8eaf0'}}>
              <div style={{fontSize:'1.5rem',marginBottom:'4px'}}>{s.icon}</div>
              <div style={{fontSize:'1.1rem',fontWeight:700,color:'#1a1a2e'}}>{s.value}</div>
              <div style={{fontSize:'.75rem',color:'#6b7280'}}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{background:'#fff',borderRadius:'10px',border:'1px solid #e8eaf0',padding:'16px',marginBottom:'16px'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:'12px',alignItems:'flex-end'}}>
          <div style={{flex:'1',minWidth:'200px'}}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search products..."
              className="form-control" />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-control">
              <option value="all">All Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
          <div>
            <label className="form-label">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="form-control" style={{width:'140px'}} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="form-control" style={{width:'140px'}} />
          </div>
          {(search || filterStatus !== 'all' || dateFrom || dateTo) && (
            <button onClick={clearFilters} className="btn btn-ghost btn-sm" style={{marginBottom:'2px'}}>Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{background:'#fff',borderRadius:'10px',border:'1px solid #e8eaf0',overflow:'hidden'}}>
        {loading ? (
          <div className="loading" style={{padding:'48px',textAlign:'center'}}>Loading inventory…</div>
        ) : inventory.length === 0 ? (
          <div className="empty-state" style={{padding:'48px',textAlign:'center'}}>No inventory records found</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.88rem'}}>
              <thead>
                <tr style={{background:'#f8f9fc',borderBottom:'2px solid #e8eaf0'}}>
                  {['Product','Brand','Color','IMEI / Serial','Category','In Stock','Min Stock','Status','Last Updated','Actions'].map(h => (
                    <th key={h} style={{padding:'10px 12px',textAlign:'left',fontSize:'.75rem',
                      color:'#6b7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'.03em',whiteSpace:'nowrap'}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inventory.map(item => {
                  const status = stockStatus(item.quantity, item.min_stock);
                  return (
                    <tr key={item.id} style={{borderBottom:'1px solid #f1f2f6'}}
                      onMouseEnter={e => e.currentTarget.style.background='#fafbff'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'10px 12px'}}>
                        <div style={{fontWeight:600,color:'#1a1a2e'}}>{item.name}</div>
                        {item.model && <div style={{fontSize:'.75rem',color:'#6b7280'}}>{item.model}</div>}
                      </td>
                      <td style={{padding:'10px 12px',color:'#4b5563'}}>{item.brand || '—'}</td>
                      <td style={{padding:'10px 12px'}}>
                        {item.color ? (
                          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                            <div style={{width:'12px',height:'12px',borderRadius:'50%',
                              background: item.color.toLowerCase(),border:'1px solid #e8eaf0'}}></div>
                            <span style={{color:'#4b5563'}}>{item.color}</span>
                          </div>
                        ) : <span style={{color:'#9ca3af'}}>—</span>}
                      </td>
                      <td style={{padding:'10px 12px',fontFamily:'monospace',fontSize:'.8rem',color:'#4b5563'}}>
                        {item.imei || '—'}
                      </td>
                      <td style={{padding:'10px 12px',color:'#6b7280'}}>{item.category || '—'}</td>
                      <td style={{padding:'10px 12px'}}>
                        <span style={{fontSize:'1.3rem',fontWeight:700,
                          color: item.quantity===0?'#dc2626': item.quantity<=item.min_stock?'#d97706':'#059669'}}>
                          {item.quantity}
                        </span>
                      </td>
                      <td style={{padding:'10px 12px',color:'#6b7280'}}>{item.min_stock}</td>
                      <td style={{padding:'10px 12px'}}>
                        <span style={{padding:'3px 10px',borderRadius:'12px',fontSize:'.75rem',
                          fontWeight:600,background:status.bg,color:status.color}}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{padding:'10px 12px',color:'#9ca3af',fontSize:'.8rem'}}>
                        {new Date(item.last_updated).toLocaleDateString('en-AE')}
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        <div style={{display:'flex',gap:'6px'}}>
                          <button onClick={() => setAdjustItem(item)}
                            style={{padding:'4px 10px',borderRadius:'6px',border:'none',
                              background:'#d1fae5',color:'#065f46',cursor:'pointer',fontSize:'.8rem',fontWeight:500}}>
                            ± Adjust
                          </button>
                          <button onClick={() => setMovementItem(item)}
                            style={{padding:'4px 10px',borderRadius:'6px',border:'none',
                              background:'#dbeafe',color:'#1e40af',cursor:'pointer',fontSize:'.8rem',fontWeight:500}}>
                            📋 History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{padding:'10px 16px',borderTop:'1px solid #f1f2f6',fontSize:'.8rem',color:'#9ca3af'}}>
              {inventory.length} product{inventory.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
