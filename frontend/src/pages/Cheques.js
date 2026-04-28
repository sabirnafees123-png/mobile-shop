// src/pages/Cheques.js
import React, { useEffect, useState } from 'react';
import { TableSkeleton, EmptyCheques } from '../components/UI';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY = {
  type: 'inbound', cheque_number: '', bank: '',
  payee_payer: '', amount: '', due_date: '', notes: '',
  shop_id: '', shop_allocation: 'single',
};

export default function Cheques() {
  const [cheques, setCheques]     = useState([]);
  const [shops, setShops]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/cheques'), api.get('/shops')])
      .then(([c, sh]) => {
        setCheques(c.data?.data || []);
        setShops(sh.data?.data || []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...EMPTY, ...c }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount');
    if (!form.payee_payer) return toast.error('Enter payee/payer name');
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      shop_id: form.shop_allocation === 'single' ? (form.shop_id || null) : null,
    };
    try {
      if (editing) {
        await api.put(`/cheques/${editing.id}`, payload);
        toast.success('Cheque updated!');
      } else {
        await api.post('/cheques', payload);
        toast.success('Cheque added!');
      }
      setShowModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const updateStatus = async (id, status) => {
    try {
      const cheque = cheques.find(c => c.id === id);
      await api.put(`/cheques/${id}`, { ...cheque, status });
      toast.success(`Marked as ${status}`);
      load();
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this cheque?')) return;
    try { await api.delete(`/cheques/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  const statusStyle = { pending: 'badge-yellow', cleared: 'badge-green', bounced: 'badge-red', cancelled: 'badge-gray' };
  const totalInbound  = cheques.filter(c => c.type === 'inbound'  && c.status === 'pending').reduce((s, c) => s + parseFloat(c.amount||0), 0);
  const totalOutbound = cheques.filter(c => c.type === 'outbound' && c.status === 'pending').reduce((s, c) => s + parseFloat(c.amount||0), 0);
  const overdue       = cheques.filter(c => c.status === 'pending' && new Date(c.due_date) < new Date()).length;

  const shopName = (id) => shops.find(s => s.id?.toString() === id?.toString())?.name || null;

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">🏦 Cheques</div><div className="page-subtitle">Track inbound & outbound cheques</div></div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Cheque</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card green"><div className="label">Pending Inbound</div><div className="value">{fmt(totalInbound)}</div></div>
        <div className="stat-card red"><div className="label">Pending Outbound</div><div className="value">{fmt(totalOutbound)}</div></div>
        <div className="stat-card yellow"><div className="label">Overdue</div><div className="value">{overdue}</div></div>
        <div className="stat-card blue"><div className="label">Total Cheques</div><div className="value">{cheques.length}</div></div>
      </div>

      <div className="card">
        {loading ? <TableSkeleton rows={6} cols={9} /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Type</th><th>Cheque #</th><th>Bank</th><th>Payee/Payer</th>
                  <th>Shop</th><th>Due Date</th><th>Amount</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cheques.length === 0 ? (
                  <tr><td colSpan={9}><EmptyCheques onNew={openAdd} /></td></tr>
                ) : cheques.map(c => (
                  <tr key={c.id}>
                    <td><span className={`badge ${c.type === 'inbound' ? 'badge-green' : 'badge-red'}`}>{c.type === 'inbound' ? '↓ IN' : '↑ OUT'}</span></td>
                    <td style={{ fontFamily: 'monospace' }}>{c.cheque_number || '—'}</td>
                    <td>{c.bank || '—'}</td>
                    <td><strong>{c.payee_payer}</strong></td>
                    <td>
                      {c.shop_allocation === 'both' ? (
                        <span style={{ fontSize: '.78rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '6px' }}>Both Shops</span>
                      ) : c.shop_allocation === 'split_equal' ? (
                        <span style={{ fontSize: '.78rem', background: '#f0fdf4', color: '#166534', padding: '2px 6px', borderRadius: '6px' }}>Split 50/50</span>
                      ) : (
                        <span style={{ fontSize: '.78rem' }}>{shopName(c.shop_id) || '—'}</span>
                      )}
                    </td>
                    <td style={{ color: c.status === 'pending' && new Date(c.due_date) < new Date() ? 'var(--accent-red)' : 'inherit' }}>
                      {c.due_date ? new Date(c.due_date).toLocaleDateString('en-AE') : '—'}
                    </td>
                    <td><strong>{fmt(c.amount)}</strong></td>
                    <td><span className={`badge ${statusStyle[c.status] || 'badge-gray'}`}>{c.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {c.status === 'pending' && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-green)' }}
                            onClick={() => updateStatus(c.id, 'cleared')}>✓ Clear</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => handleDelete(c.id)}>🗑️</button>
                      </div>
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{editing ? 'Edit Cheque' : 'Add Cheque'}</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Type *</label>
                  <select className="form-control" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="inbound">Inbound (Receiving)</option>
                    <option value="outbound">Outbound (Paying)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount * (AED)</label>
                  <input type="number" className="form-control" placeholder="0"
                    value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payee / Payer *</label>
                  <input className="form-control" placeholder="Name"
                    value={form.payee_payer} onChange={e => setForm({ ...form, payee_payer: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bank</label>
                  <input className="form-control" placeholder="Bank name"
                    value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cheque Number</label>
                  <input className="form-control" value={form.cheque_number}
                    onChange={e => setForm({ ...form, cheque_number: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input type="date" className="form-control" value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>

                {/* Shop allocation */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Shop Allocation</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '8px' }}>
                    {[
                      { val: 'single',     label: '1 Shop',     sub: 'Assign to one shop' },
                      { val: 'both',       label: 'Both Shops', sub: 'Company level' },
                      { val: 'split_equal',label: 'Split 50/50',sub: 'Divide equally' },
                    ].map(opt => (
                      <button key={opt.val} onClick={() => setForm({ ...form, shop_allocation: opt.val })}
                        style={{
                          padding: '8px', borderRadius: '8px', textAlign: 'center', cursor: 'pointer',
                          border: `2px solid ${form.shop_allocation === opt.val ? 'var(--accent)' : 'var(--border)'}`,
                          background: form.shop_allocation === opt.val ? 'var(--bg-secondary)' : 'transparent',
                        }}>
                        <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{opt.label}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                  {form.shop_allocation === 'single' && (
                    <select className="form-control" value={form.shop_id}
                      onChange={e => setForm({ ...form, shop_id: e.target.value })}>
                      <option value="">— No specific shop —</option>
                      {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  {form.shop_allocation === 'split_equal' && (
                    <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                      AED {Math.round(parseFloat(form.amount||0)/2).toLocaleString()} will be allocated to each shop
                    </div>
                  )}
                </div>

                {editing && (
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-control" value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="pending">Pending</option>
                      <option value="cleared">Cleared</option>
                      <option value="bounced">Bounced</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                )}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editing ? 'Update' : 'Add Cheque'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
