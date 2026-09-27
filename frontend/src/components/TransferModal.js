// src/components/TransferModal.js
// Reusable "New Internal Transfer" modal — used by both the Transfers page
// and the Inventory page's per-item ⋮ menu. Same fields, same /shops/transfers
// API call, no backend changes.
import React, { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY = {
  from_shop_id: '', to_shop_id: '', product_id: '',
  serial_number: '',
  quantity: '', transfer_date: new Date().toISOString().split('T')[0], notes: ''
};

// initialItem (optional): an inventory row like { product_id, shop_id, serial_number,
// brand, name, color, quantity, min_stock } — pre-fills From Shop + the product.
export default function TransferModal({ initialItem, onClose, onDone }) {
  const [shops, setShops]         = useState([]);
  const [inventory, setInventory] = useState([]);
  const [form, setForm]           = useState(() => initialItem ? {
    ...EMPTY,
    from_shop_id: String(initialItem.shop_id || ''),
    product_id: initialItem.product_id,
    serial_number: initialItem.serial_number || '',
  } : EMPTY);
  const [saving, setSaving] = useState(false);

  const [productSearch, setProductSearch] = useState(() => initialItem
    ? `${initialItem.brand ? initialItem.brand + ' ' : ''}${initialItem.name}${initialItem.color ? ' ' + initialItem.color : ''}`
    : '');
  const [searchMode, setSearchMode]   = useState('name'); // 'name' | 'imei'
  const [imeiSearch, setImeiSearch]   = useState(initialItem?.serial_number || '');
  const [imeiLoading, setImeiLoading] = useState(false);
  const imeiTimer = useRef(null);
  const [productResults, setProductResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(initialItem || null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || [])).catch(() => setShops([]));
  }, []);

  // Reset product search when from_shop changes — but skip the very first
  // run when we're pre-filled from an Inventory row, so we don't wipe it.
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; }
    else {
      setInventory([]);
      setProductSearch('');
      setProductResults([]);
      setSelectedProduct(null);
      setImeiSearch('');
      setForm(f => ({ ...f, product_id: '', serial_number: '' }));
    }
    if (!form.from_shop_id) return;
    api.get(`/shops/${form.from_shop_id}/inventory`)
      .then(r => setInventory(r.data?.data || []))
      .catch(() => setInventory([]));
  }, [form.from_shop_id]);

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
    const searchVal = String(val || '');
    if (!form.from_shop_id || searchVal.length < 3) return;
    imeiTimer.current = setTimeout(async () => {
      setImeiLoading(true);
      try {
        const r = await api.get(`/shops/${form.from_shop_id}/inventory?search=${encodeURIComponent(searchVal)}`);
        const results = (r.data?.data || []).filter(i =>
          i.serial_number && String(i.serial_number).toLowerCase().includes(searchVal.toLowerCase())
        );
        if (results.length === 1) pickProduct(results[0]);
        else setProductResults(results);
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
      onDone && onDone();
      onClose();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:'520px'}} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <strong>🔄 New Internal Transfer</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
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
              <button type="button" onClick={() => { setSearchMode('name'); setImeiSearch(''); setProductResults([]); }}
                style={{ padding:'5px 14px', borderRadius:'99px', border:'1.5px solid', fontSize:'.8rem', cursor:'pointer',
                  background: searchMode==='name' ? 'var(--accent-blue,#2563eb)' : 'transparent',
                  color: searchMode==='name' ? '#fff' : 'var(--text-muted)',
                  borderColor: searchMode==='name' ? 'var(--accent-blue,#2563eb)' : 'var(--border)' }}>
                🔤 Search by Name
              </button>
              <button type="button" onClick={() => { setSearchMode('imei'); setProductSearch(''); setProductResults([]); }}
                style={{ padding:'5px 14px', borderRadius:'99px', border:'1.5px solid', fontSize:'.8rem', cursor:'pointer',
                  background: searchMode==='imei' ? 'var(--accent-blue,#2563eb)' : 'transparent',
                  color: searchMode==='imei' ? '#fff' : 'var(--text-muted)',
                  borderColor: searchMode==='imei' ? 'var(--accent-blue,#2563eb)' : 'var(--border)' }}>
                📱 Search by IMEI
              </button>
            </div>

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
              <div style={{gridColumn:'span 2',padding:'12px 16px',background:'var(--bg-secondary)',borderRadius:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:'.95rem'}}>✅ <strong>{selectedProduct.brand} {selectedProduct.name}</strong> {selectedProduct.color && `— ${selectedProduct.color}`}</div>
                  {selectedProduct.serial_number && (
                    <div style={{marginTop:'6px', marginLeft:'24px', fontFamily:'monospace', fontSize:'.95rem', fontWeight: 600, color:'var(--accent-blue,#2563eb)'}}>
                      📱 IMEI: {selectedProduct.serial_number}
                    </div>
                  )}
                </div>
                <div style={{textAlign: 'right'}}>
                  <div style={{fontWeight: 700, fontSize: '.9rem', color: selectedProduct.quantity === 0 ? '#dc2626' : '#059669'}}>
                    {selectedProduct.quantity} available
                  </div>
                  <div style={{fontSize: '.8rem', color: 'var(--text-muted)'}}>
                    in {shops.find(s=>s.id===parseInt(form.from_shop_id))?.name}
                  </div>
                </div>
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
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Processing...' : 'Transfer Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}
