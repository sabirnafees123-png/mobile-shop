// src/pages/Purchases.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt     = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

const PRODUCT_TYPES = ['New (Box Pack)', 'Used', 'Refurbished', 'Parts', 'Accessories', 'Wholesale'];

export default function Purchases() {
  const [purchases, setPurchases]     = useState([]);
  const [suppliers, setSuppliers]     = useState([]);
  const [shops, setShops]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [viewPurchase, setViewPurchase]       = useState(null);
  const [viewLoading, setViewLoading]         = useState(false);
  const [filterShop, setFilterShop]           = useState('');

  // Serial search state per item
  const [serialSearches, setSerialSearches] = useState({});
  const [serialResults, setSerialResults]   = useState({});

  const emptyItem = () => ({
    // Product fields — entered manually or found by serial
    serial_number: '',
    product_name:  '',
    brand:         '',
    color:         '',
    product_type:  'Used',
    product_id:    null,   // set if serial matches existing product
    // Purchase fields
    qty: 1, unit_cost: '', recommended_selling_price: '', shop_id: '',
  });

  const [form, setForm] = useState({
    supplier_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
    payment_type: 'credit',
    amount_paid: '',
    notes: '',
    items: [emptyItem()],
  });

  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '', city: '', notes: '' });

  const load = (sid) => {
    setLoading(true);
    const qs = sid ? `?shop_id=${sid}` : '';
    Promise.all([
      api.get(`/purchases${qs}`),
      api.get('/suppliers'),
      api.get('/shops'),
    ])
      .then(([p, s, sh]) => {
        setPurchases(p.data?.data || []);
        setSuppliers(Array.isArray(s.data) ? s.data : s.data?.data || []);
        setShops(sh.data?.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filterShop); }, [filterShop]);

  const openAdd = () => {
    setForm({
      supplier_id: '', purchase_date: new Date().toISOString().split('T')[0],
      payment_type: 'credit', amount_paid: '', notes: '',
      items: [emptyItem()],
    });
    setSerialSearches({});
    setSerialResults({});
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

  // Serial number search — finds existing product in system
  const searchSerial = async (idx, val) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], serial_number: val, product_id: null };
    setForm({ ...form, items });

    if (val.length < 2) {
      setSerialResults(prev => ({ ...prev, [idx]: [] }));
      return;
    }
    try {
      const res = await api.get(`/products/serial/${val}`);
      setSerialResults(prev => ({ ...prev, [idx]: res.data?.data || [] }));
    } catch {
      setSerialResults(prev => ({ ...prev, [idx]: [] }));
    }
  };

  // User picks an existing product from serial search results
  const selectExistingProduct = (idx, product) => {
    const items = [...form.items];
    items[idx] = {
      ...items[idx],
      product_id:    product.id,
      serial_number: product.serial_number || items[idx].serial_number,
      product_name:  product.name,
      brand:         product.brand || '',
      color:         product.color || '',
      product_type:  product.type || 'Used',
      recommended_selling_price: product.selling_price ? Math.round(product.selling_price).toString() : items[idx].recommended_selling_price,
    };
    setForm({ ...form, items });
    setSerialResults(prev => ({ ...prev, [idx]: [] }));
  };

  const handleItemChange = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    const newTotal = items.reduce((s, it) => s + ((parseFloat(it.qty)||0) * (parseFloat(it.unit_cost)||0)), 0);
    setForm({ ...form, items, amount_paid: form.payment_type === 'cash' ? newTotal.toString() : form.amount_paid });
  };

  const handlePaymentType = (type) => {
    const t = form.items.reduce((s, i) => s + ((parseFloat(i.qty)||0) * (parseFloat(i.unit_cost)||0)), 0);
    setForm({ ...form, payment_type: type, amount_paid: type === 'cash' ? t.toString() : '' });
  };

  const total = form.items.reduce((s, i) => s + ((parseFloat(i.qty)||0) * (parseFloat(i.unit_cost)||0)), 0);

  const handleSubmit = async () => {
    if (!form.supplier_id) return toast.error('Select a supplier');
    if (form.items.some(i => !i.serial_number && !i.product_name)) return toast.error('Each item needs a serial number or product name');
    if (form.items.some(i => !i.unit_cost)) return toast.error('Each item needs a cost price');
    if (form.items.some(i => !i.shop_id)) return toast.error('Each item needs a shop selected');

    try {
      const payload = {
        supplier_id:   form.supplier_id,
        purchase_date: form.purchase_date,
        amount_paid:   form.payment_type === 'cash' ? total : parseFloat(form.amount_paid) || 0,
        notes:         form.notes,
        items: form.items.map(i => ({
          // If product_id found by serial — use it. Otherwise backend will create product.
          product_id:                i.product_id || null,
          product_name:              i.product_name || i.serial_number,
          brand:                     i.brand || '',
          color:                     i.color || '',
          product_type:              i.product_type || 'Used',
          serial_number:             i.serial_number || null,
          qty:                       parseInt(i.qty) || 1,
          unit_cost:                 parseFloat(i.unit_cost),
          recommended_selling_price: parseFloat(i.recommended_selling_price || 0),
          shop_id:                   i.shop_id,
        })),
      };
      const res = await api.post('/purchases', payload);
      toast.success(res.data?.message || 'Purchase created!');
      setShowModal(false);
      setSerialSearches({});
      setSerialResults({});
      load(filterShop);
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
  };

  const handleAddSupplier = async () => {
    if (!supplierForm.name) return toast.error('Supplier name required');
    try {
      const res = await api.post('/suppliers', supplierForm);
      const newSupplier = res.data?.supplier || res.data?.data;
      toast.success('Supplier added!');
      setSuppliers(prev => [...prev, newSupplier]);
      setForm(f => ({ ...f, supplier_id: newSupplier?.id || '' }));
      setShowAddSupplier(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '', city: '', notes: '' });
    } catch (err) { toast.error(err.response?.data?.error || err.message); }
  };

  const payStatus = (s) => ({ paid: 'badge-green', partial: 'badge-yellow', unpaid: 'badge-red' }[s] || 'badge-gray');

  const typeBadgeColor = (t) => ({
    'New (Box Pack)': { bg: '#d1fae5', color: '#065f46' },
    'Used':           { bg: '#fef3c7', color: '#92400e' },
    'Refurbished':    { bg: '#dbeafe', color: '#1e40af' },
    'Parts':          { bg: '#f3e8ff', color: '#6b21a8' },
    'Accessories':    { bg: '#fce7f3', color: '#9d174d' },
    'Wholesale':      { bg: '#e0f2fe', color: '#0369a1' },
  }[t] || { bg: '#f3f4f6', color: '#374151' });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📦 Purchases</div>
          <div className="page-subtitle">{purchases.length} purchase(s)</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select className="form-control" style={{ width: 'auto' }} value={filterShop} onChange={e => setFilterShop(e.target.value)}>
            <option value="">All Shops</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openAdd}>+ New Purchase</button>
        </div>
      </div>

      {/* Purchase List */}
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Purchase #</th><th>Supplier</th><th>Date</th>
                  <th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state"><p>No purchases yet</p></div></td></tr>
                ) : purchases.map(p => (
                  <tr key={p.id}>
                    <td><span className="badge badge-blue">{p.purchase_number}</span></td>
                    <td>{p.supplier_name}</td>
                    <td>{fmtDate(p.purchase_date)}</td>
                    <td>{p.item_count}</td>
                    <td>{fmt(p.total_amount)}</td>
                    <td style={{ color: 'var(--accent-green)' }}>{fmt(p.amount_paid)}</td>
                    <td style={{ color: p.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{fmt(p.amount_due)}</td>
                    <td><span className={`badge ${payStatus(p.payment_status)}`}>{p.payment_status}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => openView(p)}>👁️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Purchase Modal */}
      {viewPurchase && (
        <div className="modal-overlay" onClick={() => setViewPurchase(null)}>
          <div className="modal" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Purchase {viewPurchase.purchase_number}</strong>
              <button className="modal-close" onClick={() => setViewPurchase(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', fontSize: '.9rem' }}>
                <div><strong>Supplier:</strong> {viewPurchase.supplier_name}</div>
                <div><strong>Date:</strong> {fmtDate(viewPurchase.purchase_date)}</div>
                <div><strong>Total:</strong> {fmt(viewPurchase.total_amount)}</div>
                <div><strong>Paid:</strong> <span style={{ color: 'var(--accent-green)' }}>{fmt(viewPurchase.amount_paid)}</span></div>
                <div><strong>Due:</strong> <span style={{ color: viewPurchase.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{fmt(viewPurchase.amount_due)}</span></div>
                <div><strong>Status:</strong> <span className={`badge ${payStatus(viewPurchase.payment_status)}`}>{viewPurchase.payment_status}</span></div>
                {viewPurchase.notes && <div style={{ gridColumn: '1/-1' }}><strong>Notes:</strong> {viewPurchase.notes}</div>}
              </div>
              {viewLoading ? <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div> : (
                <table style={{ width: '100%', fontSize: '.88rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 0' }}>Serial / IMEI</th>
                      <th style={{ textAlign: 'left', padding: '8px 0' }}>Product</th>
                      <th style={{ textAlign: 'left', padding: '8px 0' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '8px 0' }}>Shop</th>
                      <th style={{ textAlign: 'right', padding: '8px 0' }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '8px 0' }}>Cost</th>
                      <th style={{ textAlign: 'right', padding: '8px 0' }}>Sell</th>
                      <th style={{ textAlign: 'right', padding: '8px 0' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewPurchase.items || []).length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>No items</td></tr>
                    ) : (viewPurchase.items || []).map((item, i) => {
                      const tc = typeBadgeColor(item.type);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: '.82rem', fontWeight: 600 }}>{item.serial_number || item.imei || '—'}</td>
                          <td style={{ padding: '8px 0' }}><strong>{item.brand} {item.product_name}</strong>{item.color && <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}> · {item.color}</span>}</td>
                          <td style={{ padding: '8px 0' }}>
                            {item.type && <span style={{ padding: '2px 6px', borderRadius: '6px', fontSize: '.75rem', fontWeight: 600, background: tc.bg, color: tc.color }}>{item.type}</span>}
                          </td>
                          <td style={{ padding: '8px 0' }}><span style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '6px', fontSize: '.78rem' }}>{item.shop_name || '—'}</span></td>
                          <td style={{ textAlign: 'right', padding: '8px 0' }}>{item.qty}</td>
                          <td style={{ textAlign: 'right', padding: '8px 0' }}>{fmt(item.unit_cost)}</td>
                          <td style={{ textAlign: 'right', padding: '8px 0', color: 'var(--accent-green)' }}>{fmt(item.recommended_selling_price)}</td>
                          <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>{fmt(item.qty * item.unit_cost)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={7} style={{ textAlign: 'right', padding: '8px 0', fontWeight: 700 }}>Total:</td>
                      <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 700, color: 'var(--accent)' }}>{fmt(viewPurchase.total_amount)}</td>
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
          <div className="modal" style={{ maxWidth: '900px', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>📦 New Purchase</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* Supplier + Date + Payment */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Supplier *</label>
                  <select className="form-control" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: '2px' }} onClick={() => setShowAddSupplier(true)}>+ New</button>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Purchase Date</label>
                  <input type="date" className="form-control" value={form.purchase_date}
                    onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
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
                    <label className="form-label">Amount Paid Now</label>
                    <input type="number" className="form-control" placeholder="0"
                      value={form.amount_paid} onChange={e => setForm({ ...form, amount_paid: e.target.value })} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              <div style={{ padding: '8px 12px', borderRadius: '6px', marginBottom: '1rem', fontSize: '.85rem',
                background: form.payment_type === 'cash' ? '#d1fae5' : '#fef3c7',
                color: form.payment_type === 'cash' ? '#065f46' : '#92400e' }}>
                {form.payment_type === 'cash' ? '✅ Cash — full amount paid now' : '⏳ Credit — added to supplier balance'}
              </div>

              {/* Items */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.5rem 0 0.75rem' }}>
                <div>
                  <strong>Items</strong>
                  <span style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    — scan serial number first. System finds existing product or you enter details manually.
                  </span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
              </div>

              {form.items.map((item, i) => (
                <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid var(--border)' }}>

                  {/* Row 1: Serial + Shop (the two most important fields) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    {/* Serial Number — PRIMARY KEY */}
                    <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                      <label className="form-label">
                        🔍 Serial / IMEI <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>(scan or type — key field)</span>
                      </label>
                      <input
                        className="form-control"
                        placeholder="Scan barcode or type serial number..."
                        value={item.serial_number}
                        onChange={e => searchSerial(i, e.target.value)}
                        autoComplete="off"
                        style={{ fontFamily: 'monospace', fontWeight: 600 }}
                      />
                      {/* Dropdown if existing product found */}
                      {(serialResults[i] || []).length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                          background: 'white', border: '1px solid var(--border)', borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: '180px', overflowY: 'auto' }}>
                          <div style={{ padding: '6px 12px', fontSize: '.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: '#f8f9fc' }}>
                            Found in system — click to use:
                          </div>
                          {serialResults[i].map(p => (
                            <div key={p.id} onClick={() => selectExistingProduct(i, p)}
                              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '.88rem' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                              onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                              ✅ <strong>{p.brand} {p.name}</strong>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontFamily: 'monospace', fontSize: '.8rem' }}>S/N: {p.serial_number}</span>
                              {p.selling_price > 0 && <span style={{ marginLeft: '8px', color: '#059669' }}>AED {Math.round(p.selling_price).toLocaleString()}</span>}
                            </div>
                          ))}
                          <div onClick={() => setSerialResults(prev => ({ ...prev, [i]: [] }))}
                            style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '.82rem', color: 'var(--text-muted)', background: '#f8f9fc' }}>
                            ✏️ Enter as new product instead
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Shop — per item */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Shop → <span style={{ color: '#dc2626' }}>*</span></label>
                      <select className="form-control" value={item.shop_id}
                        onChange={e => handleItemChange(i, 'shop_id', e.target.value)}
                        style={{ border: !item.shop_id ? '2px solid #dc2626' : '' }}>
                        <option value="">— Select Shop —</option>
                        {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Product details — manual entry */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        Product Name
                        {item.product_id && <span style={{ marginLeft: '6px', color: '#059669', fontSize: '.75rem' }}>✅ Found in system</span>}
                        {!item.product_id && item.serial_number && <span style={{ marginLeft: '6px', color: '#d97706', fontSize: '.75rem' }}>⚠️ Will create new product</span>}
                      </label>
                      <input className="form-control" value={item.product_name}
                        onChange={e => handleItemChange(i, 'product_name', e.target.value)}
                        placeholder="e.g. iPhone 14 Pro Max or leave empty for serial-only"
                        readOnly={!!item.product_id}
                        style={{ background: item.product_id ? 'var(--bg-tertiary,#f3f4f6)' : '' }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Brand</label>
                      <input className="form-control" value={item.brand}
                        onChange={e => handleItemChange(i, 'brand', e.target.value)}
                        placeholder="Apple, Samsung..."
                        readOnly={!!item.product_id}
                        style={{ background: item.product_id ? 'var(--bg-tertiary,#f3f4f6)' : '' }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Color</label>
                      <input className="form-control" value={item.color}
                        onChange={e => handleItemChange(i, 'color', e.target.value)}
                        placeholder="Black, White..."
                        readOnly={!!item.product_id}
                        style={{ background: item.product_id ? 'var(--bg-tertiary,#f3f4f6)' : '' }} />
                    </div>
                  </div>

                  {/* Row 3: Type + Cost + Sell Price + Qty */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 0.7fr auto', gap: '8px', alignItems: 'end' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Type</label>
                      <select className="form-control" value={item.product_type}
                        onChange={e => handleItemChange(i, 'product_type', e.target.value)}>
                        {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Cost (AED) *</label>
                      <input type="number" className="form-control" value={item.unit_cost}
                        onChange={e => handleItemChange(i, 'unit_cost', e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Selling Price</label>
                      <input type="number" className="form-control" value={item.recommended_selling_price}
                        onChange={e => handleItemChange(i, 'recommended_selling_price', e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Qty</label>
                      <input type="number" min="1" className="form-control" value={item.qty}
                        onChange={e => handleItemChange(i, 'qty', e.target.value)} />
                    </div>
                    {form.items.length > 1 && (
                      <button onClick={() => removeItem(i)}
                        style={{ marginBottom: '2px', background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
                    )}
                  </div>

                  {/* Subtotal row */}
                  {item.unit_cost && item.qty && (
                    <div style={{ textAlign: 'right', fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Subtotal: <strong>AED {Math.round((parseFloat(item.qty)||0) * (parseFloat(item.unit_cost)||0)).toLocaleString()}</strong>
                      {item.recommended_selling_price && item.unit_cost && (
                        <span style={{ marginLeft: '12px' }}>
                          Margin: AED {Math.round(((parseFloat(item.recommended_selling_price)||0) - (parseFloat(item.unit_cost)||0)) * (parseFloat(item.qty)||0)).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div style={{ textAlign: 'right', marginTop: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>
                Total: <span style={{ color: 'var(--accent)' }}>AED {Math.round(total).toLocaleString()}</span>
                {form.payment_type === 'cash' && <span style={{ marginLeft: '16px', color: 'var(--accent-green)', fontSize: '.9rem' }}>Fully Paid</span>}
                {form.payment_type === 'credit' && !form.amount_paid && <span style={{ marginLeft: '16px', color: 'var(--accent-red)', fontSize: '.9rem' }}>Due: AED {Math.round(total).toLocaleString()}</span>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>Create Purchase</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div className="modal-overlay" onClick={() => setShowAddSupplier(false)}>
          <div className="modal" style={{ maxWidth: '480px', zIndex: 1100 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Add New Supplier</strong>
              <button className="modal-close" onClick={() => setShowAddSupplier(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Name *</label><input className="form-control" value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} placeholder="+971..." /></div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-control" value={supplierForm.email} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">City</label><input className="form-control" value={supplierForm.city} onChange={e => setSupplierForm({ ...supplierForm, city: e.target.value })} /></div>
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
