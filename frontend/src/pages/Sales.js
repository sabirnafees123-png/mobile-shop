// src/pages/Sales.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const currency = process.env.REACT_APP_CURRENCY || 'AED';
  const fmt = n => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

  useEffect(() => {
    api.get('/sales').then(r => setSales(r.data)).finally(() => setLoading(false));
  }, []);

  const payStatus = s => ({ paid: 'badge-green', partial: 'badge-yellow', unpaid: 'badge-red' }[s] || 'badge-gray');

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">🧾 Sales / Invoices</div><div className="page-subtitle">All customer sales</div></div>
      </div>
      <div className="card">
        {loading ? <div className="loading">Loading...</div> : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Method</th><th>Status</th></tr></thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state"><p>No sales yet — start selling!</p></div></td></tr>
                ) : sales.map(s => (
                  <tr key={s.id}>
                    <td><span className="badge badge-green">{s.invoice_number}</span></td>
                    <td>{s.customer_name || <span style={{color:'var(--text-muted)'}}>Walk-in</span>}</td>
                    <td>{new Date(s.sale_date).toLocaleDateString('en-AE')}</td>
                    <td>{s.item_count}</td>
                    <td><strong>{fmt(s.total_amount)}</strong></td>
                    <td style={{color:'var(--accent-green)'}}>{fmt(s.amount_paid)}</td>
                    <td style={{color: s.amount_due > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}}>{fmt(s.amount_due)}</td>
                    <td><span className="badge badge-blue">{s.payment_method}</span></td>
                    <td><span className={`badge ${payStatus(s.payment_status)}`}>{s.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{marginTop:'1rem',padding:'1rem',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--text-muted)',fontSize:'0.85rem'}}>
        💡 <strong>To create a sale</strong>, use the API directly or build the sale form in the next phase. API endpoint: <code>POST /api/v1/sales</code>
      </div>
    </div>
  );
}
