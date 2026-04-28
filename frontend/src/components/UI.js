// src/components/UI.js
// Reusable skeletons + empty states — use across all pages

import React from 'react';

// ── Skeleton primitives ────────────────────────────────────
const S = ({ w, h, r = 6, mb = 0 }) => (
  <div className="skeleton" style={{ width: w, height: h, borderRadius: r, marginBottom: mb, flexShrink: 0 }} />
);

// ── TABLE SKELETON ─────────────────────────────────────────
// Usage: replace `loading ? <div className="loading">Loading...</div>` in table pages
// <TableSkeleton rows={8} cols={6} />
export function TableSkeleton({ rows = 8, cols = 5 }) {
  return (
    <div>
      {/* Filter bar skeleton */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {Array.from({ length: Math.min(cols, 5) }).map((_, i) => (
            <div key={i} style={{ flex: i === 0 ? 2 : 1, minWidth: 100 }}>
              <S w="60%" h={10} mb={6} />
              <S w="100%" h={36} r={6} />
            </div>
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '12px', padding: '10px 16px',
          background: '#f8fafc', borderBottom: '1px solid #e2e8f0'
        }}>
          {Array.from({ length: cols }).map((_, i) => (
            <S key={i} w={`${40 + Math.random() * 30}%`} h={10} />
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: '12px', padding: '14px 16px',
            borderBottom: '1px solid #f8fafc',
            alignItems: 'center'
          }}>
            {Array.from({ length: cols }).map((_, ci) => (
              <S key={ci} w={`${50 + Math.random() * 35}%`} h={ci === 0 ? 22 : 14} r={ci === 0 ? 20 : 6} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STAT CARDS SKELETON ────────────────────────────────────
// Usage: on Dashboard or any page with stat cards
// <StatCardsSkeleton count={4} />
export function StatCardsSkeleton({ count = 4 }) {
  return (
    <div className="stat-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ padding: '1.25rem' }}>
          <S w={38} h={38} r={10} mb={14} />
          <S w="55%" h={10} mb={8} />
          <S w="75%" h={26} mb={8} />
          <S w="45%" h={10} />
        </div>
      ))}
    </div>
  );
}

// ── FORM SKELETON ──────────────────────────────────────────
// Usage: inside modals or form pages while data loads
// <FormSkeleton fields={6} />
export function FormSkeleton({ fields = 6 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <S w="40%" h={10} mb={6} />
          <S w="100%" h={38} r={6} />
        </div>
      ))}
    </div>
  );
}

// ── PAGE SKELETON ──────────────────────────────────────────
// Usage: full page loading (replaces entire page content)
// <PageSkeleton />
export function PageSkeleton({ rows = 8, cols = 5 }) {
  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <S w={180} h={24} mb={8} />
          <S w={120} h={12} />
        </div>
        <S w={110} h={38} r={8} />
      </div>
      <TableSkeleton rows={rows} cols={cols} />
    </div>
  );
}

// ── EMPTY STATES ───────────────────────────────────────────

// Generic empty state
// <EmptyState icon={<SalesIcon />} title="No sales yet" message="Create your first sale to get started." action={{ label: '+ New Sale', onClick: () => {} }} />
export function EmptyState({ icon, title, message, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center'
    }}>
      {icon && (
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: '#f1f5f9', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: '1rem', color: '#94a3b8'
        }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
        {title || 'Nothing here yet'}
      </div>
      {message && (
        <div style={{ fontSize: '0.82rem', color: '#94a3b8', maxWidth: 320, lineHeight: 1.6 }}>
          {message}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="btn btn-primary"
          style={{ marginTop: '1.25rem' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Pre-built empty states for each page ──────────────────

export function EmptySales({ onNew }) {
  return <EmptyState
    icon={<SalesIcon />}
    title="No sales found"
    message="No invoices match your filters. Try adjusting the date range or clear filters."
    action={onNew ? { label: '+ New Sale', onClick: onNew } : null}
  />;
}

export function EmptyPurchases({ onNew }) {
  return <EmptyState
    icon={<PurchaseIcon />}
    title="No purchases found"
    message="No purchases match your current filters."
    action={onNew ? { label: '+ New Purchase', onClick: onNew } : null}
  />;
}

export function EmptyProducts({ onNew }) {
  return <EmptyState
    icon={<ProductIcon />}
    title="No products found"
    message="Add your first product to start tracking inventory."
    action={onNew ? { label: '+ Add Product', onClick: onNew } : null}
  />;
}

export function EmptyInventory() {
  return <EmptyState
    icon={<BoxIcon />}
    title="No inventory records"
    message="Inventory will appear here once products are added and purchases are recorded."
  />;
}

export function EmptySuppliers({ onNew }) {
  return <EmptyState
    icon={<TruckIcon />}
    title="No suppliers found"
    message="Add suppliers to track purchases and manage payables."
    action={onNew ? { label: '+ Add Supplier', onClick: onNew } : null}
  />;
}

export function EmptyCustomers({ onNew }) {
  return <EmptyState
    icon={<UsersIcon />}
    title="No customers found"
    message="Customers are added automatically when you create a sale, or add them manually."
    action={onNew ? { label: '+ Add Customer', onClick: onNew } : null}
  />;
}

export function EmptyExpenses({ onNew }) {
  return <EmptyState
    icon={<ExpenseIcon />}
    title="No expenses found"
    message="Track your business expenses by category to monitor spending."
    action={onNew ? { label: '+ Add Expense', onClick: onNew } : null}
  />;
}

export function EmptyCheques({ onNew }) {
  return <EmptyState
    icon={<ChequeIcon />}
    title="No cheques found"
    message="Track incoming and outgoing cheques and their due dates."
    action={onNew ? { label: '+ Add Cheque', onClick: onNew } : null}
  />;
}

export function EmptyTransfers({ onNew }) {
  return <EmptyState
    icon={<TransferIcon />}
    title="No stock transfers"
    message="Transfer stock between your shops to balance inventory."
    action={onNew ? { label: '+ New Transfer', onClick: onNew } : null}
  />;
}

export function EmptyReports() {
  return <EmptyState
    icon={<ReportIcon />}
    title="No data for this period"
    message="Try selecting a different date range or shop to see report data."
  />;
}

export function EmptySearch({ query }) {
  return <EmptyState
    icon={<SearchIcon />}
    title={`No results for "${query}"`}
    message="Try a different search term or clear the search to see all records."
  />;
}

// ── Error State ────────────────────────────────────────────
export function ErrorState({ onRetry }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center'
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: '#fee2e2', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: '1rem', color: '#dc2626'
      }}>
        <AlertIcon />
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
        Failed to load data
      </div>
      <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
        Something went wrong. Check your connection and try again.
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-ghost">
          ↺ Retry
        </button>
      )}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────
const SalesIcon    = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const PurchaseIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
const ProductIcon  = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>;
const BoxIcon      = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const TruckIcon    = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const UsersIcon    = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const ExpenseIcon  = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 17a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4H2v4z"/><path d="M22 9V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2h20z"/></svg>;
const ChequeIcon   = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
const TransferIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
const ReportIcon   = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>;
const SearchIcon   = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const AlertIcon    = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3a1.73 1.73 0 0 1 3.42 0L21.55 21H1.45z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
