// src/pages/Customers.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY = { name: '', phone: '', email: '', id_number: '', city: '', country: 'UAE', notes: '' };

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const currency = process.env.REACT_APP_CURRENCY || 'AED';

  const load = () => {
    setLoading(true);
    api.get('/customers').then(r => setCustomers(Array.isArray(r.data) ? r.data : (r.data?.data || []))).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!form.name) return toast.error('Customer name is required');
    try {
      await api.post('/customers', form);
      toast.success('Customer added!');
      setShowModal(false);
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const fmt = n => `${currency} ${parseFloat(n || 0).toFixed(2)}`;
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">👥 Customers</div><div className="page-subtitle">Customer accounts & credit</div></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Customer</button>
      </div>

      <div className="search-bar">
        <input className="form-control search-input" placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Emirates ID</th><th>City</th><th>Balance Due</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state"><p>No customers found</p></div></td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.phone || '—'}</td>
                    <td style={{fontFamily:'monospace',fontSize:'0.8rem'}}>{c.id_number || '—'}</td>
                    <td>{c.city || '—'}</td>
                    <td style={{color: c.balance > 0 ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight:600}}>
                      {fmt(c.balance)}
                      {c.balance > 0 && <span className="badge badge-red" style={{marginLeft:'0.5rem'}}>Due</span>}
                    </td>
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
              <strong>Add Customer</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {[['name','Full Name *'],['phone','Phone'],['email','Email'],['id_number','Emirates ID / Passport'],['city','City'],['country','Country']].map(([k,l]) => (
                  <div className="form-group" key={k}>
                    <label className="form-label">{l}</label>
                    <input className="form-control" value={form[k]} onChange={e => setForm({...form,[k]:e.target.value})} />
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
