// src/pages/Reports.js
import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const fmt    = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtPct = n => `${parseFloat(n || 0).toFixed(1)}%`;
const fmtDate = d => { try { return new Date(d).toLocaleDateString('en-AE'); } catch { return d; } };

const REPORT_TYPES = [
  { id: 'summary',          label: '📊 Sales Summary',           desc: 'Overall sales, COGS, profit by shop' },
  { id: 'product-margin',   label: '📦 Product Wise Margin',     desc: 'Margin % per product for date range' },
  { id: 'purchase-invoice', label: '🧾 Purchase Invoice Report', desc: 'Stock status per purchase invoice' },
  { id: 'stock-value',      label: '🏪 Stock Value by Shop',     desc: 'Category wise stock value per shop' },
  { id: 'daily-inventory',  label: '📅 Daily Inventory Value',   desc: 'Estimated inventory value per day' },
  { id: 'sales',            label: '💰 Sales Detail',            desc: 'All invoices in date range' },
  { id: 'purchases',        label: '🛒 Purchases Detail',        desc: 'All purchases in date range' },
  { id: 'expenses',         label: '💸 Expenses Detail',         desc: 'Expenses by category' },
  { id: 'top-products',     label: '🏆 Top Products',            desc: 'Best selling products' },
  { id: 'salesperson',      label: '👤 Salesperson',             desc: 'Performance per staff member' },
];

const CATEGORIES = ['Mobile', 'Laptop', 'Tab', 'Accessories', 'Ipad'];

