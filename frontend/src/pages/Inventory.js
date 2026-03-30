// src/pages/Inventory.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Inventory() {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('in_stock');
  const currency = process.env.REACT_APP_CURRENCY || 'AED';

  const load = () => {
    setLoading(true);
   api.get(`/inventory?status=${filter}`).then(r => setStock(r.data?.data || [])).finally(() => setLoading(false));


  };

  useEffect(() => { load(); }, [filter]);

  const fmt = (n) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

  const filtered = (Array.isArray(stock) ? stock : []).filter(s =>
    s.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.imei?.includes(search) ||
    s.purchase_number?.includes(search)
  );

  const statusBadge = (s) => {
    const map = { in_stock: 'badge-green', sold: 'badge-gray', reserved: 'badge-yellow', returned: 'badge-blue', damaged: 'badge-red' };
    return `badge ${map[s] || 'badge-gray'}`;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🗃️ Stock</div>
          <div className="page-subtitle">Individual inventory lines per purchase</div>
        </div>
        <span className="badge badge-green" style={{fontSize:'0.875rem',padding:'0.4rem 0.8rem'}}>
          {stock.filter(s => s.status === 'in_stock').length} in stock
        </span>
      </div>

      <div className="search-bar">
        <input className="form-control search-input" placeholder="Search by product, IMEI, purchase #..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-control" style={{width:'150px'}} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="in_stock">In Stock</option>
          <option value="sold">Sold</option>
          <option value="reserved">Reserved</option>
          <option value="damaged">Damaged</option>
        </select>
      </div>

      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>IMEI</th>
                  <th>Purchase #</th>
                  <th>Cost</th>
                  <th>Sell Price</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><p>No stock items found</p></div></td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.brand} {s.product_name}</strong>
                      {s.model && <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{s.model}</div>}
                    </td>
                    <td style={{fontFamily:'monospace',fontSize:'0.8rem'}}>{s.imei || '—'}</td>
                    <td><span className="badge badge-blue">{s.purchase_number}</span></td>
                    <td>{fmt(s.unit_cost)}</td>
                    <td>{s.selling_price ? fmt(s.selling_price) : <span style={{color:'var(--text-muted)'}}>Not set</span>}</td>
                    <td>
                      <span style={{color: s.qty_remaining === 0 ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight:600}}>
                        {s.qty_remaining}/{s.qty_purchased}
                      </span>
                    </td>
                    <td><span className={statusBadge(s.status)}>{s.status.replace('_',' ')}</span></td>
                    <td style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                      {new Date(s.received_at).toLocaleDateString('en-AE')}
                    </td>
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
