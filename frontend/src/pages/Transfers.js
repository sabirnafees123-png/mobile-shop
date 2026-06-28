// src/pages/Transfers.js
import React, { useEffect, useState, useRef } from 'react';
import { TableSkeleton, EmptyTransfers } from '../components/UI';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AE') : '—';

const EMPTY = {
  from_shop_id: '', to_shop_id: '', product_id: '',
  serial_number: '',
  quantity: '', transfer_date: new Date().toISOString().split('T')[0], notes: ''
};

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [shops, setShops]         = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);

  // Product search state
  const [searchMode, setSearchMode]   = useState('name'); // 'name' | 'imei'
  const [imeiSearch, setImeiSearch]   = useState('');
  const [imeiLoading, setImeiLoading] = useState(false);
  const imeiTimer = useRef(null);
  const [productResults, setProductResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchLoading, setSearchLoading]   = useState(false);
  const searchTimer = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        api.get('/shops/transfers'),
        api.get('/shops'),
      ]);
      setTransfers(tRes.data?.data || []);
      setShops(sRes.data?.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Reset product search when from_shop changes
  useEffect(() => {
    setInventory([]);
    setProductSearch('');
    setProductResults([]);
    setSelectedProduct(null);
    setImeiSearch('');
    setForm(f => ({ ...f, product_id: '', serial_number: '' }));
    if (!form.from_shop_id) return;
    // Pre-load all inventory for summary
    api.get(`/shops/${form.from_shop_id}/inventory`)
      .then(r => setInventory(r.data?.data || []))
      .catch(() => setInventory([]));
  }, [form.from_shop_id]); // intentionally omitting other deps — only re-run when source shop changes

  // Live search as user types
  const handleProductSearch = (val) => {
    setProductSearch(val);
    setSelectedProduct(null);
    setForm(f => ({ ...f, product_id: '' }));
    clearTimeout(searchTimer.current);
    if (!form.from_shop_id) return;
    if (!val.trim()) { setProductResults(inventory); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await api.get(`/shops/${form.from_shop_id}/inventory?search=${encodeURIComponent(val)}`);
        setProductResults(r.data?.data || []);
      } catch { setProductResults([]); }
      finally { setSearchLoading(false); }
    }, 250);
  };

  const handleImeiSearch = (val) => {
    setImeiSearch(val);
    setSelectedProduct(null);
    setForm(f => ({ ...f, product_id: '', serial_number: '' }));
    clearTimeout(imeiTimer.current);
    if (!form.from_shop_id || val.length < 3) return;
    imeiTimer.current = setTimeout(async () => {
      setImeiLoading(true);
      try {
        const r = await api.get(`/shops/${form.from_shop_id}/inventory?search=${encodeURIComponent(val)}`);
        const results = (r.data?.data || []).filter(i =>
          i.serial_number && i.serial_number.toLowerCase().includes(val.toLowerCase())
        );
        if (results.length === 1) {
          // Auto-select if exact match
          pickProduct(results[0]);
        } else {
          setProductResults(results);
        }
      } catch { setProductResults([]); }
      finally { setImeiLoading(false); }
    }, 300);
  };

  const pickProduct = (item) => {
    setSelectedProduct(item);
    setForm(f => ({ ...f, product_id: item.product_id, serial_number: item.serial_number || '' }));
    setProductSearch(`${item.brand ? item.brand + ' ' : ''}${item.name}${item.color ? ' ' + item.color : ''}`);
    setImeiSearch(item.serial_number || '');
    setProductResults([]);
  };

  const handleSubmit = async () => {
    if (!form.from_shop_id || !form.to_shop_id || !form.product_id || !form.quantity)
      return toast.error('All fields required');
    if (form.from_shop_id === form.to_shop_id)
      return toast.error('Cannot transfer to same shop');
    setSaving(true);
    try {
      await api.post('/shops/transfers', { ...form, quantity: parseInt(form.quantity) });
      toast.success('Transfer completed!');
      setShowModal(false);
      setForm(EMPTY);
      setProductSearch('');
      setSelectedProduct(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🔄 Internal Transfers</div>
          <div className="page-subtitle">Move stock between AlAman and Blessing</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setProductSearch(''); setSelectedProduct(null); setImeiSearch(''); setSearchMode('name'); setProductResults([]); setShowModal(true); }}>
          + New Transfer
        </button>
      </div>

      {/* Shop inventory overview */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'1.5rem'}}>
        {shops.map(shop => (
          <div key={shop.id} className="card" style={{padding:'1rem'}}>
            <div style={{fontWeight:700,fontSize:'1rem',marginBottom:'8px'}}>{shop.name}</div>
            <ShopInventorySummary shopId={shop.id} />
          </div>
        ))}
      </div>

      {/* Transfers table */}
      <div className="card">
        {loading ? <TableSkeleton rows={6} cols={6} /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Product</th><th>From</th><th>To</th><th>Qty</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr><td colSpan={6}><EmptyTransfers onNew={() => { setForm(EMPTY); setShowModal(true); }} /></td></tr>
                ) : transfers.map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.transfer_date)}</td>
                    <td><strong>{t.brand} {t.product_name}</strong></td>
                    <td><span className="badge badge-red">{t.from_shop_name}</span></td>
                    <td><span className="badge badge-green">{t.to_shop_name}</span></td>
                    <td><strong>{t.quantity}</strong></td>
                    <td style={{color:'var(--text-muted)',fontSize:'.85rem'}}>{t.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{maxWidth:'520px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔄 New Internal Transfer</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">From Shop *</label>
                  <select className="form-control" value={form.from_shop_id}
                    onChange={e => setForm({...form, from_shop_id: e.target.value, product_id: ''})}>
                    <option value="">Select shop...</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">To Shop *</label>
                  <select className="form-control" value={form.to_shop_id}
                    onChange={e => setForm({...form, to_shop_id: e.target.value})}>
                    <option value="">Select shop...</option>
                    {shops.filter(s => s.id !== parseInt(form.from_shop_id)).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Search mode toggle */}
                <div style={{gridColumn:'span 2',display:'flex',gap:'8px',marginBottom:'-8px'}}>
                  <button onClick={() => { setSearchMode('name'); setImeiSearch(''); setProductResults([]); }}
                    style={{ padding:'5px 14px', borderRadius:'99px', border:'1.5px solid', fontSize:'.8rem', cursor:'pointer',
                      background: searchMode==='name' ? 'var(--accent-blue,#2563eb)' : 'transparent',
                      color: searchMode==='name' ? '#fff' : 'var(--text-muted)',
                      borderColor: searchMode==='name' ? 'var(--accent-blue,#2563eb)' : 'var(--border)' }}>
                    🔤 Search by Name
                  </button>
                  <button onClick={() => { setSearchMode('imei'); setProductSearch(''); setProductResults([]); }}
                    style={{ padding:'5px 14px', borderRadius:'99px', border:'1.5px solid', fontSize:'.8rem', cursor:'pointer',
                      background: searchMode==='imei' ? 'var(--accent-blue,#2563eb)' : 'transparent',
                      color: searchMode==='imei' ? '#fff' : 'var(--text-muted)',
                      borderColor: searchMode==='imei' ? 'var(--accent-blue,#2563eb)' : 'var(--border)' }}>
                    📱 Search by IMEI
                  </button>
                </div>

                {/* Product search by name */}
                {searchMode === 'name' && (
                <div className="form-group" style={{gridColumn:'span 2',position:'relative'}}>
                  <label className="form-label">Product * {searchLoading && <span style={{fontSize:'.75rem',color:'var(--text-muted)'}}>searching...</span>}</label>
                  <input
                    className="form-control"
                    placeholder={form.from_shop_id ? 'Type brand, name, color...' : 'Select source shop first'}
                    disabled={!form.from_shop_id}
                    value={productSearch}
                    onChange={e => handleProductSearch(e.target.value)}
                    onFocus={() => { if (form.from_shop_id && !productSearch) setProductResults(inventory); }}
                    autoComplete="off"
                  />
                  {productResults.length > 0 && (
                    <div style={{position:'absolute',zIndex:1000,top:'100%',left:0,right:0,background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'8px',boxShadow:'0 8px 24px rgba(0,0,0,.15)',maxHeight:'220px',overflowY:'auto',marginTop:'2px'}}>
                      {productResults.map(item => (
                        <div key={item.product_id} onClick={() => pickProduct(item)}
                          style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                          onMouseOver={e => e.currentTarget.style.background='var(--bg-secondary)'}
                          onMouseOut={e => e.currentTarget.style.background=''}>
                          <div>
                            <strong style={{fontSize:'.9rem'}}>{item.brand} {item.name}</strong>
                            {item.color && <span style={{color:'var(--text-muted)',marginLeft:'6px',fontSize:'.8rem'}}>{item.color}</span>}
                            {item.serial_number && <span style={{color:'var(--text-muted)',marginLeft:'6px',fontSize:'.75rem',fontFamily:'monospace'}}>#{item.serial_number}</span>}
                          </div>
                          <span style={{fontWeight:700,fontSize:'.85rem',color:item.quantity===0?'#dc2626':item.quantity<=item.min_stock?'#d97706':'#059669'}}>{item.quantity} in stock</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {form.from_shop_id && productSearch && productResults.length===0 && !searchLoading && !selectedProduct && (
                    <div style={{fontSize:'.78rem',color:'#dc2626',marginTop:'4px'}}>No matching products found</div>
                  )}
                </div>
                )}

                {/* IMEI search */}
                {searchMode === 'imei' && (
                <div className="form-group" style={{gridColumn:'span 2',position:'relative'}}>
                  <label className="form-label">IMEI / Serial Number * {imeiLoading && <span style={{fontSize:'.75rem',color:'var(--text-muted)'}}>searching...</span>}</label>
                  <input
                    className="form-control"
                    placeholder={form.from_shop_id ? 'Scan or type IMEI number...' : 'Select source shop first'}
                    disabled={!form.from_shop_id}
                    value={imeiSearch}
                    onChange={e => handleImeiSearch(e.target.value)}
                    autoComplete="off"
                    style={{fontFamily:'monospace'}}
                  />
                  {productResults.length > 0 && (
                    <div style={{position:'absolute',zIndex:1000,top:'100%',left:0,right:0,background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'8px',boxShadow:'0 8px 24px rgba(0,0,0,.15)',maxHeight:'220px',overflowY:'auto',marginTop:'2px'}}>
                      {productResults.map(item => (
                        <div key={item.product_id} onClick={() => pickProduct(item)}
                          style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                          onMouseOver={e => e.currentTarget.style.background='var(--bg-secondary)'}
                          onMouseOut={e => e.currentTarget.style.background=''}>
                          <div>
                            <span style={{fontFamily:'monospace',fontSize:'.88rem',fontWeight:600,color:'var(--accent-blue,#2563eb)'}}>{item.serial_number}</span>
                            <span style={{marginLeft:'10px',fontSize:'.88rem'}}>{item.brand} {item.name}</span>
                            {item.color && <span style={{color:'var(--text-muted)',marginLeft:'6px',fontSize:'.8rem'}}>{item.color}</span>}
                          </div>
                          <span style={{fontWeight:700,fontSize:'.85rem',color:item.quantity===0?'#dc2626':'#059669'}}>{item.quantity} in stock</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {form.from_shop_id && imeiSearch.length>=3 && productResults.length===0 && !imeiLoading && !selectedProduct && (
                    <div style={{fontSize:'.78rem',color:'#dc2626',marginTop:'4px'}}>No product found with this IMEI in selected shop</div>
                  )}
                </div>
                )}

                {selectedProduct && (
                  <div style={{gridColumn:'span 2',padding:'10px 14px',background:'var(--bg-secondary)',borderRadius:'8px',fontSize:'.85rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>✅ {selectedProduct.brand} {selectedProduct.name} {selectedProduct.color && `— ${selectedProduct.color}`}</span>
                    <strong style={{color: selectedProduct.quantity === 0 ? '#dc2626' : '#059669'}}>
                      {selectedProduct.quantity} available in {shops.find(s=>s.id===parseInt(form.from_shop_id))?.name}
                    </strong>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Quantity *</label>
                  <input type="number" min="1" className="form-control" value={form.quantity}
                    onChange={e => setForm({...form, quantity: e.target.value})} placeholder="0"
                    max={selectedProduct?.quantity || 999} />
                </div>
                <div className="form-group">
                  <label className="form-label">Transfer Date</label>
                  <input type="date" className="form-control" value={form.transfer_date}
                    onChange={e => setForm({...form, transfer_date: e.target.value})} />
                </div>
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={form.notes}
                    onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Processing...' : 'Transfer Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Mini inventory summary per shop
function ShopInventorySummary({ shopId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/shops/${shopId}/inventory`)
      .then(r => setData(r.data?.data || []))
      .catch(() => setData([]));
  }, [shopId]);

  if (!data) return <div style={{color:'var(--text-muted)',fontSize:'.85rem'}}>Loading...</div>;
  const total = data.reduce((s, i) => s + i.quantity, 0);
  const low   = data.filter(i => i.quantity <= i.min_stock && i.quantity > 0).length;
  const out   = data.filter(i => i.quantity === 0).length;

  return (
    <div style={{display:'flex',gap:'16px',fontSize:'.85rem'}}>
      <div><strong>{data.length}</strong> <span style={{color:'var(--text-muted)'}}>products</span></div>
      <div><strong>{total}</strong> <span style={{color:'var(--text-muted)'}}>units</span></div>
      {low > 0 && <div style={{color:'#d97706'}}><strong>{low}</strong> low stock</div>}
      {out > 0 && <div style={{color:'#dc2626'}}><strong>{out}</strong> out of stock</div>}
    </div>
  );
}
