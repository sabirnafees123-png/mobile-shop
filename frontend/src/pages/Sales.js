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

// ── Print Invoice ────────────────────────────────────────────────────────────
function printInvoice(sale) {
  const items = (sale.items || []).map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.brand || ''} ${item.product_name || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">AED ${Math.round(item.unit_price).toLocaleString()}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">AED ${Math.round((item.qty||1)*item.unit_price).toLocaleString()}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${sale.invoice_number}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1a1a2e; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #1a1a2e; padding-bottom: 20px; }
        .shop-name { font-size: 24px; font-weight: bold; color: #1a1a2e; }
        .shop-sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
        .invoice-title { font-size: 28px; font-weight: bold; color: #6366f1; }
        .invoice-meta { font-size: 13px; color: #6b7280; text-align: right; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .detail-box { background: #f8f9fc; padding: 14px; border-radius: 8px; }
        .detail-label { font-size: 11px; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; }
        .detail-value { font-size: 14px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        thead tr { background: #1a1a2e; color: white; }
        thead th { padding: 10px 8px; text-align: left; font-size: 13px; }
        thead th:last-child, thead th:nth-child(3), thead th:nth-child(2) { text-align: right; }
        .totals { text-align: right; border-top: 2px solid #1a1a2e; padding-top: 12px; }
        .total-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 6px; font-size: 14px; }
        .total-final { font-size: 20px; font-weight: bold; color: #6366f1; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
          background: ${sale.payment_status==='paid'?'#d1fae5': sale.payment_status==='partial'?'#fef3c7':'#fee2e2'};
          color: ${sale.payment_status==='paid'?'#065f46': sale.payment_status==='partial'?'#92400e':'#dc2626'}; }
        .footer { margin-top: 40px; border-top: 1px solid #e8eaf0; padding-top: 16px; text-align: center; font-size: 12px; color: #9ca3af; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="shop-name">MobileShop</div>
          <div class="shop-sub">Sharjah Management System</div>
        </div>
        <div>
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-meta">
            <div><strong>${sale.invoice_number}</strong></div>
            <div>Date: ${fmtDate(sale.sale_date)}</div>
            <div><span class="status-badge">${sale.payment_status?.toUpperCase()}</span></div>
          </div>
        </div>
      </div>

      <div class="details">
        <div class="detail-box">
          <div class="detail-label">Customer</div>
          <div class="detail-value">${sale.customer_name || 'Walk-in Customer'}</div>
          ${sale.customer_phone ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;">${sale.customer_phone}</div>` : ''}
        </div>
        <div class="detail-box">
          <div class="detail-label">Payment</div>
          <div class="detail-value">${sale.payment_method?.toUpperCase()}</div>
          ${sale.notes ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;">${sale.notes}</div>` : ''}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:right;">Unit Price</th>
            <th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${items}</tbody>
      </table>

      <div class="totals">
        ${sale.discount > 0 ? `<div class="total-row"><span>Discount:</span><span style="color:#dc2626;">- AED ${Math.round(sale.discount).toLocaleString()}</span></div>` : ''}
        <div class="total-row total-final"><span>Total:</span><span>AED ${Math.round(sale.total_amount).toLocaleString()}</span></div>
        <div class="total-row" style="color:#059669;"><span>Paid:</span><span>AED ${Math.round(sale.amount_paid).toLocaleString()}</span></div>
        ${sale.amount_due > 0 ? `<div class="total-row" style="color:#dc2626;"><span>Due:</span><span>AED ${Math.round(sale.amount_due).toLocaleString()}</span></div>` : ''}
      </div>

      <div class="footer">
        Thank you for your business! · Generated on ${new Date().toLocaleDateString('en-AE')}
      </div>

      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

export default function Sales() {
  const [sales, setSales]         = useState([]);
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewSale, setViewSale]   = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [showReturn, setShowReturn]   = useState(null);
  const [returnNote, setReturnNote]   = useState('');
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

  const handleReturn = async () => {
    if (!returnNote) return toast.error('Please enter a return reason');
    try {
      await api.post(`/sales/${showReturn.id}/return`, { note: returnNote });
      toast.success('Return processed successfully');
      setShowReturn(null);
      setReturnNote('');
      setViewSale(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to process return');
    }
  };

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
        items[i].unit_price        = p.selling_price ? Math.round(p.selling_price).toString() : '';
        items[i].recommended_price = p.selling_price ? Math.round(p.selling_price).toString() : '';
        items[i].product_name      = p.name;
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

      <div className="card" style={{padding:'1rem',marginBottom:'1rem'}}>
        <input className="form-control" placeholder="🔍 Search invoice # or customer..."
          value={search} onChange={e => setSearch(e.target.value)} style={{maxWidth:'400px'}} />
      </div>

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
                      <div style={{display:'flex',gap:'4px'}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openView(s)} title="View">👁️</button>
                      </div>
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

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'1rem 0 0.5rem'}}>
                <strong>Items</strong>
                <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
              </div>

              {form.items.map((item, i) => (
                <div key={i} style={{background:'var(--bg-secondary)',borderRadius:'8px',padding:'0.75rem',marginBottom:'0.5rem'}}>
                  <div style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr 1fr 1fr auto',gap:'8px',alignItems:'end'}}>
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
                      <label className="form-label">Rec. Price</label>
                      <input type="number" className="form-control" value={item.recommended_price || ''}
                        readOnly style={{background:'var(--bg-tertiary,#f3f4f6)',color:'var(--text-muted)',cursor:'not-allowed'}} />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Qty</label>
                      <input type="number" min="1" className="form-control" value={item.qty}
                        onChange={e => updateItem(i, 'qty', e.target.value)} />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Selling Price</label>
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
                  {item.unit_price && item.qty && (
                    <div style={{textAlign:'right',fontSize:'.8rem',color:'var(--text-muted)',marginTop:'4px'}}>
                      Subtotal: AED {Math.round((parseFloat(item.qty)||0)*(parseFloat(item.unit_price)||0)).toLocaleString()}
                      {item.recommended_price && item.unit_price && (
                        <span style={{marginLeft:'12px',color: parseFloat(item.unit_price) >= parseFloat(item.recommended_price) ? 'var(--accent-green)' : 'var(--accent-red)'}}>
                          {parseFloat(item.unit_price) >= parseFloat(item.recommended_price) ? '✅ Above rec.' : '⚠️ Below rec.'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

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
          <div className="modal" style={{maxWidth:'650px'}} onClick={e => e.stopPropagation()}>
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
                      <th style={{textAlign:'left',padding:'8px 0'}}>Item</th>
                      <th style={{textAlign:'right',padding:'8px 0'}}>Qty</th>
                      <th style={{textAlign:'right',padding:'8px 0'}}>Price</th>
                      <th style={{textAlign:'right',padding:'8px 0'}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewSale.items || []).length === 0 ? (
                      <tr><td colSpan={4} style={{textAlign:'center',padding:'1rem',color:'var(--text-muted)'}}>No items</td></tr>
                    ) : (viewSale.items || []).map((item, i) => (
                      <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'8px 0'}}>
                          <strong>{item.brand || ''} {item.product_name || item.product_id}</strong>
                          {item.model && <span style={{color:'var(--text-muted)',fontSize:'.85rem'}}> — {item.model}</span>}
                        </td>
                        <td style={{textAlign:'right',padding:'8px 0'}}>{item.qty}</td>
                        <td style={{textAlign:'right',padding:'8px 0'}}>{fmt(item.unit_price)}</td>
                        <td style={{textAlign:'right',padding:'8px 0'}}>{fmt((item.qty||1)*item.unit_price)}</td>
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
              <button className="btn btn-ghost" style={{color:'var(--accent-red)'}}
                onClick={() => { setShowReturn(viewSale); setReturnNote(''); }}>
                🔄 Return
              </button>
              <button className="btn btn-primary" onClick={() => printInvoice(viewSale)}>
                🖨️ Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Return Modal ── */}
      {showReturn && (
        <div className="modal-overlay" onClick={() => setShowReturn(null)}>
          <div className="modal" style={{maxWidth:'420px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔄 Process Return</strong>
              <button className="modal-close" onClick={() => setShowReturn(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{padding:'12px',background:'#fef3c7',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem',color:'#92400e'}}>
                ⚠️ This will reverse invoice <strong>{showReturn.invoice_number}</strong> — restoring inventory and reversing customer balance.
              </div>
              <div className="form-group">
                <label className="form-label">Return Reason *</label>
                <input className="form-control" value={returnNote}
                  onChange={e => setReturnNote(e.target.value)}
                  placeholder="e.g. Defective product, customer return..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowReturn(null)}>Cancel</button>
              <button className="btn btn-primary" style={{background:'var(--accent-red)'}} onClick={handleReturn}>
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
