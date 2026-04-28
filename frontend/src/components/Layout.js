// src/components/Layout.js
import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Layout({ children, user, onLogout }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    onLogout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const navItems = [
    { path: '/',              label: 'Dashboard',     icon: DashboardIcon,    roles: ['admin','staff','accountant'] },
    { path: '/products',      label: 'Products',      icon: ProductsIcon,     roles: ['admin','staff','accountant'] },
    { path: '/inventory',     label: 'Inventory',     icon: InventoryIcon,    roles: ['admin','staff','accountant'] },
    { path: '/purchases',     label: 'Purchases',     icon: PurchasesIcon,    roles: ['admin','staff','accountant'] },
    { path: '/sales',         label: 'Sales',         icon: SalesIcon,        roles: ['admin','staff','accountant'] },
    { path: '/suppliers',     label: 'Suppliers',     icon: SuppliersIcon,    roles: ['admin','staff','accountant'] },
    { path: '/customers',     label: 'Customers',     icon: CustomersIcon,    roles: ['admin','staff','accountant'] },
    { path: '/expenses',      label: 'Expenses',      icon: ExpensesIcon,     roles: ['admin','accountant'] },
    { path: '/cheques',       label: 'Cheques',       icon: ChequesIcon,      roles: ['admin','accountant'] },
    { path: '/cash-register', label: 'Cash Register', icon: CashIcon,         roles: ['admin','accountant'] },
    { path: '/transfers',     label: 'Transfers',     icon: TransfersIcon,    roles: ['admin','staff'] },
    { path: '/obligations',   label: 'Obligations',   icon: ObligationsIcon,  roles: ['admin','accountant'] },
    { path: '/reports',       label: 'Reports',       icon: ReportsIcon,      roles: ['admin','accountant'] },
    { path: '/users',         label: 'Users',         icon: UsersIcon,        roles: ['admin'] },
  ];

  const roleConfig = {
    admin:      { color: '#6366f1', bg: '#eef2ff', label: 'Admin' },
    accountant: { color: '#0ea5e9', bg: '#e0f2fe', label: 'Accountant' },
    staff:      { color: '#f59e0b', bg: '#fef3c7', label: 'Staff' },
  };

  const visibleItems = navItems.filter(item => item.roles.includes(user?.role));
  const role = roleConfig[user?.role] || roleConfig.staff;
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .layout-root {
          display: flex;
          min-height: 100vh;
          background: #f8fafc;
          font-family: 'Inter', sans-serif;
        }

        /* ── Overlay (mobile) ── */
        .sidebar-overlay {
          display: none;
          position: fixed; inset: 0;
          background: rgba(15,23,42,0.45);
          z-index: 40;
          backdrop-filter: blur(2px);
        }
        .sidebar-overlay.open { display: block; }

        /* ── Sidebar ── */
        .sidebar-v2 {
          position: fixed; top: 0; left: 0; bottom: 0;
          width: 240px;
          background: #0f172a;
          display: flex; flex-direction: column;
          transition: width 0.25s cubic-bezier(.4,0,.2,1), transform 0.25s cubic-bezier(.4,0,.2,1);
          z-index: 50;
          overflow: hidden;
        }
        .sidebar-v2.collapsed { width: 68px; }

        @media (max-width: 768px) {
          .sidebar-v2 { transform: translateX(-100%); width: 240px !important; }
          .sidebar-v2.mobile-open { transform: translateX(0); }
        }

        /* Brand */
        .sb-brand {
          display: flex; align-items: center; gap: 10px;
          padding: 20px 16px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
          min-height: 64px;
        }
        .sb-logo {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #6366f1, #818cf8);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(99,102,241,0.4);
        }
        .sb-logo svg { width: 20px; height: 20px; }
        .sb-brand-text { overflow: hidden; transition: opacity 0.2s, width 0.25s; white-space: nowrap; }
        .sb-brand-text h2 { font-size: 15px; font-weight: 700; color: #f1f5f9; letter-spacing: -0.3px; }
        .sb-brand-text p  { font-size: 10px; color: #64748b; margin-top: 1px; letter-spacing: 0.3px; }
        .collapsed .sb-brand-text { opacity: 0; width: 0; }

        /* Collapse toggle */
        .sb-toggle {
          margin-left: auto; flex-shrink: 0;
          width: 24px; height: 24px; border-radius: 6px;
          background: rgba(255,255,255,0.06);
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #94a3b8; transition: background 0.15s, color 0.15s;
        }
        .sb-toggle:hover { background: rgba(255,255,255,0.12); color: #f1f5f9; }
        .collapsed .sb-toggle { margin-left: 0; }

        @media (max-width: 768px) { .sb-toggle { display: none; } }

        /* Nav */
        .sb-nav {
          flex: 1; overflow-y: auto; overflow-x: hidden;
          padding: 10px 8px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .sb-nav::-webkit-scrollbar { width: 4px; }
        .sb-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

        .nav-item-v2 {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 10px; border-radius: 8px;
          text-decoration: none;
          color: #94a3b8;
          font-size: 13.5px; font-weight: 500;
          transition: background 0.15s, color 0.15s;
          margin-bottom: 2px;
          white-space: nowrap;
          position: relative;
        }
        .nav-item-v2:hover { background: rgba(255,255,255,0.07); color: #e2e8f0; }
        .nav-item-v2.active {
          background: rgba(99,102,241,0.18);
          color: #a5b4fc;
        }
        .nav-item-v2.active .nav-icon-wrap { color: #818cf8; }
        .nav-item-v2 .active-bar {
          display: none; position: absolute; left: 0; top: 20%; bottom: 20%;
          width: 3px; border-radius: 0 3px 3px 0;
          background: #6366f1;
        }
        .nav-item-v2.active .active-bar { display: block; }

        .nav-icon-wrap {
          width: 20px; height: 20px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: #64748b;
          transition: color 0.15s;
        }
        .nav-icon-wrap svg { width: 18px; height: 18px; }

        .nav-label { transition: opacity 0.2s, width 0.25s; overflow: hidden; }
        .collapsed .nav-label { opacity: 0; width: 0; }

        /* Tooltip on collapsed */
        .collapsed .nav-item-v2 { justify-content: center; padding: 10px; }
        .collapsed .nav-item-v2:hover::after {
          content: attr(data-label);
          position: absolute; left: calc(100% + 10px); top: 50%;
          transform: translateY(-50%);
          background: #1e293b; color: #f1f5f9;
          font-size: 12px; font-weight: 500;
          padding: 5px 10px; border-radius: 6px;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 100;
          pointer-events: none;
        }

        /* User footer */
        .sb-footer {
          padding: 12px 8px;
          border-top: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .sb-user {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 8px;
          background: rgba(255,255,255,0.05);
          overflow: hidden;
          margin-bottom: 6px;
        }
        .sb-avatar {
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
          flex-shrink: 0;
          letter-spacing: 0.5px;
        }
        .sb-user-info { overflow: hidden; transition: opacity 0.2s, width 0.25s; white-space: nowrap; }
        .sb-user-info .u-name { font-size: 12.5px; font-weight: 600; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; }
        .sb-user-info .u-role { font-size: 10px; font-weight: 600; letter-spacing: 0.5px; margin-top: 1px; }
        .collapsed .sb-user-info { opacity: 0; width: 0; }
        .collapsed .sb-user { justify-content: center; }

        .sb-logout {
          width: 100%; padding: 8px 10px; border-radius: 8px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.15);
          color: #f87171; font-size: 12.5px; font-weight: 500;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px;
          transition: background 0.15s, color 0.15s;
        }
        .sb-logout:hover { background: rgba(239,68,68,0.15); color: #fca5a5; }
        .collapsed .sb-logout { padding: 8px; }
        .sb-logout-label { transition: opacity 0.2s, width 0.25s; overflow: hidden; white-space: nowrap; }
        .collapsed .sb-logout-label { opacity: 0; width: 0; }

        /* ── Main ── */
        .main-v2 {
          flex: 1;
          margin-left: 240px;
          transition: margin-left 0.25s cubic-bezier(.4,0,.2,1);
          min-width: 0;
          display: flex; flex-direction: column;
        }
        .main-v2.collapsed { margin-left: 68px; }

        @media (max-width: 768px) {
          .main-v2 { margin-left: 0 !important; }
        }

        /* Topbar */
        .topbar-v2 {
          height: 64px; padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between;
          background: #fff;
          border-bottom: 1px solid #e2e8f0;
          position: sticky; top: 0; z-index: 30;
          flex-shrink: 0;
        }
        .topbar-left { display: flex; align-items: center; gap: 12px; }

        /* Mobile hamburger */
        .hamburger {
          display: none; width: 36px; height: 36px; border-radius: 8px;
          background: #f1f5f9; border: none; cursor: pointer;
          align-items: center; justify-content: center; color: #475569;
          transition: background 0.15s;
        }
        .hamburger:hover { background: #e2e8f0; }
        @media (max-width: 768px) { .hamburger { display: flex; } }

        .topbar-title { font-size: 15px; font-weight: 600; color: #0f172a; }
        .topbar-right { display: flex; align-items: center; gap: 10px; }
        .topbar-badge {
          padding: 4px 10px; border-radius: 20px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.4px;
        }
        .topbar-welcome { font-size: 13px; color: #94a3b8; }
        .topbar-welcome strong { color: #334155; }

        /* Page content */
        .page-content-v2 {
          flex: 1; padding: 24px;
          min-width: 0;
        }
        @media (max-width: 768px) { .page-content-v2 { padding: 16px; } }
      `}</style>

      <div className="layout-root">

        {/* Mobile overlay */}
        <div
          className={`sidebar-overlay ${mobileOpen ? 'open' : ''}`}
          onClick={() => setMobileOpen(false)}
        />

        {/* Sidebar */}
        <aside className={`sidebar-v2 ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>

          {/* Brand */}
          <div className="sb-brand">
            <div className="sb-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/>
              </svg>
            </div>
            <div className="sb-brand-text">
              <h2>MobileShop</h2>
              <p>MANAGEMENT SYSTEM</p>
            </div>
            <button className="sb-toggle" onClick={() => setCollapsed(c => !c)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {collapsed
                  ? <><polyline points="9,18 15,12 9,6"/></>
                  : <><polyline points="15,18 9,12 15,6"/></>
                }
              </svg>
            </button>
          </div>

          {/* Nav */}
          <nav className="sb-nav">
            {visibleItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                data-label={item.label}
                className={({ isActive }) => `nav-item-v2${isActive ? ' active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="active-bar" />
                <span className="nav-icon-wrap"><item.icon /></span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="sb-footer">
            <div className="sb-user">
              <div className="sb-avatar" style={{ background: role.bg, color: role.color }}>
                {initials}
              </div>
              <div className="sb-user-info">
                <div className="u-name">{user?.name}</div>
                <div className="u-role" style={{ color: role.color }}>{role.label.toUpperCase()}</div>
              </div>
            </div>
            <button className="sb-logout" onClick={handleLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span className="sb-logout-label">Logout</span>
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className={`main-v2 ${collapsed ? 'collapsed' : ''}`}>

          {/* Topbar */}
          <header className="topbar-v2">
            <div className="topbar-left">
              <button className="hamburger" onClick={() => setMobileOpen(o => !o)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              <span className="topbar-welcome">
                Welcome back, <strong>{user?.name}</strong>
              </span>
            </div>
            <div className="topbar-right">
              <span className="topbar-badge" style={{ background: role.bg, color: role.color }}>
                {role.label.toUpperCase()}
              </span>
            </div>
          </header>

          {/* Page */}
          <div className="page-content-v2">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

// ── SVG Icons ──────────────────────────────────────────────
const ic = (d, extra = '') => () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} {...(extra ? { d: extra } : {})} />
    {extra && <path d={d} />}
  </svg>
);

const DashboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const ProductsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/>
  </svg>
);
const InventoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const PurchasesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);
const SalesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);
const SuppliersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="1"/>
    <path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);
const CustomersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const ExpensesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 17a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4H2v4z"/>
    <path d="M22 9V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2h20z"/>
    <line x1="12" y1="14" x2="12" y2="14.01"/>
  </svg>
);
const ChequesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <line x1="2" y1="10" x2="22" y2="10"/>
  </svg>
);
const CashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="1" y1="10" x2="3" y2="10"/><line x1="21" y1="10" x2="23" y2="10"/>
    <line x1="1" y1="14" x2="3" y2="14"/><line x1="21" y1="14" x2="23" y2="14"/>
  </svg>
);
const TransfersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
);
const ObligationsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    <path d="M9 16l2 2 4-4"/>
  </svg>
);
const ReportsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);
const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);