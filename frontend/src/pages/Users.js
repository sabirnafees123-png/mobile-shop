// src/pages/Users.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const EMPTY = { name: '', email: '', password: '', role: 'staff' };
const ROLES = ['admin', 'staff', 'accountant'];

const roleColor = { admin: 'badge-red', staff: 'badge-blue', accountant: 'badge-green' };

export default function Users() {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showReset, setShowReset] = useState(null);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving]       = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const load = () => {
    setLoading(true);
    api.get('/auth/users')
      .then(r => setUsers(r.data?.data || []))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (u) => { setEditing(u); setForm({ name: u.name, email: u.email, role: u.role, password: '' }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name || !form.email) return toast.error('Name and email are required');
    if (!editing && (!form.password || form.password.length < 6))
      return toast.error('Password must be at least 6 characters');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/auth/users/${editing.id}`, {
          name: form.name, email: form.email,
          role: form.role, is_active: editing.is_active
        });
        toast.success('User updated!');
      } else {
        await api.post('/auth/register', form);
        toast.success('User created!');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const toggleActive = async (u) => {
    if (u.id === currentUser.id) return toast.error("Can't deactivate yourself");
    try {
      await api.put(`/auth/users/${u.id}`, { ...u, is_active: !u.is_active });
      toast.success(u.is_active ? 'User deactivated' : 'User activated');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6)
      return toast.error('Password must be at least 6 characters');
    setSaving(true);
    try {
      await api.post(`/auth/users/${showReset.id}/reset-password`, { newPassword });
      toast.success('Password reset successfully');
      setShowReset(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">👥 User Management</div>
          <div className="page-subtitle">Manage system users and roles</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:'1.5rem'}}>
        <div className="stat-card blue">
          <div className="label">Total Users</div>
          <div className="value">{users.length}</div>
        </div>
        <div className="stat-card green">
          <div className="label">Active</div>
          <div className="value">{users.filter(u => u.is_active).length}</div>
        </div>
        <div className="stat-card red">
          <div className="label">Inactive</div>
          <div className="value">{users.filter(u => !u.is_active).length}</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Admins</div>
          <div className="value">{users.filter(u => u.role === 'admin').length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state">No users found</div></td></tr>
                ) : users.map((u, i) => (
                  <tr key={u.id}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{u.name}</strong>
                      {u.id === currentUser.id && (
                        <span style={{marginLeft:'8px',fontSize:'.75rem',color:'var(--accent)',fontWeight:500}}>(You)</span>
                      )}
                    </td>
                    <td style={{color:'var(--text-muted)'}}>{u.email}</td>
                    <td><span className={`badge ${roleColor[u.role] || 'badge-gray'}`}>{u.role}</span></td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{color:'var(--text-muted)',fontSize:'.85rem'}}>
                      {new Date(u.created_at).toLocaleDateString('en-AE')}
                    </td>
                    <td>
                      <div style={{display:'flex',gap:'6px'}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✏️ Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setShowReset(u); setNewPassword(''); }}>🔑 Reset</button>
                        {u.id !== currentUser.id && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{color: u.is_active ? 'var(--accent-red)' : 'var(--accent-green)'}}
                            onClick={() => toggleActive(u)}>
                            {u.is_active ? '🚫 Deactivate' : '✅ Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{editing ? 'Edit User' : 'Add New User'}</strong>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-control" value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})} placeholder="John Doe" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-control" value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})} placeholder="email@..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select className="form-control" value={form.role}
                    onChange={e => setForm({...form, role: e.target.value})}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                {!editing && (
                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <input type="password" className="form-control" value={form.password}
                      onChange={e => setForm({...form, password: e.target.value})} placeholder="Min 6 characters" />
                  </div>
                )}
              </div>
              <div style={{marginTop:'12px',padding:'10px 14px',background:'var(--bg-secondary)',borderRadius:'8px',fontSize:'.85rem',color:'var(--text-muted)'}}>
                <strong>Roles:</strong> Admin = full access · Staff = sales & inventory · Accountant = expenses & cheques
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showReset && (
        <div className="modal-overlay" onClick={() => setShowReset(null)}>
          <div className="modal" style={{maxWidth:'400px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔑 Reset Password</strong>
              <button className="modal-close" onClick={() => setShowReset(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{marginBottom:'16px',color:'var(--text-muted)',fontSize:'.9rem'}}>
                Reset password for <strong>{showReset.name}</strong>
              </p>
              <div className="form-group">
                <label className="form-label">New Password *</label>
                <input type="password" className="form-control" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowReset(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResetPassword} disabled={saving}>
                {saving ? 'Saving...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
