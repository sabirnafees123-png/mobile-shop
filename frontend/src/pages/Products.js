import React, { useEffect, useState, useCallback } from 'react';
import { TableSkeleton, EmptyProducts } from '../components/UI';
import toast from 'react-hot-toast';
import api from '../utils/api';

const TYPES = ['New (Box Pack)', 'Used', 'Refurbished', 'Parts', 'Accessories', 'Wholesale'];
const CATEGORIES = ['Mobile', 'Laptop', 'Tab', 'Accessories', 'Ipad'];
const SUB_CATEGORIES = {
  Mobile:      ['Mobile'],
  Laptop:      ['Laptop', 'Macbook', 'Surface', 'Chromebook'],
  Tab:         ['Tab', 'Ipad'],
  Ipad:        ['Ipad'],
  Accessories: ['Earbuds', 'Smartwatch', 'Charger', 'keyboard', 'Strip', 'Cable', 'PowerBank', 'Controller', 'Pen', 'Belkin'],
};
const ALL_SUB = ['Mobile','Ipad','Tab','Laptop','Earbuds','Smartwatch','Celender','Macbook','Charger','keyboard','Strip','Surface','Belkin','Cable','Controller','Pen','PowerBank'];

const ADJUST_REASONS = ['Opening Stock', 'Stock Found', 'Damaged / Written Off', 'Returned from Customer', 'Supplier Return', 'Manual Correction'];

const EMPTY = {
  serial_number: '', name: '', brand: '', color: '',
  type: 'Used', description: '',
  base_cost: '', selling_price: '', is_active: true,
  category: '', sub_category: '', is_service: false,
};
const LIMIT = 50;
const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AE') : '—';

const typeBadgeColor = (t) => ({
  'New (Box Pack)': { bg: '#d1fae5', color: '#065f46' },
  'Used':           { bg: '#fef3c7', color: '#92400e' },
  'Refurbished':    { bg: '#dbeafe', color: '#1e40af' },
  'Parts':          { bg: '#f3e8ff', color: '#6b21a8' },
  'Accessories':    { bg: '#fce7f3', color: '#9d174d' },
  'Wholesale':      { bg: '#e0f2fe', color: '#0369a1' },
}[t] || { bg: '#f3f4f6', color: '#374151' });

