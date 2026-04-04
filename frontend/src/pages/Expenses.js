// src/pages/Expenses.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const CATEGORIES = ['Rent', 'Utilities', 'Salary', 'Transport', 'Marketing', 'Repairs', 'Supplies', 'Visa Cost', 'License', 'Other'];
const EMPTY = {
  category: 'Rent', description: '', amount: '', payment_method: 'cash',
  expense_date: new Date().toISOString().split('T')[0],
  receipt_number: '', notes: '', payee: '', expense_type: 'one-time', status: 'paid'
};

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

export default function Expenses() {
  const [expenses, setExpenses]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/expenses').then(r => setExpenses(r.data?.data || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (e) => { setEditing(e); setForm({ ...e, amount: e.amount?.toString() }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    try {
      if (editing) {
        await api.put(`/expenses/${editing.id}`, { ...form, amount: parseFloat(form.amount) });
        toast.success('Expense updated!');
      } else {
        await api.post('/expenses', { ...form, amount: parseFloat(form.amount) });
        toast.success('Expense recorded!');
      }
      setShowModal(false);
      setForm(EMPTY);
      setEditing(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  const filtered = expenses.filter(e =>
    (!filterCat || e.category === filterCat) &&
    (!search || e.description?.toLowerCase().includes(search.toLowerCase()) ||
     e.payee?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalThisMonth = expenses
    .filter(e => e.expense_date?.startsWith(new Date().toISOString().substring(0, 7)))
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  const totalAll = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  const topCategory = expenses.length > 0
    ? Object.entries(expenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount || 0); return acc;
      }, {})).sort((a, b) => b[1] - a[1])[0]?.[0]
    : '—';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">💸 Expenses</div>
          <div className="page-subtitle">Track shop operating costs</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Expense</button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:'1.5rem'}}>
        <div className="stat-card red">
          <div className="label">This Month</div>
          <div className="value">{fmt(totalThisMonth)}</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Total All Time</div>
          <div className="value">{fmt(totalAll)}</div>
        </div>
        <div className="stat-card blue">
          <div className="label">Top Category</div>
          <div className="value" style={{fontSize:'1.1rem'}}>{topCategory}</div>
        </div>
        <div className="stat-card green">
          <div className="label">Total Records</div>
          <div className="value">{expenses.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{padding:'1rem',marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
          <input className="form-control" placeholder="🔍 Search description or payee..."
            value={search} onChange={e => setSearch(e.target.value)} style={{maxWidth:'280px'}} />
          <select className="form-control" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{maxWidth:'180px'}}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          {(search || filterCat) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); }}>Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Category</th><th>Description</th><th>Payee</th>
                  <th>Method</th><th>Amount</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><p>No expenses found</p></div></td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td><span className="badge badge-yellow">{e.category}</span></td>
                    <td>{e.description || '—'}</td>
                    <td>{e.payee || '—'}</td>
                    <td><span className="badge badge-blue">{e.payment_method}</span></td>
                    <td><strong style={{color:'var(--accent-red)'}}>{fmt(e.amount)}</strong></td>
                    <td>
                      <span className={`badge ${e.status==='paid'?'badge-green':'badge-yellow'}`}>
                        {e.status || 'paid'}
                      </span>
                    </td>
                    <td>
                      <div style={{display:'flex',gap:'4px'}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" style={{color:'var(--accent-red)'}}
                          onClick={() => handleDelete(e.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{padding:'10px 12px',fontWeight:600}}>Total</td>
                    <td style={{padding:'10px 12px',fontWeight:700,color:'var(--accent-red)'}}>
                      {fmt(filtered.reduce((s,e) => s+parseFloat(e.amount||0),0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{editing ? 'Edit Expense' : 'Record Expense'}</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-control" value={form.category}
                    onChange={e => setForm({...form, category: e.target.value})}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (AED) *</label>
                  <input type="number" className="form-control" placeholder="0"
                    value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={form.expense_date}
                    onChange={e => setForm({...form, expense_date: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payee (Paid To)</label>
                  <input className="form-control" placeholder="Person or company"
                    value={form.payee} onChange={e => setForm({...form, payee: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-control" value={form.payment_method}
                    onChange={e => setForm({...form, payment_method: e.target.value})}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status}
                    onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-control" value={form.expense_type}
                    onChange={e => setForm({...form, expense_type: e.target.value})}>
                    <option value="one-time">One-Time</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Receipt #</label>
                  <input className="form-control" value={form.receipt_number}
                    onChange={e => setForm({...form, receipt_number: e.target.value})} />
                </div>
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label className="form-label">Description</label>
                  <input className="form-control" value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})} />
                </div>
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={form.notes}
                    onChange={e => setForm({...form, notes: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                {editing ? 'Update Expense' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
