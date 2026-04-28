// src/pages/Transfers.js
import React, { useEffect, useState } from 'react';
import { TableSkeleton, EmptyTransfers } from '../components/UI';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AE') : '—';

const EMPTY = {
  from_shop_id: '', to_shop_id: '', product_id: '',
  quantity: '', transfer_date: new Date().toISOString().split('T')[0], notes: ''
};

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [shops, setShops]         = useState([]);
  const [products, setProducts]   = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, sRes, pRes] = await Promise.all([
        api.get('/shops/transfers'),
        api.get('/shops'),
        api.get('/products'),
      ]);
      setTransfers(tRes.data?.data || []);
      setShops(sRes.data?.data || []);
      setProducts(pRes.data?.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Load inventory when from_shop changes
  useEffect(() => {
    if (!form.from_shop_id) { setInventory([]); return; }
    api.get(`/shops/${form.from_shop_id}/inventory`)
      .then(r => setInventory(r.data?.data || []))
      .catch(() => setInventory([]));
  }, [form.from_shop_id]);

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
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const selectedProduct = inventory.find(i => i.product_id === form.product_id);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🔄 Internal Transfers</div>
          <div className="page-subtitle">Move stock between AlAman and Blessing</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setShowModal(true); }}>
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
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label className="form-label">Product *</label>
                  <select className="form-control" value={form.product_id}
                    onChange={e => setForm({...form, product_id: e.target.value})}>
                    <option value="">Select product...</option>
                    {inventory.map(i => (
                      <option key={i.product_id} value={i.product_id}>
                        {i.brand} {i.name} — Stock: {i.quantity}
                      </option>
                    ))}
                  </select>
                  {!form.from_shop_id && <div style={{fontSize:'.78rem',color:'var(--text-muted)',marginTop:'4px'}}>Select source shop first</div>}
                </div>
                {selectedProduct && (
                  <div style={{gridColumn:'span 2',padding:'10px 14px',background:'var(--bg-secondary)',borderRadius:'8px',fontSize:'.85rem'}}>
                    Available stock in {shops.find(s=>s.id===parseInt(form.from_shop_id))?.name}: <strong>{selectedProduct.quantity}</strong>
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
