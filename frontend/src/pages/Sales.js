import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY_FORM = {
  customer_name: '', customer_phone: '',
  sale_date: new Date().toISOString().split('T')[0],
  payment_method: 'cash', amount_paid: '', discount: 0, notes: '',
  items: [{ product_id: '', product_name: '', qty: 1, unit_price: '', discount: 0 }]
};

export default function Sales() {
  const [sales, setSales]       = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewSale, setViewSale]   = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [search, setSearch]       = useState('');
  const currency = process.env.REACT_APP_CURRENCY || 'AED';
  const fmt = n => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/sales'), api.get('/products')])
      .then(([s, p]) => {
        setSales(s.data?.data || []);
        setProducts(p.data?.data || []);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── item helpers ──
  const addItem = () => setForm(f => ({
    ...f, items: [...f.items, { product_id: '', product_name: '', qty: 1, unit_price: '', discount: 0 }]
  }));

  const removeItem = i => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const updateItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    // Auto-fill price when product selected
    if (key === 'product_id') {
      const p = products.find(p => p.id === val);
      if (p) {
        items[i].unit_price  = p.selling_price || '';
        items[i].product_name = p.name;
      }
    }
    setForm(f => ({ ...f, items }));
  };

  const subtotal = form.items.reduce((s, i) => s + ((parseFloat(i.qty) || 0) * (parseFloat(i.unit_price) || 0)), 0);
  const total    = subtotal - (parseFloat(form.discount) || 0);

  const handleSubmit = async () => {
    if (form.items.some(i => !i.product_id || !i.unit_price))
      return toast.error('Each item needs a product and price');
    try {
      const payload = {
        ...form,
        discount:    parseFloat(form.discount)    || 0,
        amount_paid: parseFloat(form.amount_paid) || total,
        items: form.items.map(i => ({
          product_id: i.product_id,
          qty:        parseInt(i.qty) || 1,
          unit_price: parseFloat(i.unit_price),
          discount:   parseFloat(i.discount) || 0,
        }))
      };
      const res = await api.post('/sales', payload);
      toast.success(res.data.message || 'Sale created!');
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create sale');
    }
  };

  const payStatus = s => ({ paid: 'badge-green', partial: 'badge-yellow', unpaid: 'badge-red' }[s] || 'badge-gray');

  // ── filtered sales ──
  const filtered = sales.filter(s =>
    !search ||
    s.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    s.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🧾 Sales / Invoices</div>
          <div className="page-subtitle">All customer sales</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowModal(true); }}>
          + New Sale
        </button>
      </div>

      {/* Search */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <input className="form-control" placeholder="🔍 Search invoice # or customer..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: '400px' }} />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10}>
                    <div className="empty-state"><p>No sales yet — click + New Sale</p></div>
                  </td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id}>
                    <td><span className="badge badge-blue">{s.invoice_number}</span></td>
                    <td>{s.customer_name || <span style={{ color: 'var(--text-muted)' }}>Walk-in</span>}</td>
                    <td>{new Date(s.sale_date).toLocaleDateString('en-AE')}</td>
                    <td>{s.item_count}</td>
                    <td><strong>{fmt(s.total_amount)}</strong></td>
                    <td style={{ color: 'var(--accent-green)' }}>{fmt(s.amount_paid)}</td>
                    <td style={{ color: s.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {fmt(s.amount_due)}
                    </td>
                    <td><span className="badge badge-blue">{s.payment_method}</span></td>
                    <td><span className={`badge ${payStatus(s.payment_status)}`}>{s.payment_status}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setViewSale(s)} title="View Invoice">
                        👁️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Sale Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🧾 New Sale</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* Customer + Date */}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Customer Name</label>
                  <input className="form-control" placeholder="Optional — leave blank for walk-in"
                    value={form.customer_name}
                    onChange={e => setForm({ ...form, customer_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer Phone</label>
                  <input className="form-control" placeholder="+971..."
                    value={form.customer_phone}
                    onChange={e => setForm({ ...form, customer_phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sale Date</label>
                  <input type="date" className="form-control" value={form.sale_date}
                    onChange={e => setForm({ ...form, sale_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-control" value={form.payment_method}
                    onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1rem 0 0.5rem' }}>
                <strong>Items</strong>
                <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
              </div>

              {form.items.map((item, i) => (
                <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
                  <div className="form-grid" style={{ gridTemplateColumns: '3fr 1fr 1fr auto' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Product *</label>
                      <select className="form-control" value={item.product_id}
                        onChange={e => updateItem(i, 'product_id', e.target.value)}>
                        <option value="">Select product...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.brand ? `(${p.brand})` : ''} {p.storage ? `- ${p.storage}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Qty</label>
                      <input type="number" min="1" className="form-control" value={item.qty}
                        onChange={e => updateItem(i, 'qty', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Price ({currency})</label>
                      <input type="number" className="form-control" value={item.unit_price}
                        onChange={e => updateItem(i, 'unit_price', e.target.value)} placeholder="0.00" />
                    </div>
                    {form.items.length > 1 && (
                      <button onClick={() => removeItem(i)}
                        style={{ marginTop: '1.5rem', background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '1.2rem' }}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Totals */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '1rem', marginTop: '0.5rem' }}>
                <div className="form-grid">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Discount ({currency})</label>
                    <input type="number" className="form-control" value={form.discount}
                      onChange={e => setForm({ ...form, discount: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Amount Paid ({currency})</label>
                    <input type="number" className="form-control" value={form.amount_paid}
                      onChange={e => setForm({ ...form, amount_paid: e.target.value })}
                      placeholder={total.toFixed(2)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Notes</label>
                    <input className="form-control" value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginTop: '0.75rem', fontSize: '1.1rem', fontWeight: 700 }}>
                  Subtotal: {fmt(subtotal)}
                  {form.discount > 0 && <span style={{ color: 'var(--accent-red)', marginLeft: '1rem' }}>- {fmt(form.discount)}</span>}
                  <span style={{ color: 'var(--accent)', marginLeft: '1rem' }}>Total: {fmt(total)}</span>
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>Create Sale</button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Invoice Modal ── */}
      {viewSale && (
        <div className="modal-overlay" onClick={() => setViewSale(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Invoice {viewSale.invoice_number}</strong>
              <button className="modal-close" onClick={() => setViewSale(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
                <div><strong>Customer:</strong> {viewSale.customer_name || 'Walk-in'}</div>
                <div><strong>Date:</strong> {new Date(viewSale.sale_date).toLocaleDateString('en-AE')}</div>
                <div><strong>Method:</strong> {viewSale.payment_method}</div>
                <div><strong>Status:</strong> <span className={`badge ${payStatus(viewSale.payment_status)}`}>{viewSale.payment_status}</span></div>
              </div>
              <table style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0' }}>Item</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Price</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewSale.items || []).map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem 0' }}>{item.product_name || item.product_id}</td>
                      <td style={{ textAlign: 'right', padding: '0.5rem 0' }}>{item.qty}</td>
                      <td style={{ textAlign: 'right', padding: '0.5rem 0' }}>{fmt(item.unit_price)}</td>
                      <td style={{ textAlign: 'right', padding: '0.5rem 0' }}>{fmt(item.qty * item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'right', marginTop: '1rem', fontWeight: 700 }}>
                {viewSale.discount > 0 && <div>Discount: - {fmt(viewSale.discount)}</div>}
                <div style={{ fontSize: '1.1rem', color: 'var(--accent)' }}>Total: {fmt(viewSale.total_amount)}</div>
                <div style={{ color: 'var(--accent-green)' }}>Paid: {fmt(viewSale.amount_paid)}</div>
                {viewSale.amount_due > 0 && <div style={{ color: 'var(--accent-red)' }}>Due: {fmt(viewSale.amount_due)}</div>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setViewSale(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}