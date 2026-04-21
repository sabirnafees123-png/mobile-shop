// src/pages/Sales.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY_FORM = () => ({
  customer_name: '', customer_phone: '+971',
  sale_date: new Date().toISOString().split('T')[0],
  payment_method: 'cash', amount_paid: '', discount: 0, notes: '',
  shop_id: '', pending_amount: '',
  is_exchange: false,
  exchange_product_name: '', exchange_serial_number: '', exchange_trade_in_value: '',
  items: [{ product_id: '', product_name: '', serial_number: '', qty: 1, unit_price: '', recommended_price: '', unit_cost: '' }],
});

const fmt     = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => { try { return new Date(d).toLocaleDateString('en-AE'); } catch { return d; } };
const paymentColor = m => ({ cash:'#059669', card:'#2563eb', bank_transfer:'#7c3aed', tabby:'#0ea5e9', tamara:'#f59e0b', pending:'#dc2626' }[m] || '#6b7280');
const statusColor  = s => ({ paid:'#059669', partial:'#d97706', unpaid:'#dc2626', returned:'#6b7280', payment_pending:'#2563eb' }[s] || '#6b7280');

function printInvoice(sale) {
  const items = (sale.items||[]).map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.brand||''} ${item.product_name||''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;color:#888;">${item.serial_number||''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">AED ${Math.round(item.unit_price).toLocaleString()}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">AED ${Math.round((item.qty||1)*item.unit_price).toLocaleString()}</td>
    </tr>`).join('');
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${sale.invoice_number}</title>
  <style>body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#1a1a2e}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#1a1a2e;color:white}thead th{padding:10px 8px;text-align:left;font-size:13px}
  .totals{text-align:right;border-top:2px solid #1a1a2e;padding-top:12px}
  .total-row{display:flex;justify-content:flex-end;gap:20px;margin-bottom:6px;font-size:14px}
  @media print{body{padding:0}}</style></head><body>
  <div style="display:flex;justify-content:space-between;margin-bottom:30px;border-bottom:2px solid #1a1a2e;padding-bottom:20px">
    <div><div style="font-size:22px;font-weight:bold">${sale.shop_name||'MobileShop'}</div><div style="font-size:12px;color:#888">Sharjah · UAE</div></div>
    <div style="text-align:right"><div style="font-size:26px;font-weight:bold;color:#6366f1">INVOICE</div>
    <div><strong>${sale.invoice_number}</strong></div><div>${fmtDate(sale.sale_date)}</div>
    ${sale.is_exchange?'<div style="color:#f59e0b;font-weight:bold">EXCHANGE</div>':''}</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <div style="background:#f8f9fc;padding:12px;border-radius:8px">
      <div style="font-size:11px;color:#888;text-transform:uppercase">Customer</div>
      <div style="font-weight:600">${sale.customer_name||'Walk-in'}</div>
      ${sale.customer_phone?`<div style="font-size:12px;color:#888">${sale.customer_phone}</div>`:''}
    </div>
    <div style="background:#f8f9fc;padding:12px;border-radius:8px">
      <div style="font-size:11px;color:#888;text-transform:uppercase">Payment</div>
      <div style="font-weight:600">${(sale.payment_method||'').toUpperCase()}</div>
    </div>
  </div>
  <table><thead><tr><th>Item</th><th>Serial</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${items}</tbody></table>
  ${sale.is_exchange?`<div style="background:#fef3c7;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px">
  <strong>Exchange:</strong> ${sale.exchange_product_name||''} (S/N: ${sale.exchange_serial_number||''}) — Trade-in: AED ${Math.round(sale.exchange_trade_in_value||0).toLocaleString()}</div>`:''}
  <div class="totals">
    ${sale.discount>0?`<div class="total-row"><span>Discount:</span><span style="color:#dc2626">- AED ${Math.round(sale.discount).toLocaleString()}</span></div>`:''}
    <div class="total-row" style="font-size:20px;font-weight:bold;color:#6366f1"><span>Total:</span><span>AED ${Math.round(sale.total_amount).toLocaleString()}</span></div>
    <div class="total-row" style="color:#059669"><span>Paid:</span><span>AED ${Math.round(sale.amount_paid).toLocaleString()}</span></div>
    ${sale.amount_due>0?`<div class="total-row" style="color:#dc2626"><span>Due:</span><span>AED ${Math.round(sale.amount_due).toLocaleString()}</span></div>`:''}
  </div>
  <div style="margin-top:40px;border-top:1px solid #e8eaf0;padding-top:16px;text-align:center;font-size:12px;color:#9ca3af">
    Thank you for your business! · ${new Date().toLocaleDateString('en-AE')}</div>
  <script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
}

// Expanded row component — loads items on demand
function SaleExpandedRow({ saleId, colSpan }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/sales/${saleId}`)
      .then(r => setData(r.data?.data))
      .finally(() => setLoading(false));
  }, [saleId]);

  if (loading) return (
    <tr style={{background:'#f8f9fc'}}>
      <td colSpan={colSpan} style={{padding:'12px 24px',color:'#6b7280',fontSize:'.85rem'}}>Loading items...</td>
    </tr>
  );
  if (!data) return null;

  return (
    <tr style={{background:'#f8f9fc',borderBottom:'2px solid #e8eaf0'}}>
      <td colSpan={colSpan} style={{padding:'12px 24px'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}}>
          <thead>
            <tr style={{background:'#f1f2f6'}}>
              <th style={{padding:'6px 10px',textAlign:'left',fontSize:'.75rem',color:'#6b7280'}}>Product</th>
              <th style={{padding:'6px 10px',textAlign:'left',fontSize:'.75rem',color:'#6b7280'}}>Serial / IMEI</th>
              <th style={{padding:'6px 10px',textAlign:'right',fontSize:'.75rem',color:'#6b7280'}}>Qty</th>
              <th style={{padding:'6px 10px',textAlign:'right',fontSize:'.75rem',color:'#6b7280'}}>Cost</th>
              <th style={{padding:'6px 10px',textAlign:'right',fontSize:'.75rem',color:'#6b7280'}}>Selling</th>
              <th style={{padding:'6px 10px',textAlign:'right',fontSize:'.75rem',color:'#6b7280'}}>Margin</th>
              <th style={{padding:'6px 10px',textAlign:'right',fontSize:'.75rem',color:'#6b7280'}}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(data.items||[]).map((item,i) => {
              const margin = (parseFloat(item.unit_price)||0) - (parseFloat(item.unit_cost)||0);
              return (
                <tr key={i} style={{borderBottom:'1px solid #e8eaf0'}}>
                  <td style={{padding:'8px 10px',fontWeight:600}}>{item.brand||''} {item.product_name||''}</td>
                  <td style={{padding:'8px 10px',fontFamily:'monospace',fontSize:'.8rem',color:'#6b7280'}}>{item.serial_number||'—'}</td>
                  <td style={{padding:'8px 10px',textAlign:'right'}}>{item.qty}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:'#92400e'}}>AED {Math.round(item.unit_cost||0).toLocaleString()}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:'#059669'}}>AED {Math.round(item.unit_price||0).toLocaleString()}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:'#6366f1',fontWeight:600}}>
                    AED {Math.round(margin).toLocaleString()}
                    {item.unit_cost > 0 && <span style={{fontSize:'.75rem',marginLeft:'4px',color:'#9ca3af'}}>({Math.round((margin/(item.unit_cost||1))*100)}%)</span>}
                  </td>
                  <td style={{padding:'8px 10px',textAlign:'right',fontWeight:600}}>AED {Math.round((item.qty||1)*item.unit_price).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.notes && <div style={{marginTop:'8px',fontSize:'.82rem',color:'#6b7280'}}>📝 {data.notes}</div>}
      </td>
    </tr>
  );
}

