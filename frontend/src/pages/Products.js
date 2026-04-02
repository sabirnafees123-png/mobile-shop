import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY = { name: '', brand: '', model: '', category: 'Mobile Phone', storage: '', color: '', condition: 'Used', base_cost: '', selling_price: '', description: '' };

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const currency = process.env.REACT_APP_CURRENCY || 'AED';

  const load = () => {
    setLoading(true);
    api.get('/products', { params: search ? { search } : {} })
      .then(r => setProducts(r.data?.data || []))
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...EMPTY, ...p }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name) return toast.error('Product name is required');
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
      toast.success('Product deleted');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const fmt = n => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📦 Products</div>
          <div className="page-subtitle">Manage your product catalog</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      {/* Search */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <input
          className="form-control"
          placeholder="🔍 Search by name, brand, model..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: '400px' }}
        />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product Name</th>
                  <th>Brand / Model</th>
                  <th>Category</th>
                  <th>Condition</th>
                  <th>Cost</th>
                  <th>Sell Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state"><p>No products found. Click + Add Product to start.</p></div></td></tr>
                ) : products.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td><strong>{p.name}</strong></td>
                    <td>{[p.brand, p.model].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{p.category || '—'}</td>
                    <td>{p.condition || '—'}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{editing ? 'Edit Product' : 'Add Product'}</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Product Name *</label>
                  <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. iPhone 14 Pro 256GB Black" />
                </div>
                <div className="form-group">
                  <label className="form-label">Brand</label>
                  <input className="form-control" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="Apple, Samsung..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <input className="form-control" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Model number" />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-control" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    <option>Mobile Phone</option>
                    <option>Tablet</option>
                    <option>Laptop</option>
                    <option>Accessory</option>
                    <option>Repair Part</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Condition</label>
                  <select className="form-control" value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>
                    <option>Used</option>
                    <option>New</option>
                    <option>Refurbished</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Storage</label>
                  <input className="form-control" value={form.storage} onChange={e => setForm({ ...form, storage: e.target.value })} placeholder="64GB, 128GB..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Color</label>
                  <input className="form-control" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="Black, White..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Base Cost ({currency})</label>
                  <input type="number" className="form-control" value={form.base_cost} onChange={e => setForm({ ...form, base_cost: e.target.value })} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price ({currency})</label>
                  <input type="number" className="form-control" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Description</label>
                  <input className="form-control" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editing ? 'Update' : 'Add Product'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}