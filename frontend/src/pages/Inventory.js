// src/pages/Inventory.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TableSkeleton, EmptyInventory } from '../components/UI';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(Number(n||0)).toLocaleString()}`;
const PRODUCT_TYPES = ['New (Box Pack)','Used','Refurbished','Parts','Accessories','Wholesale'];

function AdjustModal({ item, onClose, onDone }) {
  const [type, setType]       = useState('in');
  const [qty, setQty]         = useState('');
  const [note, setNote]       = useState('');
  const [costPrice, setCostPrice] = useState(item?.base_cost || '');
  const [saving, setSaving]   = useState(false);
  if (!item) return null;

  const handleSubmit = async () => {
    if (!qty || isNaN(qty) || Number(qty) <= 0) return toast.error('Enter a valid quantity');
    setSaving(true);
    try {
      await api.post('/inventory/adjust', {
        product_id: item.product_id, shop_id: item.shop_id,
        type, quantity: Number(qty), note, cost_price: costPrice || null,
      });
      toast.success('Stock updated!');
      onDone(); onClose();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxWidth:'420px'}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <strong>📦 Adjust — {item.name}</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{textAlign:'center',padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px'}}>
            <div style={{fontSize:'2rem',fontWeight:700}}>{item.quantity}</div>
            <div style={{fontSize:'.8rem',color:'var(--text-muted)'}}>Current Stock — {item.shop_name}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'12px'}}>
            {[['in','📥','Stock In'],['out','📤','Stock Out'],['adjustment','🔧','Set Exact']].map(([k,icon,label])=>(
              <button key={k} onClick={()=>setType(k)} style={{padding:'10px',borderRadius:'8px',
                border:`2px solid ${type===k?'var(--accent)':'var(--border)'}`,
                background:type===k?'var(--bg-secondary)':'transparent',cursor:'pointer',textAlign:'center'}}>
                <div style={{fontSize:'1.2rem'}}>{icon}</div>
                <div style={{fontSize:'.75rem',fontWeight:600}}>{label}</div>
              </button>
            ))}
          </div>
          <div className="form-group" style={{marginBottom:'12px'}}>
            <label className="form-label">Quantity</label>
            <input type="number" min="0" className="form-control" value={qty}
              onChange={e=>setQty(e.target.value)} placeholder="Enter quantity" />
          </div>
          <div className="form-group" style={{marginBottom:'12px'}}>
            <label className="form-label">Update Cost Price (AED) — optional</label>
            <input type="number" className="form-control" value={costPrice}
              onChange={e=>setCostPrice(e.target.value)} placeholder={`Current: AED ${Math.round(item.base_cost||0)}`} />
          </div>
          <div className="form-group">
            <label className="form-label">Note</label>
            <input className="form-control" value={note} onChange={e=>setNote(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving?'Saving…':'Update Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPriceModal({ item, onClose, onDone }) {
  const [costPrice, setCostPrice]     = useState(item?.base_cost || '');
  const [sellPrice, setSellPrice]     = useState(item?.selling_price || '');
  const [saving, setSaving]           = useState(false);

  const handleSubmit = async () => {
    try {
      setSaving(true);
      await api.post('/inventory/update-price', {
        product_id: item.product_id,
        cost_price: parseFloat(costPrice) || 0,
        selling_price: parseFloat(sellPrice) || 0,
      });
      toast.success('Prices updated!');
      onDone(); onClose();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxWidth:'380px'}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <strong>💰 Edit Prices — {item.name}</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group" style={{marginBottom:'12px'}}>
            <label className="form-label">Cost Price (AED)</label>
            <input type="number" className="form-control" value={costPrice}
              onChange={e=>setCostPrice(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Selling Price (AED)</label>
            <input type="number" className="form-control" value={sellPrice}
              onChange={e=>setSellPrice(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving?'Saving…':'Update Prices'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MovementsModal({ productId, productName, onClose }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading]     = useState(true);
  useEffect(() => {
    api.get('/inventory/movements', { params: { product_id: productId, limit: 30 } })
      .then(r => setMovements(r.data.data))
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  }, [productId]);
  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxWidth:'500px'}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <strong>📋 History — {productName}</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{maxHeight:'60vh',overflowY:'auto'}}>
          {loading ? <div className="loading">Loading…</div>
          : movements.length === 0 ? <div className="empty-state">No movements</div>
          : movements.map(m => (
            <div key={m.id} style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',
              background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'8px'}}>
              <div>
                <span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'.75rem',fontWeight:600,
                  background:m.type==='in'?'#d1fae5':m.type==='out'?'#fee2e2':'#dbeafe',
                  color:m.type==='in'?'#065f46':m.type==='out'?'#dc2626':'#1e40af'}}>
                  {m.type.toUpperCase()}
                </span>
                {m.note && <div style={{fontSize:'.8rem',color:'var(--text-muted)',marginTop:'2px'}}>{m.note}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:700,color:m.type==='out'?'#dc2626':'#059669'}}>
                  {m.type==='out'?'-':'+'}{m.quantity}
                </div>
                <div style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{new Date(m.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const [inventory, setInventory]       = useState([]);
  const [stats, setStats]               = useState(null);
  const [shops, setShops]               = useState([]);
  const [pagination, setPagination]     = useState({ total:0, page:1, pages:1, limit:50 });
  const [loading, setLoading]           = useState(true);
  const [importing, setImporting]       = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [adjustItem, setAdjustItem]     = useState(null);
  const [editPriceItem, setEditPriceItem] = useState(null);
  const [movementItem, setMovementItem] = useState(null);

  // Filters
  const [search, setSearch]             = useState('');
  const [shopId, setShopId]             = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterFrom, setFilterFrom]     = useState('');
  const [filterTo, setFilterTo]         = useState('');
  const [page, setPage]                 = useState(1);
  const [limitPerPage]                  = useState(50);

  const fileInputRef = useRef();

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || []));
  }, []);

  const fetchInventory = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const params = { page: pg, limit: limitPerPage };
      if (search)       params.search  = search;
      if (filterStatus) params.status  = filterStatus;
      if (shopId)       params.shop_id = shopId;
      if (filterType)   params.type    = filterType;
      if (filterFrom)   params.from    = filterFrom;
      if (filterTo)     params.to      = filterTo;

      const [invRes, statsRes] = await Promise.all([
        api.get('/inventory', { params }),
        api.get('/inventory/stats', { params: shopId ? { shop_id: shopId } : {} }),
      ]);
      setInventory(invRes.data.data || []);
      setPagination(invRes.data.pagination || { total:0, page:1, pages:1, limit:50 });
      setStats(statsRes.data.data);
    } catch { toast.error('Failed to load inventory'); }
    finally { setLoading(false); }
  }, [search, filterStatus, shopId, filterType, filterFrom, filterTo, page, limitPerPage]);

  useEffect(() => { fetchInventory(page); }, [search, filterStatus, shopId, filterType, filterFrom, filterTo, page]);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const qs = shopId ? `?shop_id=${shopId}` : '';
      const response = await fetch(
        `https://mobile-shop-snowy.vercel.app/api/v1/inventory/export${qs}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success('Exported!');
    } catch (err) { toast.error('Export failed: ' + err.message); }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true);
    try {
      const text  = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const delimiter = lines[0].includes('\t') ? '\t' : ',';
      const headers = lines[0].split(delimiter).map(h => h.replace(/"/g,'').trim().toLowerCase().replace(/ /g,'_'));
      const rows = lines.slice(1).map(line => {
        const values = delimiter==='\t' ? line.split('\t') : line.split(',').map(v=>v.replace(/^"|"$/g,''));
        const obj = {};
        headers.forEach((h,i) => { obj[h] = (values[i]||'').replace(/^\"|\"$/g,'').trim(); });
        return obj;
      }).filter(r => r.product_name || r.name || r.serial_number);
      if (rows.length === 0) { toast.error('No valid rows found'); return; }
      const res = await api.post('/inventory/import', { rows, shop_id: shopId || null });
      toast.success(res.data?.message || 'Import complete!');
      if (res.data?.errors?.length) toast.error(`${res.data.errors.length} row(s) had issues`);
      fetchInventory(1);
    } catch (err) { toast.error('Import failed: ' + (err.response?.data?.message || err.message)); }
    finally { setImporting(false); e.target.value = ''; }
  };

  const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

  const stockStatus = (qty, min) => {
    if (qty === 0)  return { label:'Out of Stock', color:'#dc2626', bg:'#fee2e2' };
    if (qty <= min) return { label:'Low Stock',    color:'#d97706', bg:'#fef3c7' };
    return            { label:'In Stock',          color:'#059669', bg:'#d1fae5' };
  };

  const clearFilters = () => {
    setSearch(''); setShopId(''); setFilterStatus('');
    setFilterType(''); setFilterFrom(''); setFilterTo('');
    setPage(1);
  };

  return (
    <div style={{padding:'24px',background:'#f8f9fc',minHeight:'100vh'}}>
      {adjustItem    && <AdjustModal    item={adjustItem}    onClose={()=>setAdjustItem(null)}    onDone={()=>fetchInventory(page)} />}
      {editPriceItem && <EditPriceModal item={editPriceItem} onClose={()=>setEditPriceItem(null)} onDone={()=>fetchInventory(page)} />}
      {movementItem  && <MovementsModal productId={movementItem.product_id} productName={movementItem.name} onClose={()=>setMovementItem(null)} />}
      <input ref={fileInputRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleImport} />

      {/* Header */}
      <div className="page-header" style={{background:'transparent',padding:'0 0 20px 0',border:'none'}}>
        <div>
          <div className="page-title">🏪 Inventory</div>
          <div className="page-subtitle">{pagination.total} total items</div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',marginLeft:'auto',flexWrap:'wrap'}}>
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>📥 Export</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>fileInputRef.current?.click()} disabled={importing}>
            {importing?'⏳ Importing...':'📤 Import'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stat-grid" style={{marginBottom:'20px'}}>
          {[
            {label:'Total Products',value:stats.total_products,icon:'📦'},
            {label:'Total Units',   value:stats.total_units||0, icon:'🔢'},
            {label:'Out of Stock',  value:stats.out_of_stock,   icon:'❌'},
            {label:'Low Stock',     value:stats.low_stock,      icon:'⚠️'},
            {label:'Stock Value',   value:fmt(stats.total_cost_value), icon:'💵'},
            {label:'Retail Value',  value:fmt(stats.total_sell_value), icon:'💰'},
          ].map(s => (
            <div key={s.label} style={{background:'#fff',borderRadius:'10px',padding:'16px',border:'1px solid #e8eaf0'}}>
              <div style={{fontSize:'1.5rem',marginBottom:'4px'}}>{s.icon}</div>
              <div style={{fontSize:'1.1rem',fontWeight:700,color:'#1a1a2e'}}>{s.value}</div>
              <div style={{fontSize:'.75rem',color:'#6b7280'}}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{background:'#fff',borderRadius:'10px',border:'1px solid #e8eaf0',padding:'16px',marginBottom:'16px'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr auto',gap:'10px',alignItems:'end'}}>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>Search</label>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              placeholder="Name, serial, brand..." className="form-control" />
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>Shop</label>
            <select value={shopId} onChange={e=>{setShopId(e.target.value);setPage(1);}} className="form-control">
              <option value="">All Shops</option>
              {shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>Status</label>
            <select value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(1);}} className="form-control">
              <option value="">All Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>Type</label>
            <select value={filterType} onChange={e=>{setFilterType(e.target.value);setPage(1);}} className="form-control">
              <option value="">All Types</option>
              {PRODUCT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>From</label>
            <input type="date" value={filterFrom} onChange={e=>{setFilterFrom(e.target.value);setPage(1);}} className="form-control" />
          </div>
          <div>
            <label style={{fontSize:'.78rem',color:'#6b7280',display:'block',marginBottom:'4px'}}>To</label>
            <input type="date" value={filterTo} onChange={e=>{setFilterTo(e.target.value);setPage(1);}} className="form-control" />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{marginBottom:'2px'}}>✕ Clear</button>
        </div>
      </div>

      {/* Table */}
      <div style={{background:'#fff',borderRadius:'10px',border:'1px solid #e8eaf0',overflow:'hidden'}}>
        {loading ? (
          <TableSkeleton rows={10} cols={8} />
        ) : inventory.length === 0 ? (
          <EmptyInventory />
        ) : (
          <>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.88rem'}}>
                <thead>
                  <tr style={{background:'#f8f9fc',borderBottom:'2px solid #e8eaf0'}}>
                    <th style={{padding:'10px 8px',width:'32px'}}></th>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:'.75rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>Serial / IMEI</th>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:'.75rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>Product</th>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:'.75rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>Color</th>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:'.75rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>Shop</th>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:'.75rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>In Stock</th>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:'.75rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>Status</th>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:'.75rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => {
                    const status   = stockStatus(item.quantity, item.min_stock);
                    const expanded = expandedRows[item.id];
                    return (
                      <React.Fragment key={item.id}>
                        <tr style={{borderBottom:'1px solid #f1f2f6',cursor:'pointer'}}
                          onMouseEnter={e=>e.currentTarget.style.background='#fafbff'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {/* Expand button */}
                          <td style={{padding:'10px 8px',textAlign:'center'}}>
                            <button onClick={()=>toggleRow(item.id)}
                              style={{background:'none',border:'none',cursor:'pointer',
                                fontSize:'1rem',color:'var(--accent)',fontWeight:700,
                                width:'24px',height:'24px',borderRadius:'4px',
                                display:'flex',alignItems:'center',justifyContent:'center'}}>
                              {expanded ? '−' : '+'}
                            </button>
                          </td>
                          <td style={{padding:'10px 12px',fontFamily:'monospace',fontSize:'.82rem',fontWeight:600}}>
                            {item.serial_number || <span style={{color:'#9ca3af'}}>—</span>}
                          </td>
                          <td style={{padding:'10px 12px'}}>
                            <div style={{fontWeight:600,color:'#1a1a2e'}}>{item.name}</div>
                            {item.type && <div style={{fontSize:'.72rem',color:'#6b7280'}}>{item.type}</div>}
                          </td>
                          <td style={{padding:'10px 12px'}}>
                            {item.color ? (
                              <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                                <div style={{width:'10px',height:'10px',borderRadius:'50%',
                                  background:item.color.toLowerCase(),border:'1px solid #e8eaf0'}}/>
                                {item.color}
                              </div>
                            ) : <span style={{color:'#9ca3af'}}>—</span>}
                          </td>
                          <td style={{padding:'10px 12px'}}>
                            <span style={{padding:'2px 8px',borderRadius:'6px',fontSize:'.78rem',fontWeight:600,background:'#f3f4f6',color:'#374151'}}>
                              {item.shop_name||'—'}
                            </span>
                          </td>
                          <td style={{padding:'10px 12px'}}>
                            <span style={{fontSize:'1.3rem',fontWeight:700,
                              color:item.quantity===0?'#dc2626':item.quantity<=item.min_stock?'#d97706':'#059669'}}>
                              {item.quantity}
                            </span>
                          </td>
                          <td style={{padding:'10px 12px'}}>
                            <span style={{padding:'3px 10px',borderRadius:'12px',fontSize:'.75rem',
                              fontWeight:600,background:status.bg,color:status.color}}>
                              {status.label}
                            </span>
                          </td>
                          <td style={{padding:'10px 12px'}}>
                            <div style={{display:'flex',gap:'4px'}}>
                              <button onClick={()=>setAdjustItem(item)}
                                style={{padding:'3px 8px',borderRadius:'6px',border:'none',
                                  background:'#d1fae5',color:'#065f46',cursor:'pointer',fontSize:'.78rem'}}>
                                ± Adjust
                              </button>
                              <button onClick={()=>setEditPriceItem(item)}
                                style={{padding:'3px 8px',borderRadius:'6px',border:'none',
                                  background:'#fef3c7',color:'#92400e',cursor:'pointer',fontSize:'.78rem'}}>
                                💰 Price
                              </button>
                              <button onClick={()=>setMovementItem(item)}
                                style={{padding:'3px 8px',borderRadius:'6px',border:'none',
                                  background:'#dbeafe',color:'#1e40af',cursor:'pointer',fontSize:'.78rem'}}>
                                📋
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Expanded detail row */}
                        {expanded && (
                          <tr style={{background:'#f8f9fc',borderBottom:'1px solid #e8eaf0'}}>
                            <td colSpan={8} style={{padding:'16px 24px'}}>
                              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'16px',fontSize:'.85rem'}}>
                                <div>
                                  <div style={{color:'#6b7280',fontSize:'.75rem',marginBottom:'4px'}}>COST PRICE</div>
                                  <div style={{fontWeight:700,color:'#92400e',fontSize:'1rem'}}>AED {Math.round(item.base_cost||0).toLocaleString()}</div>
                                </div>
                                <div>
                                  <div style={{color:'#6b7280',fontSize:'.75rem',marginBottom:'4px'}}>SELLING PRICE</div>
                                  <div style={{fontWeight:700,color:'#059669',fontSize:'1rem'}}>AED {Math.round(item.selling_price||0).toLocaleString()}</div>
                                </div>
                                <div>
                                  <div style={{color:'#6b7280',fontSize:'.75rem',marginBottom:'4px'}}>MARGIN</div>
                                  <div style={{fontWeight:700,color:'#6366f1',fontSize:'1rem'}}>
                                    AED {Math.round((item.selling_price||0)-(item.base_cost||0)).toLocaleString()}
                                    {item.base_cost > 0 && (
                                      <span style={{fontSize:'.78rem',marginLeft:'4px'}}>
                                        ({Math.round(((item.selling_price-item.base_cost)/item.base_cost)*100)}%)
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div style={{color:'#6b7280',fontSize:'.75rem',marginBottom:'4px'}}>CATEGORY</div>
                                  <div style={{fontWeight:600}}>{item.category||'—'}</div>
                                </div>
                                <div>
                                  <div style={{color:'#6b7280',fontSize:'.75rem',marginBottom:'4px'}}>LAST UPDATED</div>
                                  <div style={{fontWeight:600}}>{new Date(item.last_updated).toLocaleDateString('en-AE')}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'12px 16px',borderTop:'1px solid #f1f2f6',fontSize:'.85rem',color:'#6b7280'}}>
              <div>{pagination.total} records — Page {pagination.page} of {pagination.pages}</div>
              <div style={{display:'flex',gap:'6px'}}>
                <button onClick={()=>setPage(1)} disabled={page===1}
                  style={{padding:'4px 10px',borderRadius:'6px',border:'1px solid #e8eaf0',
                    background:page===1?'#f3f4f6':'white',cursor:page===1?'not-allowed':'pointer'}}>«</button>
                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                  style={{padding:'4px 10px',borderRadius:'6px',border:'1px solid #e8eaf0',
                    background:page===1?'#f3f4f6':'white',cursor:page===1?'not-allowed':'pointer'}}>‹ Prev</button>
                {/* Page numbers */}
                {Array.from({length:Math.min(5,pagination.pages)},(_,i)=>{
                  const p = Math.max(1,Math.min(pagination.pages-4,page-2))+i;
                  return p <= pagination.pages ? (
                    <button key={p} onClick={()=>setPage(p)}
                      style={{padding:'4px 10px',borderRadius:'6px',border:'1px solid #e8eaf0',
                        background:p===page?'var(--accent)':'white',
                        color:p===page?'white':'#374151',cursor:'pointer',fontWeight:p===page?700:400}}>
                      {p}
                    </button>
                  ) : null;
                })}
                <button onClick={()=>setPage(p=>Math.min(pagination.pages,p+1))} disabled={page===pagination.pages}
                  style={{padding:'4px 10px',borderRadius:'6px',border:'1px solid #e8eaf0',
                    background:page===pagination.pages?'#f3f4f6':'white',cursor:page===pagination.pages?'not-allowed':'pointer'}}>Next ›</button>
                <button onClick={()=>setPage(pagination.pages)} disabled={page===pagination.pages}
                  style={{padding:'4px 10px',borderRadius:'6px',border:'1px solid #e8eaf0',
                    background:page===pagination.pages?'#f3f4f6':'white',cursor:page===pagination.pages?'not-allowed':'pointer'}}>»</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
