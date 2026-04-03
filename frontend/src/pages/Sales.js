// src/pages/Sales.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY_FORM = {
  customer_name: '', customer_phone: '',
  sale_date: new Date().toISOString().split('T')[0],
  payment_method: 'cash', amount_paid: '', discount: 0, notes: '',
  items: [{ product_id: '', product_name: '', qty: 1, unit_price: '', recommended_price: '', discount: 0 }]
};

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

export default function Sales() {
  const [sales, setSales]         = useState([]);
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewSale, setViewSale]   = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [search, setSearch]       = useState('');

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

  // ── Open invoice view — fetch full details with items ──
  const openView = async (sale) => {
    setViewSale({ ...sale, items: [] });
    setViewLoading(true);
    try {
      const res = await api.get(`/sales/${sale.id}`);
      setViewSale(res.data?.data || sale);
    } catch {
      toast.error('Failed to load invoice details');
    } finally {
      setViewLoading(false);
    }
  };

  // ── item helpers ──
  const addItem = () => setForm(f => ({
    ...f, items: [...f.items, { product_id: '', product_name: '', qty: 1, unit_price: '', recommended_price: '', discount: 0 }]
  }));

  const removeItem = i => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const updateItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    if (key === 'product_id') {
      const p = products.find(p => p.id === val);
      if (p) {
        items[i].unit_price       = p.selling_price ? Math.round(p.selling_price).toString() : '';
        items[i].recommended_price = p.selling_price ? Math.round(p.selling_price).toString() : '';
        items[i].product_name     = p.name;
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
          value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: '400px' }} />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th><th>Customer</th><th>Date</th><th>Items</th>
                  <th>Total</th><th>Paid</th><th>Due</th><th>Method</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10}><div className="empty-state"><p>No sales yet</p></div></td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id}>
                    <td><span className="badge badge-blue">{s.invoice_number}</span></td>
                    <td>{s.customer_name || <span style={{color:'var(--text-muted)'}}>Walk-in</span>}</td>
                    <td>{fmtDate(s.sale_date)}</td>
                    <td>{s.item_count}</td>
                    <td><strong>{fmt(s.total_amount)}</strong></td>
                    <td style={{color:'var(--accent-green)'}}>{fmt(s.amount_paid)}</td>
                    <td style={{color: s.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}}>{fmt(s.amount_due)}</td>
                    <td><span className="badge badge-blue">{s.payment_method}</span></td>
                    <td><span className={`badge ${payStatus(s.payment_status)}`}>{s.payment_status}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openView(s)} title="View">👁️</button>
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
          <div className="modal" style={{maxWidth:'820px',maxHeight:'90vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🧾 New Sale</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Customer Name</label>
                  <input className="form-control" placeholder="Optional — walk-in"
                    value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer Phone</label>
                  <input className="form-control" placeholder="+971..."
                    value={form.customer_phone} onChange={e => setForm({...form, customer_phone: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sale Date</label>
                  <input type="date" className="form-control" value={form.sale_date}
                    onChange={e => setForm({...form, sale_date: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-control" value={form.payment_method}
                    onChange={e => setForm({...form, payment_method: e.target.value})}>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'1rem 0 0.5rem'}}>
                <strong>Items</strong>
                <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
              </div>

              {form.items.map((item, i) => (
                <div key={i} style={{background:'var(--bg-secondary)',borderRadius:'8px',padding:'0.75rem',marginBottom:'0.5rem'}}>
                  <div style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr 1fr auto',gap:'8px',alignItems:'end'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Product *</label>
                      <select className="form-control" value={item.product_id}
                        onChange={e => updateItem(i, 'product_id', e.target.value)}>
                        <option value="">Select product...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.brand} {p.name} {p.storage ? `- ${p.storage}` : ''} {p.color ? `(${p.color})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Qty</label>
                      <input type="number" min="1" className="form-control" value={item.qty}
                        onChange={e => updateItem(i, 'qty', e.target.value)} />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">
                        Price (AED)
                        {item.recommended_price && (
                          <span style={{color:'var(--accent-green)',fontSize:'.75rem',marginLeft:'6px'}}>
                            rec: {Math.round(item.recommended_price)}
                          </span>
                        )}
                      </label>
                      <input type="number" className="form-control" value={item.unit_price}
                        onChange={e => updateItem(i, 'unit_price', e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Discount</label>
                      <input type="number" className="form-control" value={item.discount}
                        onChange={e => updateItem(i, 'discount', e.target.value)} placeholder="0" />
                    </div>
                    {form.items.length > 1 && (
                      <button onClick={() => removeItem(i)}
                        style={{marginBottom:'2px',background:'none',border:'none',color:'var(--accent-red)',cursor:'pointer',fontSize:'1.2rem'}}>✕</button>
                    )}
                  </div>
                  {/* Row subtotal */}
                  {item.unit_price && item.qty && (
                    <div style={{textAlign:'right',fontSize:'.8rem',color:'var(--text-muted)',marginTop:'4px'}}>
                      Subtotal: AED {Math.round((parseFloat(item.qty)||0)*(parseFloat(item.unit_price)||0)).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}

              {/* Totals */}
              <div style={{background:'var(--bg-secondary)',borderRadius:'8px',padding:'1rem',marginTop:'0.5rem'}}>
                <div className="form-grid">
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Discount (AED)</label>
                    <input type="number" className="form-control" value={form.discount}
                      onChange={e => setForm({...form, discount: e.target.value})} placeholder="0" />
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Amount Paid (AED)</label>
                    <input type="number" className="form-control" value={form.amount_paid}
                      onChange={e => setForm({...form, amount_paid: e.target.value})}
                      placeholder={Math.round(total).toString()} />
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Notes</label>
                    <input className="form-control" value={form.notes}
                      onChange={e => setForm({...form, notes: e.target.value})} />
                  </div>
                </div>
                <div style={{textAlign:'right',marginTop:'0.75rem',fontSize:'1.1rem',fontWeight:700}}>
                  Subtotal: {fmt(subtotal)}
                  {form.discount > 0 && <span style={{color:'var(--accent-red)',marginLeft:'1rem'}}>- {fmt(form.discount)}</span>}
                  <span style={{color:'var(--accent)',marginLeft:'1rem'}}>Total: {fmt(total)}</span>
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
          <div className="modal" style={{maxWidth:'620px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Invoice {viewSale.invoice_number}</strong>
              <button className="modal-close" onClick={() => setViewSale(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem',marginBottom:'1rem',fontSize:'0.9rem'}}>
                <div><strong>Customer:</strong> {viewSale.customer_name || 'Walk-in'}</div>
                <div><strong>Date:</strong> {fmtDate(viewSale.sale_date)}</div>
                <div><strong>Method:</strong> {viewSale.payment_method}</div>
                <div><strong>Status:</strong> <span className={`badge ${payStatus(viewSale.payment_status)}`}>{viewSale.payment_status}</span></div>
                {viewSale.notes && <div style={{gridColumn:'1/-1'}}><strong>Notes:</strong> {viewSale.notes}</div>}
              </div>

              {viewLoading ? (
                <div style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>Loading items...</div>
              ) : (
                <table style={{width:'100%',fontSize:'0.9rem',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{borderBottom:'2px solid var(--border)'}}>
                      <th style={{textAlign:'left',padding:'0.5rem 0'}}>Item</th>
                      <th style={{textAlign:'right',padding:'0.5rem 0'}}>Qty</th>
                      <th style={{textAlign:'right',padding:'0.5rem 0'}}>Price</th>
                      <th style={{textAlign:'right',padding:'0.5rem 0'}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewSale.items || []).length === 0 ? (
                      <tr><td colSpan={4} style={{textAlign:'center',padding:'1rem',color:'var(--text-muted)'}}>No items found</td></tr>
                    ) : (viewSale.items || []).map((item, i) => (
                      <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'0.5rem 0'}}>
                          <strong>{item.brand || ''} {item.product_name || item.product_id}</strong>
                          {item.model && <span style={{color:'var(--text-muted)',fontSize:'.85rem'}}> — {item.model}</span>}
                        </td>
                        <td style={{textAlign:'right',padding:'0.5rem 0'}}>{item.qty}</td>
                        <td style={{textAlign:'right',padding:'0.5rem 0'}}>{fmt(item.unit_price)}</td>
                        <td style={{textAlign:'right',padding:'0.5rem 0'}}>{fmt((item.qty||1) * item.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{textAlign:'right',marginTop:'1rem',fontWeight:700}}>
                {viewSale.discount > 0 && <div style={{color:'var(--accent-red)'}}>Discount: - {fmt(viewSale.discount)}</div>}
                <div style={{fontSize:'1.1rem',color:'var(--accent)'}}>Total: {fmt(viewSale.total_amount)}</div>
                <div style={{color:'var(--accent-green)'}}>Paid: {fmt(viewSale.amount_paid)}</div>
                {viewSale.amount_due > 0 && <div style={{color:'var(--accent-red)'}}>Due: {fmt(viewSale.amount_due)}</div>}
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
