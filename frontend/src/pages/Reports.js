// src/pages/Reports.js
import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

const TABS = ['Summary', 'Sales', 'Purchases', 'Expenses', 'Top Products', 'Salesperson'];

export default function Reports() {
  const today         = new Date().toISOString().split('T')[0];
  const firstOfMonth  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [tab, setTab]       = useState('Summary');
  const [from, setFrom]     = useState(firstOfMonth);
  const [to, setTo]         = useState(today);
  const [shopId, setShopId] = useState('');
  const [shops, setShops]   = useState([]);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || [])).catch(() => {});
  }, []);

  const load = async (activeTab = tab) => {
    setLoading(true);
    setData(null);
    try {
      const params = { from, to };
      if (shopId) params.shop_id = shopId;
      let res;
      if (activeTab === 'Summary')       res = await api.get('/reports/summary',      { params });
      else if (activeTab === 'Sales')    res = await api.get('/reports/sales',         { params });
      else if (activeTab === 'Purchases') res = await api.get('/reports/purchases',   { params });
      else if (activeTab === 'Expenses')  res = await api.get('/reports/expenses',    { params });
      else if (activeTab === 'Top Products') res = await api.get('/reports/top-products', { params });
      else if (activeTab === 'Salesperson')  res = await api.get('/reports/salesperson',  { params });
      setData(res.data?.data || res.data);
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  };

  const switchTab = (t) => { setTab(t); setData(null); };
  const payStatus = s => ({ paid: 'badge-green', partial: 'badge-yellow', unpaid: 'badge-red', returned: 'badge-gray' }[s] || 'badge-gray');

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📊 Reports</div>
          <div className="page-subtitle">Business performance & analytics</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{padding:'1rem',marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'12px',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">From</label>
            <input type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} style={{width:'160px'}} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">To</label>
            <input type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} style={{width:'160px'}} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Shop</label>
            <select className="form-control" value={shopId} onChange={e => setShopId(e.target.value)} style={{width:'140px'}}>
              <option value="">All Shops</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {[
            { label: 'Today',        f: today,        t: today },
            { label: 'This Month',   f: firstOfMonth, t: today },
            { label: 'Last 7 Days',  f: new Date(Date.now()-7*86400000).toISOString().split('T')[0],  t: today },
            { label: 'Last 30 Days', f: new Date(Date.now()-30*86400000).toISOString().split('T')[0], t: today },
          ].map(r => (
            <button key={r.label} className="btn btn-ghost btn-sm"
              onClick={() => { setFrom(r.f); setTo(r.t); }} style={{marginBottom:'2px'}}>
              {r.label}
            </button>
          ))}
          <button className="btn btn-primary" onClick={() => load(tab)} style={{marginBottom:'2px'}}>
            Generate Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:'4px',marginBottom:'16px',borderBottom:'2px solid var(--border)'}}>
        {TABS.map(t => (
          <button key={t} onClick={() => switchTab(t)}
            style={{padding:'8px 16px',border:'none',background:'none',cursor:'pointer',
              fontWeight: tab===t?700:400, color: tab===t?'var(--accent)':'var(--text-muted)',
              borderBottom: tab===t?'2px solid var(--accent)':'2px solid transparent',
              marginBottom:'-2px',fontSize:'.9rem'}}>
            {t}
          </button>
        ))}
      </div>

      {!data && !loading && (
        <div className="card"><div className="empty-state" style={{padding:'48px'}}>
          Select date range and click <strong>Generate Report</strong>
        </div></div>
      )}

      {loading && <div className="loading" style={{padding:'48px',textAlign:'center'}}>Generating report...</div>}

      {/* Summary */}
      {data && tab === 'Summary' && (
        <div>
          <div className="stat-grid" style={{marginBottom:'24px'}}>
            <div className="stat-card green"><div className="label">Total Sales</div><div className="value">{fmt(data.sales?.total)}</div><div className="sub">{data.sales?.count} invoices</div></div>
            <div className="stat-card blue"><div className="label">Collected</div><div className="value">{fmt(data.sales?.collected)}</div><div className="sub">Cash received</div></div>
            <div className="stat-card yellow"><div className="label">Outstanding</div><div className="value">{fmt(data.sales?.due)}</div><div className="sub">Yet to collect</div></div>
            <div className="stat-card red"><div className="label">Total Expenses</div><div className="value">{fmt(data.expenses?.total)}</div><div className="sub">{data.expenses?.count} entries</div></div>
            <div className="stat-card blue"><div className="label">Total Purchases</div><div className="value">{fmt(data.purchases?.total)}</div><div className="sub">{data.purchases?.count} orders</div></div>
            <div className="stat-card green">
              <div className="label">Gross Profit</div>
              <div className="value" style={{color:data.profit?.gross>=0?'var(--accent-green)':'var(--accent-red)'}}>{fmt(data.profit?.gross)}</div>
              <div className="sub">Sales - Purchases</div>
            </div>
            <div className={`stat-card ${data.profit?.net>=0?'green':'red'}`}>
              <div className="label">Net Profit</div>
              <div className="value" style={{color:data.profit?.net>=0?'var(--accent-green)':'var(--accent-red)'}}>{fmt(data.profit?.net)}</div>
              <div className="sub">After expenses</div>
            </div>
          </div>
          {data.sales?.total > 0 && (
            <div className="card" style={{padding:'1rem'}}>
              <div style={{marginBottom:'8px',fontWeight:600}}>Profit Margin</div>
              <div style={{background:'#f1f2f6',borderRadius:'8px',height:'24px',overflow:'hidden'}}>
                <div style={{height:'100%',
                  width:`${Math.min(100,Math.max(0,(data.profit?.net/data.sales?.total)*100))}%`,
                  background:data.profit?.net>=0?'var(--accent-green)':'var(--accent-red)',
                  borderRadius:'8px',display:'flex',alignItems:'center',paddingLeft:'8px',
                  color:'#fff',fontSize:'.8rem',fontWeight:600}}>
                  {((data.profit?.net/data.sales?.total)*100).toFixed(1)}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sales */}
      {data && tab === 'Sales' && (
        <div className="card">
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
            <strong>{Array.isArray(data)?data.length:0} invoices</strong>
            <strong>Total: {fmt(Array.isArray(data)?data.reduce((s,r)=>s+parseFloat(r.total_amount||0),0):0)}</strong>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Invoice #</th><th>Customer</th><th>Shop</th><th>Sold By</th><th>Date</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {(Array.isArray(data)?data:[]).map(s => (
                  <tr key={s.id}>
                    <td><span className="badge badge-blue">{s.invoice_number}</span></td>
                    <td>{s.customer_name||'Walk-in'}</td>
                    <td>{s.shop_name||'—'}</td>
                    <td>{s.sold_by||'—'}</td>
                    <td>{fmtDate(s.sale_date)}</td>
                    <td><strong>{fmt(s.total_amount)}</strong></td>
                    <td style={{color:'var(--accent-green)'}}>{fmt(s.amount_paid)}</td>
                    <td style={{color:s.amount_due>0?'var(--accent-red)':'var(--accent-green)'}}>{fmt(s.amount_due)}</td>
                    <td><span className={`badge ${payStatus(s.payment_status)}`}>{s.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Purchases */}
      {data && tab === 'Purchases' && (
        <div className="card">
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
            <strong>{Array.isArray(data)?data.length:0} purchases</strong>
            <strong>Total: {fmt(Array.isArray(data)?data.reduce((s,r)=>s+parseFloat(r.total_amount||0),0):0)}</strong>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Purchase #</th><th>Supplier</th><th>Shop</th><th>Date</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {(Array.isArray(data)?data:[]).map(p => (
                  <tr key={p.id}>
                    <td><span className="badge badge-blue">{p.purchase_number}</span></td>
                    <td>{p.supplier_name}</td>
                    <td>{p.shop_name||'—'}</td>
                    <td>{fmtDate(p.purchase_date)}</td>
                    <td><strong>{fmt(p.total_amount)}</strong></td>
                    <td style={{color:'var(--accent-green)'}}>{fmt(p.amount_paid)}</td>
                    <td style={{color:p.amount_due>0?'var(--accent-red)':'var(--accent-green)'}}>{fmt(p.amount_due)}</td>
                    <td><span className={`badge ${({paid:'badge-green',partial:'badge-yellow',unpaid:'badge-red'}[p.payment_status]||'badge-gray')}`}>{p.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expenses */}
      {data && tab === 'Expenses' && (
        <div className="card">
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
            <strong>{Array.isArray(data)?data.length:0} expenses</strong>
            <strong>Total: {fmt(Array.isArray(data)?data.reduce((s,r)=>s+parseFloat(r.amount||0),0):0)}</strong>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Payee</th><th>Method</th><th>Amount</th></tr></thead>
              <tbody>
                {(Array.isArray(data)?data:[]).map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td><span className="badge badge-yellow">{e.category}</span></td>
                    <td>{e.description||'—'}</td>
                    <td>{e.payee||'—'}</td>
                    <td>{e.payment_method}</td>
                    <td><strong style={{color:'var(--accent-red)'}}>{fmt(e.amount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Products */}
      {data && tab === 'Top Products' && (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead>
              <tbody>
                {(Array.isArray(data)?data:[]).map((p,i) => (
                  <tr key={i}>
                    <td><span className="badge badge-blue">{i+1}</span></td>
                    <td><strong>{p.brand}</strong> {p.name}</td>
                    <td>{p.units_sold}</td>
                    <td>{fmt(p.revenue)}</td>
                    <td>{fmt(p.cost)}</td>
                    <td style={{color:p.profit>=0?'var(--accent-green)':'var(--accent-red)'}}><strong>{fmt(p.profit)}</strong></td>
                    <td style={{color:p.profit>=0?'var(--accent-green)':'var(--accent-red)'}}>
                      {p.revenue>0?((p.profit/p.revenue)*100).toFixed(1):0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Salesperson */}
      {data && tab === 'Salesperson' && (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Salesperson</th><th>Invoices</th><th>Items Sold</th>
                  <th>Revenue</th><th>Collected</th><th>Outstanding</th><th>Discounts Given</th><th>Customers</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(data)?data:[]).filter(s=>s.invoice_count>0).map((s,i) => (
                  <tr key={s.id}>
                    <td><span className="badge badge-blue">{i+1}</span></td>
                    <td><strong>{s.salesperson}</strong></td>
                    <td>{s.invoice_count}</td>
                    <td>{s.total_items_sold}</td>
                    <td><strong style={{color:'var(--accent-green)'}}>{fmt(s.total_revenue)}</strong></td>
                    <td style={{color:'var(--accent-green)'}}>{fmt(s.total_collected)}</td>
                    <td style={{color:s.total_due>0?'var(--accent-red)':'var(--accent-green)'}}>{fmt(s.total_due)}</td>
                    <td style={{color:'var(--accent-red)'}}>{fmt(s.total_discount)}</td>
                    <td>{s.unique_customers}</td>
                  </tr>
                ))}
                {(Array.isArray(data)?data:[]).filter(s=>s.invoice_count>0).length === 0 && (
                  <tr><td colSpan={9}><div className="empty-state">No sales data for this period</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
