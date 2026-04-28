// src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ShopSelector from '../components/ShopSelector';

export default function Dashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId]   = useState('');

  const load = (sid) => {
    setLoading(true);
    const params = sid ? `?shop_id=${sid}` : '';
    api.get(`/dashboard/summary${params}`)
      .then(res => setData(res.data?.data || res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(shopId); }, [shopId]);

  const fmt    = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
  const fmtNum = n => Math.round(parseFloat(n || 0)).toLocaleString();

  if (loading) return <DashboardSkeleton />;
  if (!data)   return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', gap:'12px' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p style={{ color:'#94a3b8', fontSize:'15px' }}>Failed to load dashboard</p>
      <button onClick={() => load(shopId)} style={{ padding:'8px 20px', borderRadius:'8px', background:'#6366f1', color:'#fff', border:'none', cursor:'pointer', fontSize:'13px' }}>Retry</button>
    </div>
  );

  const sales        = data.sales        || {};
  const today        = sales.today        || { total: 0, count: 0 };
  const this_month   = sales.this_month   || { total: 0, count: 0 };
  const by_shop      = sales.by_shop      || [];
  const inventory    = data.inventory    || {};
  const financials   = data.financials   || {};
  const cheques      = data.cheques      || {};
  const top_products = data.top_products || [];
  const shops        = data.shops        || [];

  const currentShopName = shopId
    ? shops.find(s => s.id === shopId)?.name || 'Shop'
    : 'All Shops';

  const dateStr = new Date().toLocaleDateString('en-AE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        .dash-root {
          font-family: 'DM Sans', sans-serif;
          color: #0f172a;
        }

        /* Header */
        .dash-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-wrap: wrap; gap: 16px;
          margin-bottom: 28px;
        }
        .dash-title {
          font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;
        }
        .dash-subtitle {
          font-size: 13px; color: #64748b; margin-top: 3px;
          display: flex; align-items: center; gap: 6px;
        }
        .dash-subtitle-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
          display: inline-block; animation: pulse-dot 2s infinite;
        }
        @keyframes pulse-dot {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.5; transform:scale(1.4); }
        }
        .dash-header-right {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        }
        .dash-date {
          font-size: 12px; color: #94a3b8;
          background: #f8fafc; border: 1px solid #e2e8f0;
          padding: 6px 12px; border-radius: 8px;
        }

        /* Section label */
        .dash-section-label {
          font-size: 10px; font-weight: 700; letter-spacing: 1.2px;
          text-transform: uppercase; color: #94a3b8;
          margin-bottom: 12px; margin-top: 28px;
          display: flex; align-items: center; gap: 8px;
        }
        .dash-section-label::after {
          content: ''; flex: 1; height: 1px; background: #f1f5f9;
        }

        /* Stat grid */
        .dash-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
        }

        /* Stat card */
        .dash-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 18px 20px;
          position: relative; overflow: hidden;
          transition: transform 0.18s, box-shadow 0.18s;
          cursor: default;
          animation: card-in 0.4s ease both;
        }
        .dash-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.07);
        }
        .dash-card.clickable { cursor: pointer; }

        @keyframes card-in {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .dash-card:nth-child(1) { animation-delay: 0.05s; }
        .dash-card:nth-child(2) { animation-delay: 0.10s; }
        .dash-card:nth-child(3) { animation-delay: 0.15s; }
        .dash-card:nth-child(4) { animation-delay: 0.20s; }

        /* Card accent strip */
        .dash-card::before {
          content: ''; position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          border-radius: 14px 14px 0 0;
        }
        .dash-card.c-green::before  { background: linear-gradient(90deg, #22c55e, #4ade80); }
        .dash-card.c-blue::before   { background: linear-gradient(90deg, #6366f1, #818cf8); }
        .dash-card.c-yellow::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
        .dash-card.c-red::before    { background: linear-gradient(90deg, #ef4444, #f87171); }
        .dash-card.c-purple::before { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
        .dash-card.c-teal::before   { background: linear-gradient(90deg, #14b8a6, #2dd4bf); }

        /* Card icon */
        .dash-card-icon {
          width: 38px; height: 38px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 14px; flex-shrink: 0;
        }
        .dash-card-icon svg { width: 18px; height: 18px; }
        .c-green  .dash-card-icon { background: #dcfce7; color: #16a34a; }
        .c-blue   .dash-card-icon { background: #eef2ff; color: #6366f1; }
        .c-yellow .dash-card-icon { background: #fef3c7; color: #d97706; }
        .c-red    .dash-card-icon { background: #fee2e2; color: #dc2626; }
        .c-purple .dash-card-icon { background: #f3e8ff; color: #7c3aed; }
        .c-teal   .dash-card-icon { background: #ccfbf1; color: #0f766e; }

        .dash-card-label {
          font-size: 11.5px; font-weight: 600; color: #94a3b8;
          letter-spacing: 0.2px; margin-bottom: 6px;
          text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.6px;
        }
        .dash-card-value {
          font-size: 22px; font-weight: 700; color: #0f172a;
          letter-spacing: -0.8px; line-height: 1;
          font-family: 'DM Mono', monospace;
        }
        .dash-card-sub {
          font-size: 11.5px; color: #94a3b8; margin-top: 6px;
        }
        .dash-card-sub b { color: #64748b; font-weight: 600; }

        /* Shop breakdown cards */
        .shop-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
          padding: 16px 18px; cursor: pointer;
          transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
          animation: card-in 0.4s ease both;
          display: flex; flex-direction: column; gap: 4px;
        }
        .shop-card:hover {
          transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.07);
          border-color: #6366f1;
        }
        .shop-card-name { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .shop-card-value { font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.6px; font-family: 'DM Mono', monospace; }
        .shop-card-sub { font-size: 11px; color: #94a3b8; }
        .shop-card-hint { font-size: 10px; color: #6366f1; margin-top: 4px; font-weight: 500; }

        /* Top products table */
        .dash-table-wrap {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
          overflow: hidden;
          animation: card-in 0.4s ease 0.2s both;
        }
        .dash-table-head {
          padding: 14px 20px;
          border-bottom: 1px solid #f1f5f9;
          display: flex; align-items: center; justify-content: space-between;
        }
        .dash-table-head-title { font-size: 13px; font-weight: 700; color: #0f172a; }
        .dash-table-head-sub { font-size: 11px; color: #94a3b8; }
        table.dash-table { width: 100%; border-collapse: collapse; }
        .dash-table th {
          text-align: left; padding: 10px 20px;
          font-size: 10.5px; font-weight: 700; color: #94a3b8;
          text-transform: uppercase; letter-spacing: 0.6px;
          background: #f8fafc; border-bottom: 1px solid #f1f5f9;
        }
        .dash-table th:last-child, .dash-table td:last-child { text-align: right; }
        .dash-table td {
          padding: 12px 20px; font-size: 13.5px; color: #334155;
          border-bottom: 1px solid #f8fafc;
        }
        .dash-table tr:last-child td { border-bottom: none; }
        .dash-table tr:hover td { background: #f8fafc; }
        .rank-badge {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 6px;
          font-size: 11px; font-weight: 700;
          background: #f1f5f9; color: #64748b;
        }
        .rank-badge.top { background: #fef3c7; color: #d97706; }
        .revenue-val { font-family: 'DM Mono', monospace; font-weight: 600; color: #0f172a; font-size: 13px; }

        /* Skeleton */
        .skel { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: skel-shimmer 1.4s infinite; border-radius: 8px; }
        @keyframes skel-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        @media (max-width: 640px) {
          .dash-header { flex-direction: column; }
          .dash-card-value { font-size: 18px; }
          .dash-table th, .dash-table td { padding: 10px 14px; }
        }
      `}</style>

      <div className="dash-root">

        {/* Header */}
        <div className="dash-header">
          <div>
            <div className="dash-title">Dashboard</div>
            <div className="dash-subtitle">
              <span className="dash-subtitle-dot" />
              {currentShopName} &nbsp;·&nbsp; {dateStr}
            </div>
          </div>
          <div className="dash-header-right">
            <ShopSelector
              shops={shops}
              value={shopId}
              onChange={setShopId}
              includeAll={true}
              label="Filter"
            />
          </div>
        </div>

        {/* Shop breakdown */}
        {!shopId && by_shop.length > 1 && (
          <>
            <div className="dash-section-label">This Month by Shop</div>
            <div className="dash-grid">
              {by_shop.map((sh, i) => (
                <div
                  key={sh.shop_id}
                  className="shop-card"
                  style={{ animationDelay: `${i * 0.06}s` }}
                  onClick={() => setShopId(sh.shop_id)}
                >
                  <div className="shop-card-name">{sh.shop_name}</div>
                  <div className="shop-card-value">{fmt(sh.total)}</div>
                  <div className="shop-card-sub">{sh.count} invoice(s)</div>
                  <div className="shop-card-hint">↗ Click to filter</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Sales */}
        <div className="dash-section-label">Sales</div>
        <div className="dash-grid">
          <StatCard color="green" label="Today's Sales" value={fmt(today.total)} sub={<><b>{today.count}</b> invoices today</>} icon={<SalesIcon />} />
          <StatCard color="blue"  label="This Month"    value={fmt(this_month.total)} sub={<><b>{this_month.count}</b> invoices</>} icon={<CalIcon />} />
        </div>

        {/* Inventory */}
        <div className="dash-section-label">Inventory</div>
        <div className="dash-grid">
          <StatCard color="blue"   label="Stock Units"       value={fmtNum(inventory.total_units)}  sub={<><b>{fmtNum(inventory.total_lines)}</b> product lines</>}   icon={<BoxIcon />} />
          <StatCard color="red"    label="Low Stock Alerts"  value={fmtNum(inventory.low_stock_alerts)} sub="products ≤ min stock"        icon={<AlertIcon />} />
          <StatCard color="yellow" label="Inventory Cost"    value={fmt(inventory.cost_value)}      sub="at purchase price"               icon={<TagIcon />} />
          <StatCard color="teal"   label="Inventory Retail"  value={fmt(inventory.retail_value)}    sub="at selling price"                icon={<TrendIcon />} />
        </div>

        {/* Financials */}
        <div className="dash-section-label">Financials</div>
        <div className="dash-grid">
          <StatCard color="red"    label="Owed to Suppliers"    value={fmt(financials.owed_to_suppliers)}  sub="outstanding payables"  icon={<TruckIcon />} />
          <StatCard color="purple" label="Customer Receivables" value={fmt(financials.owed_by_customers)}  sub="credit outstanding"     icon={<UsersIcon />} />
          <StatCard color="yellow" label="Expenses This Month"  value={fmt(financials.expenses_this_month)} sub="all categories"        icon={<ExpIcon />} />
          <StatCard color="red"    label="Pending Cheques"      value={fmt(cheques.pending_total)}         sub={<><b>{cheques.pending_count}</b> cheque(s)</>} icon={<ChequeIcon />} />
        </div>

        {/* Top Products */}
        {top_products.length > 0 && (
          <>
            <div className="dash-section-label">Top Products This Month</div>
            <div className="dash-table-wrap">
              <div className="dash-table-head">
                <span className="dash-table-head-title">Best Sellers</span>
                <span className="dash-table-head-sub">by revenue</span>
              </div>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Product</th>
                    <th>Units</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {top_products.map((p, i) => (
                    <tr key={i}>
                      <td><span className={`rank-badge${i < 3 ? ' top' : ''}`}>{i + 1}</span></td>
                      <td style={{ fontWeight: 500 }}>{p.brand} {p.name}</td>
                      <td>{p.units_sold}</td>
                      <td><span className="revenue-val">{fmt(p.revenue)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </>
  );
}

// ── Stat Card ──────────────────────────────────────────────
function StatCard({ color, label, value, sub, icon }) {
  return (
    <div className={`dash-card c-${color}`}>
      <div className="dash-card-icon">{icon}</div>
      <div className="dash-card-label">{label}</div>
      <div className="dash-card-value">{value}</div>
      {sub && <div className="dash-card-sub">{sub}</div>}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ marginBottom: 28 }}>
        <div className="skel" style={{ width: 160, height: 26, marginBottom: 8 }} />
        <div className="skel" style={{ width: 260, height: 16 }} />
      </div>
      {[1, 2, 3].map(s => (
        <div key={s}>
          <div className="skel" style={{ width: 120, height: 12, marginBottom: 12, marginTop: 28 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
            {[1,2,3,4].map(c => (
              <div key={c} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 20px' }}>
                <div className="skel" style={{ width: 38, height: 38, borderRadius: 10, marginBottom: 14 }} />
                <div className="skel" style={{ width: 80, height: 11, marginBottom: 8 }} />
                <div className="skel" style={{ width: 130, height: 24, marginBottom: 8 }} />
                <div className="skel" style={{ width: 100, height: 11 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────
const SalesIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const CalIcon  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const BoxIcon  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const AlertIcon= () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><triangle points="10.29,3 1.45,21 21.55,21"/><path d="M10.29 3a1.73 1.73 0 0 1 3.42 0L21.55 21H1.45z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const TagIcon  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const TrendIcon= () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>;
const TruckIcon= () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const UsersIcon= () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const ExpIcon  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 17a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4H2v4z"/><path d="M22 9V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2h20z"/></svg>;
const ChequeIcon=() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
