import React, { useEffect, useState } from 'react';
import { TableSkeleton, EmptyProducts, ErrorState } from '../components/UI';
import toast from 'react-hot-toast';
import api from '../utils/api';

const TYPES = ['New (Box Pack)', 'Used', 'Refurbished', 'Parts', 'Accessories', 'Wholesale'];

const EMPTY = {
  serial_number: '', name: '', brand: '', color: '',
  type: 'Used', description: '',
  base_cost: '', selling_price: '', is_active: true,
};

const LIMIT = 50;

export default function Products() {
  const [products, setProducts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('');

  // Pagination state
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const load = () => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search)     params.search = search;
    if (filterType) params.type   = filterType;
    api.get('/products', { params })
      .then(r => {
        setProducts(r.data?.data || []);
        setTotalPages(r.data?.pagination?.total_pages || 1);
        setTotalCount(r.data?.pagination?.total || 0);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, filterType]);

  // Fetch whenever page, search, or filterType changes
  useEffect(() => { load(); }, [page, search, filterType]);

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

  const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;

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
          <div className="page-title">📦 Products</div>
          <div className="page-subtitle">
            Showing {products.length} of {totalCount} product(s)
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      {/* Search + Filter */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            placeholder="🔍 Search name, brand, serial number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: '200px' }}
          />
          <select
            className="form-control" style={{ width: 'auto' }}
            value={filterType} onChange={e => setFilterType(e.target.value)}
          >
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <TableSkeleton rows={8} cols={10} />  : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Serial No.</th>
                  <th>Product Name</th>
                  <th>Brand</th>
                  <th>Color</th>
                  <th>Type</th>
                  <th>Cost</th>
                  <th>Sell Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={10}>
                    <EmptyProducts onNew={openAdd} />
                  </td></tr>
                ) : products.map((p, i) => {
                  const tc = typeBadgeColor(p.type);
                  return (
                    <tr key={p.id}>
                      <td>{(page - 1) * LIMIT + i + 1}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '.85rem', color: 'var(--text-muted)' }}>
                        {p.serial_number || '—'}
                      </td>
                      <td><strong>{p.name}</strong></td>
                      <td>{p.brand || '—'}</td>
                      <td>
                        {p.color ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color.toLowerCase(), border: '1px solid #ddd' }} />
                            {p.color}
                          </div>
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

            {/* Pagination bar */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '1rem', borderTop: '1px solid var(--border)' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: '.9rem', color: 'var(--text-muted)' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page === totalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal — unchanged */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
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
                      <button key={t}
                        onClick={() => setForm({ ...form, type: t })}
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
                  <label className="form-label">Serial / IMEI Number
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      (scan barcode or type manually)
                    </span>
                  </label>
                  <input
                    className="form-control"
                    placeholder="Scan or type serial number..."
                    value={form.serial_number}
                    onChange={e => setForm({ ...form, serial_number: e.target.value })}
                    autoComplete="off"
                  />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Product Name *</label>
                  <input className="form-control"
                    placeholder="e.g. iPhone 14 Pro Max 256GB"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Brand *</label>
                  <input className="form-control"
                    placeholder="Apple, Samsung..."
                    value={form.brand}
                    onChange={e => setForm({ ...form, brand: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Color</label>
                  <input className="form-control"
                    placeholder="Black, White, Gold..."
                    value={form.color}
                    onChange={e => setForm({ ...form, color: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Base Cost (AED)</label>
                  <input type="number" className="form-control"
                    value={form.base_cost}
                    onChange={e => setForm({ ...form, base_cost: e.target.value })}
                    placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price (AED)</label>
                  <input type="number" className="form-control"
                    value={form.selling_price}
                    onChange={e => setForm({ ...form, selling_price: e.target.value })}
                    placeholder="0" />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Description / Notes</label>
                  <input className="form-control"
                    value={form.description}
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