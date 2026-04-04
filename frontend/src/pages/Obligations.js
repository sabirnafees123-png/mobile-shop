// src/pages/Obligations.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AE') : '—';

const TYPES = [
  { value: 'visa_expiry',     label: 'Visa Expiry',     icon: '🪪', color: '#f59e0b' },
  { value: 'license_expiry',  label: 'License Expiry',  icon: '📋', color: '#6366f1' },
  { value: 'leave',           label: 'Employee Leave',  icon: '🏖️', color: '#10b981' },
  { value: 'salary',          label: 'Salary',          icon: '💰', color: '#3b82f6' },
  { value: 'rent',            label: 'Rent',            icon: '🏢', color: '#ef4444' },
  { value: 'supplier_payment',label: 'Supplier Payment',icon: '🏭', color: '#8b5cf6' },
  { value: 'other',           label: 'Other',           icon: '📌', color: '#6b7280' },
];

const EMPTY = {
  shop_id: '', type: 'visa_expiry', title: '', person_name: '',
  due_date: '', amount: '', status: 'pending', notes: ''
};

const urgencyStyle = {
  overdue:  { bg: '#fee2e2', color: '#dc2626', label: '🔴 Overdue' },
  due_soon: { bg: '#fef3c7', color: '#d97706', label: '🟡 Due Soon' },
  upcoming: { bg: '#d1fae5', color: '#059669', label: '🟢 Upcoming' },
};

