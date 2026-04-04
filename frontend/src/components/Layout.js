// src/components/Layout.js
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Layout({ children, user, onLogout }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const navItems = [
    { path: '/',          label: 'Dashboard', icon: '📊', roles: ['admin','staff','accountant'] },
    { path: '/products',  label: 'Products',  icon: '📱', roles: ['admin','staff','accountant'] },
    { path: '/inventory', label: 'Inventory', icon: '📦', roles: ['admin','staff','accountant'] },
    { path: '/purchases', label: 'Purchases', icon: '🛒', roles: ['admin','staff','accountant'] },
    { path: '/sales',     label: 'Sales',     icon: '💰', roles: ['admin','staff','accountant'] },
    { path: '/suppliers', label: 'Suppliers', icon: '🏭', roles: ['admin','staff','accountant'] },
    { path: '/customers', label: 'Customers', icon: '👥', roles: ['admin','staff','accountant'] },
    { path: '/expenses',  label: 'Expenses',  icon: '💸', roles: ['admin','accountant'] },
    { path: '/cheques',   label: 'Cheques',   icon: '🏦', roles: ['admin','accountant'] },
    { path: '/users',     label: 'Users',     icon: '👤', roles: ['admin'] },
    { path: '/reports',       label: 'Reports',       icon: '📊', roles: ['admin','accountant'] },
    { path: '/cash-register', label: 'Cash Register',  icon: '💵', roles: ['admin','accountant'] },
    { path: '/transfers',   label: 'Transfers',    icon: '🔄', roles: ['admin','staff'] },
    { path: '/obligations', label: 'Obligations',  icon: '📅', roles: ['admin','accountant'] },


  ];

  const roleColors = { admin: '#16a34a', accountant: '#2563eb', staff: '#d97706' };
  const visibleItems = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className="layout">
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <h2>📱 MobileShop</h2>
          <p>Sharjah Management System</p>
        </div>

        {/* Nav */}
        <nav>
          {visibleItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1rem', borderTop: '1px solid #d1fae5', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: '#dcfce7', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: '700', fontSize: '14px',
              color: '#16a34a', flexShrink: 0
            }}>
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: '600', fontSize: '13px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: roleColors[user?.role] }}>
                {user?.role?.toUpperCase()}
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost" style={{ width: '100%', color: '#dc2626', borderColor: '#fee2e2', justifyContent: 'center' }}>
            🚪 Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        {/* Top bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #d1fae5'
        }}>
          <div style={{ color: '#6b7280', fontSize: '14px' }}>
            Welcome back, <strong style={{ color: '#16a34a' }}>{user?.name}</strong>
          </div>
          <span style={{
            background: roleColors[user?.role] + '22',
            color: roleColors[user?.role],
            padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600'
          }}>
            {user?.role?.toUpperCase()}
          </span>
        </div>

        {children}
      </main>
    </div>
  );
}