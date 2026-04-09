// src/pages/Purchases.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import ShopSelector from '../components/ShopSelector';

const fmt     = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');
const emptyItem = () => ({ product_id: '', imei: '', qty: 1, unit_cost: '', recommended_selling_price: '' });

export default function Purchases() {
  const [purchases, setPurchases]     = useState([]);
  const [suppliers, setSuppliers]     = useState([]);
  const [products, setProducts]       = useState([]);
  const [shops, setShops]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [viewPurchase, setViewPurchase]       = useState(null);
  const [viewLoading, setViewLoading]         = useState(false);
  const [filterShop, setFilterShop]           = useState('');

  const mkForm = () => ({
    supplier_id: '',
    shop_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
    payment_type: 'credit',
    amount_paid: '',
    notes: '',
    items: [emptyItem()],
  });
  const [form, setForm] = useState(mkForm());
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '', city: '', notes: '' });

  const load = (sid) => {
    setLoading(true);
    const params = sid ? `?shop_id=${sid}` : '';
    Promise.all([
      api.get(`/purchases${params}`),
      api.get('/suppliers'),
      api.get('/products'),
      api.get('/shops'),
    ])
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

  const openAdd = () => {
    setForm({
      ...mkForm(),
      shop_id: shops.length === 1 ? shops[0].id : (filterShop || ''),
    });
    setShowModal(true);
  };

  const openView = async (purchase) => {
    setViewPurchase({ ...purchase, items: [] });
    setViewLoading(true);
    try {
      const res = await api.get(`/purchases/${purchase.id}`);
      setViewPurchase(res.data?.data || purchase);
    } catch { toast.error('Failed to load purchase details'); }
    finally { setViewLoading(false); }
  };

  const addItem    = () => setForm({ ...form, items: [...form.items, emptyItem()] });
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
    if (!form.supplier_id)  return toast.error('Select a supplier');
    if (!form.shop_id)      return toast.error('Select a shop');
    if (form.items.some(i => !i.product_id || !i.unit_cost)) return toast.error('Each item needs a product and cost');
    try {
      const payload = {
        supplier_id:  form.supplier_id,
        shop_id:      form.shop_id,
        purchase_date: form.purchase_date,
        amount_paid:  parseFloat(form.amount_paid || 0),
        notes:        form.notes,
        items: form.items.map(i => ({
          product_id:                 i.product_id,
          imei:                       i.imei || null,
          qty:                        parseInt(i.qty) || 1,
          unit_cost:                  parseFloat(i.unit_cost),
          recommended_selling_price:  parseFloat(i.recommended_selling_price || 0),
        })),
      };
      await api.post('/purchases', payload);
      toast.success('Purchase created!');
      setShowModal(false);
      setForm(mkForm());
      load(filterShop);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
  };

  const handleAddSupplier = async () => {
    if (!supplierForm.name) return toast.error('Supplier name required');
    try {
      await api.post('/suppliers', supplierForm);
      toast.success('Supplier added!');
      setShowAddSupplier(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '', city: '', notes: '' });
      load(filterShop);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const statusColor = s => s === 'paid' ? '#059669' : s === 'partial' ? '#d97706' : '#dc2626';

  return (
    <div>
      <div className='page-header'>
        <div>
          <div className='page-title'>Purchases</div>
          <div className='page-subtitle'>{purchases.length} purchase(s)</div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <ShopSelector shops={shops} value={filterShop} onChange={setFilterShop} includeAll={true} label='Filter' />
          <button className='btn-secondary' onClick={() => setShowAddSupplier(true)}>+ Supplier</button>
          <button className='btn-primary' onClick={openAdd}>+ New Purchase</button>
        </div>
      </div>

      {loading ? <div className='loading'>Loading...</div> : (
        <div className='table-container'>
          <table className='table'>
            <thead>
              <tr>
                <th>Purchase #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Shop</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No purchases found</td></tr>
              ) : purchases.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.purchase_number}</strong></td>
                  <td>{fmtDate(p.purchase_date)}</td>
                  <td>{p.supplier_name}</td>
                  <td>
                    <span style={{ background: 'var(--surface-alt)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.8rem' }}>
                      {p.shop_name || '—'}
                    </span>
                  </td>
                  <td>{p.item_count}</td>
                  <td>{fmt(p.total_amount)}</td>
                  <td style={{ color: '#059669' }}>{fmt(p.amount_paid)}</td>
                  <td style={{ color: p.amount_due > 0 ? '#dc2626' : 'inherit' }}>{fmt(p.amount_due)}</td>
                  <td>
                    <span style={{ color: statusColor(p.payment_status), fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                      {p.payment_status}
                    </span>
                  </td>
                  <td>
                    <button className='btn-sm' onClick={() => openView(p)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New Purchase Modal ── */}
      {showModal && (
        <div className='modal-overlay' onClick={() => setShowModal(false)}>
          <div className='modal' style={{ maxWidth: '780px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>New Purchase</h3>
              <button className='modal-close' onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className='modal-body' style={{ maxHeight: '75vh', overflowY: 'auto' }}>

              {/* Shop — required, highlighted */}
              <div style={{ background: 'var(--surface-alt)', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px' }}>
                <div className='form-group'>
                  <label>Shop <span style={{ color: '#dc2626' }}>*</span></label>
                  <select
                    value={form.shop_id}
                    onChange={e => setForm({ ...form, shop_id: e.target.value })}
                    style={{ border: !form.shop_id ? '2px solid #dc2626' : undefined }}
                  >
                    <option value=''>— Select Shop —</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Supplier + Date */}
              <div className='form-row'>
                <div className='form-group' style={{ flex: 2 }}>
                  <label>Supplier <span style={{ color: '#dc2626' }}>*</span></label>
                  <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value=''>Select supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className='form-group'>
                  <label>Date</label>
                  <input type='date' value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
                </div>
              </div>

              {/* Payment type */}
              <div className='form-row' style={{ marginBottom: '12px' }}>
                {['cash', 'credit'].map(t => (
                  <button
                    key={t}
                    className={form.payment_type === t ? 'btn-primary' : 'btn-secondary'}
                    style={{ flex: 1, textTransform: 'capitalize' }}
                    onClick={() => handlePaymentType(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {form.payment_type === 'credit' && (
                <div className='form-group'>
                  <label>Amount Paid Now (AED)</label>
                  <input type='number' value={form.amount_paid} onChange={e => setForm({ ...form, amount_paid: e.target.value })} placeholder='0' />
                </div>
              )}

              {/* Items */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px' }}>
                <label style={{ fontWeight: 600 }}>Items</label>
                <button className='btn-sm' onClick={addItem}>+ Add Item</button>
              </div>
              {form.items.map((item, i) => (
                <div key={i} style={{ background: 'var(--surface-alt)', padding: '10px', borderRadius: '8px', marginBottom: '8px' }}>
                  <div className='form-row'>
                    <div className='form-group' style={{ flex: 2 }}>
                      <label>Product</label>
                      <select value={item.product_id} onChange={e => handleItemChange(i, 'product_id', e.target.value)}>
                        <option value=''>Select product</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.brand} {p.name}</option>)}
                      </select>
                    </div>
                    <div className='form-group' style={{ flex: '0 0 70px' }}>
                      <label>Qty</label>
                      <input type='number' min='1' value={item.qty} onChange={e => handleItemChange(i, 'qty', e.target.value)} />
                    </div>
                    <div className='form-group' style={{ flex: 1 }}>
                      <label>Cost (AED)</label>
                      <input type='number' value={item.unit_cost} onChange={e => handleItemChange(i, 'unit_cost', e.target.value)} placeholder='0' />
                    </div>
                    <div className='form-group' style={{ flex: 1 }}>
                      <label>Sell Price</label>
                      <input type='number' value={item.recommended_selling_price} onChange={e => handleItemChange(i, 'recommended_selling_price', e.target.value)} placeholder='0' />
                    </div>
                    <div className='form-group' style={{ flex: 1 }}>
                      <label>IMEI</label>
                      <input value={item.imei} onChange={e => handleItemChange(i, 'imei', e.target.value)} placeholder='optional' />
                    </div>
                    {form.items.length > 1 && (
                      <button className='btn-sm btn-danger' style={{ alignSelf: 'flex-end', marginBottom: '4px' }} onClick={() => removeItem(i)}>×</button>
                    )}
                  </div>
                </div>
              ))}

              <div className='form-group'>
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder='Optional notes...' />
              </div>

              <div style={{ background: 'var(--surface-alt)', padding: '12px 16px', borderRadius: '8px', textAlign: 'right' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>Total: {fmt(total)}</div>
                <div style={{ color: '#dc2626', fontSize: '0.95rem', marginTop: '4px' }}>
                  Due: {fmt(total - parseFloat(form.amount_paid || 0))}
                </div>
              </div>
            </div>
            <div className='modal-footer'>
              <button className='btn-secondary' onClick={() => setShowModal(false)}>Cancel</button>
              <button className='btn-primary' onClick={handleSubmit}>Create Purchase</button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Purchase Modal ── */}
      {viewPurchase && (
        <div className='modal-overlay' onClick={() => setViewPurchase(null)}>
          <div className='modal' style={{ maxWidth: '600px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>{viewPurchase.purchase_number}</h3>
              <button className='modal-close' onClick={() => setViewPurchase(null)}>×</button>
            </div>
            <div className='modal-body'>
              {viewLoading ? <div className='loading'>Loading...</div> : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Supplier</span><br /><strong>{viewPurchase.supplier_name}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Shop</span><br /><strong>{viewPurchase.shop_name || '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Date</span><br />{fmtDate(viewPurchase.purchase_date)}</div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Total</span><br /><strong>{fmt(viewPurchase.total_amount)}</strong></div>
                  </div>
                  {(viewPurchase.items || []).length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px' }}>Product</th>
                        <th style={{ textAlign: 'center', padding: '6px' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '6px' }}>Cost</th>
                        <th style={{ textAlign: 'left', padding: '6px' }}>IMEI</th>
                      </tr></thead>
                      <tbody>
                        {viewPurchase.items.map((it, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px' }}>{it.brand} {it.product_name}</td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>{it.qty}</td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>{fmt(it.unit_cost)}</td>
                            <td style={{ padding: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{it.imei || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
            <div className='modal-footer'>
              <button className='btn-secondary' onClick={() => setViewPurchase(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Supplier Modal ── */}
      {showAddSupplier && (
        <div className='modal-overlay' onClick={() => setShowAddSupplier(false)}>
          <div className='modal' onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>Add Supplier</h3>
              <button className='modal-close' onClick={() => setShowAddSupplier(false)}>×</button>
            </div>
            <div className='modal-body'>
              {['name', 'phone', 'email', 'address', 'city'].map(f => (
                <div className='form-group' key={f}>
                  <label style={{ textTransform: 'capitalize' }}>{f}</label>
                  <input value={supplierForm[f]} onChange={e => setSupplierForm({ ...supplierForm, [f]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className='modal-footer'>
              <button className='btn-secondary' onClick={() => setShowAddSupplier(false)}>Cancel</button>
              <button className='btn-primary' onClick={handleAddSupplier}>Add Supplier</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
