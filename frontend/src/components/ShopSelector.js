// src/components/ShopSelector.js
// Drop-in shop filter used on every page and the dashboard
import React from 'react';

export default function ShopSelector({ shops = [], value, onChange, includeAll = true, label = 'Shop', style = {} }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...style }}>
      {label && (
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {label}:
        </label>
      )}
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        style={{
          padding: '6px 10px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: '0.9rem',
          cursor: 'pointer',
          minWidth: '140px',
        }}
      >
        {includeAll && <option value=''>All Shops</option>}
        {shops.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
