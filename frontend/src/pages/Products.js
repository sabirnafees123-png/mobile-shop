import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';


// ─── helpers ───────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  product_name: '', brand: '', model: '', category: '',
  base_cost: '', selling_price: '', barcode: '', is_active: true,
};

const CATEGORY_COLORS = {
  Mobile:    'bg-blue-100 text-blue-700',
  Tablet:    'bg-purple-100 text-purple-700',
  Accessory: 'bg-green-100 text-green-700',
  Laptop:    'bg-orange-100 text-orange-700',
  Other:     'bg-gray-100 text-gray-600',
};

function badge(cat) {
  const cls = CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {cat || '—'}
    </span>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────
function ProductModal({ open, onClose, onSave, initial, categories }) {
  const [form, setForm]     = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
    setErrors({});
  }, [initial, open]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.product_name.trim()) e.product_name = 'Name is required';
    if (!form.selling_price || isNaN(form.selling_price) || Number(form.selling_price) < 0)
      e.selling_price = 'Valid selling price required';
    if (form.base_cost && (isNaN(form.base_cost) || Number(form.base_cost) < 0))
      e.base_cost = 'Must be a positive number';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        base_cost:     form.base_cost     ? Number(form.base_cost)     : 0,
        selling_price: Number(form.selling_price),
        is_active:     Boolean(form.is_active),
      });
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || 'Save failed';
      setErrors({ api: msg });
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, name, type = 'text', placeholder }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </label>
      <input
        type={type}
        value={form[name]}
        onChange={e => set(name, e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400
          ${errors[name] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
      />
      {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 flex justify-between items-center">
          <h2 className="text-white font-bold text-lg">
            {initial?.product_id ? '✏️ Edit Product' : '➕ Add Product'}
          </h2>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          {errors.api && (
            <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {errors.api}
            </div>
          )}

          <div className="col-span-2">
            <Field label="Product Name *" name="product_name" placeholder="e.g. iPhone 15 Pro" />
          </div>
          <Field label="Brand" name="brand" placeholder="Apple, Samsung…" />
          <Field label="Model" name="model" placeholder="Model number" />

          {/* Category — combo of datalist + text */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Category</label>
            <input
              list="cats"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              placeholder="Select or type category"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <datalist id="cats">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <Field label="Base Cost (PKR)" name="base_cost" type="number" placeholder="0" />
          <Field label="Selling Price (PKR) *" name="selling_price" type="number" placeholder="0" />
          <div className="col-span-2">
            <Field label="Barcode / IMEI" name="barcode" placeholder="Optional" />
          </div>

          {/* Active toggle */}
          <div className="col-span-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => set('is_active', !form.is_active)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200
                ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm text-gray-600">
              {form.is_active ? 'Active — visible in sales' : 'Inactive — hidden from sales'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-50 flex items-center gap-2">
            {saving && <span className="animate-spin">⏳</span>}
            {initial?.product_id ? 'Update Product' : 'Add Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ──────────────────────────────────────────────────────────
function DeleteConfirm({ product, onConfirm, onCancel }) {
  const [loading, setLoading] = useState(false);
  if (!product) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
        <div className="text-5xl mb-3">🗑️</div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Delete Product?</h3>
        <p className="text-gray-500 text-sm mb-5">
          "<strong>{product.product_name}</strong>" will be permanently removed.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel}
            className="px-5 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); }}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
            {loading ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Products() {
  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState('');

  // filters
  const [search,     setSearch]     = useState('');
  const [filterCat,  setFilterCat]  = useState('');
  const [filterActive, setFilterActive] = useState('');

  // modal state
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [delTarget,  setDelTarget]  = useState(null);

  // role from localStorage (set by your Login.js)
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canEdit   = ['admin', 'accountant'].includes(user.role);
  const canDelete = user.role === 'admin';

  // ── fetch ──
  const fetchProducts = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (search)       params.search    = search;
      if (filterCat)    params.category  = filterCat;
      if (filterActive !== '') params.is_active = filterActive;
      const res = await api.get('/api/products', { params });
      setProducts(res.data.data);
    } catch {
      setError('Failed to load products. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [search, filterCat, filterActive]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    api.get('/api/products/categories').then(r => setCategories(r.data.data)).catch(() => {});
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ── CRUD handlers ──
  const handleSave = async (form) => {
    if (form.product_id) {
      await api.put(`/api/products/${form.product_id}`, form);
      showToast('✅ Product updated!');
    } else {
      await api.post('/api/products', form);
      showToast('✅ Product added!');
    }
    fetchProducts();
  };

  const handleDelete = async () => {
    await api.delete(`/api/products/${delTarget.product_id}`);
    setDelTarget(null);
    showToast('🗑️ Product deleted');
    fetchProducts();
  };

  // ── stats ──
  const totalValue = products.reduce((s, p) => s + Number(p.selling_price), 0);
  const activeCount = products.filter(p => p.is_active).length;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-bounce">
          {toast}
        </div>
      )}

      <ProductModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSave={handleSave}
        initial={editTarget}
        categories={categories}
      />
      <DeleteConfirm
        product={delTarget}
        onConfirm={handleDelete}
        onCancel={() => setDelTarget(null)}
      />

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📦 Products</h1>
          <p className="text-gray-500 text-sm">Manage your mobile shop inventory</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl shadow transition">
            ➕ Add Product
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Products', value: products.length,   icon: '📦', color: 'blue'   },
          { label: 'Active',         value: activeCount,       icon: '✅', color: 'green'  },
          { label: 'Inactive',       value: products.length - activeCount, icon: '⛔', color: 'red' },
          { label: 'Avg. Sell Price',
            value: products.length
              ? `PKR ${(totalValue / products.length).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
              : '—',
            icon: '💰', color: 'yellow' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-xl font-bold text-gray-800">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search name, brand, model, barcode…"
          className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterActive}
          onChange={e => setFilterActive(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        {(search || filterCat || filterActive) && (
          <button onClick={() => { setSearch(''); setFilterCat(''); setFilterActive(''); }}
            className="text-sm text-red-500 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3 animate-spin">⏳</div>
            Loading products…
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-medium">No products found</p>
            <p className="text-sm mt-1">
              {search || filterCat || filterActive
                ? 'Try different filters'
                : 'Click "Add Product" to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['#', 'Product', 'Brand / Model', 'Category', 'Base Cost', 'Sell Price', 'Margin', 'Barcode', 'Status', 'Actions']
                    .map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map((p, i) => {
                  const margin = p.base_cost > 0
                    ? (((p.selling_price - p.base_cost) / p.selling_price) * 100).toFixed(1)
                    : null;
                  return (
                    <tr key={p.product_id}
                      className="hover:bg-green-50/30 transition-colors group">
                      <td className="px-4 py-3 text-gray-400 font-mono">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-800">{p.product_name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {[p.brand, p.model].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3">{badge(p.category)}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono">
                        {p.base_cost > 0 ? `PKR ${Number(p.base_cost).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800 font-mono">
                        PKR {Number(p.selling_price).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {margin !== null ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                            ${margin >= 20 ? 'bg-green-100 text-green-700'
                              : margin >= 10 ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-600'}`}>
                            {margin}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500 text-xs">{p.barcode || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                          ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.is_active ? '● Active' : '○ Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && (
                            <button
                              onClick={() => { setEditTarget(p); setModalOpen(true); }}
                              className="px-3 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium">
                              ✏️ Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDelTarget(p)}
                              className="px-3 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-xs font-medium">
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {products.length} product{products.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}