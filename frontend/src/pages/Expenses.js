// src/pages/Expenses.js
import React, { useEffect, useState } from 'react';
import { TableSkeleton, EmptyExpenses } from '../components/UI';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt     = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

const mkEmpty = () => ({
  category: '', sub_category: '', category_id: '', description: '', amount: '',
  payment_method: 'cash',
  expense_date: new Date().toISOString().split('T')[0],
  receipt_number: '', notes: '', payee: '',
  expense_type: 'one-time', status: 'paid', shop_id: '',
});

export default function Expenses() {
  const [expenses, setExpenses]     = useState([]);
  const [categories, setCategories] = useState([]); // Array of {id, category, sub_category}
  const [shops, setShops]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(mkEmpty());
  const [search, setSearch]         = useState('');
  const [filterShop, setFilterShop] = useState('');
  
  // We can derive unique main categories for filtering or forms
  const uniqueMainCats = [...new Set(categories.map(c => c.category))].sort();

  const loadCategories = () =>
    api.get('/expenses/categories').then(r => setCategories(r.data?.data || []));

  const load = (sid) => {
    setLoading(true);
    let params = [];
    if (sid) params.push(`shop_id=${sid}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    Promise.all([api.get(`/expenses${qs}`), api.get('/shops')])
      .then(([e, sh]) => {
        setExpenses(e.data?.data || []);
        setShops(sh.data?.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { load(filterShop); }, [filterShop]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...mkEmpty(), shop_id: shops.length===1 ? shops[0].id : (filterShop||'') });
    setShowModal(true);
  };
  const openEdit = (e) => {
    setEditing(e);
    setForm({ 
      ...mkEmpty(), 
      ...e, 
      amount: e.amount?.toString(),
      category: e.category || '',
      sub_category: e.sub_category || ''
    });
    setShowModal(true);
  };

  const handleMainCatChange = (val) => {
    setForm({ ...form, category: val, sub_category: '', category_id: '' });
  };

  const handleSubCatChange = (val) => {
    const matched = categories.find(c => c.category === form.category && c.sub_category === val);
    setForm({ ...form, sub_category: val, category_id: matched ? matched.id : '' });
  };

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    if (!form.shop_id)    return toast.error('Please select a shop');
    if (!form.category || !form.sub_category) return toast.error('Please select Category and Sub Category');
    
    const payload = { ...form, amount: parseFloat(form.amount) };
    try {
      if (editing) {
        await api.put(`/expenses/${editing.id}`, payload);
        toast.success('Expense updated!');
      } else {
        await api.post('/expenses', payload);
        toast.success('Expense recorded!');
      }
      setShowModal(false); setEditing(null);
      load(filterShop);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await api.delete(`/expenses/${id}`); toast.success('Deleted'); load(filterShop); }
    catch { toast.error('Failed to delete'); }
  };

  const filtered = expenses.filter(e =>
    (!search || e.description?.toLowerCase().includes(search.toLowerCase()) ||
     e.payee?.toLowerCase().includes(search.toLowerCase()) ||
     e.category?.toLowerCase().includes(search.toLowerCase()) ||
     e.sub_category?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalAll = expenses.reduce((s, e) => s + parseFloat(e.amount||0), 0);
  const totalThisMonth = expenses
    .filter(e => e.expense_date?.startsWith(new Date().toISOString().substring(0,7)))
    .reduce((s, e) => s + parseFloat(e.amount||0), 0);

  // Category breakdown by Main Category
  const catBreakdown = Object.entries(
    expenses.reduce((acc, e) => {
      const k = e.category || 'Other';
      acc[k] = (acc[k]||0) + parseFloat(e.amount||0);
      return acc;
    }, {})
  ).sort((a,b) => b[1]-a[1]).slice(0,5);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">💸 Expenses</div>
          <div className="page-subtitle">{filtered.length} record(s)</div>
        </div>
        <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
          <select className="form-control" style={{width:'auto'}} value={filterShop} onChange={e => setFilterShop(e.target.value)}>
            <option value="">All Shops</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Expense</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stat-grid" style={{marginBottom:'20px'}}>
        <div className="stat-card red">
          <div className="label">This Month</div>
          <div className="value">{fmt(totalThisMonth)}</div>
          <div className="sub">{expenses.filter(e=>e.expense_date?.startsWith(new Date().toISOString().substring(0,7))).length} record(s)</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Total (Filtered)</div>
          <div className="value">{fmt(totalAll)}</div>
          <div className="sub">{expenses.length} record(s)</div>
        </div>
        {catBreakdown[0] && (
          <div className="stat-card blue">
            <div className="label">Top Category</div>
            <div className="value" style={{fontSize:'1.1rem'}}>{catBreakdown[0][0]}</div>
            <div className="sub">{fmt(catBreakdown[0][1])}</div>
          </div>
        )}
      </div>

      {/* Category Breakdown Bar */}
      {catBreakdown.length > 0 && (
        <div className="card" style={{marginBottom:'20px',padding:'16px'}}>
          <div style={{fontWeight:600,marginBottom:'10px',fontSize:'.85rem',color:'var(--text-muted)',textTransform:'uppercase'}}>Category Breakdown</div>
          {catBreakdown.map(([cat,amt]) => {
            const pct = totalAll > 0 ? (amt/totalAll)*100 : 0;
            return (
              <div key={cat} style={{marginBottom:'8px'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'3px',fontSize:'.88rem'}}>
                  <span>{cat}</span><span style={{fontWeight:600}}>{fmt(amt)}</span>
                </div>
                <div style={{background:'var(--border)',borderRadius:'4px',height:'6px'}}>
                  <div style={{width:`${pct}%`,background:'var(--primary)',borderRadius:'4px',height:'6px',transition:'width 0.3s'}} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="card" style={{padding:'1rem',marginBottom:'1rem'}}>
        <input className="form-control" placeholder="🔍 Search description, payee, category..."
          value={search} onChange={e => setSearch(e.target.value)} style={{maxWidth:'400px'}} />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <TableSkeleton rows={8} cols={8} /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Category</th><th>Sub Category</th><th>Description</th><th>Shop</th>
                  <th>Payee</th><th>Method</th><th>Amount</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9}><EmptyExpenses onNew={openAdd} /></td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td><span style={{background:'var(--surface-alt,#f3f4f6)',padding:'2px 8px',borderRadius:'12px',fontSize:'.8rem', fontWeight: 600}}>{e.category||'—'}</span></td>
                    <td><span style={{color:'var(--text-muted)', fontSize:'.85rem'}}>{e.sub_category||'—'}</span></td>
                    <td>{e.description||'—'}</td>
                    <td><span className="badge badge-gray">{e.shop_name||'—'}</span></td>
                    <td>{e.payee||'—'}</td>
                    <td style={{textTransform:'capitalize'}}>{e.payment_method}</td>
                    <td style={{fontWeight:600,color:'#dc2626'}}>{fmt(e.amount)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{color:'var(--accent-red)'}} onClick={() => handleDelete(e.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{maxWidth:'640px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{editing ? 'Edit Expense' : '+ Add Expense'}</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* Shop */}
              <div className="form-group" style={{marginBottom:'1rem',padding:'0.75rem',background:'var(--bg-secondary)',borderRadius:'8px'}}>
                <label className="form-label">Shop <span style={{color:'var(--accent-red)'}}>*</span></label>
                <select className="form-control" value={form.shop_id}
                  onChange={e => setForm({...form,shop_id:e.target.value})}
                  style={{border:!form.shop_id?'2px solid var(--accent-red)':''}}>
                  <option value="">— Select Shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Dual Category Selectors */}
              <div className="form-grid" style={{marginBottom:'1rem'}}>
                <div className="form-group">
                  <label className="form-label">Category <span style={{color:'var(--accent-red)'}}>*</span></label>
                  <select className="form-control" value={form.category}
                    onChange={e => handleMainCatChange(e.target.value)}
                    style={{border:!form.category?'2px solid var(--accent-red)':''}}>
                    <option value="">— Select Category —</option>
                    {uniqueMainCats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sub Category <span style={{color:'var(--accent-red)'}}>*</span></label>
                  <select className="form-control" value={form.sub_category}
                    onChange={e => handleSubCatChange(e.target.value)}
                    disabled={!form.category}
                    style={{border:!form.sub_category?'2px solid var(--accent-red)':''}}>
                    <option value="">— Select Sub Category —</option>
                    {categories.filter(c => c.category === form.category).map(c => (
                      <option key={c.sub_category} value={c.sub_category}>{c.sub_category}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group" style={{flex:2}}>
                  <label className="form-label">Description</label>
                  <input className="form-control" value={form.description}
                    onChange={e => setForm({...form,description:e.target.value})} placeholder="What was this expense for?" />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (AED) *</label>
                  <input type="number" className="form-control" value={form.amount}
                    onChange={e => setForm({...form,amount:e.target.value})} placeholder="0" />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={form.expense_date}
                    onChange={e => setForm({...form,expense_date:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-control" value={form.payment_method}
                    onChange={e => setForm({...form,payment_method:e.target.value})}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status}
                    onChange={e => setForm({...form,status:e.target.value})}>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Payee (who was paid)</label>
                  <input className="form-control" value={form.payee}
                    onChange={e => setForm({...form,payee:e.target.value})} placeholder="Supplier, employee name..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Receipt #</label>
                  <input className="form-control" value={form.receipt_number}
                    onChange={e => setForm({...form,receipt_number:e.target.value})} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={form.notes}
                  onChange={e => setForm({...form,notes:e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editing ? 'Update' : 'Save Expense'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
