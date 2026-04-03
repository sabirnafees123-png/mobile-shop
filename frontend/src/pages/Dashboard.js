// src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import api from '../utils/api';

export default function Dashboard() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/summary')
      .then(res => setData(res.data?.data || res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!data)   return <div className="empty-state">Failed to load dashboard</div>;

  const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;

  const sales      = data.sales      || {};
  const today      = sales.today      || { total: 0, count: 0 };
  const this_month = sales.this_month || { total: 0, count: 0 };
  const inventory  = data.inventory  || {};
  const financials = data.financials || {};
  const cheques    = data.cheques    || {};
  const top_products = data.top_products || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Welcome back — here's what's happening today</div>
        </div>
        <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>
          {new Date().toLocaleDateString('en-AE', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}
        </span>
      </div>

      {/* ── Sales Cards ── */}
      <div style={{marginBottom:'8px',padding:'4px 0'}}>
        <span style={{fontSize:'.8rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
          Sales
        </span>
      </div>
      <div className="stat-grid" style={{marginBottom:'24px'}}>
        <div className="stat-card green">
          <div className="label">Today's Sales</div>
          <div className="value">{fmt(today.total)}</div>
          <div className="sub">{today.count} invoice(s)</div>
        </div>
        <div className="stat-card blue">
          <div className="label">This Month</div>
          <div className="value">{fmt(this_month.total)}</div>
          <div className="sub">{this_month.count} invoice(s)</div>
        </div>
      </div>

      {/* ── Inventory Cards ── */}
      <div style={{marginBottom:'8px',padding:'4px 0'}}>
        <span style={{fontSize:'.8rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
          Inventory
        </span>
      </div>
      <div className="stat-grid" style={{marginBottom:'24px'}}>
        <div className="stat-card yellow">
          <div className="label">Stock Units</div>
          <div className="value">{inventory.total_units || 0}</div>
          <div className="sub">{inventory.total_lines || 0} product lines</div>
        </div>
        <div className="stat-card red">
          <div className="label">Low Stock Alerts</div>
          <div className="value">{inventory.low_stock_alerts || 0}</div>
          <div className="sub">products ≤ min stock</div>
        </div>
        <div className="stat-card blue">
          <div className="label">Inventory Cost Value</div>
          <div className="value">{fmt(inventory.cost_value)}</div>
          <div className="sub">at purchase price</div>
        </div>
        <div className="stat-card green">
          <div className="label">Inventory Retail Value</div>
          <div className="value">{fmt(inventory.retail_value)}</div>
          <div className="sub">at selling price</div>
        </div>
      </div>

      {/* ── Financial Cards ── */}
      <div style={{marginBottom:'8px',padding:'4px 0'}}>
        <span style={{fontSize:'.8rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
          Financials
        </span>
      </div>
      <div className="stat-grid" style={{marginBottom:'24px'}}>
        <div className="stat-card red">
          <div className="label">Owed to Suppliers</div>
          <div className="value">{fmt(financials.owed_to_suppliers)}</div>
          <div className="sub">outstanding payables</div>
        </div>
        <div className="stat-card blue">
          <div className="label">Customer Credit</div>
          <div className="value">{fmt(financials.owed_by_customers)}</div>
          <div className="sub">outstanding receivables</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Pending Cheques</div>
          <div className="value">{fmt(cheques.pending_total)}</div>
          <div className="sub">{cheques.pending_count || 0} cheque(s) pending</div>
        </div>
      </div>

      {/* ── Top Products ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🏆 Top Products This Month</div>
        </div>
        {top_products.length === 0 ? (
          <div className="empty-state"><p>No sales recorded this month yet</p></div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {top_products.map((p, i) => (
                  <tr key={i}>
                    <td><span className="badge badge-blue">{i + 1}</span></td>
                    <td><strong>{p.brand}</strong> {p.name}</td>
                    <td>{p.units_sold}</td>
                    <td>{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
