import React, { useState, useEffect, useCallback } from "react";

const API = "https://mobile-shop-snowy.vercel.app/api/v1";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => `AED ${Math.round(Number(n)).toLocaleString()}`;
const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });
};
const getToken = () => localStorage.getItem("token");

const apiFetch = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "cash",
    cheque_no: "",
    note: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setError("");
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/suppliers/${supplier.id}/payments`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Record Payment</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="supplier-info-strip">
            <span className="supplier-name-label">{supplier.name}</span>
            <span className="balance-badge owing">
              Balance: {fmt(supplier.balance)}
            </span>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="form-grid">
            <div className="form-group">
              <label>Amount (AED) *</label>
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) => set("payment_date", e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select
                value={form.payment_method}
                onChange={(e) => set("payment_method", e.target.value)}
                className="form-input"
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            {form.payment_method === "cheque" && (
              <div className="form-group">
                <label>Cheque No</label>
                <input
                  type="text"
                  value={form.cheque_no}
                  onChange={(e) => set("cheque_no", e.target.value)}
                  placeholder="CHQ-001"
                  className="form-input"
                />
              </div>
            )}
            <div className="form-group full-width">
              <label>Note</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="Optional note"
                className="form-input"
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Save Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Supplier Ledger View ─────────────────────────────────────────────────────
function SupplierLedger({ supplier, onBack, onPayment }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let qs = "";
      if (dateFrom) qs += `from=${dateFrom}&`;
      if (dateTo) qs += `to=${dateTo}`;
      const res = await apiFetch(`/suppliers/${supplier.id}/ledger${qs ? "?" + qs : ""}`);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [supplier.id, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm("Delete this payment?")) return;
    try {
      await apiFetch(`/suppliers/${supplier.id}/payments/${paymentId}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="ledger-page">
      {/* Header */}
      <div className="ledger-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div className="ledger-title">
          <h2>{supplier.name}</h2>
          <span className="subtitle">Supplier Ledger</span>
        </div>
        <button className="btn btn-primary" onClick={onPayment}>+ Record Payment</button>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="summary-cards">
          <div className="sum-card purchases">
            <span className="sum-label">Total Purchases</span>
            <span className="sum-amount">{fmt(data.summary.total_debit)}</span>
          </div>
          <div className="sum-card payments">
            <span className="sum-label">Total Paid</span>
            <span className="sum-amount">{fmt(data.summary.total_credit)}</span>
          </div>
          <div className={`sum-card balance ${data.summary.closing_balance > 0 ? "owing" : "clear"}`}>
            <span className="sum-label">Outstanding Balance</span>
            <span className="sum-amount">{fmt(data.summary.closing_balance)}</span>
          </div>
        </div>
      )}

      {/* Date Filters */}
      <div className="filter-row">
        <div className="filter-group">
          <label>From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="form-input sm" />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="form-input sm" />
        </div>
        <button className="btn btn-secondary sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</button>
      </div>

      {/* Ledger Table */}
      {loading ? (
        <div className="loading-state">Loading ledger...</div>
      ) : !data || data.ledger.length === 0 ? (
        <div className="empty-state">No transactions found</div>
      ) : (
        <div className="table-wrapper">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Note</th>
                <th className="num">Debit (Purchase)</th>
                <th className="num">Credit (Payment)</th>
                <th className="num">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.map((row, i) => (
                <tr key={i} className={`row-${row.type}`}>
                  <td>{fmtDate(row.entry_date)}</td>
                  <td>
                    <span className={`type-badge ${row.type}`}>
                      {row.type === "purchase" ? "📦 Purchase" : "💳 Payment"}
                    </span>
                  </td>
                  <td className="ref">{row.reference || "—"}</td>
                  <td className="note-cell">
                    {row.note || ""}
                    {row.payment_method && row.payment_method !== "cash" && (
                      <span className="method-chip">{row.payment_method}</span>
                    )}
                  </td>
                  <td className="num debit">{row.debit > 0 ? fmt(row.debit) : "—"}</td>
                  <td className="num credit">{row.credit > 0 ? fmt(row.credit) : "—"}</td>
                  <td className={`num balance ${row.balance > 0 ? "owing" : "clear"}`}>
                    {fmt(row.balance)}
                  </td>
                  <td>
                    {row.type === "payment" && (
                      <button
                        className="btn-icon danger"
                        onClick={() => handleDeletePayment(row.ref_id)}
                        title="Delete payment"
                      >🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={4}><strong>Totals</strong></td>
                <td className="num debit"><strong>{fmt(data.summary.total_debit)}</strong></td>
                <td className="num credit"><strong>{fmt(data.summary.total_credit)}</strong></td>
                <td className={`num balance ${data.summary.closing_balance > 0 ? "owing" : "clear"}`}>
                  <strong>{fmt(data.summary.closing_balance)}</strong>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Suppliers List ───────────────────────────────────────────────────────────
function SuppliersList({ onSelect, onPayment }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch("/suppliers")
      .then(setSuppliers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone && s.phone.includes(search))
  );

  const totalOwing = suppliers.reduce((s, r) => s + Number(r.balance || 0), 0);

  return (
    <div className="suppliers-page">
      <div className="page-header">
        <h2>Suppliers</h2>
        <div className="header-badge">
          Total Owing: <strong>{fmt(totalOwing)}</strong>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search supplier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input search"
        />
      </div>

      {loading ? (
        <div className="loading-state">Loading suppliers...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No suppliers found</div>
      ) : (
        <div className="table-wrapper">
          <table className="suppliers-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Supplier</th>
                <th>Phone</th>
                <th className="num">Total Purchased</th>
                <th className="num">Total Paid</th>
                <th className="num">Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td>
                    <button className="link-btn" onClick={() => onSelect(s)}>
                      {s.name}
                    </button>
                  </td>
                  <td>{s.phone || "—"}</td>
                  <td className="num">{fmt(s.total_purchased)}</td>
                  <td className="num">{fmt(s.total_paid)}</td>
                  <td className="num">
                    <span className={`balance-pill ${Number(s.balance) > 0 ? "owing" : "clear"}`}>
                      {fmt(s.balance)}
                    </span>
                  </td>
                  <td>
                    <div className="action-btns">
                      <button className="btn btn-sm" onClick={() => onSelect(s)}>Ledger</button>
                      <button
                        className="btn btn-sm btn-pay"
                        onClick={() => onPayment(s)}
                        disabled={Number(s.balance) <= 0}
                      >
                        Pay
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SuppliersLedgerPage() {
  const [view, setView] = useState("list");       // list | ledger
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [paymentSupplier, setPaymentSupplier] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const openLedger = (s) => { setSelectedSupplier(s); setView("ledger"); };
  const openPayment = (s) => setPaymentSupplier(s);
  const closePayment = () => setPaymentSupplier(null);
  const afterPayment = () => { closePayment(); setRefreshKey((k) => k + 1); };

  return (
    <>
      <style>{CSS}</style>
      <div className="sl-root">
        {view === "list" && (
          <SuppliersList
            key={refreshKey}
            onSelect={openLedger}
            onPayment={openPayment}
          />
        )}
        {view === "ledger" && selectedSupplier && (
          <SupplierLedger
            key={`${selectedSupplier.id}-${refreshKey}`}
            supplier={selectedSupplier}
            onBack={() => setView("list")}
            onPayment={() => openPayment(selectedSupplier)}
          />
        )}
        {paymentSupplier && (
          <PaymentModal
            supplier={paymentSupplier}
            onClose={closePayment}
            onSaved={afterPayment}
          />
        )}
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
  .sl-root { font-family: 'Segoe UI', sans-serif; color: #1a1a2e; }

  /* Page Headers */
  .page-header, .ledger-header {
    display: flex; align-items: center; gap: 12px;
    padding: 20px 24px; border-bottom: 1px solid #e8eaf0;
    background: #fff;
  }
  .page-header h2, .ledger-header h2 { margin: 0; font-size: 1.4rem; }
  .header-badge {
    margin-left: auto; background: #fef3c7; color: #92400e;
    padding: 6px 14px; border-radius: 20px; font-size: .88rem;
  }
  .ledger-title { flex: 1; }
  .ledger-title .subtitle { font-size: .82rem; color: #6b7280; }
  .btn-back {
    background: none; border: 1px solid #d1d5db; padding: 6px 14px;
    border-radius: 6px; cursor: pointer; color: #374151;
  }
  .btn-back:hover { background: #f3f4f6; }

  /* Summary Cards */
  .summary-cards {
    display: flex; gap: 16px; padding: 20px 24px;
    background: #f8f9fc; border-bottom: 1px solid #e8eaf0;
  }
  .sum-card {
    flex: 1; padding: 16px 20px; border-radius: 10px;
    background: #fff; border: 1px solid #e8eaf0;
  }
  .sum-card.purchases { border-left: 4px solid #f59e0b; }
  .sum-card.payments  { border-left: 4px solid #10b981; }
  .sum-card.balance.owing  { border-left: 4px solid #ef4444; }
  .sum-card.balance.clear  { border-left: 4px solid #10b981; }
  .sum-label { display: block; font-size: .8rem; color: #6b7280; margin-bottom: 6px; }
  .sum-amount { font-size: 1.3rem; font-weight: 700; }
  .sum-card.purchases .sum-amount { color: #d97706; }
  .sum-card.payments .sum-amount  { color: #059669; }
  .sum-card.balance.owing .sum-amount { color: #dc2626; }
  .sum-card.balance.clear .sum-amount { color: #059669; }

  /* Toolbar / Filters */
  .toolbar { padding: 16px 24px; display: flex; gap: 12px; }
  .filter-row {
    padding: 12px 24px; display: flex; align-items: flex-end; gap: 12px;
    background: #f8f9fc; border-bottom: 1px solid #e8eaf0;
  }
  .filter-group { display: flex; flex-direction: column; gap: 4px; }
  .filter-group label { font-size: .78rem; color: #6b7280; }

  /* Inputs */
  .form-input {
    padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
    font-size: .9rem; outline: none; background: #fff;
  }
  .form-input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px #e0e7ff; }
  .form-input.search { width: 280px; }
  .form-input.sm { padding: 6px 10px; font-size: .85rem; }

  /* Buttons */
  .btn {
    padding: 8px 18px; border-radius: 6px; border: none;
    cursor: pointer; font-size: .88rem; font-weight: 500;
  }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary  { background: #6366f1; color: #fff; }
  .btn-primary:hover:not(:disabled)  { background: #4f46e5; }
  .btn-secondary { background: #e5e7eb; color: #374151; }
  .btn-secondary:hover { background: #d1d5db; }
  .btn.sm { padding: 5px 12px; font-size: .82rem; }
  .btn-sm { padding: 5px 12px; border-radius: 5px; border: 1px solid #d1d5db; background: #f9fafb; cursor: pointer; font-size: .82rem; }
  .btn-sm:hover { background: #f3f4f6; }
  .btn-pay { background: #10b981 !important; color: #fff !important; border-color: #10b981 !important; }
  .btn-pay:hover:not(:disabled) { background: #059669 !important; }
  .btn-icon { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 2px 6px; }
  .btn-icon.danger:hover { color: #ef4444; }
  .link-btn { background: none; border: none; cursor: pointer; color: #4f46e5; font-weight: 500; text-decoration: underline; }

  /* Tables */
  .table-wrapper { padding: 0 24px 24px; overflow-x: auto; }
  .suppliers-table, .ledger-table {
    width: 100%; border-collapse: collapse; font-size: .88rem;
  }
  .suppliers-table th, .ledger-table th {
    text-align: left; padding: 10px 12px; font-size: .78rem;
    color: #6b7280; background: #f8f9fc; border-bottom: 2px solid #e8eaf0;
    text-transform: uppercase; letter-spacing: .03em;
  }
  .suppliers-table td, .ledger-table td {
    padding: 10px 12px; border-bottom: 1px solid #f1f2f6;
  }
  .suppliers-table tr:hover td, .ledger-table tr:hover td { background: #fafbff; }
  .ledger-table tfoot td { background: #f8f9fc; border-top: 2px solid #e8eaf0; }
  .num { text-align: right; }
  .note-cell { max-width: 180px; font-size: .82rem; color: #6b7280; }
  .ref { font-family: monospace; font-size: .82rem; color: #4b5563; }

  /* Type Badge */
  .type-badge {
    padding: 3px 8px; border-radius: 12px; font-size: .78rem; font-weight: 500;
  }
  .type-badge.purchase { background: #fef3c7; color: #92400e; }
  .type-badge.payment  { background: #d1fae5; color: #065f46; }

  /* Balance Pills */
  .balance-pill, .balance-badge {
    padding: 4px 10px; border-radius: 12px; font-size: .82rem; font-weight: 600;
  }
  .balance-pill.owing, .balance-badge.owing { background: #fee2e2; color: #dc2626; }
  .balance-pill.clear, .balance-badge.clear { background: #d1fae5; color: #059669; }

  .num.debit  { color: #d97706; }
  .num.credit { color: #059669; }
  .num.balance.owing { color: #dc2626; font-weight: 600; }
  .num.balance.clear { color: #059669; font-weight: 600; }

  .method-chip {
    display: inline-block; margin-left: 6px; padding: 1px 6px;
    background: #ede9fe; color: #5b21b6; border-radius: 10px; font-size: .72rem;
  }
  .action-btns { display: flex; gap: 6px; }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .modal-box {
    background: #fff; border-radius: 12px; width: 480px; max-width: 95vw;
    box-shadow: 0 20px 60px rgba(0,0,0,.2);
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px; border-bottom: 1px solid #e8eaf0;
  }
  .modal-header h3 { margin: 0; font-size: 1.1rem; }
  .modal-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #6b7280; }
  .modal-body { padding: 20px 24px; }
  .modal-footer {
    padding: 16px 24px; border-top: 1px solid #e8eaf0;
    display: flex; justify-content: flex-end; gap: 10px;
  }
  .supplier-info-strip {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; background: #f8f9fc; border-radius: 8px; margin-bottom: 16px;
  }
  .supplier-name-label { font-weight: 600; color: #1a1a2e; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: .82rem; color: #374151; font-weight: 500; }
  .form-group.full-width { grid-column: 1 / -1; }
  .form-error { background: #fee2e2; color: #dc2626; padding: 8px 12px; border-radius: 6px; font-size: .85rem; margin-bottom: 12px; }
  .loading-state, .empty-state { padding: 48px; text-align: center; color: #9ca3af; font-size: .95rem; }

  @media (max-width: 640px) {
    .summary-cards { flex-direction: column; }
    .form-grid { grid-template-columns: 1fr; }
    .toolbar { flex-direction: column; }
    .form-input.search { width: 100%; }
  }
`;
