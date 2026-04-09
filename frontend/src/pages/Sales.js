// src/pages/Sales.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import ShopSelector from '../components/ShopSelector';

const mkEmpty = () => ({
  customer_name: '', customer_phone: '',
  sale_date: new Date().toISOString().split('T')[0],
  payment_method: 'cash', amount_paid: '', discount: 0, notes: '',
  shop_id: '',
  items: [{ product_id: '', product_name: '', qty: 1, unit_price: '', discount: 0 }],
});

const fmt     = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

// ── Print Invoice ─────────────────────────────────────────────
function printInvoice(sale, shopName) {
  const items = (sale.items || []).map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.brand || ''} ${item.product_name || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">AED ${Math.round(item.unit_price).toLocaleString()}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">AED ${Math.round((item.qty || 1) * item.unit_price).toLocaleString()}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><title>Invoice ${sale.invoice_number}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#1a1a2e}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;border-bottom:2px solid #1a1a2e;padding-bottom:20px}
      .shop-name{font-size:24px;font-weight:bold;color:#1a1a2e}
      .shop-sub{font-size:12px;color:#6b7280;margin-top:4px}
      .invoice-title{font-size:28px;font-weight:bold;color:#6366f1}
      .invoice-meta{font-size:13px;color:#6b7280;text-align:right}
      .details{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
      .detail-box{background:#f8f9fc;padding:14px;border-radius:8px}
      .detail-label{font-size:11px;color:#6b7280;text-transform:uppercase;margin-bottom:6px}
      .detail-value{font-size:14px;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      thead tr{background:#1a1a2e;color:white}
      thead th{padding:10px 8px;text-align:left;font-size:13px}
      .totals{text-align:right;border-top:2px solid #1a1a2e;padding-top:12px}
      .total-row{display:flex;justify-content:flex-end;gap:20px;margin-bottom:6px;font-size:14px}
      .total-final{font-size:20px;font-weight:bold;color:#6366f1}
      .footer{margin-top:40px;border-top:1px solid #e8eaf0;padding-top:16px;text-align:center;font-size:12px;color:#9ca3af}
      .status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;
        background:${sale.payment_status === 'paid' ? '#d1fae5' : sale.payment_status === 'partial' ? '#fef3c7' : '#fee2e2'};
        color:${sale.payment_status === 'paid' ? '#065f46' : sale.payment_status === 'partial' ? '#92400e' : '#dc2626'}}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <div>
        <div class="shop-name">${shopName || 'MobileShop'}</div>
        <div class="shop-sub">Sharjah · UAE</div>
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
      <thead><tr>
        <th>Item</th><th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Unit Price</th><th style="text-align:right;">Total</th>
      </tr></thead>
      <tbody>${items}</tbody>
    </table>
    <div class="totals">
      ${sale.discount > 0 ? `<div class="total-row"><span>Discount:</span><span style="color:#dc2626;">- AED ${Math.round(sale.discount).toLocaleString()}</span></div>` : ''}
      <div class="total-row total-final"><span>Total:</span><span>AED ${Math.round(sale.total_amount).toLocaleString()}</span></div>
      <div class="total-row" style="color:#059669;"><span>Paid:</span><span>AED ${Math.round(sale.amount_paid).toLocaleString()}</span></div>
      ${sale.amount_due > 0 ? `<div class="total-row" style="color:#dc2626;"><span>Due:</span><span>AED ${Math.round(sale.amount_due).toLocaleString()}</span></div>` : ''}
    </div>
    <div class="footer">Thank you for your business! · Generated on ${new Date().toLocaleDateString('en-AE')}</div>
    <script>window.onload = () => window.print();</script>
    </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

export default function Sales() {
  const [sales, setSales]         = useState([]);
  const [products, setProducts]   = useState([]);
  const [shops, setShops]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewSale, setViewSale]   = useState(null);
  const [form, setForm]           = useState(mkEmpty());
  const [filterShop, setFilterShop] = useState('');

  const load = (sid) => {
    setLoading(true);
    const params = sid ? `?shop_id=${sid}` : '';
    Promise.all([
      api.get(`/sales${params}`),
      api.get('/products'),
      api.get('/shops'),
    ])
      .then(([s, p, sh]) => {
        setSales(s.data?.data || []);
        setProducts(p.data?.data || []);
        setShops(sh.data?.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filterShop); }, [filterShop]);

  const openAdd = () => {
    setForm({
      ...mkEmpty(),
      // Pre-select shop if only one, or last used
      shop_id: shops.length === 1 ? shops[0].id : (filterShop || ''),
    });
    setShowModal(true);
  };

  const openView = async (sale) => {
    setViewSale({ ...sale, items: [] });
    try {
      const res = await api.get(`/sales/${sale.id}`);
      setViewSale(res.data?.data || sale);
    } catch { toast.error('Failed to load sale details'); }
  };

  const addItem    = () => setForm({ ...form, items: [...form.items, { product_id: '', qty: 1, unit_price: '', discount: 0 }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  const updateItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    setForm({ ...form, items });
  };

  const total    = form.items.reduce((s, i) => s + ((parseFloat(i.qty) || 0) * (parseFloat(i.unit_price) || 0)), 0);
  const grandTotal = total - parseFloat(form.discount || 0);

  const handleSubmit = async () => {
    if (!form.shop_id)   return toast.error('Please select a shop');
    if (form.items.some(i => !i.product_id || !i.unit_price)) return toast.error('Each item needs a product and price');
    try {
      const payload = {
        ...form,
        amount_paid:  parseFloat(form.amount_paid || 0),
        discount:     parseFloat(form.discount || 0),
        items: form.items.map(i => ({
          product_id: i.product_id,
          qty:        parseInt(i.qty) || 1,
          unit_price: parseFloat(i.unit_price),
          discount:   parseFloat(i.discount || 0),
        })),
      };
      await api.post('/sales', payload);
      toast.success('Invoice created!');
      setShowModal(false);
      setForm(mkEmpty());
      load(filterShop);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
  };

  const handleReturn = async (id) => {
    if (!window.confirm('Process return for this invoice?')) return;
    try {
      await api.post(`/sales/${id}/return`, { note: 'Customer return' });
      toast.success('Return processed');
      load(filterShop);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const shopName = (id) => shops.find(s => s.id === id)?.name || '';

  const statusColor = s => s === 'paid' ? '#059669' : s === 'partial' ? '#d97706' : s === 'returned' ? '#6b7280' : '#dc2626';

  return (
    <div>
      <div className='page-header'>
        <div>
          <div className='page-title'>Sales</div>
          <div className='page-subtitle'>{sales.length} invoice(s)</div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <ShopSelector shops={shops} value={filterShop} onChange={setFilterShop} includeAll={true} label='Filter' />
          <button className='btn-primary' onClick={openAdd}>+ New Invoice</button>
        </div>
      </div>

      {loading ? <div className='loading'>Loading...</div> : (
        <div className='table-container'>
          <table className='table'>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Shop</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No invoices found</td></tr>
              ) : sales.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.invoice_number}</strong></td>
                  <td>{fmtDate(s.sale_date)}</td>
                  <td>{s.customer_name || 'Walk-in'}</td>
                  <td>
                    <span style={{ background: 'var(--surface-alt)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.8rem' }}>
                      {s.shop_name || '—'}
                    </span>
                  </td>
                  <td>{fmt(s.total_amount)}</td>
                  <td style={{ color: '#059669' }}>{fmt(s.amount_paid)}</td>
                  <td style={{ color: s.amount_due > 0 ? '#dc2626' : 'inherit' }}>{fmt(s.amount_due)}</td>
                  <td>
                    <span style={{ color: statusColor(s.payment_status), fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                      {s.payment_status}
                    </span>
                  </td>
                  <td>
                    <button className='btn-sm' onClick={() => openView(s)}>View</button>
                    <button className='btn-sm' onClick={() => printInvoice(s, s.shop_name)} style={{ marginLeft: '4px' }}>Print</button>
                    {s.payment_status !== 'returned' && (
                      <button className='btn-sm btn-danger' onClick={() => handleReturn(s.id)} style={{ marginLeft: '4px' }}>Return</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New Invoice Modal ── */}
      {showModal && (
        <div className='modal-overlay' onClick={() => setShowModal(false)}>
          <div className='modal' style={{ maxWidth: '760px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>New Sales Invoice</h3>
              <button className='modal-close' onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className='modal-body' style={{ maxHeight: '75vh', overflowY: 'auto' }}>

              {/* Shop selector — required */}
              <div className='form-row' style={{ background: 'var(--surface-alt)', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px' }}>
                <div className='form-group' style={{ flex: 1 }}>
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

              {/* Customer + Date */}
              <div className='form-row'>
                <div className='form-group'>
                  <label>Customer Name</label>
                  <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder='Walk-in Customer' />
                </div>
                <div className='form-group'>
                  <label>Customer Phone</label>
                  <input value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} placeholder='+971...' />
                </div>
                <div className='form-group'>
                  <label>Date</label>
                  <input type='date' value={form.sale_date} onChange={e => setForm({ ...form, sale_date: e.target.value })} />
                </div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 600 }}>Items</label>
                  <button className='btn-sm' onClick={addItem}>+ Add Item</button>
                </div>
                {form.items.map((item, i) => (
                  <div key={i} className='form-row' style={{ alignItems: 'flex-end', background: 'var(--surface-alt)', padding: '8px', borderRadius: '8px', marginBottom: '8px' }}>
                    <div className='form-group' style={{ flex: 2 }}>
                      <label>Product</label>
                      <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                        <option value=''>Select product</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.brand} {p.name}</option>)}
                      </select>
                    </div>
                    <div className='form-group' style={{ flex: '0 0 70px' }}>
                      <label>Qty</label>
                      <input type='number' min='1' value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                    </div>
                    <div className='form-group' style={{ flex: 1 }}>
                      <label>Price (AED)</label>
                      <input type='number' value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} placeholder='0' />
                    </div>
                    <div className='form-group' style={{ flex: 1 }}>
                      <label>Discount</label>
                      <input type='number' value={item.discount} onChange={e => updateItem(i, 'discount', e.target.value)} placeholder='0' />
                    </div>
                    {form.items.length > 1 && (
                      <button className='btn-sm btn-danger' style={{ marginBottom: '4px' }} onClick={() => removeItem(i)}>×</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Payment */}
              <div className='form-row'>
                <div className='form-group'>
                  <label>Payment Method</label>
                  <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                    <option value='cash'>Cash</option>
                    <option value='card'>Card</option>
                    <option value='bank_transfer'>Bank Transfer</option>
                    <option value='installment'>Installment</option>
                    <option value='mixed'>Mixed</option>
                  </select>
                </div>
                <div className='form-group'>
                  <label>Invoice Discount (AED)</label>
                  <input type='number' value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} placeholder='0' />
                </div>
                <div className='form-group'>
                  <label>Amount Paid (AED)</label>
                  <input type='number' value={form.amount_paid} onChange={e => setForm({ ...form, amount_paid: e.target.value })} placeholder='0' />
                </div>
              </div>

              <div className='form-group'>
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder='Optional notes...' />
              </div>

              {/* Totals summary */}
              <div style={{ background: 'var(--surface-alt)', padding: '12px 16px', borderRadius: '8px', textAlign: 'right' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Subtotal: {fmt(total)}
                  {parseFloat(form.discount) > 0 && <> · Discount: -{fmt(form.discount)}</>}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>Grand Total: {fmt(grandTotal)}</div>
                <div style={{ color: grandTotal - parseFloat(form.amount_paid || 0) > 0 ? '#dc2626' : '#059669', fontSize: '0.95rem', marginTop: '4px' }}>
                  Due: {fmt(Math.max(0, grandTotal - parseFloat(form.amount_paid || 0)))}
                </div>
              </div>
            </div>
            <div className='modal-footer'>
              <button className='btn-secondary' onClick={() => setShowModal(false)}>Cancel</button>
              <button className='btn-primary' onClick={handleSubmit}>Create Invoice</button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Sale Modal ── */}
      {viewSale && (
        <div className='modal-overlay' onClick={() => setViewSale(null)}>
          <div className='modal' style={{ maxWidth: '640px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>{viewSale.invoice_number}</h3>
              <button className='modal-close' onClick={() => setViewSale(null)}>×</button>
            </div>
            <div className='modal-body'>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Customer</span><br /><strong>{viewSale.customer_name || 'Walk-in'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Shop</span><br /><strong>{viewSale.shop_name || '—'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Date</span><br />{fmtDate(viewSale.sale_date)}</div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Payment</span><br />{viewSale.payment_method}</div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Total</span><br /><strong>{fmt(viewSale.total_amount)}</strong></div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sold by</span><br />{viewSale.sold_by || '—'}</div>
              </div>
              {(viewSale.items || []).length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Product</th>
                    <th style={{ textAlign: 'center', padding: '6px' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>Price</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>Total</th>
                  </tr></thead>
                  <tbody>
                    {viewSale.items.map((it, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px' }}>{it.brand} {it.product_name}</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>{it.qty}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{fmt(it.unit_price)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{fmt(it.qty * it.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className='modal-footer'>
              <button className='btn-secondary' onClick={() => setViewSale(null)}>Close</button>
              <button className='btn-primary' onClick={() => printInvoice(viewSale, viewSale.shop_name)}>Print Invoice</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
