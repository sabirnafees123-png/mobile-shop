import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const CATEGORIES = ['Rent', 'Utilities', 'Salary', 'Transport', 'Marketing', 'Repairs', 'Supplies', 'Visa Cost', 'License', 'Other'];
const EMPTY = {
  category: 'Rent', description: '', amount: '', payment_method: 'cash',
  expense_date: new Date().toISOString().split('T')[0],
  receipt_number: '', notes: '', payee: '', expense_type: 'one-time', status: 'paid'
};

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const currency = process.env.REACT_APP_CURRENCY || 'AED';
  const fmt = n => `${currency} ${Math.round(parseFloat(n || 0)).toLocaleString()}`;

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

  const totalThisMonth = expenses
    .filter(e => e.expense_date?.startsWith(new Date().toISOString().substring(0, 7)))
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  const topCategory = expenses.length > 0
    ? Object.entries(expenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + 1; return acc;
      }, {})).sort((a, b) => b[1] - a[1])[0]?.[0]
    : '—';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">💸 Expenses</div>
          <div className="page-subtitle">Track shop operating costs</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setShowModal(true); }}>
          + Add Expense
        </button>
      </div>

      {/* Stats */}
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
          <div className="value" style={{ fontSize: '1.1rem' }}>{topCategory}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Payee</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={9}>
                    <div className="empty-state"><p>No expenses recorded yet</p></div>
                  </td></tr>
                ) : expenses.map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.expense_date).toLocaleDateString('en-AE')}</td>
                    <td><span className="badge badge-yellow">{e.category}</span></td>
                    <td>{e.description || '—'}</td>
                    <td>{e.payee || '—'}</td>
                    <td><span className="badge badge-gray">{e.expense_type || 'one-time'}</span></td>
                    <td><span className="badge badge-blue">{e.payment_method}</span></td>
                    <td><strong style={{ color: 'var(--accent-red)' }}>{fmt(e.amount)}</strong></td>
                    <td>
                      <span className={`badge ${e.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>
                        {e.status || 'paid'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(e.id)}
                        style={{ color: 'var(--accent-red)' }}>✕</button>
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
              <strong>Record Expense</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-control" value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount * ({currency})</label>
                  <input type="number" className="form-control" placeholder="0"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={form.expense_date}
                    onChange={e => setForm({ ...form, expense_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payee (Paid To)</label>
                  <input className="form-control" placeholder="Person or company"
                    value={form.payee}
                    onChange={e => setForm({ ...form, payee: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-control" value={form.payment_method}
                    onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-control" value={form.expense_type}
                    onChange={e => setForm({ ...form, expense_type: e.target.value })}>
                    <option value="one-time">One-Time</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Receipt #</label>
                  <input className="form-control" value={form.receipt_number}
                    onChange={e => setForm({ ...form, receipt_number: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} />
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