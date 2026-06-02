import React, { useEffect, useState } from 'react';
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

const EMPTY = {
  serial_number: '', name: '', brand: '', color: '',
  type: 'Used', description: '',
  base_cost: '', selling_price: '', is_active: true,
  category: '', sub_category: '', is_service: false,
};

const LIMIT = 50;

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

  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const load = () => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search)       params.search      = search;
    if (filterType)   params.type        = filterType;
    if (filterCat)    params.category    = filterCat;
    if (filterSubCat) params.sub_category = filterSubCat;
    api.get('/products', { params })
      .then(r => {
        setProducts(r.data?.data || []);
        setTotalPages(r.data?.pagination?.total_pages || 1);
        setTotalCount(r.data?.pagination?.total || 0);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(1); }, [search, filterType, filterCat, filterSubCat]);
  useEffect(() => { load(); }, [page, search, filterType, filterCat, filterSubCat]);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...EMPTY, ...p }); setShowModal(true); };

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
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  const clearFilters = () => {
    setSearch(''); setFilterType(''); setFilterCat(''); setFilterSubCat('');
  };

  const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;

  const typeBadgeColor = (t) => ({
    'New (Box Pack)': { bg: '#d1fae5', color: '#065f46' },
    'Used':           { bg: '#fef3c7', color: '#92400e' },
    'Refurbished':    { bg: '#dbeafe', color: '#1e40af' },
    'Parts':          { bg: '#f3e8ff', color: '#6b21a8' },
    'Accessories':    { bg: '#fce7f3', color: '#9d174d' },
    'Wholesale':      { bg: '#e0f2fe', color: '#0369a1' },
  }[t] || { bg: '#f3f4f6', color: '#374151' });

  // Sub categories to show in filter — depends on selected category
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
            <select className="form-control" value={filterSubCat}
              onChange={e => setFilterSubCat(e.target.value)}>
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
        {loading ? <TableSkeleton rows={8} cols={11} /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Serial No.</th>
                  <th>Product Name</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th>Sub Category</th>
                  <th>Type</th>
                  <th>Cost</th>
                  <th>Sell Price</th>
                  <th>Status</th>
                  <th>Actions</th>
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
                      <td><strong>{p.name}</strong>{p.is_service && <span style={{marginLeft:'6px',background:'#eef2ff',color:'#6366f1',padding:'1px 6px',borderRadius:'6px',fontSize:'11px',fontWeight:600}}>🔧 Service</span>}</td>
                      <td>{p.brand || '—'}</td>
                      <td>
                        {p.category ? (
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '.75rem', fontWeight: 600, background: '#eef2ff', color: '#6366f1' }}>
                            {p.category}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {p.sub_category ? (
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '.75rem', fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>
                            {p.sub_category}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '.78rem', fontWeight: 600, background: tc.bg, color: tc.color }}>
                          {p.type || '—'}
                        </span>
                      </td>
                      <td>{p.base_cost > 0 ? fmt(p.base_cost) : '—'}</td>
                      <td><strong>{fmt(p.selling_price)}</strong></td>
                      <td>
                        <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
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

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{editing ? 'Edit Product' : 'Add Product'}</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Type selector */}
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
                          color: form.type === t ? tc.color : 'var(--text-muted)',
                          cursor: 'pointer',
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

                {/* Category + Sub Category */}
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
                  <label style={{ display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', padding:'10px 14px', background: form.is_service ? '#eef2ff' : '#f8fafc', borderRadius:'8px', border:`1.5px solid ${form.is_service ? '#6366f1' : '#e2e8f0'}` }}>
                    <input type="checkbox" checked={form.is_service || false}
                      onChange={e => setForm({ ...form, is_service: e.target.checked })}
                      style={{ width:'18px', height:'18px', accentColor:'#6366f1' }} />
                    <div>
                      <div style={{ fontWeight:600, color: form.is_service ? '#6366f1' : '#0f172a' }}>🔧 Service / Repair Item</div>
                      <div style={{ fontSize:'12px', color:'#64748b' }}>No inventory deducted when sold — for repairs, services, labour charges</div>
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