export default function Reports() {
  const today        = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [from, setFrom]         = useState(firstOfMonth);
  const [to, setTo]             = useState(today);
  const [shopId, setShopId]     = useState('');
  const [shops, setShops]       = useState([]);
  const [summary, setSummary]   = useState(null);
  const [reportType, setReportType] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Purchase invoice search
  const [invoiceSearch, setInvoiceSearch] = useState('');

  // Product margin filters
  const [marginCategory, setMarginCategory] = useState('');

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || [])).catch(() => {});
  }, []);

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const params = { from, to };
      if (shopId) params.shop_id = shopId;
      const res = await api.get('/reports/summary', { params });
      setSummary(res.data?.data || res.data);
    } catch { toast.error('Failed to load summary'); }
    finally { setSummaryLoading(false); }
  };

  const loadReport = async (type = reportType) => {
    if (!type) return toast.error('Select a report type');
    setLoading(true);
    setReportData(null);
    try {
      const params = { from, to };
      if (shopId) params.shop_id = shopId;
      let res;
      if (type === 'summary')          res = await api.get('/reports/summary',          { params });
      else if (type === 'product-margin')   res = await api.get('/reports/product-margin',   { params: { ...params, category: marginCategory } });
      else if (type === 'purchase-invoice') res = await api.get('/reports/purchase-invoice', { params: { invoice_number: invoiceSearch } });
      else if (type === 'stock-value')      res = await api.get('/reports/stock-value',      { params: { as_of_date: to } });
      else if (type === 'daily-inventory')  res = await api.get('/reports/daily-inventory',  { params });
      else if (type === 'sales')            res = await api.get('/reports/sales',             { params });
      else if (type === 'purchases')        res = await api.get('/reports/purchases',         { params });
      else if (type === 'expenses')         res = await api.get('/reports/expenses',          { params });
      else if (type === 'top-products')     res = await api.get('/reports/top-products',      { params });
      else if (type === 'salesperson')      res = await api.get('/reports/salesperson',       { params });
      setReportData(res?.data?.data || res?.data);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to load report'); }
    finally { setLoading(false); }
  };

  const setQuick = (type) => {
    const now = new Date();
    if (type === 'today') { setFrom(today); setTo(today); }
    else if (type === 'month') { setFrom(firstOfMonth); setTo(today); }
    else if (type === '7days') {
      const d = new Date(); d.setDate(d.getDate()-7);
      setFrom(d.toISOString().split('T')[0]); setTo(today);
    } else if (type === '30days') {
      const d = new Date(); d.setDate(d.getDate()-30);
      setFrom(d.toISOString().split('T')[0]); setTo(today);
    }
  };

  const printReport = async () => {
    if (!from || !to) return toast.error('Select a date range first');
    try {
      const res = await api.get('/reports/print-summary', { params: { from, to } });
      const d = res.data?.data;
      if (!d) return toast.error('No data');
      const fmtN = n => `AED ${Math.round(parseFloat(n||0)).toLocaleString()}`;
      const pct  = n => `${parseFloat(n||0).toFixed(1)}%`;
      const shopNames = d.sales_by_shop.map(r => r.shop_name);
      const buildTable = (rows) => rows.map(row => `
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:10px 16px;font-size:13px;color:#334155">${row[0]}</td>
          ${row.slice(1).map((cell,i) => `<td style="padding:10px 16px;text-align:right;font-size:13px;font-weight:${i===row.length-2?'700':'400'};color:${i===row.length-2?'#6366f1':'#334155'}">${cell}</td>`).join('')}
        </tr>`).join('');
      const salesRows = [
        ['Total Invoices',     ...d.sales_by_shop.map(r=>r.invoice_count),  d.sales_by_shop.reduce((s,r)=>s+parseInt(r.invoice_count||0),0)],
        ['Returned',           ...d.sales_by_shop.map(r=>r.returned_count), d.sales_by_shop.reduce((s,r)=>s+parseInt(r.returned_count||0),0)],
        ['Net Sales',          ...d.sales_by_shop.map(r=>fmtN(r.net_sales)),       fmtN(d.totals.net_sales)],
        ['Cost of Goods Sold', ...d.sales_by_shop.map(r=>fmtN(r.cost_of_goods)),   fmtN(d.totals.cost_of_goods)],
        ['Gross Profit',       ...d.sales_by_shop.map(r=>fmtN(parseFloat(r.net_sales||0)-parseFloat(r.cost_of_goods||0))), fmtN(d.totals.gross_profit)],
        ['Gross Margin %',     ...d.sales_by_shop.map(r=>{ const s=parseFloat(r.net_sales||0),c=parseFloat(r.cost_of_goods||0); return s>0?pct(((s-c)/s)*100):'0.0%'; }), pct(d.totals.gross_margin)],
      ];
      const expRows = Object.entries(d.expenses_by_shop.reduce((acc,r)=>{
        if(!acc[r.category])acc[r.category]={};
        acc[r.category][r.shop_name]=r.total; return acc;
      },{})).map(([cat,vals])=>[cat,...shopNames.map(sh=>fmtN(vals[sh]||0)), fmtN(Object.values(vals).reduce((s,v)=>s+parseFloat(v||0),0))]);
      const win = window.open('','_blank');
      win.document.write(`<!DOCTYPE html><html><head><title>Business Summary Report</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;color:#0f172a;font-size:14px}
      table{width:100%;border-collapse:collapse}thead tr{background:#0f172a}thead th{padding:10px 16px;text-align:left;color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
      thead th:not(:first-child){text-align:right}.section{margin-bottom:28px}.section-title{font-size:15px;font-weight:700;color:#0f172a;padding:12px 0;border-bottom:2px solid #6366f1;margin-bottom:0;display:flex;align-items:center;gap:8px}
      @media print{@page{margin:10mm;size:A4}}</style></head><body>
      <div style="padding:32px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #6366f1">
          <div><div style="font-size:24px;font-weight:800;color:#0f172a">Business Summary Report</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px">${fmtDate(from)} — ${fmtDate(to)}</div></div>
          <div style="text-align:right"><div style="font-size:28px;font-weight:800;color:#6366f1">${fmtN(d.totals.net_sales)}</div><div style="font-size:12px;color:#64748b">Net Sales</div></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px">
          ${[['Net Sales',fmtN(d.totals.net_sales),'#6366f1'],['Gross Profit',fmtN(d.totals.gross_profit),'#059669'],['Net Profit',fmtN(d.totals.net_profit),'#059669'],['Expenses',fmtN(d.totals.total_expenses),'#dc2626']]
            .map(([l,v,c])=>`<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;border-top:3px solid ${c}"><div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">${l}</div><div style="font-size:18px;font-weight:800;color:${c};margin-top:4px">${v}</div></div>`).join('')}
        </div>
        <div class="section"><div class="section-title">📊 Sales Summary</div>
        <table><thead><tr><th>Metric</th>${shopNames.map(s=>`<th>${s}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${buildTable(salesRows)}</tbody></table></div>
        <div class="section"><div class="section-title">💸 Expenses by Category</div>
        <table><thead><tr><th>Category</th>${shopNames.map(s=>`<th>${s}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${buildTable(expRows)}</tbody></table></div>
        <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8">
          Generated: ${new Date().toLocaleString('en-AE')}
        </div>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
      </body></html>`);
      win.document.close();
    } catch { toast.error('Failed to generate print report'); }
  };

  const payStatus = s => ({ paid:'badge-green', partial:'badge-yellow', unpaid:'badge-red', returned:'badge-gray' }[s]||'badge-gray');

  return (
    <div>
      <style>{`
        .report-selector { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; margin-bottom:20px; }
        .report-card { background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; padding:14px 16px; cursor:pointer; transition:all .15s; }
        .report-card:hover { border-color:#6366f1; box-shadow:0 4px 12px rgba(99,102,241,.1); transform:translateY(-1px); }
        .report-card.selected { border-color:#6366f1; background:#eef2ff; }
        .report-card-label { font-size:13px; font-weight:700; color:#0f172a; margin-bottom:3px; }
        .report-card-desc { font-size:11px; color:#94a3b8; }
        .r-table { width:100%; border-collapse:collapse; font-size:13px; }
        .r-table th { padding:9px 14px; text-align:left; font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.5px; background:#f8fafc; border-bottom:1px solid #e2e8f0; white-space:nowrap; }
        .r-table td { padding:10px 14px; border-bottom:1px solid #f8fafc; vertical-align:middle; }
        .r-table tr:hover td { background:#f8fafc; }
        .r-table tr:last-child td { border-bottom:none; }
        .grand-row td { background:#0f172a!important; color:#fff; font-weight:800; }
        .cat-row td { background:#f8fafc!important; font-weight:700; }
      `}</style>

      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-title">📊 Reports</div>
          <div className="page-subtitle">Business analytics and performance reports</div>
        </div>
        <button className="btn btn-ghost" onClick={printReport}>🖨️ Print Summary</button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding:'1rem', marginBottom:'16px' }}>
        <div style={{ display:'flex', gap:'10px', alignItems:'flex-end', flexWrap:'wrap' }}>
          <div>
            <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>From</label>
            <input type="date" className="form-control" style={{ width:'auto' }} value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>To</label>
            <input type="date" className="form-control" style={{ width:'auto' }} value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Shop</label>
            <select className="form-control" style={{ width:'auto' }} value={shopId} onChange={e => setShopId(e.target.value)}>
              <option value="">All Shops</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', gap:'6px', paddingBottom:'2px' }}>
            {['today','month','7days','30days'].map(q => (
              <button key={q} className="btn btn-ghost btn-sm" onClick={() => setQuick(q)}>
                {q==='today'?'Today':q==='month'?'This Month':q==='7days'?'Last 7 Days':'Last 30 Days'}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" style={{ paddingBottom:'8px' }} onClick={loadSummary}>
            {summaryLoading ? 'Loading...' : '↻ Refresh Summary'}
          </button>
        </div>
      </div>

      {/* Summary stat cards — always visible */}
      {summary && (
        <div className="stat-grid" style={{ marginBottom:'20px' }}>
          <div className="stat-card green"><div className="label">Total Sales</div><div className="value">{fmt(summary.sales?.total)}</div><div className="sub">{summary.sales?.count} invoices</div></div>
          <div className="stat-card blue"><div className="label">Collected</div><div className="value">{fmt(summary.sales?.collected)}</div><div className="sub">Cash received</div></div>
          <div className="stat-card yellow"><div className="label">Outstanding</div><div className="value">{fmt(summary.sales?.due)}</div><div className="sub">Yet to collect</div></div>
          <div className="stat-card red"><div className="label">Cost of Goods</div><div className="value">{fmt(summary.cogs)}</div><div className="sub">Actual unit cost</div></div>
          <div className="stat-card red"><div className="label">Expenses</div><div className="value">{fmt(summary.expenses?.total)}</div><div className="sub">{summary.expenses?.count} entries</div></div>
          <div className="stat-card blue"><div className="label">Purchases</div><div className="value">{fmt(summary.purchases?.total)}</div><div className="sub">{summary.purchases?.count} orders</div></div>
          <div className="stat-card green">
            <div className="label">Gross Profit</div>
            <div className="value" style={{ color: summary.profit?.gross>=0?'var(--accent-green)':'var(--accent-red)' }}>{fmt(summary.profit?.gross)}</div>
            <div className="sub">Sales - COGS</div>
          </div>
          <div className={`stat-card ${summary.profit?.net>=0?'green':'red'}`}>
            <div className="label">Net Profit</div>
            <div className="value" style={{ color: summary.profit?.net>=0?'var(--accent-green)':'var(--accent-red)' }}>{fmt(summary.profit?.net)}</div>
            <div className="sub">After expenses</div>
          </div>
        </div>
      )}

      {/* Report selector */}
      <div style={{ marginBottom:'12px', fontSize:'12px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.8px' }}>
        Select Report Type
      </div>
      <div className="report-selector">
        {REPORT_TYPES.map(r => (
          <div key={r.id} className={`report-card${reportType===r.id?' selected':''}`}
            onClick={() => { setReportType(r.id); setReportData(null); }}>
            <div className="report-card-label">{r.label}</div>
            <div className="report-card-desc">{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Report-specific extra inputs */}
      {reportType === 'purchase-invoice' && (
        <div className="card" style={{ padding:'1rem', marginBottom:'12px' }}>
          <div style={{ display:'flex', gap:'10px', alignItems:'flex-end' }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Purchase Invoice Number</label>
              <input className="form-control" placeholder="e.g. PUR-001" value={invoiceSearch}
                onChange={e => setInvoiceSearch(e.target.value)}
                onKeyDown={e => e.key==='Enter' && loadReport()} />
            </div>
            <button className="btn btn-primary" onClick={() => loadReport()}>Search</button>
          </div>
        </div>
      )}

      {reportType === 'product-margin' && (
        <div className="card" style={{ padding:'1rem', marginBottom:'12px' }}>
          <div style={{ display:'flex', gap:'10px', alignItems:'flex-end' }}>
            <div>
              <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Filter by Category</label>
              <select className="form-control" style={{ width:'auto' }} value={marginCategory} onChange={e => setMarginCategory(e.target.value)}>
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => loadReport()}>Generate</button>
          </div>
        </div>
      )}

      {/* Generate button for other report types */}
      {reportType && reportType !== 'purchase-invoice' && reportType !== 'product-margin' && (
        <div style={{ marginBottom:'12px' }}>
          <button className="btn btn-primary" onClick={() => loadReport()}>
            {loading ? 'Loading...' : `Generate ${REPORT_TYPES.find(r=>r.id===reportType)?.label}`}
          </button>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>
          <div style={{ fontSize:'1.5rem', marginBottom:'8px' }}>⏳</div>
          <div>Generating report...</div>
        </div>
      )}

      {/* ── REPORT OUTPUT ── */}

      {/* Product Margin Report */}
      {!loading && reportData && reportType === 'product-margin' && (() => {
        const { rows, totals } = reportData;
        return (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
              <strong>Product Wise Margin Report</strong>
              <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>{fmtDate(from)} — {fmtDate(to)}</span>
            </div>
            <div className="table-wrapper">
              <table className="r-table">
                <thead>
                  <tr>
                    <th>#</th><th>Product</th><th>Brand</th><th>Category</th><th>Sub Category</th>
                    <th style={{ textAlign:'right' }}>Qty Sold</th>
                    <th style={{ textAlign:'right' }}>Revenue</th>
                    <th style={{ textAlign:'right' }}>COGS</th>
                    <th style={{ textAlign:'right' }}>Gross Profit</th>
                    <th style={{ textAlign:'right' }}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ color:'#94a3b8' }}>{i+1}</td>
                      <td><strong>{r.product_name}</strong></td>
                      <td style={{ color:'#64748b' }}>{r.brand||'—'}</td>
                      <td><span style={{ background:'#eef2ff', color:'#6366f1', padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:600 }}>{r.category}</span></td>
                      <td style={{ color:'#64748b', fontSize:'12px' }}>{r.sub_category||'—'}</td>
                      <td style={{ textAlign:'right' }}>{r.qty_sold}</td>
                      <td style={{ textAlign:'right' }}>{fmt(r.revenue)}</td>
                      <td style={{ textAlign:'right', color:'#92400e' }}>{fmt(r.cogs)}</td>
                      <td style={{ textAlign:'right' }}>
                        <strong style={{ color: parseFloat(r.gross_profit)>=0?'#059669':'#dc2626' }}>{fmt(r.gross_profit)}</strong>
                      </td>
                      <td style={{ textAlign:'right' }}>
                        <span style={{ background: parseFloat(r.margin_pct)>=20?'#d1fae5':parseFloat(r.margin_pct)>=10?'#fef3c7':'#fee2e2',
                          color: parseFloat(r.margin_pct)>=20?'#065f46':parseFloat(r.margin_pct)>=10?'#92400e':'#991b1b',
                          padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:700 }}>
                          {r.margin_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="grand-row">
                    <td colSpan={5}><strong>TOTAL</strong></td>
                    <td style={{ textAlign:'right', color:'#fff' }}>{totals.qty_sold}</td>
                    <td style={{ textAlign:'right', color:'#fff' }}>{fmt(totals.revenue)}</td>
                    <td style={{ textAlign:'right', color:'#fbbf24' }}>{fmt(totals.cogs)}</td>
                    <td style={{ textAlign:'right', color:'#4ade80' }}>{fmt(totals.gross_profit)}</td>
                    <td style={{ textAlign:'right', color:'#4ade80' }}>{totals.margin_pct}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Purchase Invoice Report */}
      {!loading && reportData && reportType === 'purchase-invoice' && (() => {
        const { purchase, items, totals } = reportData;
        return (
          <div>
            {/* Purchase header */}
            <div className="card" style={{ marginBottom:'12px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'12px', fontSize:'13px' }}>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Purchase #</div><strong>{purchase.purchase_number}</strong></div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Supplier</div>{purchase.supplier_name}</div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Date</div>{fmtDate(purchase.purchase_date)}</div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Shop</div>{purchase.shop_name||'—'}</div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Total Cost</div><strong style={{ color:'#dc2626' }}>{fmt(totals.totalCost)}</strong></div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Revenue (sold)</div><strong style={{ color:'#059669' }}>{fmt(totals.totalRevenue)}</strong></div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Gross Profit</div><strong style={{ color: totals.grossProfit>=0?'#059669':'#dc2626' }}>{fmt(totals.grossProfit)}</strong></div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Margin</div><strong style={{ color:'#6366f1' }}>{totals.margin}%</strong></div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>In Stock</div><strong>{totals.qtyInStock} units</strong></div>
                <div><div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'3px' }}>Stock Value</div><strong>{fmt(totals.stockValue)}</strong></div>
              </div>
            </div>
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div className="table-wrapper">
                <table className="r-table">
                  <thead>
                    <tr>
                      <th>Product</th><th>Serial</th><th>Category</th>
                      <th style={{ textAlign:'right' }}>Qty Bought</th>
                      <th style={{ textAlign:'right' }}>Qty Sold</th>
                      <th style={{ textAlign:'right' }}>In Stock</th>
                      <th style={{ textAlign:'right' }}>Unit Cost</th>
                      <th style={{ textAlign:'right' }}>Revenue</th>
                      <th style={{ textAlign:'right' }}>Profit</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const profit = parseFloat(item.revenue||0) - parseFloat(item.cogs||0);
                      const status = item.qty_in_stock === 0 ? { label:'Sold Out', bg:'#d1fae5', color:'#065f46' }
                        : parseInt(item.qty_sold||0) === 0   ? { label:'In Stock',  bg:'#dbeafe', color:'#1e40af' }
                        : { label:'Partial', bg:'#fef3c7', color:'#92400e' };
                      return (
                        <tr key={i}>
                          <td><strong>{item.brand} {item.product_name}</strong></td>
                          <td style={{ fontFamily:'monospace', fontSize:'12px', color:'#64748b' }}>{item.serial_number||'—'}</td>
                          <td><span style={{ background:'#eef2ff', color:'#6366f1', padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:600 }}>{item.category||'—'}</span></td>
                          <td style={{ textAlign:'right' }}>{item.qty_purchased}</td>
                          <td style={{ textAlign:'right', color:'#059669', fontWeight:600 }}>{item.qty_sold}</td>
                          <td style={{ textAlign:'right', color: item.qty_in_stock===0?'#94a3b8':'#0f172a', fontWeight:700 }}>{item.qty_in_stock}</td>
                          <td style={{ textAlign:'right', color:'#92400e' }}>{fmt(item.unit_cost)}</td>
                          <td style={{ textAlign:'right', color:'#059669' }}>{fmt(item.revenue)}</td>
                          <td style={{ textAlign:'right' }}><strong style={{ color: profit>=0?'#059669':'#dc2626' }}>{fmt(profit)}</strong></td>
                          <td><span style={{ background:status.bg, color:status.color, padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:600 }}>{status.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stock Value Report */}
      {!loading && reportData && reportType === 'stock-value' && (() => {
        const { rows, category_totals, grand_total, shops: repShops, as_of_date } = reportData;
        const fmt2 = n => `AED ${Math.round(parseFloat(n||0)).toLocaleString()}`;
        const grouped = {};
        rows.forEach(r => {
          if (!grouped[r.category]) grouped[r.category] = {};
          if (!grouped[r.category][r.sub_category]) grouped[r.category][r.sub_category] = {};
          grouped[r.category][r.sub_category][r.shop_name] = r;
        });
        return (
          <div>
            <div style={{ display:'flex', gap:'12px', marginBottom:'16px', flexWrap:'wrap' }}>
              {repShops.map(sh => {
                const sv = rows.filter(r=>r.shop_id===sh.id).reduce((s,r)=>s+parseFloat(r.cost_value||0),0);
                const rv = rows.filter(r=>r.shop_id===sh.id).reduce((s,r)=>s+parseFloat(r.retail_value||0),0);
                return (
                  <div key={sh.id} className="card" style={{ flex:1, minWidth:180, padding:'14px 16px', borderTop:'3px solid #6366f1' }}>
                    <div style={{ fontSize:'11px', fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:'6px' }}>{sh.name}</div>
                    <div style={{ fontSize:'18px', fontWeight:800, color:'#0f172a' }}>{fmt2(sv)}</div>
                    <div style={{ fontSize:'11px', color:'#64748b' }}>Cost Value</div>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'#059669', marginTop:'4px' }}>{fmt2(rv)}</div>
                    <div style={{ fontSize:'11px', color:'#64748b' }}>Retail Value</div>
                  </div>
                );
              })}
              <div className="card" style={{ flex:1, minWidth:180, padding:'14px 16px', borderTop:'3px solid #0f172a' }}>
                <div style={{ fontSize:'11px', fontWeight:700, color:'#0f172a', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:'6px' }}>All Shops</div>
                <div style={{ fontSize:'18px', fontWeight:800, color:'#0f172a' }}>{fmt2(grand_total?.cost_value)}</div>
                <div style={{ fontSize:'11px', color:'#64748b' }}>Cost · {parseInt(grand_total?.total_units||0).toLocaleString()} units</div>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#059669', marginTop:'4px' }}>{fmt2(grand_total?.retail_value)}</div>
                <div style={{ fontSize:'11px', color:'#64748b' }}>Retail Value</div>
              </div>
            </div>
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                <strong>Category Wise Stock Value</strong>
                <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>As of {fmtDate(as_of_date)}</span>
              </div>
              <div className="table-wrapper">
                <table className="r-table">
                  <thead>
                    <tr>
                      <th>Category</th><th>Sub Category</th><th style={{ textAlign:'right' }}>Units</th>
                      {repShops.map(sh=><th key={sh.id} style={{ textAlign:'right' }}>{sh.name} Cost</th>)}
                      {repShops.map(sh=><th key={sh.id+'r'} style={{ textAlign:'right' }}>{sh.name} Retail</th>)}
                      <th style={{ textAlign:'right' }}>Total Cost</th>
                      <th style={{ textAlign:'right' }}>Total Retail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(grouped).map(([cat, subCats]) => {
                      const catRows = rows.filter(r=>r.category===cat);
                      const catCost = catRows.reduce((s,r)=>s+parseFloat(r.cost_value||0),0);
                      const catRetail = catRows.reduce((s,r)=>s+parseFloat(r.retail_value||0),0);
                      const catUnits = catRows.reduce((s,r)=>s+parseInt(r.total_units||0),0);
                      return [
                        ...Object.entries(subCats).map(([subCat, shopData], si) => {
                          const subUnits = Object.values(shopData).reduce((s,r)=>s+parseInt(r.total_units||0),0);
                          const subCost  = Object.values(shopData).reduce((s,r)=>s+parseFloat(r.cost_value||0),0);
                          const subRetail= Object.values(shopData).reduce((s,r)=>s+parseFloat(r.retail_value||0),0);
                          return (
                            <tr key={`${cat}-${subCat}`}>
                              <td style={{ color:si===0?'#0f172a':'transparent' }}>
                                {si===0&&<span style={{ background:'#eef2ff', color:'#6366f1', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:700 }}>{cat}</span>}
                              </td>
                              <td style={{ color:'#475569', paddingLeft:'20px' }}>{subCat}</td>
                              <td style={{ textAlign:'right', color:'#64748b' }}>{subUnits}</td>
                              {repShops.map(sh=><td key={sh.id} style={{ textAlign:'right', color:'#92400e' }}>{shopData[sh.name]?fmt2(shopData[sh.name].cost_value):'—'}</td>)}
                              {repShops.map(sh=><td key={sh.id+'r'} style={{ textAlign:'right', color:'#059669' }}>{shopData[sh.name]?fmt2(shopData[sh.name].retail_value):'—'}</td>)}
                              <td style={{ textAlign:'right', fontWeight:600 }}>{fmt2(subCost)}</td>
                              <td style={{ textAlign:'right', fontWeight:600, color:'#059669' }}>{fmt2(subRetail)}</td>
                            </tr>
                          );
                        }),
                        <tr key={`${cat}-total`} className="cat-row">
                          <td colSpan={2} style={{ fontWeight:700 }}>{cat} Total</td>
                          <td style={{ textAlign:'right', fontWeight:700 }}>{catUnits}</td>
                          {repShops.map(sh=>{ const v=catRows.filter(r=>r.shop_name===sh.name).reduce((s,r)=>s+parseFloat(r.cost_value||0),0); return <td key={sh.id} style={{ textAlign:'right', fontWeight:700, color:'#92400e' }}>{fmt2(v)}</td>; })}
                          {repShops.map(sh=>{ const v=catRows.filter(r=>r.shop_name===sh.name).reduce((s,r)=>s+parseFloat(r.retail_value||0),0); return <td key={sh.id+'r'} style={{ textAlign:'right', fontWeight:700, color:'#059669' }}>{fmt2(v)}</td>; })}
                          <td style={{ textAlign:'right', fontWeight:700, color:'#6366f1' }}>{fmt2(catCost)}</td>
                          <td style={{ textAlign:'right', fontWeight:700, color:'#059669' }}>{fmt2(catRetail)}</td>
                        </tr>
                      ];
                    })}
                    <tr className="grand-row">
                      <td colSpan={2}>GRAND TOTAL</td>
                      <td style={{ textAlign:'right', color:'#fff' }}>{parseInt(grand_total?.total_units||0).toLocaleString()}</td>
                      {repShops.map(sh=>{ const v=rows.filter(r=>r.shop_name===sh.name).reduce((s,r)=>s+parseFloat(r.cost_value||0),0); return <td key={sh.id} style={{ textAlign:'right', color:'#fbbf24' }}>{fmt2(v)}</td>; })}
                      {repShops.map(sh=>{ const v=rows.filter(r=>r.shop_name===sh.name).reduce((s,r)=>s+parseFloat(r.retail_value||0),0); return <td key={sh.id+'r'} style={{ textAlign:'right', color:'#4ade80' }}>{fmt2(v)}</td>; })}
                      <td style={{ textAlign:'right', color:'#fbbf24' }}>{fmt2(grand_total?.cost_value)}</td>
                      <td style={{ textAlign:'right', color:'#4ade80' }}>{fmt2(grand_total?.retail_value)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Daily Inventory Value */}
      {!loading && reportData && reportType === 'daily-inventory' && (() => {
        const { rows, shops: invShops } = reportData;
        return (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <strong>Daily Inventory Value</strong>
              <span style={{ fontSize:'12px', color:'#94a3b8', background:'#fef3c7', padding:'4px 10px', borderRadius:'6px' }}>
                ⚠️ Approximate — calculated backwards from current inventory
              </span>
            </div>
            <div className="table-wrapper">
              <table className="r-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    {invShops.map(sh=><th key={sh.id} style={{ textAlign:'right' }}>{sh.name}</th>)}
                    <th style={{ textAlign:'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td>{fmtDate(row.date)}</td>
                      {invShops.map(sh=><td key={sh.id} style={{ textAlign:'right', color:'#334155' }}>{fmt(row.shops[sh.id]?.cost_value||0)}</td>)}
                      <td style={{ textAlign:'right', fontWeight:700, color:'#6366f1' }}>{fmt(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Sales Detail */}
      {!loading && reportData && reportType === 'sales' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="table-wrapper">
            <table className="r-table">
              <thead><tr><th>Invoice #</th><th>Customer</th><th>Shop</th><th>Date</th><th style={{ textAlign:'right' }}>Total</th><th style={{ textAlign:'right' }}>Paid</th><th style={{ textAlign:'right' }}>Due</th><th>Method</th><th>Status</th></tr></thead>
              <tbody>
                {(Array.isArray(reportData)?reportData:[]).map((s,i) => (
                  <tr key={i}>
                    <td><span className="badge badge-blue">{s.invoice_number}</span></td>
                    <td>{s.customer_name||<span style={{ color:'#94a3b8' }}>Walk-in</span>}</td>
                    <td><span className="badge badge-gray">{s.shop_name}</span></td>
                    <td>{fmtDate(s.sale_date)}</td>
                    <td style={{ textAlign:'right', fontWeight:600 }}>{fmt(s.total_amount)}</td>
                    <td style={{ textAlign:'right', color:'#059669' }}>{fmt(s.amount_paid)}</td>
                    <td style={{ textAlign:'right', color:s.amount_due>0?'#dc2626':'#059669' }}>{fmt(s.amount_due)}</td>
                    <td style={{ fontSize:'12px', fontWeight:600, textTransform:'uppercase' }}>{s.payment_method}</td>
                    <td><span className={`badge ${payStatus(s.payment_status)}`}>{s.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Purchases Detail */}
      {!loading && reportData && reportType === 'purchases' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="table-wrapper">
            <table className="r-table">
              <thead><tr><th>Purchase #</th><th>Supplier</th><th>Date</th><th style={{ textAlign:'right' }}>Total</th><th style={{ textAlign:'right' }}>Paid</th><th style={{ textAlign:'right' }}>Due</th><th>Status</th></tr></thead>
              <tbody>
                {(Array.isArray(reportData)?reportData:[]).map((p,i) => (
                  <tr key={i}>
                    <td><span className="badge badge-blue">{p.purchase_number}</span></td>
                    <td>{p.supplier_name}</td>
                    <td>{fmtDate(p.purchase_date)}</td>
                    <td style={{ textAlign:'right', fontWeight:600 }}>{fmt(p.total_amount)}</td>
                    <td style={{ textAlign:'right', color:'#059669' }}>{fmt(p.amount_paid)}</td>
                    <td style={{ textAlign:'right', color:p.amount_due>0?'#dc2626':'#059669' }}>{fmt(p.amount_due)}</td>
                    <td><span className={`badge ${payStatus(p.payment_status)}`}>{p.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expenses Detail */}
      {!loading && reportData && reportType === 'expenses' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="table-wrapper">
            <table className="r-table">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Shop</th><th style={{ textAlign:'right' }}>Amount</th><th>Method</th></tr></thead>
              <tbody>
                {(Array.isArray(reportData)?reportData:[]).map((e,i) => (
                  <tr key={i}>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td><span className="badge badge-purple">{e.category_name||e.category}</span></td>
                    <td>{e.description}</td>
                    <td><span className="badge badge-gray">{e.shop_name||'—'}</span></td>
                    <td style={{ textAlign:'right', fontWeight:600, color:'#dc2626' }}>{fmt(e.amount)}</td>
                    <td style={{ fontSize:'12px', textTransform:'uppercase', color:'#64748b' }}>{e.payment_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Products */}
      {!loading && reportData && reportType === 'top-products' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="table-wrapper">
            <table className="r-table">
              <thead><tr><th>#</th><th>Product</th><th style={{ textAlign:'right' }}>Units</th><th style={{ textAlign:'right' }}>Revenue</th><th style={{ textAlign:'right' }}>Cost</th><th style={{ textAlign:'right' }}>Profit</th><th style={{ textAlign:'right' }}>Margin</th></tr></thead>
              <tbody>
                {(Array.isArray(reportData)?reportData:[]).map((p,i) => (
                  <tr key={i}>
                    <td><span className={`badge ${i<3?'badge-yellow':'badge-gray'}`}>{i+1}</span></td>
                    <td><strong>{p.brand}</strong> {p.name}</td>
                    <td style={{ textAlign:'right' }}>{p.units_sold}</td>
                    <td style={{ textAlign:'right' }}>{fmt(p.revenue)}</td>
                    <td style={{ textAlign:'right', color:'#92400e' }}>{fmt(p.cost)}</td>
                    <td style={{ textAlign:'right' }}><strong style={{ color:p.profit>=0?'#059669':'#dc2626' }}>{fmt(p.profit)}</strong></td>
                    <td style={{ textAlign:'right' }}>{p.revenue>0?((p.profit/p.revenue)*100).toFixed(1):0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Salesperson */}
      {!loading && reportData && reportType === 'salesperson' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="table-wrapper">
            <table className="r-table">
              <thead><tr><th>#</th><th>Salesperson</th><th style={{ textAlign:'right' }}>Invoices</th><th style={{ textAlign:'right' }}>Items</th><th style={{ textAlign:'right' }}>Revenue</th><th style={{ textAlign:'right' }}>Collected</th><th style={{ textAlign:'right' }}>Outstanding</th><th style={{ textAlign:'right' }}>Discounts</th></tr></thead>
              <tbody>
                {(Array.isArray(reportData)?reportData:[]).filter(s=>s.invoice_count>0).map((s,i) => (
                  <tr key={s.id}>
                    <td><span className="badge badge-blue">{i+1}</span></td>
                    <td><strong>{s.salesperson}</strong></td>
                    <td style={{ textAlign:'right' }}>{s.invoice_count}</td>
                    <td style={{ textAlign:'right' }}>{s.total_items_sold}</td>
                    <td style={{ textAlign:'right' }}><strong style={{ color:'#059669' }}>{fmt(s.total_revenue)}</strong></td>
                    <td style={{ textAlign:'right', color:'#059669' }}>{fmt(s.total_collected)}</td>
                    <td style={{ textAlign:'right', color:s.total_due>0?'#dc2626':'#059669' }}>{fmt(s.total_due)}</td>
                    <td style={{ textAlign:'right', color:'#dc2626' }}>{fmt(s.total_discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary report output */}
      {!loading && reportData && reportType === 'summary' && (() => {
        const d = reportData;
        return (
          <div className="stat-grid">
            <div className="stat-card green"><div className="label">Total Sales</div><div className="value">{fmt(d.sales?.total)}</div><div className="sub">{d.sales?.count} invoices</div></div>
            <div className="stat-card red"><div className="label">COGS</div><div className="value">{fmt(d.cogs)}</div><div className="sub">Actual unit cost</div></div>
            <div className="stat-card green"><div className="label">Gross Profit</div><div className="value" style={{ color:d.profit?.gross>=0?'var(--accent-green)':'var(--accent-red)' }}>{fmt(d.profit?.gross)}</div><div className="sub">Sales - COGS</div></div>
            <div className="stat-card red"><div className="label">Expenses</div><div className="value">{fmt(d.expenses?.total)}</div><div className="sub">{d.expenses?.count} entries</div></div>
            <div className={`stat-card ${d.profit?.net>=0?'green':'red'}`}><div className="label">Net Profit</div><div className="value" style={{ color:d.profit?.net>=0?'var(--accent-green)':'var(--accent-red)' }}>{fmt(d.profit?.net)}</div><div className="sub">After expenses</div></div>
          </div>
        );
      })()}

    </div>
  );
}
