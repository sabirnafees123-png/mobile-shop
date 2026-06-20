// src/pages/Purchases.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt     = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

const PRODUCT_TYPES = ['New (Box Pack)', 'Used', 'Refurbished', 'Parts', 'Accessories', 'Wholesale'];

const typeBadgeColor = (t) => ({
  'New (Box Pack)': { bg: '#d1fae5', color: '#065f46' },
  'Used':           { bg: '#fef3c7', color: '#92400e' },
  'Refurbished':    { bg: '#dbeafe', color: '#1e40af' },
  'Parts':          { bg: '#f3e8ff', color: '#6b21a8' },
  'Accessories':    { bg: '#fce7f3', color: '#9d174d' },
  'Wholesale':      { bg: '#e0f2fe', color: '#0369a1' },
}[t] || { bg: '#f3f4f6', color: '#374151' });

// ── Expanded row — loads items on demand ──────────────────────────────────────
function PurchaseExpandedRow({ purchaseId, colSpan }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/purchases/${purchaseId}`)
      .then(r => setData(r.data?.data))
      .finally(() => setLoading(false));
  }, [purchaseId]);

  if (loading) return (
    <tr style={{ background: '#f8f9fc' }}>
      <td colSpan={colSpan} style={{ padding: '12px 24px', color: '#6b7280', fontSize: '.85rem' }}>
        Loading items...
      </td>
    </tr>
  );
  if (!data) return null;

  return (
    <tr style={{ background: '#f8f9fc', borderBottom: '2px solid #e8eaf0' }}>
      <td colSpan={colSpan} style={{ padding: '12px 24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
          <thead>
            <tr style={{ background: '#f1f2f6' }}>
              <th style={{ padding: '6px 10px', textAlign: 'left',  fontSize: '.75rem', color: '#6b7280' }}>Product</th>
              <th style={{ padding: '6px 10px', textAlign: 'left',  fontSize: '.75rem', color: '#6b7280' }}>Serial / IMEI</th>
              <th style={{ padding: '6px 10px', textAlign: 'left',  fontSize: '.75rem', color: '#6b7280' }}>Shop</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '.75rem', color: '#6b7280' }}>Qty</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '.75rem', color: '#6b7280' }}>Cost</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '.75rem', color: '#6b7280' }}>Selling Price</th>
            </tr>
          </thead>
          <tbody>
            {(data.items || []).map((item, i) => {
              const tc = typeBadgeColor(item.type);
              return (
                <tr key={i} style={{ borderBottom: '1px solid #e8eaf0' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                    {item.brand || ''} {item.product_name || ''}
                    {item.color && <span style={{ color: '#9ca3af', fontSize: '.78rem', marginLeft: '4px' }}>· {item.color}</span>}
                    {item.type && (
                      <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '6px', fontSize: '.72rem', fontWeight: 600, background: tc.bg, color: tc.color }}>
                        {item.type}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '.8rem', color: '#6b7280' }}>
                    {item.serial_number || item.imei || '—'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '6px', fontSize: '.78rem' }}>
                      {item.shop_name || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#92400e' }}>
                    AED {Math.round(item.unit_cost || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                    AED {Math.round(item.recommended_selling_price || 0).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.notes && (
          <div style={{ marginTop: '8px', fontSize: '.82rem', color: '#6b7280' }}>📝 {data.notes}</div>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Purchases() {
  const [purchases, setPurchases]     = useState([]);
  const [suppliers, setSuppliers]     = useState([]);
  const [shops, setShops]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [viewPurchase, setViewPurchase]       = useState(null);
  const [viewLoading, setViewLoading]         = useState(false);
  const [showSupPay, setShowSupPay]           = useState(null);
  const [supPayForm, setSupPayForm]           = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', note: '' });
  const [filterShop, setFilterShop]           = useState('');
  const [filterStatus, setFilterStatus]       = useState('');
  const [search, setSearch]                   = useState('');
  const [expandedRows, setExpandedRows]       = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying]         = useState(false);


  // ── Pagination state ──────────────────────────────────────────────────────
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const LIMIT = 50;

  // Serial search state per item
  const [serialSearches, setSerialSearches] = useState({});
  const [serialResults, setSerialResults]   = useState({});

  const emptyItem = () => ({
    serial_number: '',
    product_name:  '',
    brand:         '',
    color:         '',
    product_type:  'Used',
    product_id:    null,
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

  // Load suppliers and shops once on mount
  useEffect(() => {
    Promise.all([api.get('/suppliers'), api.get('/shops')])
      .then(([s, sh]) => {
        setSuppliers(Array.isArray(s.data) ? s.data : s.data?.data || []);
        setShops(sh.data?.data || []);
      })
      .catch(console.error);
  }, []);

  const load = (sid, currentPage) => {
    setLoading(true);
    const params = new URLSearchParams({ page: currentPage, limit: LIMIT });
    if (sid)          params.set('shop_id', sid);
    if (filterStatus) params.set('payment_status', filterStatus);
    if (search)       params.set('search', search);
    api.get(`/purchases?${params.toString()}`)
      .then(p => {
        setPurchases(p.data?.data || []);
        setTotalPages(p.data?.pagination?.total_pages || 1);
        setTotalCount(p.data?.pagination?.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filterShop, filterStatus, search]);
  useEffect(() => { load(filterShop, page); }, [filterShop, filterStatus, search, page]);

  const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

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

  const fileInputRef = useRef(null);

  const downloadTemplate = () => {
    const headers = ['serial_number','product_name','brand','color','product_type','unit_cost','recommended_selling_price','qty','shop'];
    const example = [
      ['350486745601689','SAM GALAXY S21 ULTRA 512GB','Samsung','Black','Used','830','1100','1','AlAman'],
      ['354477870340637','SAM GALAXY S21 ULTRA 512GB','Samsung','Black','Used','830','1100','1','Blessing'],
    ];
    const csv = [headers, ...example].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'purchase_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text  = ev.target.result;
        const lines = text.trim().split('\n').filter(Boolean);
        if (lines.length < 2) return toast.error('File is empty or has no data rows');

        // Detect separator
        const sep = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/[^a-z_]/g,''));

        const col = (row, names) => {
          for (const n of names) {
            const idx = headers.indexOf(n);
            if (idx !== -1 && row[idx] !== undefined) return row[idx].trim();
          }
          return '';
        };

        const shopNameToId = {};
        shops.forEach(s => {
          shopNameToId[s.name.toLowerCase()] = s.id;
          shopNameToId[String(s.id)]         = s.id;
        });

        const parsed = [];
        const errors = [];

        lines.slice(1).forEach((line, i) => {
          if (!line.trim()) return;
          const row = line.split(sep).map(c => c.trim().replace(/^"|"$/g,''));

          const shopRaw  = col(row, ['shop','shop_id','shop_name']);
          const shopId   = shopNameToId[shopRaw.toLowerCase()] || shopNameToId[shopRaw] || '';
          const cost     = col(row, ['unit_cost','cost','price','purchase_price']);
          const sellPrice= col(row, ['recommended_selling_price','selling_price','sell_price','sell']);
          const serial   = col(row, ['serial_number','serial','imei']);
          const name     = col(row, ['product_name','name','product']);
          const type     = col(row, ['product_type','type']);

          if (!cost || parseFloat(cost) <= 0) {
            errors.push(`Row ${i+2}: cost missing or 0`);
            return;
          }

          // Match product_type to valid options
          const matchedType = PRODUCT_TYPES.find(t => t.toLowerCase() === type.toLowerCase()) || 'Used';

          parsed.push({
            serial_number: serial,
            product_name:  name,
            brand:         col(row, ['brand']),
            color:         col(row, ['color']),
            product_type:  matchedType,
            unit_cost:     cost,
            recommended_selling_price: sellPrice || '',
            qty:           col(row, ['qty','quantity']) || '1',
            shop_id:       shopId,
            product_id:    null,
          });
        });

        if (errors.length) toast.error(errors.slice(0,3).join('\n') + (errors.length > 3 ? `\n...+${errors.length-3} more` : ''));
        if (!parsed.length) return toast.error('No valid rows found');

        setForm(prev => ({
          ...prev,
          items: parsed,
          payment_type: 'credit',
          amount_paid:  '',
        }));
        toast.success(`✅ ${parsed.length} items loaded from file!`);
      } catch (err) {
        toast.error('Failed to parse file: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };


  const serialAborts = useRef({});

  const searchSerial = (idx, val) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], serial_number: val, product_id: null };
    setForm({ ...form, items });

    // Clear previous timer for this row
    if (serialTimers.current[idx]) clearTimeout(serialTimers.current[idx]);

    // Abort previous in-flight request for this row
    if (serialAborts.current[idx]) serialAborts.current[idx].abort();

    if (val.length < 2) {
      setSerialResults(prev => ({ ...prev, [idx]: [] }));
      return;
    }

    // Debounce — wait 400ms after user stops typing
    serialTimers.current[idx] = setTimeout(async () => {
      const controller = new AbortController();
      serialAborts.current[idx] = controller;
      try {
        const res = await api.get(`/products/serial/${val}`, { signal: controller.signal });
        setSerialResults(prev => ({ ...prev, [idx]: res.data?.data || [] }));
      } catch (e) {
        if (e.name !== 'CanceledError' && e.name !== 'AbortError') {
          setSerialResults(prev => ({ ...prev, [idx]: [] }));
        }
      }
    }, 400);
  };

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
    if (submitting) return;
    setSubmitting(true);
    if (!form.supplier_id) { setSubmitting(false); return toast.error('Select a supplier'); }
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
      load(filterShop, page);
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setSubmitting(false); }
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

  const handleSupplierPayment = async () => {
    if (!supPayForm.amount || parseFloat(supPayForm.amount) <= 0) return toast.error('Enter valid amount');
    if (paying) return;
    setPaying(true);
    try {
      await api.post(`/purchases/${showSupPay.id}/pay`, { 
        amount: parseFloat(supPayForm.amount),
        payment_date: supPayForm.payment_date,
        notes: supPayForm.note,
        shop_id: showSupPay.shop_id || filterShop || null,
      });
      toast.success('Payment recorded!');
      setShowSupPay(null);
      setSupPayForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', note: '' });
      load(filterShop, page);
    } catch (err) { if(err.response?.status===423) toast.error("🔒 "+(err.response?.data?.message||"Register locked")); else toast.error(err.response?.data?.message||"Failed"); }
    finally { setPaying(false); }
  };

  const payStatus = (s) => ({ paid: 'badge-green', partial: 'badge-yellow', unpaid: 'badge-red' }[s] || 'badge-gray');

  const COL_COUNT = 10; // expand-btn + 8 data cols + actions

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📦 Purchases</div>
          <div className="page-subtitle">Showing {purchases.length} of {totalCount} purchases</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="form-control" style={{ width: '180px' }} placeholder="Search purchase #, supplier..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-control" style={{ width: 'auto' }} value={filterShop} onChange={e => setFilterShop(e.target.value)}>
            <option value="">All Shops</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="form-control" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterShop(''); setFilterStatus(''); }}>✕ Clear</button>
          <button className="btn btn-primary" onClick={openAdd}>+ New Purchase</button>
        </div>
      </div>

      {/* ── Purchase List ── */}
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '32px' }}></th>
                    <th>Purchase #</th><th>Supplier</th><th>Date</th>
                    <th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.length === 0 ? (
                    <tr><td colSpan={COL_COUNT}><div className="empty-state"><p>No purchases yet</p></div></td></tr>
                  ) : purchases.map(p => (
                    <React.Fragment key={p.id}>
                      <tr>
                        {/* Expand button */}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button
                            onClick={() => toggleRow(p.id)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: '1.1rem', color: 'var(--accent)', fontWeight: 700,
                              width: '24px', height: '24px', borderRadius: '4px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              lineHeight: 1,
                            }}>
                            {expandedRows[p.id] ? '−' : '+'}
                          </button>
                        </td>
                        <td><span className="badge badge-blue">{p.purchase_number}</span></td>
                        <td>{p.supplier_name}</td>
                        <td>{fmtDate(p.purchase_date)}</td>
                        <td>{p.item_count}</td>
                        <td>{fmt(p.total_amount)}</td>
                        <td style={{ color: 'var(--accent-green)' }}>{fmt(p.amount_paid)}</td>
                        <td style={{ color: p.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{fmt(p.amount_due)}</td>
                        <td><span className={`badge ${payStatus(p.payment_status)}`}>{p.payment_status}</span></td>
                        <td>
                          <div style={{ display:'flex', gap:'4px' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openView(p)}>👁️</button>
                            {(p.payment_status === 'unpaid' || p.payment_status === 'partial') && (
                              <button
                                className="btn btn-sm"
                                style={{ background:'#fef3c7', color:'#92400e', border:'none', cursor:'pointer', fontSize:'.75rem', padding:'3px 8px', borderRadius:'6px' }}
                                onClick={() => { setShowSupPay(p); setSupPayForm({ amount: Math.round(p.amount_due).toString(), payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', note: '' }); }}>
                                💳 Pay
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedRows[p.id] && <PurchaseExpandedRow purchaseId={p.id} colSpan={COL_COUNT} />}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination bar ── */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1}
                >
                  ← Previous
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page === totalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── View Purchase Modal ── */}
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
          <div className="modal" style={{ maxWidth: '1100px', width:'96vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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
                <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}
                  style={{ color:'#059669', borderColor:'#059669' }}>⬇ Template</button>
                <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}
                  style={{ color:'#2563eb', borderColor:'#2563eb' }}>📂 Upload CSV / Excel</button>
                <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls"
                  style={{ display:'none' }} onChange={handleCSVUpload} />
              </div>

              {/* ── Items table with horizontal scroll ── */}
              <div style={{ overflowX:'auto', marginBottom:'0.5rem' }}>
              <div style={{ minWidth:'920px' }}>

              {/* ── Column headers (shown once above items) ── */}
              <div style={{ display:'grid', gridTemplateColumns:'32px 160px 90px 200px 100px 80px 80px 80px 50px 28px', gap:'6px', padding:'0 4px 4px', borderBottom:'1px solid var(--border)', marginBottom:'6px' }}>
                {['#','Serial / IMEI','Shop','Product Name','Brand','Type','Cost','Sell','Qty',''].map((h,idx) => (
                  <div key={idx} style={{ fontSize:'.72rem', color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.03em' }}>{h}</div>
                ))}
              </div>

              {form.items.map((item, i) => (
                <div key={i} style={{ position:'relative' }}>
                  {/* ── Single row per item ── */}
                  <div style={{ display:'grid', gridTemplateColumns:'32px 160px 90px 200px 100px 80px 80px 80px 50px 28px', gap:'6px', alignItems:'center', padding:'4px', borderRadius:'6px', background: i%2===0 ? 'var(--bg-secondary)' : 'transparent', marginBottom:'3px' }}>

                    {/* # badge */}
                    <div style={{ fontSize:'.75rem', color:'var(--text-muted)', textAlign:'center', fontWeight:600 }}>{i+1}</div>

                    {/* Serial / IMEI */}
                    <div style={{ position:'relative' }}>
                      <input
                        className="form-control"
                        placeholder="Serial / IMEI"
                        value={item.serial_number}
                        onChange={e => searchSerial(i, e.target.value)}
                        autoComplete="off"
                        style={{ fontFamily:'monospace', fontSize:'.78rem', padding:'5px 7px', height:'32px',
                          border: item.product_id ? '1.5px solid #059669' : item.serial_number ? '1.5px solid #d97706' : '1px solid var(--border)' }}
                        title={item.product_id ? '✅ Found in system' : item.serial_number ? '⚠️ Will create new product' : ''}
                      />
                      {(serialResults[i] || []).length > 0 && (
                        <div style={{ position:'absolute', top:'100%', left:0, zIndex:200, width:'320px',
                          background:'white', border:'1px solid var(--border)', borderRadius:'8px',
                          boxShadow:'0 4px 12px rgba(0,0,0,.15)', maxHeight:'180px', overflowY:'auto' }}>
                          <div style={{ padding:'5px 10px', fontSize:'.72rem', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', background:'#f8f9fc' }}>
                            Found in system — click to use:
                          </div>
                          {serialResults[i].map(p => (
                            <div key={p.id} onClick={() => selectExistingProduct(i, p)}
                              style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:'.83rem' }}
                              onMouseEnter={e => e.currentTarget.style.background='#f0fdf4'}
                              onMouseLeave={e => e.currentTarget.style.background='white'}>
                              ✅ <strong>{p.brand} {p.name}</strong>
                              <span style={{ color:'var(--text-muted)', marginLeft:'6px', fontFamily:'monospace', fontSize:'.75rem' }}>{p.serial_number}</span>
                            </div>
                          ))}
                          <div onClick={() => setSerialResults(prev => ({ ...prev, [i]: [] }))}
                            style={{ padding:'6px 12px', cursor:'pointer', fontSize:'.78rem', color:'var(--text-muted)', background:'#f8f9fc' }}>
                            ✏️ Enter as new product
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Shop */}
                    <select className="form-control" value={item.shop_id}
                      onChange={e => handleItemChange(i, 'shop_id', e.target.value)}
                      style={{ fontSize:'.78rem', padding:'5px 4px', height:'32px',
                        border: !item.shop_id ? '1.5px solid #dc2626' : '1px solid var(--border)' }}>
                      <option value="">Shop</option>
                      {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    {/* Product Name */}
                    <input className="form-control" value={item.product_name}
                      onChange={e => handleItemChange(i, 'product_name', e.target.value)}
                      placeholder="Product name"
                      readOnly={!!item.product_id}
                      style={{ fontSize:'.78rem', padding:'5px 7px', height:'32px',
                        background: item.product_id ? 'var(--bg-tertiary,#f3f4f6)' : '' }} />

                    {/* Brand */}
                    <input className="form-control" value={item.brand}
                      onChange={e => handleItemChange(i, 'brand', e.target.value)}
                      placeholder="Brand"
                      readOnly={!!item.product_id}
                      style={{ fontSize:'.78rem', padding:'5px 7px', height:'32px',
                        background: item.product_id ? 'var(--bg-tertiary,#f3f4f6)' : '' }} />

                    {/* Type */}
                    <select className="form-control" value={item.product_type}
                      onChange={e => handleItemChange(i, 'product_type', e.target.value)}
                      style={{ fontSize:'.75rem', padding:'5px 3px', height:'32px' }}>
                      {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    {/* Cost */}
                    <input type="number" className="form-control" value={item.unit_cost}
                      onChange={e => handleItemChange(i, 'unit_cost', e.target.value)}
                      placeholder="0"
                      style={{ fontSize:'.78rem', padding:'5px 6px', height:'32px' }} />

                    {/* Selling Price */}
                    <input type="number" className="form-control" value={item.recommended_selling_price}
                      onChange={e => handleItemChange(i, 'recommended_selling_price', e.target.value)}
                      placeholder="0"
                      style={{ fontSize:'.78rem', padding:'5px 6px', height:'32px' }} />

                    {/* Qty */}
                    <input type="number" min="1" className="form-control" value={item.qty}
                      onChange={e => handleItemChange(i, 'qty', e.target.value)}
                      style={{ fontSize:'.78rem', padding:'5px 6px', height:'32px' }} />

                    {/* Remove */}
                    {form.items.length > 1
                      ? <button onClick={() => removeItem(i)}
                          style={{ background:'none', border:'none', color:'var(--accent-red)', cursor:'pointer', fontSize:'1rem', padding:'0', textAlign:'center' }}>✕</button>
                      : <div />
                    }
                  </div>

                  {item.unit_cost && item.qty && (
                    <div style={{ textAlign:'right', fontSize:'.72rem', color:'var(--text-muted)', paddingRight:'34px', marginBottom:'2px', marginTop:'-2px' }}>
                      Sub: <strong style={{ color:'var(--text-primary)' }}>AED {Math.round((parseFloat(item.qty)||0)*(parseFloat(item.unit_cost)||0)).toLocaleString()}</strong>
                      {item.recommended_selling_price && item.unit_cost && (
                        <span style={{ marginLeft:'10px' }}>
                          Margin: AED {Math.round(((parseFloat(item.recommended_selling_price)||0)-(parseFloat(item.unit_cost)||0))*(parseFloat(item.qty)||0)).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              </div>{/* minWidth */}
              </div>{/* overflowX scroll */}

              <div style={{ textAlign: 'right', marginTop: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>
                Total: <span style={{ color: 'var(--accent)' }}>AED {Math.round(total).toLocaleString()}</span>
                {form.payment_type === 'cash' && <span style={{ marginLeft: '16px', color: 'var(--accent-green)', fontSize: '.9rem' }}>Fully Paid</span>}
                {form.payment_type === 'credit' && !form.amount_paid && <span style={{ marginLeft: '16px', color: 'var(--accent-red)', fontSize: '.9rem' }}>Due: AED {Math.round(total).toLocaleString()}</span>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
  					{submitting ? 'Creating...' : 'Create Purchase'}
		</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplier Payment Modal ── */}
      {showSupPay && (
        <div className="modal-overlay" onClick={() => setShowSupPay(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>💳 Pay Supplier — {showSupPay.supplier_name}</strong>
              <button className="modal-close" onClick={() => setShowSupPay(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ padding:'12px', background:'var(--bg-secondary)', borderRadius:'8px', marginBottom:'16px', fontSize:'.9rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span>Purchase Total:</span><strong>{fmt(showSupPay.total_amount)}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span>Already Paid:</span><strong style={{ color:'#059669' }}>{fmt(showSupPay.amount_paid)}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid var(--border)', paddingTop:'6px' }}>
                  <span>Outstanding:</span><strong style={{ color:'#dc2626' }}>{fmt(showSupPay.amount_due)}</strong>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Amount (AED) *</label>
                  <input type="number" className="form-control" value={supPayForm.amount}
                    onChange={e => setSupPayForm({ ...supPayForm, amount: e.target.value })} placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={supPayForm.payment_date}
                    onChange={e => setSupPayForm({ ...supPayForm, payment_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Method</label>
                  <select className="form-control" value={supPayForm.payment_method}
                    onChange={e => setSupPayForm({ ...supPayForm, payment_method: e.target.value })}>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Note</label>
                  <input className="form-control" value={supPayForm.note}
                    onChange={e => setSupPayForm({ ...supPayForm, note: e.target.value })} placeholder="Optional" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowSupPay(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSupplierPayment} disabled={paying}>
                {paying ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Supplier Modal ── */}
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
