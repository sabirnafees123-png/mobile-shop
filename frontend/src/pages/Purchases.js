// src/pages/Purchases.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

export default function Purchases() {
  const [purchases, setPurchases]   = useState([]);
  const [suppliers, setSuppliers]   = useState([]);
  const [products, setProducts]     = useState([]);
  const [shops, setShops]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [viewPurchase, setViewPurchase] = useState(null);
  const [viewLoading, setViewLoading]   = useState(false);
  const [filterShop, setFilterShop]     = useState('');

  const emptyItem = { product_id: '', imei: '', qty: 1, unit_cost: '', recommended_selling_price: '' };

  const [form, setForm] = useState({
    supplier_id: '', shop_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
    payment_type: 'credit', amount_paid: '', notes: '',
    items: [{ ...emptyItem }]
  });

  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '', city: '', notes: '' });

  const load = (sid) => {
    setLoading(true);
    const qs = sid ? `?shop_id=${sid}` : '';
    Promise.all([api.get(`/purchases${qs}`), api.get('/suppliers'), api.get('/products'), api.get('/shops')])
      .then(([p, s, pr, sh]) => {
        setPurchases(p.data?.data || []);
        setSuppliers(Array.isArray(s.data) ? s.data : s.data?.data || []);
        setProducts(pr.data?.data || []);
        setShops(sh.data?.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(filterShop); }, [filterShop]);

  const openView = async (purchase) => {
    setViewPurchase({ ...purchase, items: [] });
    setViewLoading(true);
    try {
      const res = await api.get(`/purchases/${purchase.id}`);
      setViewPurchase(res.data?.data || purchase);
    } catch {
      toast.error('Failed to load purchase details');
    } finally {
      setViewLoading(false);
    }
  };

  const addItem    = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  const handlePaymentType = (type) => {
    const total = form.items.reduce((s, i) => s + ((parseFloat(i.qty) || 0) * (parseFloat(i.unit_cost) || 0)), 0);
    setForm({ ...form, payment_type: type, amount_paid: type === 'cash' ? total.toString() : '' });
  };

  const handleItemChange = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    const newTotal = items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_cost) || 0)), 0);
    setForm({ ...form, items, amount_paid: form.payment_type === 'cash' ? newTotal.toString() : form.amount_paid });
  };

  const total = form.items.reduce((s, i) => s + ((parseFloat(i.qty) || 0) * (parseFloat(i.unit_cost) || 0)), 0);

  const handleSubmit = async () => {
    if (!form.supplier_id) return toast.error('Select a supplier');
    if (!form.shop_id)     return toast.error('Select a shop');
    if (form.items.some(i => !i.product_id || !i.unit_cost)) return toast.error('Each item needs a product and cost');
    try {
      const payload = {
        ...form,
        amount_paid: form.payment_type === 'cash' ? total : parseFloat(form.amount_paid) || 0
      };
      const res = await api.post('/purchases', payload);
      toast.success(res.data?.message || 'Purchase created!');
      setShowModal(false);
      setForm({ supplier_id: '', shop_id: '', purchase_date: new Date().toISOString().split('T')[0], payment_type: 'credit', amount_paid: '', notes: '', items: [{ ...emptyItem }] });
      load(filterShop);
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

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">📦 Purchases</div><div className="page-subtitle">Stock purchases from suppliers</div></div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <select className="form-control" style={{width:'auto'}} value={filterShop} onChange={e => setFilterShop(e.target.value)}>
            <option value="">All Shops</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => { setForm(f => ({...f, shop_id: shops.length===1?shops[0].id:(filterShop||'')})); setShowModal(true); }}>+ New Purchase</button>
        </div>
      </div>

      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Purchase #</th><th>Supplier</th><th>Shop</th><th>Date</th>
                  <th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr><td colSpan={10}><div className="empty-state"><p>No purchases yet</p></div></td></tr>
                ) : purchases.map(p => (
                  <tr key={p.id}>
                    <td><span className="badge badge-blue">{p.purchase_number}</span></td>
                    <td>{p.supplier_name}</td>
                    <td><span className="badge badge-gray">{p.shop_name || '—'}</span></td>
                    <td>{fmtDate(p.purchase_date)}</td>
                    <td>{p.item_count}</td>
                    <td>{fmt(p.total_amount)}</td>
                    <td style={{color:'var(--accent-green)'}}>{fmt(p.amount_paid)}</td>
                    <td style={{color: p.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}}>{fmt(p.amount_due)}</td>
                    <td><span className={`badge ${payStatus(p.payment_status)}`}>{p.payment_status}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openView(p)} title="View Details">👁️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── View Purchase Modal ── */}
      {viewPurchase && (
        <div className="modal-overlay" onClick={() => setViewPurchase(null)}>
          <div className="modal" style={{maxWidth:'680px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Purchase {viewPurchase.purchase_number}</strong>
              <button className="modal-close" onClick={() => setViewPurchase(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                <div><strong>Supplier:</strong> {viewPurchase.supplier_name}</div>
                <div><strong>Shop:</strong> {viewPurchase.shop_name || '—'}</div>
                <div><strong>Date:</strong> {fmtDate(viewPurchase.purchase_date)}</div>
                <div><strong>Total:</strong> {fmt(viewPurchase.total_amount)}</div>
                <div><strong>Paid:</strong> <span style={{color:'var(--accent-green)'}}>{fmt(viewPurchase.amount_paid)}</span></div>
                <div><strong>Due:</strong> <span style={{color: viewPurchase.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}}>{fmt(viewPurchase.amount_due)}</span></div>
                <div><strong>Status:</strong> <span className={`badge ${({paid:'badge-green',partial:'badge-yellow',unpaid:'badge-red'}[viewPurchase.payment_status]||'badge-gray')}`}>{viewPurchase.payment_status}</span></div>
                {viewPurchase.notes && <div style={{gridColumn:'1/-1'}}><strong>Notes:</strong> {viewPurchase.notes}</div>}
              </div>
              {viewLoading ? (
                <div style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>Loading items...</div>
              ) : (
                <table style={{width:'100%',fontSize:'.9rem',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{borderBottom:'2px solid var(--border)'}}>
                      <th style={{textAlign:'left',padding:'8px 0'}}>Product</th>
                      <th style={{textAlign:'left',padding:'8px 0'}}>IMEI</th>
                      <th style={{textAlign:'right',padding:'8px 0'}}>Qty</th>
                      <th style={{textAlign:'right',padding:'8px 0'}}>Unit Cost</th>
                      <th style={{textAlign:'right',padding:'8px 0'}}>Selling Price</th>
                      <th style={{textAlign:'right',padding:'8px 0'}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewPurchase.items || []).length === 0 ? (
                      <tr><td colSpan={6} style={{textAlign:'center',padding:'1rem',color:'var(--text-muted)'}}>No items found</td></tr>
                    ) : (viewPurchase.items || []).map((item, i) => (
                      <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'8px 0'}}><strong>{item.brand} {item.product_name}</strong></td>
                        <td style={{padding:'8px 0',fontFamily:'monospace',fontSize:'.8rem',color:'var(--text-muted)'}}>{item.imei || '—'}</td>
                        <td style={{textAlign:'right',padding:'8px 0'}}>{item.qty}</td>
                        <td style={{textAlign:'right',padding:'8px 0'}}>{fmt(item.unit_cost)}</td>
                        <td style={{textAlign:'right',padding:'8px 0',color:'var(--accent-green)'}}>{fmt(item.recommended_selling_price)}</td>
                        <td style={{textAlign:'right',padding:'8px 0',fontWeight:600}}>{fmt(item.qty * item.unit_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:'2px solid var(--border)'}}>
                      <td colSpan={5} style={{textAlign:'right',padding:'8px 0',fontWeight:700}}>Total:</td>
                      <td style={{textAlign:'right',padding:'8px 0',fontWeight:700,color:'var(--accent)'}}>{fmt(viewPurchase.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setViewPurchase(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Purchase Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{maxWidth:'800px',maxHeight:'90vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>New Purchase</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* ── Shop Selector (NEW) ── */}
              <div className="form-group" style={{marginBottom:'1rem',padding:'0.75rem',background:'var(--bg-secondary)',borderRadius:'8px'}}>
                <label className="form-label">Shop <span style={{color:'var(--accent-red)'}}>*</span></label>
                <select className="form-control" value={form.shop_id} onChange={e => setForm({...form, shop_id: e.target.value})}
                  style={{border: !form.shop_id ? '2px solid var(--accent-red)' : ''}}>
                  <option value="">— Select Shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

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

              <div style={{padding:'8px 12px',borderRadius:'6px',marginBottom:'1rem',fontSize:'.85rem',
                background: form.payment_type==='cash'?'#d1fae5':'#fef3c7',
                color: form.payment_type==='cash'?'#065f46':'#92400e'}}>
                {form.payment_type==='cash' ? '✅ Cash Purchase — full amount marked as paid' : '⏳ Credit Purchase — unpaid amount added to supplier balance'}
              </div>

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
                  {item.unit_cost && item.qty && (
                    <div style={{textAlign:'right',fontSize:'.8rem',color:'var(--text-muted)',marginTop:'4px'}}>
                      Subtotal: AED {Math.round((parseFloat(item.qty)||0)*(parseFloat(item.unit_cost)||0)).toLocaleString()}
                      {item.recommended_selling_price && (
                        <span style={{marginLeft:'12px'}}>
                          Margin: AED {Math.round(((parseFloat(item.recommended_selling_price)||0)-(parseFloat(item.unit_cost)||0))*(parseFloat(item.qty)||0)).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div style={{textAlign:'right',marginTop:'0.75rem',fontSize:'1rem',fontWeight:700}}>
                Total: <span style={{color:'var(--accent)'}}>AED {Math.round(total).toLocaleString()}</span>
                {form.payment_type==='cash' && <span style={{marginLeft:'16px',color:'var(--accent-green)',fontSize:'.9rem'}}>Paid: AED {Math.round(total).toLocaleString()}</span>}
                {form.payment_type==='credit' && !form.amount_paid && <span style={{marginLeft:'16px',color:'var(--accent-red)',fontSize:'.9rem'}}>Due: AED {Math.round(total).toLocaleString()}</span>}
                {form.payment_type==='credit' && form.amount_paid && <>
                  <span style={{marginLeft:'16px',color:'var(--accent-green)',fontSize:'.9rem'}}>Paid: AED {Math.round(parseFloat(form.amount_paid)||0).toLocaleString()}</span>
                  <span style={{marginLeft:'16px',color:'var(--accent-red)',fontSize:'.9rem'}}>Due: AED {Math.round(total-(parseFloat(form.amount_paid)||0)).toLocaleString()}</span>
                </>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>Create Purchase</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Supplier Modal ── */}
      {showAddSupplier && (
        <div className="modal-overlay" onClick={() => setShowAddSupplier(false)}>
          <div className="modal" style={{maxWidth:'480px',zIndex:1100}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Add New Supplier</strong>
              <button className="modal-close" onClick={() => setShowAddSupplier(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Name *</label><input className="form-control" value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm,name:e.target.value})} placeholder="Supplier name" /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={supplierForm.phone} onChange={e => setSupplierForm({...supplierForm,phone:e.target.value})} placeholder="+971..." /></div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-control" value={supplierForm.email} onChange={e => setSupplierForm({...supplierForm,email:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">City</label><input className="form-control" value={supplierForm.city} onChange={e => setSupplierForm({...supplierForm,city:e.target.value})} placeholder="Dubai" /></div>
                <div className="form-group" style={{gridColumn:'1/-1'}}><label className="form-label">Address</label><input className="form-control" value={supplierForm.address} onChange={e => setSupplierForm({...supplierForm,address:e.target.value})} /></div>
                <div className="form-group" style={{gridColumn:'1/-1'}}><label className="form-label">Notes</label><input className="form-control" value={supplierForm.notes} onChange={e => setSupplierForm({...supplierForm,notes:e.target.value})} /></div>
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
