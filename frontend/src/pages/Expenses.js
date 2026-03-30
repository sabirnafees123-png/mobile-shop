// src/pages/Expenses.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const CATEGORIES = ['Rent', 'Utilities', 'Salary', 'Transport', 'Marketing', 'Repairs', 'Supplies', 'Other'];
const EMPTY = { category: 'Rent', description: '', amount: '', payment_method: 'cash', expense_date: new Date().toISOString().split('T')[0], receipt_number: '', notes: '' };

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const currency = process.env.REACT_APP_CURRENCY || 'AED';

  const load = () => {
    setLoading(true);
    api.get('/expenses').then(r => setExpenses(r.data?.data || [])).finally(() => setLoading(false));

  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    try {
      await api.post('/expenses', { ...form, amount: parseFloat(form.amount) });
      toast.success('Expense recorded!');
      setShowModal(false);
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Deleted');
      load();
    } catch (err) { toast.error(err.message); }
  };

  const fmt = n => `${currency} ${parseFloat(n || 0).toFixed(2)}`;
  const totalThisMonth = expenses
    .filter(e => e.expense_date?.startsWith(new Date().toISOString().substring(0, 7)))
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">💸 Expenses</div>
          <div className="page-subtitle">Track shop operating costs</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Expense</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card red">
          <div className="label">This Month</div>
          <div className="value">{fmt(totalThisMonth)}</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Total Records</div>
          <div className="value">{expenses.length}</div>
        </div>
        <div className="stat-card blue">
          <div className="label">Top Category</div>
          <div className="value" style={{ fontSize: '1.1rem' }}>
            {expenses.length > 0
              ? Object.entries(expenses.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {}))
                  .sort((a, b) => b[1] - a[1])[0]?.[0]
              : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Receipt #</th><th>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><p>No expenses recorded yet</p></div></td></tr>
                ) : expenses.map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.expense_date).toLocaleDateString('en-AE')}</td>
                    <td><span className="badge badge-yellow">{e.category}</span></td>
                    <td>{e.description || '—'}</td>
                    <td><span className="badge badge-blue">{e.payment_method}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.receipt_number || '—'}</td>
                    <td><strong style={{ color: 'var(--accent-red)' }}>{fmt(e.amount)}</strong></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(e.id)}
                        style={{ color: 'var(--accent-red)' }}>✕</button>
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
              <strong>Record Expense</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-control" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <input type="number" className="form-control" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-control" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                    {['cash', 'card', 'bank_transfer'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input className="form-control" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Receipt #</label>
                  <input className="form-control" value={form.receipt_number} onChange={e => setForm({ ...form, receipt_number: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>Save Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