export default function Sales() {
  const [sales, setSales]             = useState([]);
  const [products, setProducts]       = useState([]);
  const [shops, setShops]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [showReturn, setShowReturn]   = useState(false);
  const [showPayment, setShowPayment] = useState(null);
  const [viewSale, setViewSale]       = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM());
  const [expandedRows, setExpandedRows] = useState({});

  // Filters
  const [search, setSearch]               = useState('');
  const [filterShop, setFilterShop]       = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterFrom, setFilterFrom]       = useState('');
  const [filterTo, setFilterTo]           = useState('');

  // Serial/name search per item
  const [serialSearches, setSerialSearches] = useState({});
  const [serialResults, setSerialResults]   = useState({});
  const [nameSearches, setNameSearches]     = useState({});
  const [nameResults, setNameResults]       = useState({});

  // Return
  const [returnSearch, setReturnSearch]   = useState('');
  const [returnResults, setReturnResults] = useState([]);
  const [returnInvoice, setReturnInvoice] = useState(null);
  const [returnAmount, setReturnAmount]   = useState('');
  const [returnNote, setReturnNote]       = useState('');

  // Payment
  const [payAmount, setPayAmount] = useState('');

  const load = (sid, status, payment, from, to) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sid)     params.append('shop_id', sid);
    if (status)  params.append('payment_status', status);
    if (payment) params.append('payment_method', payment);
    if (from)    params.append('from', from);
    if (to)      params.append('to', to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    Promise.all([api.get(`/sales${qs}`), api.get('/products'), api.get('/shops')])
      .then(([s, p, sh]) => {
        setSales(s.data?.data || []);
        setProducts(p.data?.data || []);
        setShops(sh.data?.data || []);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(filterShop, filterStatus, filterPayment, filterFrom, filterTo);
  }, [filterShop, filterStatus, filterPayment, filterFrom, filterTo]);

  const reloadAll = () => load(filterShop, filterStatus, filterPayment, filterFrom, filterTo);

  const clearFilters = () => {
    setSearch(''); setFilterShop(''); setFilterStatus('');
    setFilterPayment(''); setFilterFrom(''); setFilterTo('');
  };

  // Serial search
  const searchSerial = async (idx, val) => {
    setSerialSearches(prev => ({ ...prev, [idx]: val }));
    if (val.length < 2) { setSerialResults(prev => ({ ...prev, [idx]: [] })); return; }
    try {
      const res = await api.get(`/products/serial/${val}`);
      setSerialResults(prev => ({ ...prev, [idx]: res.data?.data || [] }));
    } catch { setSerialResults(prev => ({ ...prev, [idx]: [] })); }
  };

  const searchByName = (idx, val) => {
    setNameSearches(prev => ({ ...prev, [idx]: val }));
    if (val.length < 1) { setNameResults(prev => ({ ...prev, [idx]: [] })); return; }
    const filtered = products.filter(p =>
      p.name?.toLowerCase().includes(val.toLowerCase()) ||
      p.brand?.toLowerCase().includes(val.toLowerCase()) ||
      p.serial_number?.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 15);
    setNameResults(prev => ({ ...prev, [idx]: filtered }));
  };

  const selectSerialProduct = (idx, product) => {
    const items = [...form.items];
    items[idx] = {
      ...items[idx],
      product_id:        product.id,
      product_name:      product.name,
      serial_number:     product.serial_number || '',
      recommended_price: product.selling_price ? Math.round(product.selling_price).toString() : '',
      unit_price:        product.selling_price ? Math.round(product.selling_price).toString() : '',
      unit_cost:         product.base_cost || 0,
    };
    setForm({ ...form, items });
    setSerialSearches(prev => ({ ...prev, [idx]: product.serial_number || product.name }));
    setSerialResults(prev => ({ ...prev, [idx]: [] }));
    setNameSearches(prev => ({ ...prev, [idx]: product.name }));
    setNameResults(prev => ({ ...prev, [idx]: [] }));
  };

  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { product_id:'', product_name:'', serial_number:'', qty:1, unit_price:'', recommended_price:'', unit_cost:'' }] }));
  const removeItem = i  => setForm(f => ({ ...f, items: f.items.filter((_,idx) => idx !== i) }));

  const updateItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: val };
    if (key === 'product_id') {
      const p = products.find(p => p.id === val);
      if (p) {
        items[i].unit_price        = p.selling_price ? Math.round(p.selling_price).toString() : '';
        items[i].recommended_price = p.selling_price ? Math.round(p.selling_price).toString() : '';
        items[i].product_name      = p.name;
        items[i].unit_cost         = p.base_cost || 0;
        items[i].serial_number     = p.serial_number || '';
        setSerialSearches(prev => ({ ...prev, [i]: p.serial_number || p.name || '' }));
        setNameSearches(prev => ({ ...prev, [i]: p.name || '' }));
      }
    }
    setForm(f => ({ ...f, items }));
  };

  const subtotal = form.items.reduce((s,i) => s + ((parseFloat(i.qty)||0)*(parseFloat(i.unit_price)||0)), 0);
  const tradeIn  = form.is_exchange ? (parseFloat(form.exchange_trade_in_value)||0) : 0;
  const total    = subtotal - (parseFloat(form.discount)||0) - tradeIn;

  const handleSubmit = async () => {
    if (!form.shop_id) return toast.error('Please select a shop');
    if (form.items.some(i => !i.product_id || !i.unit_price)) return toast.error('Each item needs a product and price');
    if (form.is_exchange && !form.exchange_serial_number) return toast.error('Enter exchange phone serial number');
    try {
      const payload = {
        ...form,
        customer_phone: form.customer_phone === '+971' ? '' : form.customer_phone,
        discount:    parseFloat(form.discount)||0,
        amount_paid: parseFloat(form.amount_paid)||(form.payment_method==='cash' ? total : 0),
        pending_amount: parseFloat(form.pending_amount)||0,
        exchange_trade_in_value: parseFloat(form.exchange_trade_in_value)||0,
        items: form.items.map(i => ({
          product_id:    i.product_id,
          qty:           parseInt(i.qty)||1,
          unit_price:    parseFloat(i.unit_price),
          unit_cost:     parseFloat(i.unit_cost)||0,
          serial_number: i.serial_number||null,
        })),
      };
      const res = await api.post('/sales', payload);
      toast.success(res.data.message || 'Sale created!');
      setShowModal(false);
      setForm(EMPTY_FORM());
      setSerialSearches({}); setSerialResults({});
      setNameSearches({}); setNameResults({});
      reloadAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const searchForReturn = async (q) => {
    setReturnSearch(q);
    if (q.length < 2) { setReturnResults([]); return; }
    try {
      const res = await api.get(`/sales/search-serial?q=${q}`);
      setReturnResults(res.data?.data || []);
    } catch { setReturnResults([]); }
  };

  const selectReturnInvoice = async (inv) => {
    try {
      const res = await api.get(`/sales/${inv.id}`);
      setReturnInvoice(res.data?.data);
      setReturnAmount(Math.round(res.data?.data?.amount_paid||0).toString());
      setReturnResults([]);
    } catch { toast.error('Failed to load invoice'); }
  };

  const handleReturn = async () => {
    if (!returnInvoice) return toast.error('Select an invoice first');
    if (!returnNote)   return toast.error('Enter return reason');
    try {
      await api.post(`/sales/${returnInvoice.id}/return`, { note: returnNote, return_amount: parseFloat(returnAmount)||0 });
      toast.success('Return processed!');
      setShowReturn(false); setReturnInvoice(null);
      setReturnSearch(''); setReturnNote(''); setReturnAmount('');
      reloadAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const markReceived = async (invoiceId) => {
    try {
      await api.post(`/sales/${invoiceId}/mark-received`, {});
      toast.success('Payment marked as received!');
      reloadAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleAdjustPayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return toast.error('Enter valid amount');
    try {
      await api.post(`/sales/${showPayment.id}/mark-received`, { partial_amount: parseFloat(payAmount) });
      toast.success('Payment updated!');
      setShowPayment(null); setPayAmount('');
      reloadAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const openView = async (sale) => {
    setViewSale({ ...sale, items: [] }); setViewLoading(true);
    try { const res = await api.get(`/sales/${sale.id}`); setViewSale(res.data?.data || sale); }
    catch { toast.error('Failed to load invoice'); }
    finally { setViewLoading(false); }
  };

  const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

  const filtered = sales.filter(s =>
    !search ||
    s.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    s.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.customer_phone?.includes(search)
  );

  const COL_COUNT = 11;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🧾 Sales / Invoices</div>
          <div className="page-subtitle">{filtered.length} invoice(s)</div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <button className="btn btn-ghost" style={{color:'#dc2626'}} onClick={() => setShowReturn(true)}>🔄 Return</button>
          <button className="btn btn-primary" onClick={() => {
            setForm({...EMPTY_FORM(), shop_id: shops.length===1 ? shops[0].id.toString() : (filterShop||'')});
            setShowModal(true);
          }}>+ New Sale</button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card" style={{padding:'1rem',marginBottom:'1rem'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr auto',gap:'10px',alignItems:'end',flexWrap:'wrap'}}>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>Search</label>
            <input className="form-control" placeholder="Invoice #, customer, phone..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>Shop</label>
            <select className="form-control" value={filterShop} onChange={e => setFilterShop(e.target.value)}>
              <option value="">All Shops</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>Status</label>
            <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="payment_pending">Awaiting</option>
              <option value="returned">Returned</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>Payment</label>
            <select className="form-control" value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="tabby">Tabby</option>
              <option value="tamara">Tamara</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>From</label>
            <input type="date" className="form-control" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>To</label>
            <input type="date" className="form-control" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          <button className="btn btn-ghost btn-sm" style={{marginBottom:'2px'}} onClick={clearFilters}>✕ Clear</button>
        </div>
      </div>

      {/* ── Sales Table ── */}
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{width:'32px'}}></th>
                  <th>Invoice #</th><th>Customer</th><th>Shop</th><th>Date</th>
                  <th>Total</th><th>Paid</th><th>Due</th><th>Method</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={COL_COUNT}><div className="empty-state"><p>No sales found</p></div></td></tr>
                ) : filtered.map(s => (
                  <React.Fragment key={s.id}>
                    <tr>
                      {/* Expand button */}
                      <td style={{padding:'8px',textAlign:'center'}}>
                        <button onClick={() => toggleRow(s.id)}
                          style={{background:'none',border:'none',cursor:'pointer',
                            fontSize:'1.1rem',color:'var(--accent)',fontWeight:700,
                            width:'24px',height:'24px',borderRadius:'4px',
                            display:'flex',alignItems:'center',justifyContent:'center',
                            lineHeight:1}}>
                          {expandedRows[s.id] ? '−' : '+'}
                        </button>
                      </td>
                      <td>
                        <span className="badge badge-blue">{s.invoice_number}</span>
                        {s.is_exchange && <span style={{marginLeft:'4px',fontSize:'.7rem',background:'#fef3c7',color:'#92400e',padding:'1px 5px',borderRadius:'6px'}}>EX</span>}
                      </td>
                      <td>
                        <div>{s.customer_name || <span style={{color:'var(--text-muted)'}}>Walk-in</span>}</div>
                        {s.customer_phone && <div style={{fontSize:'.78rem',color:'var(--text-muted)'}}>{s.customer_phone}</div>}
                      </td>
                      <td><span className="badge badge-gray">{s.shop_name||'—'}</span></td>
                      <td>{fmtDate(s.sale_date)}</td>
                      <td><strong>{fmt(s.total_amount)}</strong></td>
                      <td style={{color:'#059669'}}>{fmt(s.amount_paid)}</td>
                      <td style={{color:s.amount_due>0?'#dc2626':'#059669'}}>{fmt(s.amount_due)}</td>
                      <td><span style={{fontSize:'.78rem',fontWeight:600,color:paymentColor(s.payment_method),textTransform:'uppercase'}}>{s.payment_method}</span></td>
                      <td><span style={{fontSize:'.78rem',fontWeight:600,color:statusColor(s.payment_status),textTransform:'uppercase'}}>
                        {s.payment_status==='payment_pending'?'AWAITING':s.payment_status}
                      </span></td>
                      <td>
                        <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openView(s)}>👁️</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => printInvoice(s)}>🖨️</button>
                          {s.payment_status==='payment_pending' && (
                            <button className="btn btn-sm" style={{background:'#d1fae5',color:'#065f46',border:'none',cursor:'pointer',fontSize:'.75rem',padding:'3px 8px',borderRadius:'6px'}}
                              onClick={() => markReceived(s.id)}>✓ Received</button>
                          )}
                          {(s.payment_status==='partial'||s.payment_status==='unpaid') && (
                            <button className="btn btn-sm" style={{background:'#fef3c7',color:'#92400e',border:'none',cursor:'pointer',fontSize:'.75rem',padding:'3px 8px',borderRadius:'6px'}}
                              onClick={() => { setShowPayment(s); setPayAmount(''); }}>💰 Pay</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedRows[s.id] && <SaleExpandedRow saleId={s.id} colSpan={COL_COUNT} />}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Sale Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{maxWidth:'860px',maxHeight:'92vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🧾 New Sale</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Shop */}
              <div className="form-group" style={{marginBottom:'1rem',padding:'0.75rem',background:'var(--bg-secondary)',borderRadius:'8px'}}>
                <label className="form-label">Shop <span style={{color:'var(--accent-red)'}}>*</span></label>
                <select className="form-control" value={form.shop_id}
                  onChange={e => setForm({...form,shop_id:e.target.value})}
                  style={{border:!form.shop_id?'2px solid var(--accent-red)':''}}>
                  <option value="">— Select Shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Customer */}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Customer Name</label>
                  <input className="form-control" placeholder="Optional" value={form.customer_name}
                    onChange={e => setForm({...form,customer_name:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone (+971 pre-filled)</label>
                  <input className="form-control" value={form.customer_phone}
                    onChange={e => setForm({...form,customer_phone:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sale Date</label>
                  <input type="date" className="form-control" value={form.sale_date}
                    onChange={e => setForm({...form,sale_date:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-control" value={form.payment_method}
                    onChange={e => setForm({...form,payment_method:e.target.value})}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="tabby">Tabby</option>
                    <option value="tamara">Tamara</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              {form.payment_method==='pending' && (
                <div className="form-group" style={{background:'#fef2f2',padding:'12px',borderRadius:'8px',marginBottom:'12px'}}>
                  <label className="form-label">Pending Amount (AED)</label>
                  <input type="number" className="form-control" value={form.pending_amount}
                    onChange={e => setForm({...form,pending_amount:e.target.value})} placeholder="0" />
                </div>
              )}
              {['tabby','tamara','card','bank_transfer'].includes(form.payment_method) && (
                <div style={{padding:'10px 14px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',marginBottom:'12px',fontSize:'.85rem',color:'#1e40af'}}>
                  ℹ️ <strong>{form.payment_method.toUpperCase()}</strong> — shows as "Awaiting". Accountant clicks Mark Received when money arrives.
                </div>
              )}

              {/* Items */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'1rem 0 0.5rem'}}>
                <strong>Items</strong>
                <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
              </div>

              {form.items.map((item, i) => (
                <div key={i} style={{background:'var(--bg-secondary)',borderRadius:'8px',padding:'0.75rem',marginBottom:'0.5rem'}}>
                  {/* Serial search */}
                  <div style={{marginBottom:'8px',position:'relative'}}>
                    <label className="form-label">🔍 Search by Serial / IMEI (scan or type)</label>
                    <input className="form-control"
                      placeholder="Scan barcode or type serial number..."
                      value={serialSearches[i]!==undefined ? serialSearches[i] : (item.serial_number||'')}
                      onChange={e => searchSerial(i, e.target.value)}
                      autoComplete="off" />
                    {(serialResults[i]||[]).length > 0 && (
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:100,background:'white',
                        border:'1px solid var(--border)',borderRadius:'8px',boxShadow:'0 4px 12px rgba(0,0,0,.1)',maxHeight:'200px',overflowY:'auto'}}>
                        {serialResults[i].map(p => (
                          <div key={p.id} onClick={() => selectSerialProduct(i,p)}
                            style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid var(--border)',fontSize:'.88rem'}}
                            onMouseEnter={e=>e.currentTarget.style.background='#f8f9fc'}
                            onMouseLeave={e=>e.currentTarget.style.background='white'}>
                            <strong>{p.brand} {p.name}</strong>
                            {p.serial_number && <span style={{color:'var(--text-muted)',marginLeft:'8px',fontSize:'.8rem',fontFamily:'monospace'}}>S/N: {p.serial_number}</span>}
                            <span style={{marginLeft:'8px',color:'#059669',fontSize:'.82rem'}}>AED {Math.round(p.selling_price||0).toLocaleString()}</span>
                            <span style={{marginLeft:'8px',color:'#92400e',fontSize:'.82rem'}}>Cost: AED {Math.round(p.base_cost||0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Name search */}
                  <div style={{marginBottom:'8px',position:'relative'}}>
                    <label className="form-label">🔍 Search by Product Name (type to filter)</label>
                    <input className="form-control"
                      placeholder="Type product name e.g. iPad, iPhone..."
                      value={nameSearches[i]!==undefined ? nameSearches[i] : (item.product_name||'')}
                      onChange={e => searchByName(i, e.target.value)}
                      autoComplete="off" />
                    {(nameResults[i]||[]).length > 0 && (
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:100,background:'white',
                        border:'1px solid var(--border)',borderRadius:'8px',boxShadow:'0 4px 12px rgba(0,0,0,.1)',maxHeight:'220px',overflowY:'auto'}}>
                        {nameResults[i].map(p => (
                          <div key={p.id} onClick={() => selectSerialProduct(i,p)}
                            style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid var(--border)',fontSize:'.88rem'}}
                            onMouseEnter={e=>e.currentTarget.style.background='#f8f9fc'}
                            onMouseLeave={e=>e.currentTarget.style.background='white'}>
                            <strong>{p.brand} {p.name}</strong>
                            {p.serial_number && <span style={{color:'var(--text-muted)',marginLeft:'8px',fontSize:'.8rem',fontFamily:'monospace'}}>S/N: {p.serial_number}</span>}
                            <span style={{marginLeft:'8px',color:'#059669',fontSize:'.82rem'}}>AED {Math.round(p.selling_price||0).toLocaleString()}</span>
                            <span style={{marginLeft:'8px',color:'#92400e',fontSize:'.82rem'}}>Cost: AED {Math.round(p.base_cost||0).toLocaleString()}</span>
                            <span style={{marginLeft:'8px',fontSize:'.75rem',background:'#f3f4f6',padding:'1px 6px',borderRadius:'4px'}}>{p.type||''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:'8px',alignItems:'end'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Cost Price</label>
                      <input type="number" className="form-control" value={item.unit_cost||''} readOnly
                        style={{background:'#fef3c7',color:'#92400e',cursor:'not-allowed',fontWeight:600}} />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Rec. Price</label>
                      <input type="number" className="form-control" value={item.recommended_price||''} readOnly
                        style={{background:'var(--bg-tertiary,#f3f4f6)',color:'var(--text-muted)',cursor:'not-allowed'}} />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Qty</label>
                      <input type="number" min="1" className="form-control" value={item.qty}
                        onChange={e => updateItem(i,'qty',e.target.value)} />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Selling Price</label>
                      <input type="number" className="form-control" value={item.unit_price}
                        onChange={e => updateItem(i,'unit_price',e.target.value)} placeholder="0" />
                    </div>
                    {form.items.length>1 && (
                      <button onClick={() => removeItem(i)}
                        style={{marginBottom:'2px',background:'none',border:'none',color:'var(--accent-red)',cursor:'pointer',fontSize:'1.2rem'}}>✕</button>
                    )}
                  </div>
                  {item.unit_price && item.qty && (
                    <div style={{textAlign:'right',fontSize:'.8rem',color:'var(--text-muted)',marginTop:'4px'}}>
                      Subtotal: AED {Math.round((parseFloat(item.qty)||0)*(parseFloat(item.unit_price)||0)).toLocaleString()}
                      {item.recommended_price && item.unit_price && (
                        <span style={{marginLeft:'12px',color:parseFloat(item.unit_price)>=parseFloat(item.recommended_price)?'var(--accent-green)':'var(--accent-red)'}}>
                          {parseFloat(item.unit_price)>=parseFloat(item.recommended_price)?'✅ Above rec.':'⚠️ Below rec.'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Exchange */}
              <div style={{background:form.is_exchange?'#fef9c3':'var(--bg-secondary)',border:`1px solid ${form.is_exchange?'#fde68a':'var(--border)'}`,borderRadius:'8px',padding:'12px',marginBottom:'12px'}}>
                <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:600}}>
                  <input type="checkbox" checked={form.is_exchange} onChange={e => setForm({...form,is_exchange:e.target.checked})} />
                  🔄 Exchange — customer is trading in a phone
                </label>
                {form.is_exchange && (
                  <div className="form-grid" style={{marginTop:'12px'}}>
                    <div className="form-group">
                      <label className="form-label">Phone Coming IN (product name)</label>
                      <input className="form-control" value={form.exchange_product_name}
                        onChange={e => setForm({...form,exchange_product_name:e.target.value})} placeholder="e.g. iPhone X 64GB Black" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Serial / IMEI of trade-in</label>
                      <input className="form-control" value={form.exchange_serial_number}
                        onChange={e => setForm({...form,exchange_serial_number:e.target.value})} placeholder="Scan or type..." />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Trade-in Value (AED)</label>
                      <input type="number" className="form-control" value={form.exchange_trade_in_value}
                        onChange={e => setForm({...form,exchange_trade_in_value:e.target.value})} placeholder="0" />
                    </div>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div style={{background:'var(--bg-secondary)',borderRadius:'8px',padding:'1rem'}}>
                <div className="form-grid">
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Invoice Discount (AED)</label>
                    <input type="number" className="form-control" value={form.discount}
                      onChange={e => setForm({...form,discount:e.target.value})} placeholder="0" />
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Amount Paid (AED)</label>
                    <input type="number" className="form-control" value={form.amount_paid}
                      onChange={e => setForm({...form,amount_paid:e.target.value})}
                      placeholder={form.payment_method==='cash'?Math.round(total).toString():'0'} />
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Notes</label>
                    <input className="form-control" value={form.notes}
                      onChange={e => setForm({...form,notes:e.target.value})} />
                  </div>
                </div>
                <div style={{textAlign:'right',marginTop:'0.75rem',fontSize:'1.05rem',fontWeight:700}}>
                  Subtotal: {fmt(subtotal)}
                  {parseFloat(form.discount)>0 && <span style={{color:'var(--accent-red)',marginLeft:'1rem'}}>- {fmt(form.discount)}</span>}
                  {tradeIn>0 && <span style={{color:'#f59e0b',marginLeft:'1rem'}}>- Trade-in: {fmt(tradeIn)}</span>}
                  <span style={{color:'var(--accent)',marginLeft:'1rem',fontSize:'1.15rem'}}>Total: {fmt(total)}</span>
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

      {/* ── Return Modal ── */}
      {showReturn && (
        <div className="modal-overlay" onClick={() => setShowReturn(false)}>
          <div className="modal" style={{maxWidth:'560px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔄 Process Return</strong>
              <button className="modal-close" onClick={() => setShowReturn(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{marginBottom:'12px',position:'relative'}}>
                <label className="form-label">Search Invoice # or Serial Number</label>
                <input className="form-control" placeholder="Type invoice number or serial..."
                  value={returnSearch} onChange={e => searchForReturn(e.target.value)} />
                {returnResults.length>0 && (
                  <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:100,background:'white',
                    border:'1px solid var(--border)',borderRadius:'8px',boxShadow:'0 4px 12px rgba(0,0,0,.1)'}}>
                    {returnResults.map(inv => (
                      <div key={inv.id} onClick={() => selectReturnInvoice(inv)}
                        style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid var(--border)',fontSize:'.88rem'}}
                        onMouseEnter={e=>e.currentTarget.style.background='#f8f9fc'}
                        onMouseLeave={e=>e.currentTarget.style.background='white'}>
                        <strong>{inv.invoice_number}</strong>
                        <span style={{marginLeft:'8px',color:'var(--text-muted)'}}>{inv.customer_name||'Walk-in'}</span>
                        <span style={{marginLeft:'8px',color:'#059669'}}>AED {Math.round(inv.total_amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {returnInvoice && (
                <>
                  <div style={{padding:'12px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                    <div style={{fontWeight:700,marginBottom:'6px'}}>Invoice: {returnInvoice.invoice_number}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px'}}>
                      <div>Customer: <strong>{returnInvoice.customer_name||'Walk-in'}</strong></div>
                      <div>Original: <strong style={{color:'#059669'}}>{fmt(returnInvoice.total_amount)}</strong></div>
                    </div>
                  </div>
                  <div style={{padding:'10px',background:'#fef3c7',borderRadius:'8px',marginBottom:'12px',fontSize:'.85rem',color:'#92400e'}}>
                    ⚠️ Return will restore inventory and update customer balance.
                  </div>
                  <div className="form-group" style={{marginBottom:'12px'}}>
                    <label className="form-label">Amount to Return to Customer (AED)</label>
                    <input type="number" className="form-control" value={returnAmount}
                      onChange={e => setReturnAmount(e.target.value)}
                      placeholder={Math.round(returnInvoice.amount_paid||0).toString()} />
                    {returnAmount && parseFloat(returnAmount)<parseFloat(returnInvoice.amount_paid||0) && (
                      <div style={{marginTop:'4px',fontSize:'.82rem',color:'#d97706'}}>
                        ⚠️ Deduction: AED {Math.round(parseFloat(returnInvoice.amount_paid)-parseFloat(returnAmount)).toLocaleString()} kept
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Return Reason *</label>
                    <input className="form-control" value={returnNote}
                      onChange={e => setReturnNote(e.target.value)} placeholder="e.g. Defective, customer changed mind..." />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowReturn(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:'#dc2626'}} onClick={handleReturn} disabled={!returnInvoice}>Confirm Return</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Adjust Payment Modal ── */}
      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(null)}>
          <div className="modal" style={{maxWidth:'420px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>💰 Record Payment — {showPayment.invoice_number}</strong>
              <button className="modal-close" onClick={() => setShowPayment(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                  <span>Invoice Total:</span><strong>{fmt(showPayment.total_amount)}</strong>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                  <span>Already Paid:</span><strong style={{color:'#059669'}}>{fmt(showPayment.amount_paid)}</strong>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:'6px'}}>
                  <span>Outstanding:</span><strong style={{color:'#dc2626'}}>{fmt(showPayment.amount_due)}</strong>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Amount Received Now (AED)</label>
                <input type="number" className="form-control" value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder={Math.round(showPayment.amount_due||0).toString()} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPayment(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdjustPayment}>Record Payment</button>
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
                <div><strong>Customer:</strong> {viewSale.customer_name||'Walk-in'}</div>
                <div><strong>Phone:</strong> {viewSale.customer_phone||'—'}</div>
                <div><strong>Shop:</strong> {viewSale.shop_name||'—'}</div>
                <div><strong>Date:</strong> {fmtDate(viewSale.sale_date)}</div>
                <div><strong>Method:</strong> <span style={{color:paymentColor(viewSale.payment_method)}}>{viewSale.payment_method?.toUpperCase()}</span></div>
                <div><strong>Status:</strong> <span style={{color:statusColor(viewSale.payment_status)}}>{viewSale.payment_status?.toUpperCase()}</span></div>
                {viewSale.is_exchange && (
                  <div style={{gridColumn:'1/-1',background:'#fef3c7',padding:'8px',borderRadius:'6px',fontSize:'.85rem'}}>
                    🔄 <strong>Exchange:</strong> {viewSale.exchange_product_name} (S/N: {viewSale.exchange_serial_number}) — Trade-in: {fmt(viewSale.exchange_trade_in_value)}
                  </div>
                )}
                {viewSale.notes && <div style={{gridColumn:'1/-1'}}><strong>Notes:</strong> {viewSale.notes}</div>}
              </div>
              {viewLoading ? <div style={{textAlign:'center',padding:'2rem'}}>Loading...</div> : (
                <table style={{width:'100%',fontSize:'0.9rem',borderCollapse:'collapse'}}>
                  <thead><tr style={{borderBottom:'2px solid var(--border)'}}>
                    <th style={{textAlign:'left',padding:'8px 0'}}>Item</th>
                    <th style={{textAlign:'left',padding:'8px 0'}}>Serial</th>
                    <th style={{textAlign:'right',padding:'8px 0'}}>Qty</th>
                    <th style={{textAlign:'right',padding:'8px 0'}}>Price</th>
                    <th style={{textAlign:'right',padding:'8px 0'}}>Total</th>
                  </tr></thead>
                  <tbody>
                    {(viewSale.items||[]).map((item,i) => (
                      <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'8px 0'}}><strong>{item.brand||''} {item.product_name||''}</strong></td>
                        <td style={{padding:'8px 0',fontFamily:'monospace',fontSize:'.8rem',color:'var(--text-muted)'}}>{item.serial_number||'—'}</td>
                        <td style={{textAlign:'right',padding:'8px 0'}}>{item.qty}</td>
                        <td style={{textAlign:'right',padding:'8px 0'}}>{fmt(item.unit_price)}</td>
                        <td style={{textAlign:'right',padding:'8px 0'}}>{fmt((item.qty||1)*item.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{textAlign:'right',marginTop:'1rem',fontWeight:700}}>
                {viewSale.discount>0 && <div style={{color:'var(--accent-red)'}}>Discount: - {fmt(viewSale.discount)}</div>}
                {viewSale.exchange_trade_in_value>0 && <div style={{color:'#f59e0b'}}>Trade-in: - {fmt(viewSale.exchange_trade_in_value)}</div>}
                <div style={{fontSize:'1.1rem',color:'var(--accent)'}}>Total: {fmt(viewSale.total_amount)}</div>
                <div style={{color:'var(--accent-green)'}}>Paid: {fmt(viewSale.amount_paid)}</div>
                {viewSale.amount_due>0 && <div style={{color:'var(--accent-red)'}}>Due: {fmt(viewSale.amount_due)}</div>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setViewSale(null)}>Close</button>
              {viewSale.payment_status==='payment_pending' && (
                <button className="btn btn-ghost" style={{color:'#059669'}} onClick={() => {markReceived(viewSale.id);setViewSale(null);}}>✓ Mark Received</button>
              )}
              {(viewSale.payment_status==='partial'||viewSale.payment_status==='unpaid') && (
                <button className="btn btn-ghost" style={{color:'#d97706'}} onClick={() => {setShowPayment(viewSale);setViewSale(null);}}>💰 Record Payment</button>
              )}
              <button className="btn btn-primary" onClick={() => printInvoice(viewSale)}>🖨️ Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
