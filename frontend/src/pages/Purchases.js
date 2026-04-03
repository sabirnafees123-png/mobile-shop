// src/pages/Purchases.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Purchases() {
  const [purchases, setPurchases]   = useState([]);
  const [suppliers, setSuppliers]   = useState([]);
  const [products, setProducts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const currency = process.env.REACT_APP_CURRENCY || 'AED';

  const emptyItem = { product_id: '', imei: '', qty: 1, unit_cost: '', recommended_selling_price: '' };

  const [form, setForm] = useState({
    supplier_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
    payment_type: 'credit',   // cash | credit
    amount_paid: '',
    notes: '',
    items: [{ ...emptyItem }]
  });

  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '', city: '', notes: '' });

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/purchases'), api.get('/suppliers'), api.get('/products')])
      .then(([p, s, pr]) => {
        setPurchases(p.data?.data || []);
        setSuppliers(Array.isArray(s.data) ? s.data : s.data?.data || []);
        setProducts(pr.data?.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const addItem    = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  const updateItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    setForm({ ...form, items });
  };

  // When payment_type changes to cash, auto-fill amount_paid with total
  const handlePaymentType = (type) => {
    const total = form.items.reduce((s, i) => s + ((parseFloat(i.qty) || 0) * (parseFloat(i.unit_cost) || 0)), 0);
    setForm({ ...form, payment_type: type, amount_paid: type === 'cash' ? total.toString() : '' });
  };

  const total = form.items.reduce((s, i) => s + ((parseFloat(i.qty) || 0) * (parseFloat(i.unit_cost) || 0)), 0);

  // Keep amount_paid in sync when total changes and payment_type is cash
  const handleItemChange = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    const newTotal = items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_cost) || 0)), 0);
    setForm({ ...form, items, amount_paid: form.payment_type === 'cash' ? newTotal.toString() : form.amount_paid });
  };

  const handleSubmit = async () => {
    if (!form.supplier_id) return toast.error('Select a supplier');
    if (form.items.some(i => !i.product_id || !i.unit_cost)) return toast.error('Each item needs a product and cost');
    try {
      const payload = {
        ...form,
        amount_paid: form.payment_type === 'cash' ? total : parseFloat(form.amount_paid) || 0
      };
      const res = await api.post('/purchases', payload);
      toast.success(res.data?.message || 'Purchase created!');
      setShowModal(false);
      setForm({ supplier_id: '', purchase_date: new Date().toISOString().split('T')[0], payment_type: 'credit', amount_paid: '', notes: '', items: [{ ...emptyItem }] });
      load();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
  };

  const handleAddSupplier = async () => {
    if (!supplierForm.name) return toast.error('Supplier name is required');
    try {
      const res = await api.post('/suppliers', supplierForm);
      const newSupplier = res.data?.supplier;
      toast.success('Supplier added!');
      setSuppliers(prev => [...prev, newSupplier]);
      setForm(f => ({ ...f, supplier_id: newSupplier.id }));
      setShowAddSupplier(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '', city: '', notes: '' });
    } catch (err) { toast.error(err.response?.data?.error || err.message); }
  };

  const payStatus = (s) => ({ paid: 'badge-green', partial: 'badge-yellow', unpaid: 'badge-red' }[s] || 'badge-gray');
  const fmt = n => `${currency} ${Math.round(parseFloat(n || 0)).toLocaleString()}`;

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
              <thead>
                <tr>
                  <th>Purchase #</th><th>Supplier</th><th>Date</th>
                  <th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th>
                </tr>
              </thead>
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

      {/* ── New Purchase Modal ─────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{maxWidth:'800px',maxHeight:'90vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>New Purchase</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* Supplier row */}
              <div style={{display:'flex',gap:'8px',alignItems:'flex-end',marginBottom:'1rem'}}>
                <div className="form-group" style={{flex:1,marginBottom:0}}>
                  <label className="form-label">Supplier *</label>
                  <select className="form-control" value={form.supplier_id} onChange={e => setForm({...form,supplier_id:e.target.value})}>
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-ghost btn-sm" style={{marginBottom:'2px'}} onClick={() => setShowAddSupplier(true)}>+ New Supplier</button>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Purchase Date</label>
                  <input type="date" className="form-control" value={form.purchase_date} onChange={e => setForm({...form,purchase_date:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Type</label>
                  <select className="form-control" value={form.payment_type} onChange={e => handlePaymentType(e.target.value)}>
                    <option value="credit">Credit (Pay Later)</option>
                    <option value="cash">Cash (Paid Now)</option>
                  </select>
                </div>
                {form.payment_type === 'credit' && (
                  <div className="form-group">
                    <label className="form-label">Amount Paid Now (Partial)</label>
                    <input type="number" className="form-control" placeholder="0" value={form.amount_paid} onChange={e => setForm({...form,amount_paid:e.target.value})} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} />
                </div>
              </div>

              {/* Payment type info */}
              <div style={{
                padding:'8px 12px', borderRadius:'6px', marginBottom:'1rem', fontSize:'.85rem',
                background: form.payment_type === 'cash' ? '#d1fae5' : '#fef3c7',
                color: form.payment_type === 'cash' ? '#065f46' : '#92400e'
              }}>
                {form.payment_type === 'cash'
                  ? '✅ Cash Purchase — full amount will be marked as paid, no balance added to supplier'
                  : '⏳ Credit Purchase — unpaid amount will be added to supplier balance/ledger'}
              </div>

              {/* Items */}
              <div style={{margin:'0.5rem 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <strong>Items</strong>
                <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
              </div>

              {form.items.map((item, i) => (
                <div key={i} style={{background:'var(--bg-secondary)',borderRadius:'8px',padding:'0.75rem',marginBottom:'0.5rem'}}>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr auto',gap:'8px',alignItems:'end'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Product *</label>
                      <select className="form-control" value={item.product_id} onChange={e => handleItemChange(i,'product_id',e.target.value)}>
                        <option value="">Select...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.brand} {p.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">IMEI</label>
                      <input className="form-control" value={item.imei} onChange={e => handleItemChange(i,'imei',e.target.value)} placeholder="Optional" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Qty</label>
                      <input type="number" min="1" className="form-control" value={item.qty} onChange={e => handleItemChange(i,'qty',e.target.value)} />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Unit Cost *</label>
                      <input type="number" className="form-control" value={item.unit_cost} onChange={e => handleItemChange(i,'unit_cost',e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Selling Price</label>
                      <input type="number" className="form-control" value={item.recommended_selling_price} onChange={e => handleItemChange(i,'recommended_selling_price',e.target.value)} placeholder="0" />
                    </div>
                    {form.items.length > 1 && (
                      <button onClick={() => removeItem(i)} style={{marginBottom:'2px',background:'none',border:'none',color:'var(--accent-red)',cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
                    )}
                  </div>
                  {/* Row subtotal */}
                  {item.unit_cost && item.qty && (
                    <div style={{textAlign:'right',fontSize:'.8rem',color:'var(--text-muted)',marginTop:'4px'}}>
                      Subtotal: {currency} {Math.round((parseFloat(item.qty)||0)*(parseFloat(item.unit_cost)||0)).toLocaleString()}
                      {item.recommended_selling_price && (
                        <span style={{marginLeft:'12px'}}>
                          Margin: {currency} {Math.round(((parseFloat(item.recommended_selling_price)||0)-(parseFloat(item.unit_cost)||0))*(parseFloat(item.qty)||0)).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Totals */}
              <div style={{textAlign:'right',marginTop:'0.75rem',fontSize:'1rem',fontWeight:700}}>
                Total: <span style={{color:'var(--accent)'}}>{currency} {Math.round(total).toLocaleString()}</span>
                {form.payment_type === 'cash' && (
                  <span style={{marginLeft:'16px',color:'var(--accent-green)',fontSize:'.9rem'}}>
                    Paid: {currency} {Math.round(total).toLocaleString()}
                  </span>
                )}
                {form.payment_type === 'credit' && form.amount_paid && (
                  <>
                    <span style={{marginLeft:'16px',color:'var(--accent-green)',fontSize:'.9rem'}}>
                      Paid: {currency} {Math.round(parseFloat(form.amount_paid)||0).toLocaleString()}
                    </span>
                    <span style={{marginLeft:'16px',color:'var(--accent-red)',fontSize:'.9rem'}}>
                      Due: {currency} {Math.round(total-(parseFloat(form.amount_paid)||0)).toLocaleString()}
                    </span>
                  </>
                )}
                {form.payment_type === 'credit' && !form.amount_paid && (
                  <span style={{marginLeft:'16px',color:'var(--accent-red)',fontSize:'.9rem'}}>
                    Due: {currency} {Math.round(total).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>Create Purchase</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Supplier Modal ─────────────────────────────────────── */}
      {showAddSupplier && (
        <div className="modal-overlay" onClick={() => setShowAddSupplier(false)}>
          <div className="modal" style={{maxWidth:'480px',zIndex:1100}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Add New Supplier</strong>
              <button className="modal-close" onClick={() => setShowAddSupplier(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-control" value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm,name:e.target.value})} placeholder="Supplier name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-control" value={supplierForm.phone} onChange={e => setSupplierForm({...supplierForm,phone:e.target.value})} placeholder="+971..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-control" value={supplierForm.email} onChange={e => setSupplierForm({...supplierForm,email:e.target.value})} placeholder="email@..." />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input className="form-control" value={supplierForm.city} onChange={e => setSupplierForm({...supplierForm,city:e.target.value})} placeholder="Dubai" />
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Address</label>
                  <input className="form-control" value={supplierForm.address} onChange={e => setSupplierForm({...supplierForm,address:e.target.value})} placeholder="Address" />
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={supplierForm.notes} onChange={e => setSupplierForm({...supplierForm,notes:e.target.value})} placeholder="Optional notes" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddSupplier(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddSupplier}>Add Supplier</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
