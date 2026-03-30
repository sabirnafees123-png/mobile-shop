// src/pages/Products.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY = { name: '', brand: '', model: '', category: 'Mobile Phone', storage: '', color: '', condition: 'Used', description: '' };

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/products').then(r => setProducts(r.data?.data || [])).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!form.name) return toast.error('Product name is required');
    try {
      await api.post('/products', form);
      toast.success('Product added!');
      setShowModal(false);
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(search.toLowerCase())
  );

  const conditionBadge = (c) => {
    const map = { New: 'badge-green', Used: 'badge-yellow', Refurbished: 'badge-blue', 'For Parts': 'badge-red' };
    return `badge ${map[c] || 'badge-gray'}`;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📱 Products</div>
          <div className="page-subtitle">Master product catalog</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Product</button>
      </div>

      <div className="search-bar">
        <input className="form-control search-input" placeholder="Search by name or brand..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Name</th><th>Brand</th><th>Model</th><th>Storage</th><th>Color</th><th>Condition</th><th>Category</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><p>No products found</p></div></td></tr>
                ) : filtered.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.brand || '—'}</td>
                    <td>{p.model || '—'}</td>
                    <td>{p.storage || '—'}</td>
                    <td>{p.color || '—'}</td>
                    <td><span className={conditionBadge(p.condition)}>{p.condition}</span></td>
                    <td>{p.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Add New Product</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {[['name','Product Name*'],['brand','Brand'],['model','Model'],['storage','Storage (e.g. 128GB)'],['color','Color']].map(([k,l]) => (
                  <div className="form-group" key={k}>
                    <label className="form-label">{l}</label>
                    <input className="form-control" value={form[k]} onChange={e => setForm({...form,[k]:e.target.value})} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Condition</label>
                  <select className="form-control" value={form.condition} onChange={e => setForm({...form,condition:e.target.value})}>
                    {['New','Used','Refurbished','For Parts'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-control" value={form.category} onChange={e => setForm({...form,category:e.target.value})}>
                    {['Mobile Phone','Tablet','Accessory','Laptop','Smartwatch','Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" rows={3} value={form.description} onChange={e => setForm({...form,description:e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>Save Product</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
