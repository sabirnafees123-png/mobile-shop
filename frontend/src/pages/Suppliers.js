// src/pages/Suppliers.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY = { name: '', phone: '', email: '', address: '', city: 'Sharjah', country: 'UAE', notes: '' };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const currency = process.env.REACT_APP_CURRENCY || 'AED';

  const load = () => {
    setLoading(true);
    api.get('/suppliers').then(r => setSuppliers(Array.isArray(r.data) ? r.data : (r.data?.data || []))).finally(() => setLoading(false));

  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!form.name) return toast.error('Supplier name is required');
    try {
      await api.post('/suppliers', form);
      toast.success('Supplier added!');
      setShowModal(false);
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const fmt = n => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">🏭 Suppliers</div><div className="page-subtitle">Supplier accounts & balances</div></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Supplier</button>
      </div>
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Balance Owed</th></tr></thead>
              <tbody>
                {suppliers.length === 0 ? (
                  <tr><td colSpan={4}><div className="empty-state"><p>No suppliers yet</p></div></td></tr>
                ) : suppliers.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.city}, {s.country}</td>
                    <td style={{color: s.balance > 0 ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight: 600}}>
                      {fmt(s.balance)}
                      {s.balance > 0 && <span className="badge badge-red" style={{marginLeft:'0.5rem'}}>Owed</span>}
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
              <strong>Add Supplier</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {[['name','Name *'],['phone','Phone'],['email','Email'],['city','City'],['country','Country']].map(([k,l]) => (
                  <div className="form-group" key={k}>
                    <label className="form-label">{l}</label>
                    <input className="form-control" value={form[k]} onChange={e => setForm({...form,[k]:e.target.value})} />
                  </div>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-control" rows={2} value={form.address} onChange={e => setForm({...form,address:e.target.value})} />
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
