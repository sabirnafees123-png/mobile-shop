// src/utils/category.js
// One place that knows the product category names used in the database:
//   MOBILE, TAB, LAPTOP, ACCESSORIES
// (Other special categories such as 'Exchange' or 'Service' are left exactly as they are.)

const CANONICAL = ['MOBILE', 'TAB', 'LAPTOP', 'ACCESSORIES'];

// Older / alternative spellings -> the canonical name
const ALIASES = { 'MOBILE PHONE': 'MOBILE', 'IPAD': 'TAB', 'TABLET': 'TAB', 'MACBOOK': 'LAPTOP' };

// Every spelling in the database that belongs to a filter value
const FILTER_GROUPS = {
  MOBILE:      ['MOBILE', 'MOBILE PHONE'],
  TAB:         ['TAB', 'IPAD', 'TABLET'],
  LAPTOP:      ['LAPTOP', 'MACBOOK'],
  ACCESSORIES: ['ACCESSORIES'],
};

const clean = (c) => String(c == null ? '' : c).replace(/\s+/g, ' ').trim().toUpperCase();

// 'Mobile Phone ' -> 'MOBILE', 'ipad' -> 'TAB' ...  (null if it is not one of the 4 known categories)
const canonicalCategory = (c) => {
  const k = clean(c);
  const v = ALIASES[k] || k;
  return CANONICAL.includes(v) ? v : null;
};

// What to store: the canonical name for known categories; anything else is kept as typed (trimmed); empty -> null
const categoryForSave = (c) => {
  const k = canonicalCategory(c);
  if (k) return k;
  const t = String(c == null ? '' : c).trim();
  return t || null;
};

// For filters:  WHERE UPPER(TRIM(p.category)) = ANY($n)   with   $n = categoryFilterList(value)
const categoryFilterList = (c) => {
  const k = canonicalCategory(c);
  return k ? FILTER_GROUPS[k] : [clean(c)];
};

module.exports = { CANONICAL, canonicalCategory, categoryForSave, categoryFilterList };