export default function Products() {
  const [products, setProducts]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editing, setEditing]           = useState(null);
  const [form, setForm]                 = useState(EMPTY);
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterSubCat, setFilterSubCat] = useState('');
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [totalCount, setTotalCount]     = useState(0);

  // Transactions modal
  const [txProduct, setTxProduct]   = useState(null);
  const [txData, setTxData]         = useState(null);
  const [txLoading, setTxLoading]   = useState(false);
  const [txTab, setTxTab]           = useState('sales');

  // Adjust modal
  const [adjProduct, setAdjProduct] = useState(null);
  const [shops, setShops]           = useState([]);
  const [adjForm, setAdjForm]       = useState({ shop_id: '', quantity: '', reason: 'Opening Stock', note: '' });
  const [adjSaving, setAdjSaving]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search)       params.search       = search;
    if (filterType)   params.type         = filterType;
    if (filterCat)    params.category     = filterCat;
    if (filterSubCat) params.sub_category = filterSubCat;
    api.get('/products', { params })
      .then(r => {
        setProducts(r.data?.data || []);
        setTotalPages(r.data?.pagination?.total_pages || 1);
        setTotalCount(r.data?.pagination?.total || 0);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [page, search, filterType, filterCat, filterSubCat]);

  useEffect(() => { setPage(1); }, [search, filterType, filterCat, filterSubCat]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || [])).catch(() => {});
  }, []);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...EMPTY, ...p }); setShowModal(true); };

  const openTx = async (p) => {
    setTxProduct(p); setTxData(null); setTxTab('sales'); setTxLoading(true);
    try {
      const r = await api.get(`/products/${p.id}/transactions`);
      setTxData(r.data?.data);
    } catch { toast.error('Failed to load transactions'); }
    finally { setTxLoading(false); }
  };

  const openAdj = (p) => {
    setAdjProduct(p);
    setAdjForm({ shop_id: '', quantity: '', reason: 'Opening Stock', note: '' });
  };

  const handleSubmit = async () => {
    if (!form.name)  return toast.error('Product name is required');
    if (!form.brand) return toast.error('Brand is required');
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, form);
        toast.success('Product updated!');
      } else {
        await api.post('/products', form);
        toast.success('Product added!');
      }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try { await api.delete(`/products/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const handleAdjust = async () => {
    if (!adjForm.shop_id)  return toast.error('Select a shop');
    if (!adjForm.quantity || adjForm.quantity === '0') return toast.error('Enter quantity');
    setAdjSaving(true);
    try {
      const r = await api.post(`/products/${adjProduct.id}/adjust`, {
        shop_id:  adjForm.shop_id,
        quantity: parseInt(adjForm.quantity),
        reason:   adjForm.reason,
        note:     adjForm.note || adjForm.reason,
      });
      toast.success(`Stock updated! New qty: ${r.data?.data?.quantity}`);
      setAdjProduct(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setAdjSaving(false); }
  };

  const clearFilters = () => { setSearch(''); setFilterType(''); setFilterCat(''); setFilterSubCat(''); };
  const subCatsForFilter = filterCat ? (SUB_CATEGORIES[filterCat] || ALL_SUB) : ALL_SUB;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📦 Products</div>
          <div className="page-subtitle">Showing {products.length} of {totalCount} product(s)</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Search</label>
            <input className="form-control" placeholder="Name, brand, serial number..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Category</label>
            <select className="form-control" value={filterCat}
              onChange={e => { setFilterCat(e.target.value); setFilterSubCat(''); }}>
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sub Category</label>
            <select className="form-control" value={filterSubCat} onChange={e => setFilterSubCat(e.target.value)}>
              <option value="">All Sub Categories</option>
              {subCatsForFilter.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Type</label>
            <select className="form-control" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: '2px' }} onClick={clearFilters}>✕ Clear</button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <TableSkeleton rows={8} cols={12} /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Serial No.</th><th>Product Name</th><th>Brand</th>
                  <th>Category</th><th>Sub Category</th><th>Type</th>
                  <th>Cost</th><th>Sell Price</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={11}><EmptyProducts onNew={openAdd} /></td></tr>
                ) : products.map((p, i) => {
                  const tc = typeBadgeColor(p.type);
                  return (
                    <tr key={p.id}>
                      <td>{(page - 1) * LIMIT + i + 1}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '.85rem', color: 'var(--text-muted)' }}>
                        {p.serial_number || '—'}
                      </td>
                      <td>
                        <strong>{p.name}</strong>
                        {p.is_service && <span style={{ marginLeft: '6px', background: '#eef2ff', color: '#6366f1', padding: '1px 6px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>🔧 Service</span>}
                      </td>
                      <td>{p.brand || '—'}</td>
                      <td>
                        {p.category ? (
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '.75rem', fontWeight: 600, background: '#eef2ff', color: '#6366f1' }}>{p.category}</span>
                        ) : '—'}
                      </td>
                      <td>
                        {p.sub_category ? (
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '.75rem', fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{p.sub_category}</span>
                        ) : '—'}
                      </td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '.78rem', fontWeight: 600, background: tc.bg, color: tc.color }}>{p.type || '—'}</span>
                      </td>
                      <td>{p.base_cost > 0 ? fmt(p.base_cost) : '—'}</td>
                      <td><strong>{fmt(p.selling_price)}</strong></td>
                      <td>
                        <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" title="View Transactions" onClick={() => openTx(p)}>📋</button>
                        <button className="btn btn-ghost btn-sm" title="Stock Adjustment" onClick={() => openAdj(p)}>⚖️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => handleDelete(p.id)}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '1rem', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
                <span style={{ fontSize: '.9rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Transactions Modal ───────────────────────────────────────── */}
      {txProduct && (
        <div className="modal-overlay" onClick={() => setTxProduct(null)}>
          <div className="modal" style={{ maxWidth: '760px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <strong>📋 Transactions — {txProduct.brand} {txProduct.name}</strong>
                {txProduct.serial_number && <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Serial: {txProduct.serial_number}</div>}
              </div>
              <button className="modal-close" onClick={() => setTxProduct(null)}>✕</button>
            </div>

            {/* Current stock summary */}
            {txData?.inventory?.length > 0 && (
              <div style={{ padding: '10px 20px', background: 'var(--bg-secondary)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {txData.inventory.map(inv => (
                  <div key={inv.shop_id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{inv.shop_name}:</span>
                    <strong style={{ color: inv.quantity === 0 ? '#dc2626' : inv.quantity <= inv.min_stock ? '#d97706' : '#059669' }}>
                      {inv.quantity} in stock
                    </strong>
                  </div>
                ))}
                {txData.inventory.length === 0 && <span style={{ fontSize: '.8rem', color: '#dc2626' }}>Not in inventory</span>}
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
              {[
                { key: 'sales',     label: `🧾 Sales (${txData?.sales?.length || 0})` },
                { key: 'purchases', label: `📥 Purchases (${txData?.purchases?.length || 0})` },
                { key: 'movements', label: `🔄 Movements (${txData?.movements?.length || 0})` },
              ].map(tab => (
                <button key={tab.key} onClick={() => setTxTab(tab.key)}
                  style={{
                    padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: '.85rem', fontWeight: txTab === tab.key ? 700 : 400,
                    color: txTab === tab.key ? 'var(--accent)' : 'var(--text-muted)',
                    borderBottom: txTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {txLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
              ) : (
                <>
                  {txTab === 'sales' && (
                    <table style={{ width: '100%', fontSize: '.85rem' }}>
                      <thead><tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Invoice</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Shop</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Price</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Status</th>
                      </tr></thead>
                      <tbody>
                        {txData?.sales?.length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No sales found</td></tr>
                        ) : txData?.sales?.map(s => (
                          <tr key={s.reference} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px' }}><strong style={{ color: 'var(--accent)' }}>{s.reference}</strong></td>
                            <td style={{ padding: '8px' }}>{fmtDate(s.date)}</td>
                            <td style={{ padding: '8px' }}>{s.shop_name}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{s.quantity}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(s.price)}</td>
                            <td style={{ padding: '8px' }}>
                              <span className={`badge ${s.payment_status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>{s.payment_status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {txTab === 'purchases' && (
                    <table style={{ width: '100%', fontSize: '.85rem' }}>
                      <thead><tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Purchase #</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Shop</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Cost</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Status</th>
                      </tr></thead>
                      <tbody>
                        {txData?.purchases?.length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No purchases found</td></tr>
                        ) : txData?.purchases?.map(p => (
                          <tr key={p.reference} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px' }}><strong style={{ color: 'var(--accent)' }}>{p.reference}</strong></td>
                            <td style={{ padding: '8px' }}>{fmtDate(p.date)}</td>
                            <td style={{ padding: '8px' }}>{p.shop_name}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{p.quantity}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(p.price)}</td>
                            <td style={{ padding: '8px' }}>
                              <span className={`badge ${p.payment_status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>{p.payment_status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {txTab === 'movements' && (
                    <table style={{ width: '100%', fontSize: '.85rem' }}>
                      <thead><tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Type</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Note</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Qty</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Date</th>
                      </tr></thead>
                      <tbody>
                        {txData?.movements?.length === 0 ? (
                          <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No movements found</td></tr>
                        ) : txData?.movements?.map((m, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px' }}>
                              <span style={{ fontWeight: 700, color: m.movement_type === 'in' ? '#059669' : '#dc2626' }}>
                                {m.movement_type === 'in' ? '▲ IN' : '▼ OUT'}
                              </span>
                            </td>
                            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{m.note || '—'}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{m.quantity}</td>
                            <td style={{ padding: '8px' }}>{fmtDate(m.date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Adjustment Modal ───────────────────────────────────── */}
      {adjProduct && (
        <div className="modal-overlay" onClick={() => setAdjProduct(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <strong>⚖️ Stock Adjustment</strong>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {adjProduct.brand} {adjProduct.name}
                </div>
              </div>
              <button className="modal-close" onClick={() => setAdjProduct(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Shop *</label>
                  <select className="form-control" value={adjForm.shop_id}
                    onChange={e => setAdjForm({ ...adjForm, shop_id: e.target.value })}>
                    <option value="">Select shop...</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Quantity *</label>
                  <input type="number" className="form-control" value={adjForm.quantity}
                    onChange={e => setAdjForm({ ...adjForm, quantity: e.target.value })}
                    placeholder="Use negative to remove (e.g. -2)" />
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Positive = add stock &nbsp;|&nbsp; Negative = remove stock
                  </div>
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Reason</label>
                  <select className="form-control" value={adjForm.reason}
                    onChange={e => setAdjForm({ ...adjForm, reason: e.target.value })}>
                    {ADJUST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Note (optional)</label>
                  <input className="form-control" value={adjForm.note}
                    onChange={e => setAdjForm({ ...adjForm, note: e.target.value })}
                    placeholder="Additional details..." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setAdjProduct(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdjust} disabled={adjSaving}>
                {adjSaving ? 'Saving...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Product Modal ───────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{editing ? 'Edit Product' : 'Add Product'}</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {TYPES.map(t => {
                    const tc = typeBadgeColor(t);
                    return (
                      <button key={t} onClick={() => setForm({ ...form, type: t })}
                        style={{
                          padding: '8px 4px', borderRadius: '8px', fontSize: '.82rem', fontWeight: 600,
                          border: `2px solid ${form.type === t ? tc.color : 'var(--border)'}`,
                          background: form.type === t ? tc.bg : 'transparent',
                          color: form.type === t ? tc.color : 'var(--text-muted)', cursor: 'pointer',
                        }}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Serial / IMEI Number</label>
                  <input className="form-control" placeholder="Scan or type serial number..."
                    value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} autoComplete="off" />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Product Name *</label>
                  <input className="form-control" placeholder="e.g. iPhone 14 Pro Max 256GB"
                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Brand *</label>
                  <input className="form-control" placeholder="Apple, Samsung..."
                    value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Color</label>
                  <input className="form-control" placeholder="Black, White, Gold..."
                    value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-control" value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value, sub_category: '' })}>
                    <option value="">— Select Category —</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sub Category</label>
                  <select className="form-control" value={form.sub_category}
                    onChange={e => setForm({ ...form, sub_category: e.target.value })}>
                    <option value="">— Select Sub Category —</option>
                    {(form.category ? (SUB_CATEGORIES[form.category] || ALL_SUB) : ALL_SUB).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Base Cost (AED)</label>
                  <input type="number" className="form-control" value={form.base_cost}
                    onChange={e => setForm({ ...form, base_cost: e.target.value })} placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price (AED)</label>
                  <input type="number" className="form-control" value={form.selling_price}
                    onChange={e => setForm({ ...form, selling_price: e.target.value })} placeholder="0" />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 14px', background: form.is_service ? '#eef2ff' : '#f8fafc', borderRadius: '8px', border: `1.5px solid ${form.is_service ? '#6366f1' : '#e2e8f0'}` }}>
                    <input type="checkbox" checked={form.is_service || false}
                      onChange={e => setForm({ ...form, is_service: e.target.checked })}
                      style={{ width: '18px', height: '18px', accentColor: '#6366f1' }} />
                    <div>
                      <div style={{ fontWeight: 600, color: form.is_service ? '#6366f1' : '#0f172a' }}>🔧 Service / Repair Item</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>No inventory deducted when sold — for repairs, services, labour charges</div>
                    </div>
                  </label>
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Description / Notes</label>
                  <input className="form-control" value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional — deal details, specs, etc." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                {editing ? 'Update' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
