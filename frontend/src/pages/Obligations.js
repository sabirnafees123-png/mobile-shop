// src/pages/Obligations.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import ShopSelector from '../components/ShopSelector';

const fmt     = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => { try { return new Date(d).toLocaleDateString('en-AE'); } catch { return d; } };

const mkEmpty = () => ({
  shop_id: '',
  shop_allocation: 'single',       // 'single' | 'both' | 'split_equal'
  obligation_model: 'confirmed',   // 'cheque' | 'confirmed'
  type: 'payable',
  title: '',
  person_name: '',
  due_date: '',
  amount: '',
  status: 'pending',
  notes: '',
  category_id: '',
  cheque_number: '',
  bank: '',
  payee_payer: '',
  is_recurring: false,
  recurrence_period: '',
});

export default function Obligations() {
  const [obligations, setObligations] = useState([]);
  const [categories, setCategories]   = useState([]);
  const [shops, setShops]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(mkEmpty());
  const [filterShop, setFilterShop]   = useState('');
  const [filterModel, setFilterModel] = useState('');  // '' | 'cheque' | 'confirmed'
  const [filterStatus, setFilterStatus] = useState('pending');

  const load = (sid, model, status) => {
    setLoading(true);
    let params = [];
    if (sid)    params.push(`shop_id=${sid}`);
    if (model)  params.push(`obligation_model=${model}`);
    if (status) params.push(`status=${status}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    Promise.all([
      api.get(`/obligations${qs}`),
      api.get('/expenses/categories'),
      api.get('/shops'),
    ])
      .then(([o, cat, sh]) => {
        setObligations(o.data?.data || []);
        setCategories(cat.data?.data || []);
        setShops(sh.data?.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filterShop, filterModel, filterStatus); }, [filterShop, filterModel, filterStatus]);

  const openAdd  = () => {
    setEditing(null);
    setForm({ ...mkEmpty(), shop_id: shops.length === 1 ? shops[0].id : (filterShop || '') });
    setShowModal(true);
  };
  const openEdit = (o) => { setEditing(o); setForm({ ...mkEmpty(), ...o, amount: o.amount?.toString() }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.title)    return toast.error('Title is required');
    if (!form.due_date) return toast.error('Due date is required');
    if (form.shop_allocation === 'single' && !form.shop_id) return toast.error('Please select a shop, or choose Both/Split');
    try {
      const payload = { ...form, amount: parseFloat(form.amount || 0) };
      if (editing) {
        await api.put(`/obligations/${editing.id}`, payload);
        toast.success('Updated!');
      } else {
        await api.post('/obligations', payload);
        toast.success('Obligation added!');
      }
      setShowModal(false);
      load(filterShop, filterModel, filterStatus);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this obligation?')) return;
    try { await api.delete(`/obligations/${id}`); load(filterShop, filterModel, filterStatus); }
    catch { toast.error('Failed to delete'); }
  };

  const markDone = async (ob) => {
    try {
      await api.put(`/obligations/${ob.id}`, { ...ob, status: 'paid' });
      toast.success('Marked as paid!');
      load(filterShop, filterModel, filterStatus);
    } catch { toast.error('Failed'); }
  };

  const totalPending  = obligations.filter(o => o.status === 'pending').reduce((s, o) => s + parseFloat(o.amount || 0), 0);
  const totalOverdue  = obligations.filter(o => o.urgency === 'overdue' || (o.due_date < new Date().toISOString().split('T')[0] && o.status === 'pending')).reduce((s, o) => s + parseFloat(o.amount || 0), 0);
  const chequeObs     = obligations.filter(o => o.obligation_model === 'cheque');
  const confirmedObs  = obligations.filter(o => o.obligation_model !== 'cheque');

  return (
    <div>
      <div className='page-header'>
        <div>
          <div className='page-title'>Obligations</div>
          <div className='page-subtitle'>Upcoming payments & confirmed liabilities</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <ShopSelector shops={shops} value={filterShop} onChange={setFilterShop} includeAll={true} label='Shop' />
          <select
            className='form-control'
            value={filterModel}
            onChange={e => setFilterModel(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value=''>All Types</option>
            <option value='cheque'>Cheque-backed</option>
            <option value='confirmed'>Confirmed Liabilities</option>
          </select>
          <select
            className='form-control'
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value=''>All Statuses</option>
            <option value='pending'>Pending</option>
            <option value='paid'>Paid</option>
          </select>
          <button className='btn btn-primary' onClick={openAdd}>+ Add Obligation</button>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className='stat-grid'>
        <div className='stat-card red'>
          <div className='label'>Total Pending</div>
          <div className='value'>{fmt(totalPending)}</div>
          <div className='sub'>{obligations.filter(o => o.status === 'pending').length} item(s)</div>
        </div>
        <div className='stat-card red'>
          <div className='label'>Overdue</div>
          <div className='value'>{fmt(totalOverdue)}</div>
          <div className='sub'>past due date</div>
        </div>
        <div className='stat-card blue'>
          <div className='label'>Cheque-backed</div>
          <div className='value'>{chequeObs.length}</div>
          <div className='sub'>{fmt(chequeObs.reduce((s, o) => s + parseFloat(o.amount || 0), 0))}</div>
        </div>
        <div className='stat-card yellow'>
          <div className='label'>Confirmed Liabilities</div>
          <div className='value'>{confirmedObs.length}</div>
          <div className='sub'>{fmt(confirmedObs.reduce((s, o) => s + parseFloat(o.amount || 0), 0))}</div>
        </div>
      </div>

      {/* ── Month-wise Summary ── */}
      {(() => {
        const monthMap = {};
        obligations.filter(o => o.status === 'pending').forEach(o => {
          if (!o.due_date) return;
          const m = o.due_date.slice(0, 7); // YYYY-MM
          if (!monthMap[m]) monthMap[m] = 0;
          monthMap[m] += parseFloat(o.amount || 0);
        });
        const months = Object.keys(monthMap).sort();
        if (!months.length) return null;
        return (
          <div className='card' style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
            <div className='card-title' style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '1rem' }}>
              Monthly Breakdown — Pending
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {months.map(m => {
                const [y, mo] = m.split('-');
                const label = new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleString('en-AE', { month: 'short', year: 'numeric' });
                return (
                  <div key={m} style={{
                    padding: '0.65rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                    textAlign: 'center', minWidth: '110px', background: 'var(--bg-primary)',
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {fmt(monthMap[m])}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Explanation ── */}
      <div className='card' style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <span className='badge badge-blue' style={{ marginBottom: '6px' }}>Cheque-backed</span>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Payments tied to a physical cheque — supplier payments, post-dated cheques, rent.
          </div>
        </div>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <span className='badge badge-yellow' style={{ marginBottom: '6px' }}>Confirmed Liability</span>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Fixed charges with no cheque — salaries, visa fees, license renewal, utilities.
          </div>
        </div>
      </div>

      {loading ? <div className='loading'>Loading...</div> : (
        <div className='table-wrapper'>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Shop</th>
                <th>Category</th>
                <th>Person</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Cheque #</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {obligations.length === 0 ? (
                <tr><td colSpan={10}><div className='empty-state'>No obligations found</div></td></tr>
              ) : obligations.map(o => {
                const today = new Date().toISOString().split('T')[0];
                const isOverdue = o.status === 'pending' && o.due_date < today;
                return (
                  <tr key={o.id} style={{ opacity: o.status === 'paid' ? 0.55 : 1 }}>
                    <td>
                      <span className={`badge ${o.obligation_model === 'cheque' ? 'badge-blue' : 'badge-yellow'}`}>
                        {o.obligation_model === 'cheque' ? 'Cheque' : 'Confirmed'}
                      </span>
                    </td>
                    <td><strong>{o.title}</strong></td>
                    <td>
                      <span className='badge badge-gray'>{o.shop_name || 'Both / Split'}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{o.category_name?.trim().replace(/^\/|\/$/g, '').trim() || '—'}</td>
                    <td>{o.person_name || o.payee_payer || '—'}</td>
                    <td style={{ color: isOverdue ? 'var(--accent-red)' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>
                      {fmtDate(o.due_date)}
                      {isOverdue && <span className='badge badge-red' style={{ marginLeft: '6px' }}>Overdue</span>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{fmt(o.amount)}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {o.cheque_number ? `${o.bank || ''} #${o.cheque_number}` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${o.status === 'paid' ? 'badge-green' : isOverdue ? 'badge-red' : 'badge-yellow'}`}>
                        {o.status}
                      </span>
                      {o.is_recurring && <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }} title='Recurring'>↻</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {o.status === 'pending' && (
                          <button className='btn btn-success btn-sm' onClick={() => markDone(o)}>Paid</button>
                        )}
                        <button className='btn btn-ghost btn-sm' onClick={() => openEdit(o)}>Edit</button>
                        <button className='btn btn-danger btn-sm' onClick={() => handleDelete(o.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className='modal-overlay' onClick={() => setShowModal(false)}>
          <div className='modal' style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <strong>{editing ? 'Edit Obligation' : 'Add Obligation'}</strong>
              <button className='modal-close' onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className='modal-body'>

              {/* Model toggle — most important choice */}
              <div className='form-group'>
                <label className='form-label'>Obligation Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { val: 'confirmed', label: 'Confirmed Liability', sub: 'Salary, visa, license, utilities — no cheque' },
                    { val: 'cheque',    label: 'Cheque-backed',        sub: 'Backed by a physical cheque' },
                  ].map(opt => (
                    <div
                      key={opt.val}
                      onClick={() => setForm({ ...form, obligation_model: opt.val })}
                      style={{
                        border: `1.5px solid ${form.obligation_model === opt.val ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)', padding: '0.85rem 1rem', cursor: 'pointer',
                        background: form.obligation_model === opt.val ? 'var(--accent-light)' : 'transparent',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: form.obligation_model === opt.val ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shop allocation */}
              <div className='form-group'>
                <label className='form-label'>Shop Allocation</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '10px' }}>
                  {[
                    { val: 'single',      label: '1 Shop',      sub: 'Assign to one shop' },
                    { val: 'both',        label: 'Both Shops',  sub: 'Company level' },
                    { val: 'split_equal', label: 'Split 50/50', sub: 'Divide equally' },
                  ].map(opt => (
                    <div key={opt.val} onClick={() => setForm({ ...form, shop_allocation: opt.val })}
                      style={{
                        border: `1.5px solid ${form.shop_allocation === opt.val ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)', padding: '0.55rem', textAlign: 'center', cursor: 'pointer',
                        background: form.shop_allocation === opt.val ? 'var(--accent-light)' : 'transparent',
                      }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: form.shop_allocation === opt.val ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{opt.sub}</div>
                    </div>
                  ))}
                </div>
                {form.shop_allocation === 'single' && (
                  <select className='form-control' value={form.shop_id} onChange={e => setForm({ ...form, shop_id: e.target.value })}>
                    <option value=''>— Select Shop —</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {form.shop_allocation === 'split_equal' && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.65rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                    {fmt(parseFloat(form.amount || 0) / 2)} will be allocated to each shop
                  </div>
                )}
              </div>

              <div className='form-row'>
                <div className='form-group' style={{ flex: 2 }}>
                  <label className='form-label'>Title *</label>
                  <input className='form-control' value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder='e.g. March Salary, Shop License Renewal' />
                </div>
                <div className='form-group'>
                  <label className='form-label'>Type</label>
                  <select className='form-control' value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value='payable'>Payable</option>
                    <option value='receivable'>Receivable</option>
                  </select>
                </div>
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label className='form-label'>Category</label>
                  <select className='form-control' value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    <option value=''>— Select —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.category}{c.sub_category ? ' / ' + c.sub_category : ''}</option>)}
                  </select>
                </div>
                <div className='form-group'>
                  <label className='form-label'>Person / Party</label>
                  <input className='form-control' value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} placeholder='Supplier, employee name...' />
                </div>
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label className='form-label'>Due Date *</label>
                  <input type='date' className='form-control' value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className='form-group'>
                  <label className='form-label'>Amount (AED)</label>
                  <input type='number' className='form-control' value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder='0' />
                </div>
                <div className='form-group'>
                  <label className='form-label'>Status</label>
                  <select className='form-control' value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value='pending'>Pending</option>
                    <option value='paid'>Paid</option>
                  </select>
                </div>
              </div>

              {/* Cheque fields — only shown for cheque model */}
              {form.obligation_model === 'cheque' && (
                <div className='card' style={{ padding: '1rem', marginBottom: '1.25rem', background: 'var(--bg-secondary)' }}>
                  <div className='form-label' style={{ marginBottom: '0.75rem', color: 'var(--accent)' }}>Cheque Details</div>
                  <div className='form-row'>
                    <div className='form-group'>
                      <label className='form-label'>Cheque Number</label>
                      <input className='form-control' value={form.cheque_number} onChange={e => setForm({ ...form, cheque_number: e.target.value })} placeholder='e.g. 000123' />
                    </div>
                    <div className='form-group'>
                      <label className='form-label'>Bank</label>
                      <input className='form-control' value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} placeholder='Bank name' />
                    </div>
                  </div>
                  <div className='form-group' style={{ marginBottom: 0 }}>
                    <label className='form-label'>Payee / Payer</label>
                    <input className='form-control' value={form.payee_payer} onChange={e => setForm({ ...form, payee_payer: e.target.value })} placeholder='Name on the cheque' />
                  </div>
                </div>
              )}

              {/* Confirmed liability — recurring option */}
              {form.obligation_model === 'confirmed' && (
                <div className='card' style={{ padding: '1rem', marginBottom: '1.25rem', background: 'var(--bg-secondary)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: form.is_recurring ? '0.75rem' : 0 }}>
                    <input
                      type='checkbox'
                      checked={form.is_recurring}
                      onChange={e => setForm({ ...form, is_recurring: e.target.checked })}
                    />
                    <span className='form-label' style={{ marginBottom: 0 }}>Recurring charge</span>
                  </label>
                  {form.is_recurring && (
                    <select className='form-control' value={form.recurrence_period} onChange={e => setForm({ ...form, recurrence_period: e.target.value })}>
                      <option value=''>Select period</option>
                      <option value='monthly'>Monthly</option>
                      <option value='quarterly'>Quarterly</option>
                      <option value='yearly'>Yearly</option>
                    </select>
                  )}
                </div>
              )}

              <div className='form-group' style={{ marginBottom: 0 }}>
                <label className='form-label'>Notes</label>
                <input className='form-control' value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className='modal-footer'>
              <button className='btn btn-ghost' onClick={() => setShowModal(false)}>Cancel</button>
              <button className='btn btn-primary' onClick={handleSubmit}>{editing ? 'Update' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
