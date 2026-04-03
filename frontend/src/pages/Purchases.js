// src/pages/Purchases.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const currency = process.env.REACT_APP_CURRENCY || 'AED';

  const [form, setForm] = useState({
    supplier_id: '', purchase_date: new Date().toISOString().split('T')[0],
    amount_paid: '', notes: '',
    items: [{ product_id: '', imei: '', qty: 1, unit_cost: '', recommended_selling_price: '' }]
  });

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/purchases'), api.get('/suppliers'), api.get('/products')])
     .then(([p, s, pr]) => {
  setPurchases(p.data?.data || []);
  setSuppliers(Array.isArray(s.data) ? s.data : s.data?.data || []);
  setProducts(pr.data?.data || []);
})



      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const addItem = () => setForm({ ...form, items: [...form.items, { product_id: '', imei: '', qty: 1, unit_cost: '', recommended_selling_price: '' }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  const updateItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    setForm({ ...form, items });
  };

  const total = form.items.reduce((s, i) => s + ((parseFloat(i.qty) || 0) * (parseFloat(i.unit_cost) || 0)), 0);

  const handleSubmit = async () => {
    if (!form.supplier_id) return toast.error('Select a supplier');
    if (form.items.some(i => !i.product_id || !i.unit_cost)) return toast.error('Each item needs a product and cost');
    try {
      const res = await api.post('/purchases', { ...form, amount_paid: parseFloat(form.amount_paid) || 0 });
      toast.success(res.message || 'Purchase created!');
      setShowModal(false);
      setForm({ supplier_id: '', purchase_date: new Date().toISOString().split('T')[0], amount_paid: '', notes: '', items: [{ product_id: '', imei: '', qty: 1, unit_cost: '', recommended_selling_price: '' }
] });
      load();
    } catch (err) { toast.error(err.message); }
  };

  const payStatus = (s) => ({ paid: 'badge-green', partial: 'badge-yellow', unpaid: 'badge-red' }[s] || 'badge-gray');
  const fmt = n => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">📦 Purchases</div><div className="page-subtitle">Stock purchases from suppliers</div></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Purchase</button>
      </div>

      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Purchase #</th><th>Supplier</th><th>Date</th><th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><p>No purchases yet</p></div></td></tr>
                ) : purchases.map(p => (
                  <tr key={p.id}>
                    <td><span className="badge badge-blue">{p.purchase_number}</span></td>
                    <td>{p.supplier_name}</td>
                    <td>{new Date(p.purchase_date).toLocaleDateString('en-AE')}</td>
                    <td>{p.item_count}</td>
                    <td>{fmt(p.total_amount)}</td>
                    <td style={{color:'var(--accent-green)'}}>{fmt(p.amount_paid)}</td>
                    <td style={{color: p.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}}>{fmt(p.amount_due)}</td>
                    <td><span className={`badge ${payStatus(p.payment_status)}`}>{p.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{maxWidth:'750px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>New Purchase</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Supplier *</label>
                  <select className="form-control" value={form.supplier_id} onChange={e => setForm({...form,supplier_id:e.target.value})}>
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Date</label>
                  <input type="date" className="form-control" value={form.purchase_date} onChange={e => setForm({...form,purchase_date:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount Paid Now</label>
                  <input type="number" className="form-control" placeholder="0.00" value={form.amount_paid} onChange={e => setForm({...form,amount_paid:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} />
                </div>
              </div>

              <div style={{margin:'1rem 0 0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <strong>Items</strong>
                <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
              </div>

              {form.items.map((item, i) => (
                <div key={i} style={{background:'var(--bg-secondary)',borderRadius:'8px',padding:'0.75rem',marginBottom:'0.5rem'}}>
                  <div className="form-grid" style={{gridTemplateColumns:'2fr 1fr 1fr 1fr auto'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Product *</label>
                      <select className="form-control" value={item.product_id} onChange={e => updateItem(i,'product_id',e.target.value)}>
                        <option value="">Select...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.brand} {p.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">IMEI</label>
                      <input className="form-control" value={item.imei} onChange={e => updateItem(i,'imei',e.target.value)} placeholder="Optional" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Qty</label>
                      <input type="number" min="1" className="form-control" value={item.qty} onChange={e => updateItem(i,'qty',e.target.value)} />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
  <label className="form-label">Selling Price</label>
  <input type="number" className="form-control" value={item.recommended_selling_price} onChange={e => updateItem(i,'recommended_selling_price',e.target.value)} placeholder="0.00" />
</div>
                    {form.items.length > 1 && (
                      <button onClick={() => removeItem(i)} style={{marginTop:'1.5rem',background:'none',border:'none',color:'var(--accent-red)',cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
                    )}
                  </div>
                </div>
              ))}

              <div style={{textAlign:'right',marginTop:'0.75rem',fontSize:'1rem',fontWeight:700}}>
                Total: <span style={{color:'var(--accent)'}}>{currency} {total.toFixed(2)}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>Create Purchase</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