export default function Obligations() {
  const [items, setItems]         = useState([]);
  const [upcoming, setUpcoming]   = useState([]);
  const [shops, setShops]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [filterType, setFilterType]   = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterShop, setFilterShop]   = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType)   params.type    = filterType;
      if (filterStatus) params.status  = filterStatus;
      if (filterShop)   params.shop_id = filterShop;
      const [oblRes, upRes, shopRes] = await Promise.all([
        api.get('/obligations', { params }),
        api.get('/obligations/upcoming'),
        api.get('/shops'),
      ]);
      setItems(oblRes.data?.data || []);
      setUpcoming(upRes.data?.data || []);
      setShops(shopRes.data?.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterType, filterStatus, filterShop]);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...item, amount: item.amount?.toString() }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.title || !form.due_date || !form.type) return toast.error('Title, type and due date required');
    try {
      if (editing) {
        await api.put(`/obligations/${editing.id}`, form);
        toast.success('Updated!');
      } else {
        await api.post('/obligations', form);
        toast.success('Obligation added!');
      }
      setShowModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this obligation?')) return;
    try {
      await api.delete(`/obligations/${id}`);
      toast.success('Deleted');
      load();
    } catch { toast.error('Failed'); }
  };

  const markDone = async (item) => {
    try {
      await api.put(`/obligations/${item.id}`, { ...item, status: 'done' });
      toast.success('Marked as done!');
      load();
    } catch { toast.error('Failed'); }
  };

  const getTypeInfo = (type) => TYPES.find(t => t.value === type) || TYPES[TYPES.length - 1];

  const overdue  = upcoming.filter(u => u.urgency === 'overdue').length;
  const dueSoon  = upcoming.filter(u => u.urgency === 'due_soon').length;
  const totalAmt = upcoming.filter(u => u.amount > 0).reduce((s, u) => s + parseFloat(u.amount || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📅 Obligations & Reminders</div>
          <div className="page-subtitle">Track visa, license, leave, payments & more</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Obligation</button>
      </div>

      {/* Summary Cards */}
      <div className="stat-grid" style={{marginBottom:'1.5rem'}}>
        <div className="stat-card red">
          <div className="label">Overdue</div>
          <div className="value">{overdue}</div>
          <div className="sub">Needs immediate attention</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Due in 30 Days</div>
          <div className="value">{dueSoon}</div>
          <div className="sub">Coming up soon</div>
        </div>
        <div className="stat-card blue">
          <div className="label">Total Pending</div>
          <div className="value">{upcoming.length}</div>
          <div className="sub">All pending items</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Upcoming Amount</div>
          <div className="value">{fmt(totalAmt)}</div>
          <div className="sub">Financial obligations</div>
        </div>
      </div>

      {/* Upcoming alerts */}
      {upcoming.filter(u => u.urgency !== 'upcoming').length > 0 && (
        <div className="card" style={{marginBottom:'1rem',padding:'1rem'}}>
          <div style={{fontWeight:600,marginBottom:'12px',color:'#1a1a2e'}}>⚠️ Requires Attention</div>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {upcoming.filter(u => u.urgency !== 'upcoming').slice(0,5).map(u => {
              const typeInfo = getTypeInfo(u.type);
              const urg = urgencyStyle[u.urgency];
              return (
                <div key={u.id} style={{display:'flex',alignItems:'center',gap:'12px',
                  padding:'10px 14px',borderRadius:'8px',background:urg.bg}}>
                  <span style={{fontSize:'1.2rem'}}>{typeInfo.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,color:'#1a1a2e',fontSize:'.9rem'}}>{u.title}</div>
                    <div style={{fontSize:'.8rem',color:'#6b7280'}}>
                      {u.shop_name && <span>{u.shop_name} · </span>}
                      {u.person_name && <span>{u.person_name} · </span>}
                      Due: {fmtDate(u.due_date)}
                      {u.amount > 0 && <span style={{marginLeft:'8px',fontWeight:600}}>{fmt(u.amount)}</span>}
                    </div>
                  </div>
                  <span style={{padding:'3px 10px',borderRadius:'12px',fontSize:'.75rem',
                    fontWeight:600,background:'transparent',color:urg.color}}>
                    {urg.label}
                  </span>
                  <button className="btn btn-ghost btn-sm" style={{color:'#059669'}}
                    onClick={() => markDone(u)}>✓ Done</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{padding:'1rem',marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
          <select className="form-control" value={filterType} onChange={e => setFilterType(e.target.value)} style={{maxWidth:'180px'}}>
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{maxWidth:'150px'}}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="form-control" value={filterShop} onChange={e => setFilterShop(e.target.value)} style={{maxWidth:'150px'}}>
            <option value="">All Shops</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {(filterType || filterStatus || filterShop) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterType(''); setFilterStatus('pending'); setFilterShop(''); }}>Clear</button>
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
                  <th>Type</th><th>Title</th><th>Person</th><th>Shop</th>
                  <th>Due Date</th><th>Amount</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state">No obligations found</div></td></tr>
                ) : items.map(item => {
                  const typeInfo = getTypeInfo(item.type);
                  const isOverdue = item.status === 'pending' && new Date(item.due_date) < new Date();
                  return (
                    <tr key={item.id}>
                      <td>
                        <span style={{padding:'3px 8px',borderRadius:'12px',fontSize:'.78rem',
                          fontWeight:600,background:typeInfo.color+'22',color:typeInfo.color}}>
                          {typeInfo.icon} {typeInfo.label}
                        </span>
                      </td>
                      <td><strong>{item.title}</strong>{item.notes && <div style={{fontSize:'.78rem',color:'var(--text-muted)'}}>{item.notes}</div>}</td>
                      <td>{item.person_name || '—'}</td>
                      <td>{item.shop_name || 'All Shops'}</td>
                      <td style={{color: isOverdue ? 'var(--accent-red)' : 'inherit', fontWeight: isOverdue ? 700 : 400}}>
                        {fmtDate(item.due_date)}
                        {isOverdue && <span style={{marginLeft:'6px',fontSize:'.75rem'}}>⚠️</span>}
                      </td>
                      <td>{item.amount > 0 ? <strong>{fmt(item.amount)}</strong> : '—'}</td>
                      <td>
                        <span className={`badge ${item.status==='done'?'badge-green':item.status==='cancelled'?'badge-gray':'badge-yellow'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div style={{display:'flex',gap:'4px'}}>
                          {item.status === 'pending' && (
                            <button className="btn btn-ghost btn-sm" style={{color:'#059669'}} onClick={() => markDone(item)}>✓</button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>✏️</button>
                          <button className="btn btn-ghost btn-sm" style={{color:'var(--accent-red)'}} onClick={() => handleDelete(item.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
              <strong>{editing ? 'Edit Obligation' : 'Add Obligation'}</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Type *</label>
                  <select className="form-control" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Shop</label>
                  <select className="form-control" value={form.shop_id} onChange={e => setForm({...form, shop_id: e.target.value})}>
                    <option value="">All Shops</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label className="form-label">Title *</label>
                  <input className="form-control" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. John's Visa Expiry" />
                </div>
                <div className="form-group">
                  <label className="form-label">Person Name</label>
                  <input className="form-control" value={form.person_name} onChange={e => setForm({...form, person_name: e.target.value})} placeholder="Employee name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date *</label>
                  <input type="date" className="form-control" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (AED)</label>
                  <input type="number" className="form-control" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="pending">Pending</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label className="form-label">Notes</label>
                  <input className="form-control" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional notes" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editing ? 'Update' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
