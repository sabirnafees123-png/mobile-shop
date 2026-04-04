// src/pages/CashRegister.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt = n => `AED ${Math.round(parseFloat(n || 0)).toLocaleString()}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-AE');

export default function CashRegister() {
  const [data, setData]           = useState(null);
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showOpen, setShowOpen]   = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openingBal, setOpeningBal] = useState('');
  const [closingBal, setClosingBal] = useState('');
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [today, hist] = await Promise.all([
        api.get('/cash-register/today'),
        api.get('/cash-register/history'),
      ]);
      setData(today.data?.data);
      setHistory(hist.data?.data || []);
    } catch {
      toast.error('Failed to load cash register');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleOpen = async () => {
    setSaving(true);
    try {
      await api.post('/cash-register/open', { opening_balance: parseFloat(openingBal) || 0, notes });
      toast.success('Register opened!');
      setShowOpen(false);
      setOpeningBal('');
      setNotes('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const handleClose = async () => {
    setSaving(true);
    try {
      await api.post('/cash-register/close', { closing_balance: parseFloat(closingBal) || 0, notes });
      toast.success('Register closed!');
      setShowClose(false);
      setClosingBal('');
      setNotes('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="loading" style={{padding:'48px',textAlign:'center'}}>Loading...</div>;

  const today = data?.today || {};
  const register = data?.register;
  const isOpen = register?.status === 'open';
  const isClosed = register?.status === 'closed';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">💵 Cash Register</div>
          <div className="page-subtitle">Daily cash flow — {new Date().toLocaleDateString('en-AE', {weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {!register && (
            <button className="btn btn-primary" onClick={() => setShowOpen(true)}>
              🔓 Open Register
            </button>
          )}
          {isOpen && (
            <button className="btn btn-primary" style={{background:'var(--accent-red)'}} onClick={() => setShowClose(true)}>
              🔒 Close Register
            </button>
          )}
          {isClosed && (
            <span className="badge badge-gray" style={{padding:'8px 16px',fontSize:'.9rem'}}>
              🔒 Register Closed
            </span>
          )}
        </div>
      </div>

      {/* Register Status Banner */}
      {register && (
        <div style={{
          padding:'12px 16px',borderRadius:'8px',marginBottom:'20px',fontSize:'.9rem',
          background: isOpen ? '#d1fae5' : '#f1f2f6',
          color: isOpen ? '#065f46' : '#6b7280',
          border: `1px solid ${isOpen ? '#a7f3d0' : '#e8eaf0'}`
        }}>
          {isOpen
            ? `✅ Register opened today with opening balance: ${fmt(register.opening_balance)}`
            : `🔒 Register closed — Closing balance: ${fmt(register.closing_balance)}`}
          {register.notes && <span style={{marginLeft:'12px',opacity:.7}}>· {register.notes}</span>}
        </div>
      )}

      {/* Today's Summary Cards */}
      <div style={{marginBottom:'8px',fontWeight:600,fontSize:'.8rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
        Today's Summary
      </div>
      <div className="stat-grid" style={{marginBottom:'24px'}}>
        <div className="stat-card green">
          <div className="label">Cash In Hand</div>
          <div className="value">{fmt(today.cash_in_hand)}</div>
          <div className="sub">Opening + Cash Sales - Expenses</div>
        </div>
        <div className="stat-card blue">
          <div className="label">Yesterday Closing</div>
          <div className="value">{fmt(data?.yesterday_closing)}</div>
          <div className="sub">Carried forward</div>
        </div>
        <div className="stat-card green">
          <div className="label">Cash Sales Today</div>
          <div className="value">{fmt(today.cash_sales)}</div>
          <div className="sub">{today.invoice_count} invoices</div>
        </div>
        <div className="stat-card blue">
          <div className="label">Bank / Card Sales</div>
          <div className="value">{fmt((today.bank_sales||0) + (today.card_sales||0))}</div>
          <div className="sub">Non-cash</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Total Sales Today</div>
          <div className="value">{fmt(today.total_sales)}</div>
          <div className="sub">All methods</div>
        </div>
        <div className="stat-card red">
          <div className="label">Expenses Today</div>
          <div className="value">{fmt(today.expenses)}</div>
          <div className="sub">Cash outflow</div>
        </div>
      </div>

      {/* Cheques Summary */}
      <div style={{marginBottom:'8px',fontWeight:600,fontSize:'.8rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
        Pending Cheques
      </div>
      <div className="stat-grid" style={{marginBottom:'24px',gridTemplateColumns:'1fr 1fr'}}>
        <div className="stat-card green">
          <div className="label">Inbound (To Receive)</div>
          <div className="value">{fmt(data?.cheques?.pending_inbound)}</div>
          <div className="sub">Pending collection</div>
        </div>
        <div className="stat-card red">
          <div className="label">Outbound (To Pay)</div>
          <div className="value">{fmt(data?.cheques?.pending_outbound)}</div>
          <div className="sub">Pending payment</div>
        </div>
      </div>

      {/* History */}
      <div style={{marginBottom:'8px',fontWeight:600,fontSize:'.8rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>
        Register History
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Opening</th><th>Cash Sales</th>
                <th>Expenses</th><th>Closing</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state">No register history yet</div></td></tr>
              ) : history.map(h => (
                <tr key={h.id}>
                  <td>{fmtDate(h.register_date)}</td>
                  <td>{fmt(h.opening_balance)}</td>
                  <td style={{color:'var(--accent-green)'}}>{fmt(h.total_sales_cash)}</td>
                  <td style={{color:'var(--accent-red)'}}>{fmt(h.total_expenses)}</td>
                  <td><strong>{fmt(h.closing_balance)}</strong></td>
                  <td>
                    <span className={`badge ${h.status==='open'?'badge-green':'badge-gray'}`}>
                      {h.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Register Modal */}
      {showOpen && (
        <div className="modal-overlay" onClick={() => setShowOpen(false)}>
          <div className="modal" style={{maxWidth:'400px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔓 Open Register</strong>
              <button className="modal-close" onClick={() => setShowOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{marginBottom:'12px'}}>
                <label className="form-label">Opening Balance (AED)</label>
                <input type="number" className="form-control" value={openingBal}
                  onChange={e => setOpeningBal(e.target.value)} placeholder="Cash in hand at start of day" />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={notes}
                  onChange={e => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleOpen} disabled={saving}>
                {saving ? 'Opening...' : 'Open Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Register Modal */}
      {showClose && (
        <div className="modal-overlay" onClick={() => setShowClose(false)}>
          <div className="modal" style={{maxWidth:'400px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <strong>🔒 Close Register</strong>
              <button className="modal-close" onClick={() => setShowClose(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{padding:'12px',background:'var(--bg-secondary)',borderRadius:'8px',marginBottom:'16px',fontSize:'.9rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                  <span>Cash Sales Today:</span><strong style={{color:'var(--accent-green)'}}>{fmt(today.cash_sales)}</strong>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                  <span>Expenses Today:</span><strong style={{color:'var(--accent-red)'}}>{fmt(today.expenses)}</strong>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:'6px'}}>
                  <span>Expected Cash:</span><strong style={{color:'var(--accent)'}}>{fmt(today.cash_in_hand)}</strong>
                </div>
              </div>
              <div className="form-group" style={{marginBottom:'12px'}}>
                <label className="form-label">Actual Closing Balance (AED)</label>
                <input type="number" className="form-control" value={closingBal}
                  onChange={e => setClosingBal(e.target.value)}
                  placeholder={Math.round(today.cash_in_hand || 0).toString()} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-control" value={notes}
                  onChange={e => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowClose(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:'var(--accent-red)'}} onClick={handleClose} disabled={saving}>
                {saving ? 'Closing...' : 'Close Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
