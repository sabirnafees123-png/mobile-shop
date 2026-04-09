// src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ShopSelector from '../components/ShopSelector';

export default function Dashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId]   = useState('');   // '' = all shops

  const load = (sid) => {
    setLoading(true);
    const params = sid ? `?shop_id=${sid}` : '';
    api.get(`/dashboard/summary${params}`)
      .then(res => setData(res.data?.data || res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(shopId); }, [shopId]);

  if (loading) return <div className='loading'>Loading dashboard...</div>;
  if (!data)   return <div className='empty-state'>Failed to load dashboard</div>;

  const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;

  const sales        = data.sales        || {};
  const today        = sales.today        || { total: 0, count: 0 };
  const this_month   = sales.this_month   || { total: 0, count: 0 };
  const by_shop      = sales.by_shop      || [];
  const inventory    = data.inventory    || {};
  const financials   = data.financials   || {};
  const cheques      = data.cheques      || {};
  const top_products = data.top_products || [];
  const shops        = data.shops        || [];

  return (
    <div>
      <div className='page-header'>
        <div>
          <div className='page-title'>Dashboard</div>
          <div className='page-subtitle'>
            {shopId
              ? `Showing: ${shops.find(s => s.id === shopId)?.name || 'Shop'}`
              : 'All Shops Combined'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <ShopSelector
            shops={shops}
            value={shopId}
            onChange={setShopId}
            includeAll={true}
            label='Filter'
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* ── Shop-wise Sales Breakdown (only when "All Shops" selected) ── */}
      {!shopId && by_shop.length > 1 && (
        <>
          <div style={{ marginBottom: '8px', padding: '4px 0' }}>
            <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              This Month by Shop
            </span>
          </div>
          <div className='stat-grid' style={{ marginBottom: '24px' }}>
            {by_shop.map(sh => (
              <div
                key={sh.shop_id}
                className='stat-card blue'
                style={{ cursor: 'pointer' }}
                onClick={() => setShopId(sh.shop_id)}
              >
                <div className='label'>{sh.shop_name}</div>
                <div className='value'>{fmt(sh.total)}</div>
                <div className='sub'>{sh.count} invoice(s) · click to filter</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Sales Cards ── */}
      <div style={{ marginBottom: '8px', padding: '4px 0' }}>
        <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Sales
        </span>
      </div>
      <div className='stat-grid' style={{ marginBottom: '24px' }}>
        <div className='stat-card green'>
          <div className='label'>Today's Sales</div>
          <div className='value'>{fmt(today.total)}</div>
          <div className='sub'>{today.count} invoice(s)</div>
        </div>
        <div className='stat-card blue'>
          <div className='label'>This Month</div>
          <div className='value'>{fmt(this_month.total)}</div>
          <div className='sub'>{this_month.count} invoice(s)</div>
        </div>
      </div>

      {/* ── Inventory Cards ── */}
      <div style={{ marginBottom: '8px', padding: '4px 0' }}>
        <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Inventory
        </span>
      </div>
      <div className='stat-grid' style={{ marginBottom: '24px' }}>
        <div className='stat-card yellow'>
          <div className='label'>Stock Units</div>
          <div className='value'>{inventory.total_units || 0}</div>
          <div className='sub'>{inventory.total_lines || 0} product lines</div>
        </div>
        <div className='stat-card red'>
          <div className='label'>Low Stock Alerts</div>
          <div className='value'>{inventory.low_stock_alerts || 0}</div>
          <div className='sub'>products ≤ min stock</div>
        </div>
        <div className='stat-card blue'>
          <div className='label'>Inventory Cost</div>
          <div className='value'>{fmt(inventory.cost_value)}</div>
          <div className='sub'>at purchase price</div>
        </div>
        <div className='stat-card green'>
          <div className='label'>Inventory Retail</div>
          <div className='value'>{fmt(inventory.retail_value)}</div>
          <div className='sub'>at selling price</div>
        </div>
      </div>

      {/* ── Financial Cards ── */}
      <div style={{ marginBottom: '8px', padding: '4px 0' }}>
        <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Financials
        </span>
      </div>
      <div className='stat-grid' style={{ marginBottom: '24px' }}>
        <div className='stat-card red'>
          <div className='label'>Owed to Suppliers</div>
          <div className='value'>{fmt(financials.owed_to_suppliers)}</div>
          <div className='sub'>outstanding payables</div>
        </div>
        <div className='stat-card blue'>
          <div className='label'>Customer Credit</div>
          <div className='value'>{fmt(financials.owed_by_customers)}</div>
          <div className='sub'>receivables</div>
        </div>
        <div className='stat-card yellow'>
          <div className='label'>Expenses This Month</div>
          <div className='value'>{fmt(financials.expenses_this_month)}</div>
          <div className='sub'>all categories</div>
        </div>
        <div className='stat-card red'>
          <div className='label'>Pending Cheques</div>
          <div className='value'>{fmt(cheques.pending_total)}</div>
          <div className='sub'>{cheques.pending_count} cheque(s)</div>
        </div>
      </div>

      {/* ── Top Products ── */}
      {top_products.length > 0 && (
        <>
          <div style={{ marginBottom: '8px', padding: '4px 0' }}>
            <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Top Products This Month
            </span>
          </div>
          <div className='card' style={{ marginBottom: '24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Units</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {top_products.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{i + 1}</td>
                    <td style={{ padding: '8px' }}>{p.brand} {p.name}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{p.units_sold}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
