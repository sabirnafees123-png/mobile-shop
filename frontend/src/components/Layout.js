import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Layout({ children, user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  // Define nav items with role restrictions
  const navItems = [
    { path: '/',           label: 'Dashboard',  icon: '📊', roles: ['admin', 'staff', 'accountant'] },
    { path: '/products',   label: 'Products',   icon: '📱', roles: ['admin', 'staff', 'accountant'] },
    { path: '/inventory',  label: 'Inventory',  icon: '📦', roles: ['admin', 'staff', 'accountant'] },
    { path: '/purchases',  label: 'Purchases',  icon: '🛒', roles: ['admin', 'staff', 'accountant'] },
    { path: '/sales',      label: 'Sales',      icon: '💰', roles: ['admin', 'staff', 'accountant'] },
    { path: '/suppliers',  label: 'Suppliers',  icon: '🏭', roles: ['admin', 'staff', 'accountant'] },
    { path: '/customers',  label: 'Customers',  icon: '👥', roles: ['admin', 'staff', 'accountant'] },
    { path: '/expenses',   label: 'Expenses',   icon: '💸', roles: ['admin', 'accountant'] }, // Hidden from staff
  ];

  const visibleNavItems = navItems.filter(item =>
    !item.roles || item.roles.includes(user?.role)
  );

  const roleColors = {
    admin: '#4f8ef7',
    accountant: '#10b981',
    staff: '#f59e0b',
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <aside style={{ ...styles.sidebar, width: sidebarOpen ? '240px' : '64px' }}>
        {/* Toggle button */}
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={styles.toggleBtn}>
          {sidebarOpen ? '◀' : '▶'}
        </button>

        {/* Logo */}
        <div style={styles.logoArea}>
          <span style={styles.logoIcon}>📱</span>
          {sidebarOpen && <span style={styles.logoText}>MobileShop</span>}
        </div>

        {/* Navigation */}
        <nav style={styles.nav}>
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              style={({ isActive }) => ({
                ...styles.navLink,
                background: isActive ? 'rgba(79,142,247,0.15)' : 'transparent',
                color: isActive ? '#4f8ef7' : '#aaaacc',
                borderLeft: isActive ? '3px solid #4f8ef7' : '3px solid transparent',
              })}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              {sidebarOpen && <span style={styles.navLabel}>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User Profile + Logout (bottom of sidebar) */}
        <div style={styles.userSection}>
          {sidebarOpen ? (
            <>
              <div style={styles.userInfo}>
                <div style={styles.userAvatar}>
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div style={styles.userDetails}>
                  <span style={styles.userName}>{user?.name || 'User'}</span>
                  <span style={{
                    ...styles.userRole,
                    color: roleColors[user?.role] || '#8888aa'
                  }}>
                    {user?.role?.toUpperCase()}
                  </span>
                </div>
              </div>
              <button onClick={handleLogout} style={styles.logoutBtn}>
                🚪 Logout
              </button>
            </>
          ) : (
            <button onClick={handleLogout} style={styles.logoutBtnSmall} title="Logout">
              🚪
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        {/* Top bar */}
        <header style={styles.topBar}>
          <div style={styles.pageTitle}>
            Welcome back, <strong style={{ color: '#4f8ef7' }}>{user?.name}</strong>
          </div>
          <div style={styles.topBarRight}>
            <span style={{
              background: roleColors[user?.role] + '22',
              color: roleColors[user?.role],
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600',
            }}>
              {user?.role?.toUpperCase()}
            </span>
          </div>
        </header>

        {/* Page content */}
        <div style={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    background: '#0f0f1a',
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
  },
  sidebar: {
    background: '#12121f',
    borderRight: '1px solid #2a2a4a',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.3s ease',
    overflow: 'hidden',
    flexShrink: 0,
    position: 'relative',
  },
  toggleBtn: {
    position: 'absolute',
    top: '12px',
    right: '8px',
    background: 'none',
    border: '1px solid #2a2a4a',
    color: '#8888aa',
    borderRadius: '6px',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    fontSize: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '20px 16px',
    borderBottom: '1px solid #2a2a4a',
    minHeight: '64px',
  },
  logoIcon: { fontSize: '24px', flexShrink: 0 },
  logoText: { color: '#ffffff', fontWeight: '700', fontSize: '16px', whiteSpace: 'nowrap' },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0',
    flex: 1,
    overflowY: 'auto',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    textDecoration: 'none',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  navIcon: { fontSize: '18px', flexShrink: 0, width: '24px', textAlign: 'center' },
  navLabel: { fontSize: '14px', fontWeight: '500' },
  userSection: {
    padding: '12px',
    borderTop: '1px solid #2a2a4a',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  userAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #4f8ef7, #7c3aed)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: '14px',
    flexShrink: 0,
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  userName: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userRole: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.5px',
  },
  logoutBtn: {
    width: '100%',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#ef4444',
    borderRadius: '8px',
    padding: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'background 0.2s',
  },
  logoutBtnSmall: {
    width: '40px',
    height: '36px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    margin: '0 auto',
    display: 'block',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  topBar: {
    background: '#12121f',
    borderBottom: '1px solid #2a2a4a',
    padding: '0 24px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  pageTitle: { color: '#aaaacc', fontSize: '14px' },
  topBarRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
  },
};