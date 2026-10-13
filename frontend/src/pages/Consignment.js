// src/pages/Consignment.js
// Consignment: stock stays in the OWNER shop's inventory but is physically kept in another shop.
// Invoices made here are created under the OWNER shop, so cash / profit / register stay with the owner.
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const fmt     = n => `AED ${Math.round(Number(n || 0)).toLocaleString()}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AE') : '—';
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};
const productLabel = c => `${c.brand ? c.brand + ' ' : ''}${c.name}${c.color ? ' ' + c.color : ''}`;

// ── Invoice (sell a consigned item) ─────────────────────────────────────────
function InvoiceModal({ item, onClose, onDone }) {
  const open = Number(item.open_qty);
  const [qty, setQty]             = useState(open);
  const [sellPrice, setSellPrice] = useState(item.selling_price || '');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerName, setCustomerName]   = useState('');
  const [saleDate, setSaleDate]   = useState(todayStr());
  const [saving, setSaving]       = useState(false);

  const total = (parseFloat(sellPrice) || 0) * (parseInt(qty) || 0);

  const submit = async () => {
    const q = parseInt(qty);
    if (!q || q <= 0) return toast.error('Enter a valid quantity');
    if (q > open) return toast.error(`Only ${open} unit(s) open`);
    if (!sellPrice || parseFloat(sellPrice) <= 0) return toast.error('Enter a selling price');
    setSaving(true);
    try {
      const res = await api.post('/sales', {
        shop_id: item.owner_shop_id,               // invoice is always under the OWNER shop
        payment_method: paymentMethod,
        amount_paid: total,
        discount: 0,
        sale_date: saleDate,
        customer_name: customerName || undefined,
        notes: `Consignment sale — kept at ${item.holder_shop_name}`,
        items: [{
          product_id: item.product_id,
          qty: q,
          unit_cost: parseFloat(item.base_cost) || 0,
          unit_price: parseFloat(sellPrice) || 0,
          serial_number: item.serial_number || undefined,
          consignment_id: item.id,
        }],
      });
      toast.success(`Invoice ${res.data?.data?.invoice_number || ''} created (${item.owner_shop_name})`);
      onDone(); onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create invoice');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <strong>🧾 Invoice — {productLabel(item)}</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: '10px 12px', background: '#eff6ff', borderRadius: '8px', marginBottom: '14px', fontSize: '.85rem' }}>
            Invoice will be made under <strong>{item.owner_shop_name}</strong> (owner).
            Cash and profit go to {item.owner_shop_name}.<br />
            Item is kept at <strong>{item.holder_shop_name}</strong>
            {item.serial_number ? ` — S/N ${item.serial_number}` : ''}.
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Customer Name (optional)</label>
            <input type="text" className="form-control" value={customerName}
              onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in customer" />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Sale Date</label>
            <input type="date" className="form-control" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Quantity (open: {open})</label>
            <input type="number" min="1" max={open} className="form-control" value={qty}
              onChange={e => setQty(e.target.value)} disabled={!!item.serial_number} />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Selling Price (AED) — per unit</label>
            <input type="number" className="form-control" value={sellPrice}
              onChange={e => setSellPrice(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Payment Method</label>
            <select className="form-control" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f0fdf4', borderRadius: '8px', fontSize: '.9rem', fontWeight: 600 }}>
            <span>Total</span><span>{fmt(total)}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Return (stock comes back to the owner shop) ─────────────────────────────
function ReturnModal({ item, onClose, onDone }) {
  const open = Number(item.open_qty);
  const [qty, setQty]   = useState(open);
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const q = parseInt(qty);
    if (!q || q <= 0 || q > open) return toast.error(`Quantity must be between 1 and ${open}`);
    setSaving(true);
    try {
      await api.post(`/consignments/${item.id}/return`, { qty: q, return_date: date });
      toast.success('Returned to ' + item.owner_shop_name);
      onDone(); onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to return');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <strong>↩️ Return — {productLabel(item)}</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: '.85rem', marginBottom: '14px', color: 'var(--text-muted)' }}>
            {item.holder_shop_name} → {item.owner_shop_name}. Stock was never removed from {item.owner_shop_name}'s
            inventory, so only this record is closed.
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Quantity (open: {open})</label>
            <input type="number" min="1" max={open} className="form-control" value={qty}
              onChange={e => setQty(e.target.value)} disabled={!!item.serial_number} />
          </div>
          <div className="form-group">
            <label className="form-label">Return Date</label>
            <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Consignment() {
  const [tab, setTab]           = useState('open');      // open | closed
  const [rows, setRows]         = useState([]);
  const [summary, setSummary]   = useState([]);
  const [shops, setShops]       = useState([]);
  const [ownerShop, setOwnerShop]   = useState('');
  const [holderShop, setHolderShop] = useState('');
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [invoiceItem, setInvoiceItem] = useState(null);
  const [returnItem, setReturnItem]   = useState(null);

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data?.data || [])).catch(() => setShops([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: tab };
      if (ownerShop)  params.owner_shop_id  = ownerShop;
      if (holderShop) params.holder_shop_id = holderShop;
      if (search.trim()) params.search = search.trim();
      const [list, sum] = await Promise.all([
        api.get('/consignments', { params }),
        api.get('/consignments/summary'),
      ]);
      setRows(list.data?.data || []);
      setSummary(sum.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load consignments');
    } finally { setLoading(false); }
  }, [tab, ownerShop, holderShop, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const cancel = async (c) => {
    if (!window.confirm(`Cancel this consignment entry for ${productLabel(c)}? (entered by mistake)`)) return;
    try {
      await api.delete(`/consignments/${c.id}`);
      toast.success('Cancelled');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to cancel'); }
  };

  const totalUnits = summary.reduce((s, x) => s + Number(x.units || 0), 0);
  const totalValue = summary.reduce((s, x) => s + Number(x.cost_value || 0), 0);

  return (
    <div>
      {invoiceItem && <InvoiceModal item={invoiceItem} onClose={() => setInvoiceItem(null)} onDone={load} />}
      {returnItem  && <ReturnModal  item={returnItem}  onClose={() => setReturnItem(null)}  onDone={load} />}

      <div className="page-header">
        <div>
          <div className="page-title">🤝 Consignment</div>
          <div className="page-subtitle">
            Stock given by one shop to another to sell. It stays in the owner shop's inventory; invoices are made
            under the owner shop. To give stock: Inventory → ⋮ → Give on Consignment.
          </div>
        </div>
      </div>

      {/* Summary: which shop's stock is lying where */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px', marginBottom: '1.25rem' }}>
        {summary.map(s => (
          <div key={`${s.owner_shop_id}-${s.holder_shop_id}`} className="card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              <strong>{s.owner_shop_name}</strong> stock lying at <strong>{s.holder_shop_name}</strong>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '4px' }}>{s.units} units</div>
            <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Cost value {fmt(s.cost_value)}</div>
          </div>
        ))}
        <div className="card" style={{ padding: '1rem', background: '#f8fafc' }}>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Total on consignment</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '4px' }}>{totalUnits} units</div>
          <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Cost value {fmt(totalValue)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className={`btn btn-sm ${tab === 'open' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('open')}>
              At other shop
            </button>
            <button className={`btn btn-sm ${tab === 'closed' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('closed')}>
              History
            </button>
          </div>
          <div>
            <label className="form-label">Owner shop</label>
            <select className="form-control" value={ownerShop} onChange={e => setOwnerShop(e.target.value)}>
              <option value="">All</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Kept at</label>
            <select className="form-control" value={holderShop} onChange={e => setHolderShop(e.target.value)}>
              <option value="">All</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label className="form-label">Search</label>
            <input type="text" className="form-control" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Name, brand or IMEI" />
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Given</th><th>Product</th><th>IMEI / Serial</th><th>Owner</th><th>Kept at</th>
                  <th>{tab === 'open' ? 'Open qty' : 'Result'}</th>
                  <th>Cost</th>
                  {tab === 'closed' && <th>Invoice</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>
                    {tab === 'open' ? 'Nothing is lying at another shop.' : 'No history yet.'}
                  </td></tr>
                ) : rows.map(c => {
                  const open = Number(c.open_qty);
                  const untouched = Number(c.sold_qty) === 0 && Number(c.returned_qty) === 0;
                  return (
                    <tr key={c.id}>
                      <td>{fmtDate(c.given_date)}</td>
                      <td>
                        <strong>{productLabel(c)}</strong>
                        {c.notes && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{c.notes}</div>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{c.serial_number || '—'}</td>
                      <td><span className="badge badge-blue">{c.owner_shop_name}</span></td>
                      <td><span className="badge badge-yellow">{c.holder_shop_name}</span></td>
                      <td>
                        {tab === 'open' ? (
                          <strong>{open}{Number(c.qty) !== open ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {c.qty}</span> : null}</strong>
                        ) : (
                          <span style={{ fontSize: '.8rem' }}>
                            {Number(c.sold_qty) > 0 && <span className="badge badge-green" style={{ marginRight: 4 }}>Sold {c.sold_qty}</span>}
                            {Number(c.returned_qty) > 0 && <span className="badge badge-gray">Returned {c.returned_qty}</span>}
                          </span>
                        )}
                      </td>
                      <td>{fmt(tab === 'open' ? c.open_cost_value : Number(c.base_cost) * Number(c.qty))}</td>
                      {tab === 'closed' && <td style={{ fontSize: '.8rem' }}>{c.invoices || '—'}</td>}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {open > 0 && (
                          <>
                            <button className="btn btn-sm btn-primary" onClick={() => setInvoiceItem(c)}>🧾 Invoice</button>{' '}
                            <button className="btn btn-sm btn-ghost" onClick={() => setReturnItem(c)}>↩️ Return</button>{' '}
                            {untouched && <button className="btn btn-sm btn-ghost" title="Entered by mistake" onClick={() => cancel(c)}>✕</button>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
