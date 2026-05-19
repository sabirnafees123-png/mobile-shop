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
  const [history, setHistory]   = useState([]);
  const [tab, setTab]           = useState('count');
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0]);

  // Category-wise navigation
  const [activeCategory, setActiveCategory] = useState('');
  // checked: Set of product_ids that have been tick-marked as counted
  const [checked, setChecked]   = useState(new Set());

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || []));
    loadHistory();
  }, []);

  useEffect(() => {
    if (shopId) loadInventory();
  }, [shopId]);

  // When items load, default to first category
  useEffect(() => {
    if (items.length > 0) {
      const cats = [...new Set(items.map(i => i.category))].sort();
      if (cats.length > 0 && !activeCategory) setActiveCategory(cats[0]);
    }
  }, [items]);

  const loadInventory = async () => {
    setLoading(true);
    setChecked(new Set()); // reset checkmarks on fresh load
    setActiveCategory('');
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

  const updateActual = (productId, val) => {
    setItems(prev => prev.map(item => item.product_id === productId
      ? { ...item, actual_qty: parseInt(val) || 0 } : item));
  };

  const updateNotes = (productId, val) => {
    setItems(prev => prev.map(item => item.product_id === productId
      ? { ...item, notes: val } : item));
  };

  const toggleCheck = (productId) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const checkAllInCategory = (cat) => {
    const catItems = items.filter(i => i.category === cat);
    const allChecked = catItems.every(i => checked.has(i.product_id));
    setChecked(prev => {
      const next = new Set(prev);
      catItems.forEach(i => allChecked ? next.delete(i.product_id) : next.add(i.product_id));
      return next;
    });
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
    const activeItems = activeCategory ? items.filter(i => i.category === activeCategory) : items;
    const grouped = {};
    activeItems.forEach(i => {
      if (!grouped[i.category]) grouped[i.category] = [];
      grouped[i.category].push(i);
    });

    const rows = Object.entries(grouped).map(([cat, catItems]) => `
      <tr style="background:#0f172a">
        <td colspan="6" style="padding:8px 12px;color:#fff;font-weight:700;font-size:13px">${cat}</td>
      </tr>
      ${catItems.map((item, idx) => `
        <tr style="background:${idx%2===0?'#fff':'#f8fafc'}">
          <td style="padding:8px 12px;text-align:center;font-size:11px;color:#94a3b8">${idx+1}</td>
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
          <div style="font-size:20px;font-weight:700">${shopName} — Stock Count${activeCategory ? ` (${activeCategory})` : ''}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">Date: ${new Date(date).toLocaleDateString('en-AE')} &nbsp;|&nbsp; Total Items: ${activeItems.length} &nbsp;|&nbsp; Total Units: ${activeItems.reduce((s,i)=>s+i.system_qty,0)}</div>
        </div>
        <div style="text-align:right;font-size:12px;color:#94a3b8">
          <div>Counted by: _______________</div>
          <div style="margin-top:6px">Signature: _______________</div>
        </div>
      </div>
      <table>
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">#</th>
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
  const filteredItems = activeCategory ? items.filter(i => i.category === activeCategory) : items;
  const totalVariance = items.reduce((s, i) => s + (i.actual_qty - i.system_qty), 0);
  const missingItems = items.filter(i => i.actual_qty < i.system_qty).length;

  // Per-category progress
  const getCatProgress = (cat) => {
    const catItems = items.filter(i => i.category === cat);
    const done = catItems.filter(i => checked.has(i.product_id)).length;
    return { done, total: catItems.length };
  };

  const totalChecked = items.filter(i => checked.has(i.product_id)).length;
  const allDone = items.length > 0 && totalChecked === items.length;

  const catIdx = categories.indexOf(activeCategory);
  const hasPrev = catIdx > 0;
  const hasNext = catIdx < categories.length - 1;

  return (
    <div>
      <style>{`
        .sc-tabs { display:flex; gap:4px; margin-bottom:20px; background:#f1f5f9; padding:4px; border-radius:10px; width:fit-content; }
        .sc-tab { padding:8px 18px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:600; color:#64748b; background:transparent; transition:all .15s; }
        .sc-tab.active { background:#fff; color:#6366f1; box-shadow:0 1px 4px rgba(0,0,0,.08); }
        .variance-neg { color:#dc2626; font-weight:700; }
        .variance-pos { color:#059669; font-weight:700; }
        .variance-zero { color:#94a3b8; }
        .cat-pill {
          display:inline-flex; align-items:center; gap:6px;
          padding:6px 14px; border-radius:20px; border:1.5px solid #e2e8f0;
          font-size:12px; font-weight:600; cursor:pointer; background:#fff;
          color:#64748b; transition:all .15s; white-space:nowrap;
        }
        .cat-pill:hover { border-color:#6366f1; color:#6366f1; }
        .cat-pill.active { background:#6366f1; color:#fff; border-color:#6366f1; }
        .cat-pill.done { border-color:#059669; }
        .cat-pill.active.done { background:#059669; border-color:#059669; }
        .progress-bar-wrap { background:#e2e8f0; border-radius:10px; height:6px; overflow:hidden; margin-top:4px; }
        .progress-bar-fill { height:6px; border-radius:10px; background:#6366f1; transition:width .3s; }
        .check-cell { width:40px; text-align:center; }
        .item-checkbox {
          width:20px; height:20px; border-radius:6px; border:2px solid #cbd5e1;
          display:inline-flex; align-items:center; justify-content:center;
          cursor:pointer; transition:all .15s; background:#fff; flex-shrink:0;
          user-select:none;
        }
        .item-checkbox.checked { background:#059669; border-color:#059669; }
        .item-checkbox.checked::after { content:'✓'; color:#fff; font-size:13px; font-weight:700; }
        tr.row-checked td { background:#f0fdf4 !important; }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">📊 Stock Count</div>
          <div className="page-subtitle">Physical inventory count and variance tracking</div>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {tab === 'count' && shopId && items.length > 0 && (
            <>
              <button className="btn btn-ghost" onClick={printCount}>🖨️ Print {activeCategory || 'All'}</button>
              <button className="btn btn-primary" onClick={saveCount} disabled={saving}>
                {saving ? 'Saving...' : '💾 Update Stock Count'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="sc-tabs">
        {['count', 'history'].map(t => (
          <button key={t} className={`sc-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'count' ? '📋 Count' : '📅 History'}
          </button>
        ))}
      </div>

      {tab === 'count' && (
        <>
          {/* Controls */}
          <div className="card" style={{ padding:'1rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap' }}>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Shop</label>
                <select className="form-control" value={shopId}
                  onChange={e => {
                    setShopId(e.target.value);
                    setShopName(e.target.options[e.target.selectedIndex]?.text || '');
                  }}>
                  <option value="">— Select Shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:'.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px' }}>Count Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              {items.length > 0 && (
                <div style={{ marginLeft:'auto', textAlign:'right' }}>
                  <div style={{ fontSize:'12px', color:'#64748b', fontWeight:600 }}>
                    ✅ {totalChecked} / {items.length} items checked
                  </div>
                  <div className="progress-bar-wrap" style={{ width:160 }}>
                    <div className="progress-bar-fill" style={{ width:`${(totalChecked/items.length)*100}%`, background: allDone ? '#059669' : '#6366f1' }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Category Navigation Tabs */}
          {items.length > 0 && (
            <div style={{ marginBottom:'12px' }}>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:'12px', color:'#94a3b8', fontWeight:600, marginRight:'4px' }}>CATEGORY:</span>
                <button
                  className={`cat-pill${!activeCategory ? ' active' : ''}`}
                  onClick={() => setActiveCategory('')}
                >
                  All ({items.length})
                </button>
                {categories.map(cat => {
                  const { done, total } = getCatProgress(cat);
                  const catDone = done === total && total > 0;
                  return (
                    <button
                      key={cat}
                      className={`cat-pill${activeCategory === cat ? ' active' : ''}${catDone ? ' done' : ''}`}
                      onClick={() => setActiveCategory(cat)}
                    >
                      {catDone && <span>✓</span>}
                      {cat} ({done}/{total})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary cards */}
          {items.length > 0 && (
            <div className="stat-grid" style={{ marginBottom:'16px' }}>
              {Object.entries(summary).map(([cat, s]) => (
                <div key={cat} className="card" style={{ padding:'12px 16px', borderTop:'3px solid #6366f1', cursor:'pointer' }}
                  onClick={() => setActiveCategory(cat)}>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'.5px' }}>{cat}</div>
                  <div style={{ fontSize:'20px', fontWeight:800, color:'#0f172a', marginTop:'4px' }}>{s.units}</div>
                  <div style={{ fontSize:'11px', color:'#64748b' }}>{s.count} products</div>
                  {(() => { const p = getCatProgress(cat); return (
                    <div style={{ marginTop:'6px' }}>
                      <div className="progress-bar-wrap">
                        <div className="progress-bar-fill" style={{ width:`${p.total ? (p.done/p.total)*100 : 0}%`, background: p.done===p.total && p.total>0 ? '#059669' : '#6366f1' }} />
                      </div>
                      <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'3px' }}>{p.done}/{p.total} checked</div>
                    </div>
                  );})()}
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
            ) : filteredItems.length === 0 ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>No inventory found for this shop</div>
            ) : (
              <>
                {/* Category header with check-all */}
                {activeCategory && (
                  <div style={{ padding:'10px 16px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                      <span style={{ fontWeight:700, color:'#6366f1' }}>{activeCategory}</span>
                      <span style={{ fontSize:'12px', color:'#94a3b8' }}>{filteredItems.length} items</span>
                    </div>
                    <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                      {(() => { const { done, total } = getCatProgress(activeCategory); return (
                        <span style={{ fontSize:'12px', color: done===total ? '#059669' : '#64748b', fontWeight:600 }}>
                          {done === total && total > 0 ? '✅ All counted!' : `${done}/${total} checked`}
                        </span>
                      );})()}
                      <button className="btn btn-ghost btn-sm" onClick={() => checkAllInCategory(activeCategory)}>
                        {(() => { const catItems = items.filter(i => i.category === activeCategory); return catItems.every(i => checked.has(i.product_id)) ? '✕ Uncheck All' : '✓ Check All'; })()}
                      </button>
                    </div>
                  </div>
                )}

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th className="check-cell">✓</th>
                        <th>#</th>
                        <th>Product</th>
                        <th>Brand</th>
                        {!activeCategory && <th>Category</th>}
                        <th>Sub Category</th>
                        <th style={{ textAlign:'center' }}>System Qty</th>
                        <th style={{ textAlign:'center' }}>Actual Qty</th>
                        <th style={{ textAlign:'center' }}>Variance</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item, i) => {
                        const variance = item.actual_qty - item.system_qty;
                        const isChecked = checked.has(item.product_id);
                        return (
                          <tr key={item.product_id}
                            className={isChecked ? 'row-checked' : ''}
                            style={{ background: variance < 0 && !isChecked ? '#fff5f5' : undefined }}>
                            <td className="check-cell">
                              <div
                                className={`item-checkbox${isChecked ? ' checked' : ''}`}
                                onClick={() => toggleCheck(item.product_id)}
                                title={isChecked ? 'Mark as uncounted' : 'Mark as counted'}
                              />
                            </td>
                            <td style={{ color:'#94a3b8', fontSize:'12px' }}>{i + 1}</td>
                            <td>
                              <strong style={{ color: isChecked ? '#059669' : '#0f172a' }}>{item.name}</strong>
                            </td>
                            <td style={{ color:'#64748b' }}>{item.brand || '—'}</td>
                            {!activeCategory && (
                              <td>
                                <span style={{ background:'#eef2ff', color:'#6366f1', padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:600 }}>{item.category}</span>
                              </td>
                            )}
                            <td style={{ color:'#64748b', fontSize:'12px' }}>{item.sub_category}</td>
                            <td style={{ textAlign:'center', fontWeight:700 }}>{item.system_qty}</td>
                            <td style={{ textAlign:'center' }}>
                              <input type="number" min="0"
                                style={{ width:'70px', padding:'5px 8px', border:`1.5px solid ${variance < 0 ? '#dc2626' : '#e2e8f0'}`, borderRadius:'6px', textAlign:'center', fontWeight:700, fontSize:'13px' }}
                                value={item.actual_qty}
                                onChange={e => updateActual(item.product_id, e.target.value)} />
                            </td>
                            <td style={{ textAlign:'center' }}>
                              <span className={variance < 0 ? 'variance-neg' : variance > 0 ? 'variance-pos' : 'variance-zero'}>
                                {variance > 0 ? '+' : ''}{variance}
                              </span>
                            </td>
                            <td>
                              <input placeholder="Notes..." style={{ padding:'4px 8px', border:'1.5px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', width:'120px' }}
                                value={item.notes || ''} onChange={e => updateNotes(item.product_id, e.target.value)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Prev / Next category navigation */}
                {categories.length > 1 && activeCategory && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderTop:'1px solid #e2e8f0', background:'#fafafa' }}>
                    <button className="btn btn-ghost btn-sm" disabled={!hasPrev}
                      onClick={() => setActiveCategory(categories[catIdx - 1])}>
                      ← {hasPrev ? categories[catIdx - 1] : ''}
                    </button>
                    <div style={{ fontSize:'12px', color:'#94a3b8' }}>
                      Category {catIdx + 1} of {categories.length}
                    </div>
                    <button className="btn btn-ghost btn-sm" disabled={!hasNext}
                      onClick={() => setActiveCategory(categories[catIdx + 1])}>
                      {hasNext ? categories[catIdx + 1] : ''} →
                    </button>
                  </div>
                )}
              </>
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
                    <th>Date</th><th>Shop</th><th>Counted By</th>
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
