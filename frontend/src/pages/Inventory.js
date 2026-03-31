import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

// ── Adjust Stock Modal ───────────────────────────────────────────────────────
function AdjustModal({ item, onClose, onDone }) {
  const [type, setType]     = useState('in');
  const [qty, setQty]       = useState('');
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);

  if (!item) return null;

  const handleSubmit = async () => {
    if (!qty || isNaN(qty) || Number(qty) <= 0)
      return toast.error('Enter a valid quantity');
    setSaving(true);
    try {
      await api.post('/inventory/adjust', {
        product_id: item.product_id,
        type, quantity: Number(qty), note
      });
      toast.success('Stock updated!');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const typeConfig = {
    in:         { label: 'Stock In',    color: 'bg-green-500',  icon: '📥', desc: 'Add stock (purchase/return)' },
    out:        { label: 'Stock Out',   color: 'bg-red-500',    icon: '📤', desc: 'Remove stock (damage/loss)' },
    adjustment: { label: 'Set Exact',   color: 'bg-blue-500',   icon: '🔧', desc: 'Set absolute stock count' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-white font-bold text-lg">📦 Adjust Stock</h2>
            <p className="text-green-100 text-sm">{item.name} {item.brand ? `· ${item.brand}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Current stock */}
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-gray-800">{item.quantity}</div>
            <div className="text-sm text-gray-500">Current Stock</div>
          </div>

          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(typeConfig).map(([k, v]) => (
              <button key={k} onClick={() => setType(k)}
                className={`p-3 rounded-xl border-2 text-center transition-all
                  ${type === k ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="text-xl">{v.icon}</div>
                <div className="text-xs font-semibold text-gray-700 mt-1">{v.label}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 text-center">{typeConfig[type].desc}</p>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Quantity
            </label>
            <input
              type="number" min="0" value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder="Enter quantity"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Note (optional)
            </label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Received from supplier"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-50">
            {saving ? 'Saving…' : 'Update Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Movements Modal ──────────────────────────────────────────────────────────
function MovementsModal({ productId, productName, onClose }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    api.get('/inventory/movements', { params: { product_id: productId, limit: 30 } })
      .then(r => setMovements(r.data.data))
      .catch(() => toast.error('Failed to load movements'))
      .finally(() => setLoading(false));
  }, [productId]);

  const typeStyle = {
    in:         'bg-green-100 text-green-700',
    out:        'bg-red-100 text-red-600',
    adjustment: 'bg-blue-100 text-blue-700',
  };
  const typeIcon = { in: '📥', out: '📤', adjustment: '🔧' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-white font-bold text-lg">📋 Stock History</h2>
            <p className="text-blue-100 text-sm">{productName}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading…</div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No movements yet</div>
          ) : (
            <div className="space-y-2">
              {movements.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{typeIcon[m.type]}</span>
                    <div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeStyle[m.type]}`}>
                        {m.type.toUpperCase()}
                      </span>
                      {m.note && <p className="text-xs text-gray-500 mt-0.5">{m.note}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${m.type === 'out' ? 'text-red-600' : 'text-green-600'}`}>
                      {m.type === 'out' ? '-' : '+'}{m.quantity}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t text-right">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-100">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterLow, setFilterLow] = useState(false);
  const [adjustItem, setAdjustItem]       = useState(null);
  const [movementItem, setMovementItem]   = useState(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search)    params.search    = search;
      if (filterLow) params.low_stock = true;
      const [invRes, statsRes] = await Promise.all([
        api.get('/inventory', { params }),
        api.get('/inventory/stats'),
      ]);
      setInventory(invRes.data.data);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load inventory');
    } finally { setLoading(false); }
  }, [search, filterLow]);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const stockStatus = (qty, min) => {
    if (qty === 0)    return { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' };
    if (qty <= min)   return { label: 'Low Stock',    cls: 'bg-yellow-100 text-yellow-700' };
    return              { label: 'In Stock',          cls: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {adjustItem && (
        <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onDone={fetchInventory} />
      )}
      {movementItem && (
        <MovementsModal
          productId={movementItem.product_id}
          productName={movementItem.name}
          onClose={() => setMovementItem(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🏪 Inventory</h1>
          <p className="text-gray-500 text-sm">Track stock levels across all products</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {[
            { label: 'Total Products', value: stats.total_products,  icon: '📦', color: 'blue'   },
            { label: 'Total Units',    value: stats.total_units || 0, icon: '🔢', color: 'indigo' },
            { label: 'Out of Stock',   value: stats.out_of_stock,    icon: '❌', color: 'red'    },
            { label: 'Low Stock',      value: stats.low_stock,       icon: '⚠️', color: 'yellow' },
            { label: 'Stock Value',    value: `PKR ${Number(stats.total_cost_value || 0).toLocaleString()}`,  icon: '💵', color: 'green'  },
            { label: 'Retail Value',   value: `PKR ${Number(stats.total_sell_value || 0).toLocaleString()}`, icon: '💰', color: 'emerald'},
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-lg font-bold text-gray-800 truncate">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search products…"
          className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button onClick={() => setFilterLow(!filterLow)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition
            ${filterLow ? 'bg-yellow-50 border-yellow-400 text-yellow-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          ⚠️ Low Stock Only
        </button>
        {(search || filterLow) && (
          <button onClick={() => { setSearch(''); setFilterLow(false); }}
            className="text-sm text-red-500 hover:underline">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3 animate-spin">⏳</div>Loading inventory…
          </div>
        ) : inventory.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-5xl mb-3">📭</div>
            <p>No inventory records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Product', 'Category', 'In Stock', 'Min Stock', 'Status', 'Location', 'Last Updated', 'Actions']
                    .map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {inventory.map(item => {
                  const status = stockStatus(item.quantity, item.min_stock);
                  return (
                    <tr key={item.id} className="hover:bg-green-50/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-800">{item.name}</div>
                        <div className="text-xs text-gray-400">{[item.brand, item.model].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.category || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-2xl font-bold ${item.quantity === 0 ? 'text-red-500' : item.quantity <= item.min_stock ? 'text-yellow-600' : 'text-green-600'}`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.min_stock}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.location || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(item.last_updated).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setAdjustItem(item)}
                            className="px-3 py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium">
                            ± Adjust
                          </button>
                          <button onClick={() => setMovementItem(item)}
                            className="px-3 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium">
                            📋 History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              {inventory.length} product{inventory.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}