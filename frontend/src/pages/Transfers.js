// src/pages/Transfers.js
import React, { useEffect, useState } from 'react';
import { TableSkeleton, EmptyTransfers } from '../components/UI';
import toast from 'react-hot-toast';
import api from '../utils/api';
import TransferModal from '../components/TransferModal';

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AE') : '—';

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [shops, setShops]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        api.get('/shops/transfers'),
        api.get('/shops'),
      ]);
      setTransfers(tRes.data?.data || []);
      setShops(sRes.data?.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🔄 Internal Transfers</div>
          <div className="page-subtitle">Move stock between AlAman and Blessing</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Transfer
        </button>
      </div>

      {/* Shop inventory overview */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'1.5rem'}}>
        {shops.map(shop => (
          <div key={shop.id} className="card" style={{padding:'1rem'}}>
            <div style={{fontWeight:700,fontSize:'1rem',marginBottom:'8px'}}>{shop.name}</div>
            <ShopInventorySummary shopId={shop.id} />
          </div>
        ))}
      </div>

      {/* Transfers table */}
      <div className="card">
        {loading ? <TableSkeleton rows={6} cols={6} /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Product</th><th>From</th><th>To</th><th>Qty</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr><td colSpan={6}><EmptyTransfers onNew={() => setShowModal(true)} /></td></tr>
                ) : transfers.map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.transfer_date)}</td>
                    <td><strong>{t.brand} {t.product_name}</strong></td>
                    <td><span className="badge badge-red">{t.from_shop_name}</span></td>
                    <td><span className="badge badge-green">{t.to_shop_name}</span></td>
                    <td><strong>{t.quantity}</strong></td>
                    <td style={{color:'var(--text-muted)',fontSize:'.85rem'}}>{t.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <TransferModal onClose={() => setShowModal(false)} onDone={load} />
      )}
    </div>
  );
}

// Mini inventory summary per shop
function ShopInventorySummary({ shopId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/shops/${shopId}/inventory`)
      .then(r => setData(r.data?.data || []))
      .catch(() => setData([]));
  }, [shopId]);

  if (!data) return <div style={{color:'var(--text-muted)',fontSize:'.85rem'}}>Loading...</div>;
  const total = data.reduce((s, i) => s + i.quantity, 0);
  const low   = data.filter(i => i.quantity <= i.min_stock && i.quantity > 0).length;
  const out   = data.filter(i => i.quantity === 0).length;

  return (
    <div style={{display:'flex',gap:'16px',fontSize:'.85rem'}}>
      <div><strong>{data.length}</strong> <span style={{color:'var(--text-muted)'}}>products</span></div>
      <div><strong>{total}</strong> <span style={{color:'var(--text-muted)'}}>units</span></div>
      {low > 0 && <div style={{color:'#d97706'}}><strong>{low}</strong> low stock</div>}
      {out > 0 && <div style={{color:'#dc2626'}}><strong>{out}</strong> out of stock</div>}
    </div>
  );
}