// src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import api from '../utils/api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const currency = process.env.REACT_APP_CURRENCY || 'AED';

  useEffect(() => {
    api.get('/dashboard/summary')
      .then(res => {
        // Handle both response structures
        const responseData = res.data?.data || res.data;
        setData(responseData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!data) return <div className="empty-state">Failed to load dashboard</div>;

  const fmt = (n) => `${currency} ${parseFloat(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`;

  // Safe accessors with fallbacks
  const sales = data.sales || {};
  const today = sales.today || { total: 0, count: 0 };
  const this_month = sales.this_month || { total: 0, count: 0 };
  const inventory = data.inventory || { total_units: 0, total_lines: 0, low_stock_alerts: 0 };
  const financials = data.financials || { owed_to_suppliers: 0, owed_by_customers: 0 };
  const top_products = data.top_products || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Welcome back — here's what's happening today</div>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>
      <div className="stat-grid">
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
        <div className="stat-card yellow">
          <div className="label">Stock Units</div>
          <div className="value">{inventory.total_units}</div>
          <div className="sub">{inventory.total_lines} stock lines</div>
        </div>
        <div className="stat-card red">
          <div className="label">Low Stock Alerts</div>
          <div className="value">{inventory.low_stock_alerts}</div>
          <div className="sub">products ≤ 2 units</div>
        </div>
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
      </div>
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
                  <th>#</th>
                  <th>Product</th>
                  <th>Units Sold</th>
                  <th>Revenue</th>
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