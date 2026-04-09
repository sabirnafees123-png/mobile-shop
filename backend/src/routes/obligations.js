// src/pages/Obligations.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import ShopSelector from '../components/ShopSelector';

const fmt     = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => { try { return new Date(d).toLocaleDateString('en-AE'); } catch { return d; } };

const urgencyColor = u =>
  u === 'overdue'  ? '#dc2626' :
  u === 'due_soon' ? '#d97706' : '#059669';

const mkEmpty = () => ({
  shop_id: '',
  obligation_model: 'confirmed',   // 'cheque' | 'confirmed'
  type: 'payable',
  title: '',
  person_name: '',
  due_date: '',
  amount: '',
  status: 'pending',
  notes: '',
  category_id: '',
  cheque_id: '',
  is_recurring: false,
  recurrence_period: '',
});

export default function Obligations() {
  const [obligations, setObligations] = useState([]);
  const [cheques, setCheques]         = useState([]);
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
      api.get('/cheques'),
      api.get('/expenses/categories'),
      api.get('/shops'),
    ])
      .then(([o, ch, cat, sh]) => {
        setObligations(o.data?.data || []);
        setCheques(ch.data?.data || []);
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
  const openEdit = (o) => { setEditing(o); setForm({ ...o, amount: o.amount?.toString() }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.title)    return toast.error('Title is required');
    if (!form.due_date) return toast.error('Due date is required');
    if (!form.shop_id)  return toast.error('Please select a shop');
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
            value={filterModel}
            onChange={e => setFilterModel(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.9rem' }}
          >
            <option value=''>All Types</option>
            <option value='cheque'>Cheque-backed</option>
            <option value='confirmed'>Confirmed Liabilities</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.9rem' }}
          >
            <option value=''>All Statuses</option>
            <option value='pending'>Pending</option>
            <option value='paid'>Paid</option>
          </select>
          <button className='btn-primary' onClick={openAdd}>+ Add Obligation</button>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className='stat-grid' style={{ marginBottom: '20px' }}>
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

      {/* ── Explanation Banner ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: '4px' }}>📄 Cheque-backed Obligations</div>
          <div style={{ fontSize: '0.85rem', color: '#1e40af' }}>Payments tied to a physical cheque — supplier payments, post-dated cheques, rent. Track cheque number, bank, and status.</div>
        </div>
        <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>📋 Confirmed Liabilities</div>
          <div style={{ fontSize: '0.85rem', color: '#78350f' }}>Fixed charges with no cheque — salaries, visa fees, license renewal, utilities. Confirmed commitments paid by cash/transfer.</div>
        </div>
      </div>

      {loading ? <div className='loading'>Loading...</div> : (
        <div className='table-container'>
          <table className='table'>
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
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No obligations found</td></tr>
              ) : obligations.map(o => {
                const today = new Date().toISOString().split('T')[0];
                const isOverdue = o.status === 'pending' && o.due_date < today;
                return (
                  <tr key={o.id} style={{ opacity: o.status === 'paid' ? 0.6 : 1 }}>
                    <td>
                      <span style={{
                        background: o.obligation_model === 'cheque' ? '#dbeafe' : '#fef9c3',
                        color:      o.obligation_model === 'cheque' ? '#1d4ed8' : '#854d0e',
                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
                      }}>
                        {o.obligation_model === 'cheque' ? '📄 Cheque' : '📋 Confirmed'}
                      </span>
                    </td>
                    <td><strong>{o.title}</strong></td>
                    <td>
                      <span style={{ background: 'var(--surface-alt)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.8rem' }}>
                        {o.shop_name || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{o.category_name || '—'}</td>
                    <td>{o.person_name || '—'}</td>
                    <td style={{ color: isOverdue ? '#dc2626' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>
                      {fmtDate(o.due_date)}
                      {isOverdue && <span style={{ marginLeft: '4px', fontSize: '0.75rem', color: '#dc2626' }}>OVERDUE</span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(o.amount)}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {o.cheque_number ? `${o.bank || ''} #${o.cheque_number}` : '—'}
                    </td>
                    <td>
                      <span style={{
                        color: o.status === 'paid' ? '#059669' : isOverdue ? '#dc2626' : '#d97706',
                        fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase',
                      }}>
                        {o.status}
                      </span>
                      {o.is_recurring && <span style={{ marginLeft: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>↻</span>}
                    </td>
                    <td>
                      {o.status === 'pending' && (
                        <button className='btn-sm' style={{ background: '#059669', color: 'white', marginRight: '4px' }} onClick={() => markDone(o)}>✓ Paid</button>
                      )}
                      <button className='btn-sm' onClick={() => openEdit(o)}>Edit</button>
                      <button className='btn-sm btn-danger' style={{ marginLeft: '4px' }} onClick={() => handleDelete(o.id)}>Del</button>
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
          <div className='modal' style={{ maxWidth: '640px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>{editing ? 'Edit Obligation' : 'Add Obligation'}</h3>
              <button className='modal-close' onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className='modal-body' style={{ maxHeight: '75vh', overflowY: 'auto' }}>

              {/* Model toggle — most important choice */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Obligation Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { val: 'confirmed', label: '📋 Confirmed Liability', sub: 'Salary, visa, license, utilities — no cheque' },
                    { val: 'cheque',    label: '📄 Cheque-backed',        sub: 'Backed by a physical cheque' },
                  ].map(opt => (
                    <div
                      key={opt.val}
                      onClick={() => setForm({ ...form, obligation_model: opt.val })}
                      style={{
                        border: `2px solid ${form.obligation_model === opt.val ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: '10px', padding: '12px', cursor: 'pointer',
                        background: form.obligation_model === opt.val ? 'var(--primary-light, #eff6ff)' : 'var(--surface)',
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{opt.label}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className='form-group'>
                <label>Shop <span style={{ color: '#dc2626' }}>*</span></label>
                <select value={form.shop_id} onChange={e => setForm({ ...form, shop_id: e.target.value })}>
                  <option value=''>— Select Shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className='form-row'>
                <div className='form-group' style={{ flex: 2 }}>
                  <label>Title <span style={{ color: '#dc2626' }}>*</span></label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder='e.g. March Salary, Shop License Renewal' />
                </div>
                <div className='form-group'>
                  <label>Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value='payable'>Payable</option>
                    <option value='receivable'>Receivable</option>
                  </select>
                </div>
              </div>

              <div className='form-row'>
                <div className='form-group' style={{ flex: 1 }}>
                  <label>Category</label>
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    <option value=''>— Select —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className='form-group' style={{ flex: 1 }}>
                  <label>Person / Party</label>
                  <input value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} placeholder='Supplier, employee name...' />
                </div>
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label>Due Date <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type='date' value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className='form-group'>
                  <label>Amount (AED)</label>
                  <input type='number' value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder='0' />
                </div>
                <div className='form-group'>
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value='pending'>Pending</option>
                    <option value='paid'>Paid</option>
                  </select>
                </div>
              </div>

              {/* Cheque fields — only shown for cheque model */}
              {form.obligation_model === 'cheque' && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px', color: '#1d4ed8' }}>Cheque Details</div>
                  <div className='form-group'>
                    <label>Link to Cheque</label>
                    <select value={form.cheque_id} onChange={e => setForm({ ...form, cheque_id: e.target.value })}>
                      <option value=''>— Select Cheque (optional) —</option>
                      {cheques.map(ch => (
                        <option key={ch.id} value={ch.id}>
                          #{ch.cheque_number} · {ch.bank} · {fmt(ch.amount)} · {fmtDate(ch.due_date)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Confirmed liability — recurring option */}
              {form.obligation_model === 'confirmed' && (
                <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                    <input
                      type='checkbox'
                      checked={form.is_recurring}
                      onChange={e => setForm({ ...form, is_recurring: e.target.checked })}
                    />
                    <span style={{ fontWeight: 600, color: '#92400e' }}>Recurring charge</span>
                  </label>
                  {form.is_recurring && (
                    <select value={form.recurrence_period} onChange={e => setForm({ ...form, recurrence_period: e.target.value })}>
                      <option value=''>Select period</option>
                      <option value='monthly'>Monthly</option>
                      <option value='quarterly'>Quarterly</option>
                      <option value='yearly'>Yearly</option>
                    </select>
                  )}
                </div>
              )}

              <div className='form-group'>
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className='modal-footer'>
              <button className='btn-secondary' onClick={() => setShowModal(false)}>Cancel</button>
              <button className='btn-primary' onClick={handleSubmit}>{editing ? 'Update' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
