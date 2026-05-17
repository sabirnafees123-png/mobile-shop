// src/pages/StockCount.js
import React, { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function StockCount({ user }) {
  const [shops, setShops]       = useState([]);
  const [shopId, setShopId]     = useState('');
  const [shopName, setShopName] = useState('');
  const [items, setItems]       = useState([]);
  const [summary, setSummary]   = useState({});
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [filterCat, setFilterCat] = useState('');
  const [history, setHistory]   = useState([]);
  const [tab, setTab]           = useState('count');
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || []));
    loadHistory();
  }, []);

  useEffect(() => {
    if (shopId) loadInventory();
  }, [shopId]);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stock-count', { params: { shop_id: shopId } });
      setItems((res.data?.data || []).map(i => ({ ...i, actual_qty: i.system_qty, notes: '' })));
      setSummary(res.data?.summary || {});
    } catch { toast.error('Failed to load inventory'); }
    finally { setLoading(false); }
  };

  const loadHistory = async () => {
    try {
      const res = await api.get('/stock-count/history');
      setHistory(res.data?.data || []);
    } catch {}
  };

  const updateActual = (idx, val) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, actual_qty: parseInt(val) || 0 } : item));
  };

  const selectAll = () => {
    setItems(prev => prev.map(item => ({ ...item, actual_qty: item.system_qty })));
    toast.success('All items set to system quantity');
  };

  const saveCount = async () => {
    if (!shopId) return toast.error('Select a shop first');
    setSaving(true);
    try {
      await api.post('/stock-count', {
        shop_id: shopId, count_date: date,
        items: items.map(i => ({ product_id: i.product_id, system_qty: i.system_qty, actual_qty: i.actual_qty, notes: i.notes })),
        created_by: user?.id,
      });
      toast.success('Stock count saved!');
      loadHistory();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const printCount = () => {
    const filtered = filterCat ? items.filter(i => i.category === filterCat) : items;
    const grouped = {};
    filtered.forEach(i => {
      if (!grouped[i.category]) grouped[i.category] = [];
      grouped[i.category].push(i);
    });

    const rows = Object.entries(grouped).map(([cat, catItems]) => `
      <tr style="background:#0f172a">
        <td colspan="5" style="padding:8px 12px;color:#fff;font-weight:700;font-size:13px">${cat}</td>
      </tr>
      ${catItems.map((item, i) => `
        <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
          <td style="padding:8px 12px;font-size:12px">${item.name}${item.brand ? ` (${item.brand})` : ''}</td>
          <td style="padding:8px 12px;font-size:12px;color:#64748b">${item.sub_category || '—'}</td>
          <td style="padding:8px 12px;text-align:center;font-weight:700">${item.system_qty}</td>
          <td style="padding:8px 12px;text-align:center;border:1.5px solid #cbd5e1;min-width:60px">&nbsp;</td>
          <td style="padding:8px 12px;border:1.5px solid #cbd5e1;min-width:100px">&nbsp;</td>
        </tr>
      `).join('')}
    `).join('');

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Stock Count — ${shopName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Inter',sans-serif;color:#0f172a;font-size:13px}
      table{width:100%;border-collapse:collapse}
      @media print{@page{margin:10mm;size:A4}}
    </style></head><body>
    <div style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #6366f1">
        <div>
          <div style="font-size:20px;font-weight:700">${shopName} — Stock Count</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">Date: ${new Date(date).toLocaleDateString('en-AE')} &nbsp;|&nbsp; Total Items: ${filtered.length} &nbsp;|&nbsp; Total Units: ${filtered.reduce((s,i)=>s+i.system_qty,0)}</div>
        </div>
        <div style="text-align:right;font-size:12px;color:#94a3b8">
          <div>Counted by: _______________</div>
          <div style="margin-top:6px">Signature: _______________</div>
        </div>
      </div>
      <table>
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Product</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Sub Category</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">System Qty</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Actual Qty</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">
        Printed: ${new Date().toLocaleString('en-AE')} &nbsp;|&nbsp; ${shopName}
      </div>
    </div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
    </body></html>`);
    win.document.close();
  };

  const categories = [...new Set(items.map(i => i.category))].sort();
  const filtered = filterCat ? items.filter(i => i.category === filterCat) : items;
  const totalVariance = items.reduce((s, i) => s + (i.actual_qty - i.system_qty), 0);
  const missingItems = items.filter(i => i.actual_qty < i.system_qty).length;

  return (
    <div>
      <style>{`
        .sc-tabs { display:flex; gap:4px; margin-bottom:20px; background:#f1f5f9; padding:4px; border-radius:10px; width:fit-content; }
        .sc-tab { padding:8px 18px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:600; color:#64748b; background:transparent; transition:all .15s; }
        .sc-tab.active { background:#fff; color:#6366f1; box-shadow:0 1px 4px rgba(0,0,0,.08); }
        .variance-neg { color:#dc2626; font-weight:700; }
        .variance-pos { color:#059669; font-weight:700; }
        .variance-zero { color:#94a3b8; }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">📊 Stock Count</div>
          <div className="page-subtitle">Physical inventory count and variance tracking</div>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {tab === 'count' && shopId && items.length > 0 && (
            <>
              <button className="btn btn-ghost" onClick={printCount}>🖨️ Print Sheet</button>
              <button className="btn btn-ghost" onClick={selectAll}>✓ Select All (Match System)</button>
              <button className="btn btn-primary" onClick={saveCount} disabled={saving}>
                {saving ? 'Saving...' : '💾 Save Count'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="sc-tabs">
        <button className={`sc-tab${tab==='count'?' active':''}`} onClick={() => setTab('count')}>📋 Count</button>
        <button className={`sc-tab${tab==='history'?' active':''}`} onClick={() => setTab('history')}>📅 History</button>
      </div>

      {tab === 'count' && (
        <>
          {/* Controls */}
          <div className="card" style={{ padding:'1rem', marginBottom:'1rem' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:'12px', alignItems:'end' }}>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Shop *</label>
                <select className="form-control" value={shopId}
                  onChange={e => { setShopId(e.target.value); setShopName(shops.find(s=>s.id==e.target.value)?.name||''); setFilterCat(''); }}>
                  <option value="">— Select Shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Count Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Filter Category</label>
                <select className="form-control" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                  <option value="">All Categories</option>
                  {categories.map(c => <option key={c} value={c}>{c} ({summary[c]?.units || 0} units)</option>)}
                </select>
              </div>
              <div style={{ paddingBottom:'2px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setFilterCat('')}>✕ Clear</button>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          {items.length > 0 && (
            <div className="stat-grid" style={{ marginBottom:'16px' }}>
              {Object.entries(summary).map(([cat, s]) => (
                <div key={cat} className="card" style={{ padding:'12px 16px', borderTop:'3px solid #6366f1' }}>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'.5px' }}>{cat}</div>
                  <div style={{ fontSize:'20px', fontWeight:800, color:'#0f172a', marginTop:'4px' }}>{s.units}</div>
                  <div style={{ fontSize:'11px', color:'#64748b' }}>{s.count} products</div>
                </div>
              ))}
              {missingItems > 0 && (
                <div className="card" style={{ padding:'12px 16px', borderTop:'3px solid #dc2626' }}>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#dc2626', textTransform:'uppercase', letterSpacing:'.5px' }}>⚠️ Missing</div>
                  <div style={{ fontSize:'20px', fontWeight:800, color:'#dc2626', marginTop:'4px' }}>{Math.abs(totalVariance)}</div>
                  <div style={{ fontSize:'11px', color:'#64748b' }}>{missingItems} products affected</div>
                </div>
              )}
            </div>
          )}

          {/* Count table */}
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            {loading ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>Loading inventory...</div>
            ) : !shopId ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>
                <div style={{ fontSize:'2rem', marginBottom:'8px' }}>🏪</div>
                <div style={{ fontWeight:600 }}>Select a shop to start counting</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>No inventory found for this shop</div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product</th>
                      <th>Brand</th>
                      <th>Category</th>
                      <th>Sub Category</th>
                      <th style={{ textAlign:'center' }}>System Qty</th>
                      <th style={{ textAlign:'center' }}>Actual Qty</th>
                      <th style={{ textAlign:'center' }}>Variance</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item, i) => {
                      const variance = item.actual_qty - item.system_qty;
                      const origIdx = items.findIndex(x => x.product_id === item.product_id);
                      return (
                        <tr key={item.product_id} style={{ background: variance < 0 ? '#fff5f5' : 'inherit' }}>
                          <td style={{ color:'#94a3b8', fontSize:'12px' }}>{i+1}</td>
                          <td><strong>{item.name}</strong></td>
                          <td style={{ color:'#64748b' }}>{item.brand || '—'}</td>
                          <td><span style={{ background:'#eef2ff', color:'#6366f1', padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:600 }}>{item.category}</span></td>
                          <td style={{ color:'#64748b', fontSize:'12px' }}>{item.sub_category}</td>
                          <td style={{ textAlign:'center', fontWeight:700 }}>{item.system_qty}</td>
                          <td style={{ textAlign:'center' }}>
                            <input type="number" min="0"
                              style={{ width:'70px', padding:'5px 8px', border:`1.5px solid ${variance < 0 ? '#dc2626' : '#e2e8f0'}`, borderRadius:'6px', textAlign:'center', fontWeight:700, fontSize:'13px' }}
                              value={item.actual_qty}
                              onChange={e => updateActual(origIdx, e.target.value)} />
                          </td>
                          <td style={{ textAlign:'center' }}>
                            <span className={variance < 0 ? 'variance-neg' : variance > 0 ? 'variance-pos' : 'variance-zero'}>
                              {variance > 0 ? '+' : ''}{variance}
                            </span>
                          </td>
                          <td>
                            <input placeholder="Notes..." style={{ padding:'4px 8px', border:'1.5px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', width:'120px' }}
                              value={item.notes || ''} onChange={e => { const copy=[...items]; copy[origIdx]={...copy[origIdx],notes:e.target.value}; setItems(copy); }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {history.length === 0 ? (
            <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>
              <div style={{ fontSize:'2rem', marginBottom:'8px' }}>📅</div>
              <div style={{ fontWeight:600 }}>No stock counts yet</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shop</th>
                    <th>Counted By</th>
                    <th style={{ textAlign:'right' }}>Items</th>
                    <th style={{ textAlign:'right' }}>Missing Items</th>
                    <th style={{ textAlign:'right' }}>Missing Units</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td>{new Date(h.count_date).toLocaleDateString('en-AE')}</td>
                      <td><span className="badge badge-gray">{h.shop_name}</span></td>
                      <td>{h.counted_by_name || '—'}</td>
                      <td style={{ textAlign:'right' }}>{h.item_count}</td>
                      <td style={{ textAlign:'right' }}>
                        {h.items_missing > 0
                          ? <span style={{ color:'#dc2626', fontWeight:700 }}>{h.items_missing}</span>
                          : <span style={{ color:'#059669' }}>0</span>}
                      </td>
                      <td style={{ textAlign:'right' }}>
                        {h.total_missing_units > 0
                          ? <span style={{ color:'#dc2626', fontWeight:700 }}>-{h.total_missing_units}</span>
                          : <span style={{ color:'#059669' }}>0</span>}
                      </td>
                      <td><span className={`badge ${h.status==='completed'?'badge-green':'badge-yellow'}`}>{h.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
