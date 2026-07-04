# Mobile Shop Management System — Project SKILL File
## Last Updated: July 2026
## GitHub: https://github.com/sabirnafees123-png/mobile-shop
## Stack: React Frontend, Node/Express Backend, PostgreSQL (Supabase), Vercel

---

## ⚠️ BEFORE MAKING ANY CHANGE — READ THIS FILE FIRST

### Change Protocol:
1. Read relevant section below
2. Identify ALL tables/files affected
3. Tell user: what will change, what are the side effects
4. Get confirmation
5. Then make the change

---

## 🏪 SHOPS
| ID | Name |
|----|------|
| 1 | AlAman |
| 2 | Blessing |

---

## 👥 USER ROLES & ACCESS
| Role | Access |
|------|--------|
| admin | Everything including Users page, Cash Entry button, Stock Adjustment |
| accountant | Everything except Users page (Waqas = accountant) |
| staff | Limited — no Finance, no Reports, no Cash Register admin features |

### Admin-Only Features (do NOT open to other roles without explicit request):
- Users page (`/users`)
- `+ Cash Entry` button in Cash Register
- Stock Adjustment button (⚖️) in Products/Inventory
- User Log was admin-only, now also accountant

---

## 🗄️ DATABASE TABLES & KEY COLUMNS

### `sales_invoices`
- `user_id` → tracks who created invoice
- `sale_date` → user-entered date (can be back date)
- `created_at` → actual system timestamp
- `payment_method`: cash | card | bank_transfer | tabby | tamara | pending | exchange
- `payment_status`: paid | unpaid | partial | payment_pending | returned
- `shop_id` → 1=AlAman, 2=Blessing

### `sale_items`
- Links to `sales_invoices` via `invoice_id`
- Has `unit_cost`, `unit_price`, `qty`, `serial_number`

### `purchases`
- `created_by` → UUID (recently added — old records will be NULL)
- `purchase_date` → user-entered date
- `created_at` → actual timestamp
- `shop_id` → purchase header shop
- ⚠️ purchase_items can have DIFFERENT shop_id than purchase header

### `purchase_items`
- `shop_id` → which shop the item goes to (can differ from purchase.shop_id)
- Used for inventory upsert

### `products`
- `is_service` → boolean — if TRUE: NO inventory tracking, NO stock deduction on sale
- `is_active` → soft delete flag
- `serial_number` → unique identifier (IMEI)

### `inventory`
- Unique constraint: `(product_id, shop_id)`
- `quantity` = 0 → product hidden from Inventory page
- Service products (`is_service=true`) should NOT have inventory rows

### `stock_movements`
- Type: in | out | sale | purchase | return | adjustment | damage | found | opening_stock
- Every inventory change should log here

### `cash_register`
- One row per (shop_id, register_date)
- `status`: open | closed
- `total_sales_cash` → only CASH sales
- `total_expenses` → only CASH expenses + supplier cash payments
- ⚠️ Digital payments (card/tabby/tamara/bank) do NOT go here

### `cash_manual_entries`
- Manual IN/OUT entries — admin only via Cash Register page
- Also used for: non-cash payment tracking (card/tabby received)
- `entry_type`: in | out
- `category`: 'Shop Transfer' is special — used for inter-shop transfers

### `supplier_ledger`
- `transaction_type`: purchase | payment
- `amount`: positive for purchase (debit), negative for payment (credit)
- `balance_after` = running supplier balance
- ⚠️ Purchase entry must use `totalAmount` NOT `amountDue`

### `finance_accounts`
- `type`: bank | investor | card | fund
- `shop_id` → NULL for bank/investor (business-level), required for card/fund
- Constraint: `type IN ('investor','card','fund','bank')`

### `finance_transactions`
- `affects_cash` → if true, updates cash_register when recording
- `transaction_type`: in | out
- `created_by` → user who recorded

### `expense_categories`
- Columns: `id`, `category`, `sub_category`, `is_active`
- ⚠️ NO `name` column — always use `category` and `sub_category`

### `user_shifts`
- Unique constraint on `user_id`
- `shift_start`, `shift_end`, `break_start`, `break_end` → TIME type, nullable
- `grace_minutes` → late threshold

### `attendance`
- Unique constraint: `(user_id, date)`
- `is_late`, `late_minutes` → calculated on save
- `status`: present | absent | annual_leave | half_day | wfh

### `obligations`
- `obligation_model`: cheque | confirmed
- `category_id` → references `expense_categories.id`
- ⚠️ Use `ec.category` and `ec.sub_category` NOT `ec.name` in queries

### `finance_accounts`
- `shop_id` is nullable — bank/investor have no shop

---

## 💰 CASH REGISTER RULES (CRITICAL)

### What goes INTO cash_register.total_sales_cash:
- Cash sales (payment_method='cash')
- Cash payments received on pending invoices (received_method='cash')
- Finance transactions with affects_cash=true (IN)
- Manual cash entries (IN) — admin only

### What goes INTO cash_register.total_expenses:
- Cash expenses (payment_method='cash')
- Supplier payments (cash)
- Finance transactions with affects_cash=true (OUT)

### What does NOT go into cash_register:
- Card/Tabby/Tamara/Bank Transfer sales
- Digital payment receipts (go to cash_manual_entries for tracking)
- Bank account transactions

### Register Lock Rule:
- Register MUST be open to record any cash transaction
- If closed → throw error, NO silent fallback to manual entries
- This applies to: sales, purchases payment, returns, mark payment received

### Return Cash Flow (CURRENT):
- Return → record as `cash_manual_entries OUT` (refund)
- Do NOT deduct from `total_sales_cash` — sale stays counted
- Returns show separately in detail view

---

## 🔄 KEY BUSINESS FLOWS

### Sale Create Flow:
1. Find/create customer
2. Check inventory per item per shop (stockMap[product_id][shop_id])
3. INSERT sales_invoices
4. INSERT sale_items (batch)
5. UPDATE inventory (batch, skip is_service=true products)
6. INSERT stock_movements
7. UPDATE customers.balance if credit
8. UPDATE cash_register if cash payment (register must be open)

### Purchase Create Flow:
1. INSERT purchases (with created_by = req.user.id)
2. Check existing serials (batch)
3. Batch UPDATE existing products OR INSERT new ones
4. INSERT purchase_items
5. UPSERT inventory (skip is_service=true products)
6. UPDATE supplier balance
7. INSERT supplier_ledger (purchase = +totalAmount, payment = -amount_paid)
8. UPDATE cash_register if cash paid (register must be open)

### Mark Payment Received Flow:
- Cash → UPDATE cash_register (register must be OPEN, else hard error)
- Non-cash (card/tabby/tamara/bank) → INSERT cash_manual_entries IN only
- Never silent fallback

### Stock Validation:
- Uses `stockMap[product_id][shop_id]` — per item per shop
- is_service=true → skip validation
- 0 stock → block sale

---

## ⚡ PERFORMANCE RULES (DO NOT BREAK)

- NEVER use `Promise.all` with queries on the SAME `client` (transaction)
- Always use sequential `await client.query()` inside transactions
- `Promise.all` is OK with `pool.query()` (outside transactions)
- Debounce all search inputs (400ms) with AbortController
- Batch INSERT/UPDATE for multiple items (never loop individual queries)

---

## 🐛 KNOWN BUGS FIXED (do not reintroduce)

1. **Double cash entry on return** — fixed: returns use manual_entries OUT only
2. **Promise.all in transactions** — fixed in sales and purchases
3. **Supplier ledger using amountDue** — fixed: must use totalAmount
4. **ec.name column** — does not exist, use ec.category + ec.sub_category
5. **Silent fallback when register closed** — removed: hard error thrown
6. **Service products getting inventory** — fixed: check is_service before upsert
7. **Stock validation using wrong shop** — fixed: per-item shop_id check
8. **UNION ALL purchase_date double counting** — fixed in cashRegister detail
9. **Serial search API flood** — fixed: debounce + AbortController

---

## 📁 FILE MAP

### Backend Controllers:
| File | Handles |
|------|---------|
| `salesController.js` | Create sale, return, mark payment received |
| `purchasesController.js` | Create purchase, record payment |
| `inventoryController.js` | Inventory adjustments |
| `productsController.js` | Products CRUD |
| `suppliersController.js` | Suppliers, ledger |
| `salesReturn.js` | ⚠️ NOT used in routes — salesController.js handles returns |

### Backend Routes:
| File | API Path |
|------|---------|
| `cashRegister.js` | /api/v1/cash-register |
| `expenses.js` | /api/v1/expenses |
| `finance.js` | /api/v1/finance |
| `userLog.js` | /api/v1/user-log |
| `attendance.js` | /api/v1/attendance + /shifts |
| `obligations.js` | /api/v1/obligations |

### Frontend Pages:
| File | Page |
|------|------|
| `Sales.js` | Sales invoices |
| `Purchases.js` | Purchase management + CSV upload |
| `CashRegister.js` | Daily register, history, detail view |
| `Finance.js` | Bank/Investor/Card/Fund accounts |
| `UserLog.js` | Activity log by user |
| `Attendance.js` | Daily attendance + shifts + report |
| `Obligations.js` | Upcoming payments |

---

## 🔗 IMPACT MATRIX — Before changing X, check Y

| If you change... | Also check... |
|-----------------|---------------|
| `expense_categories` table | obligations.js query, expenses.js, cashRegister.js detail |
| `cash_register` logic | CashRegister.js frontend display, checkRegisterLock.js middleware |
| Return flow | salesController.js returnSale, cash_manual_entries, inventory |
| Payment received | salesController.js markPaymentReceived, cash_register update |
| Purchase create | supplier_ledger entries, inventory upsert, is_service check |
| User roles in Layout.js | Also check backend route protection if sensitive |
| `finance_transactions` | cashRegister.js detail endpoint (bank_receipts section) |
| `sales_invoices` payment_status | CashRegister detail view filters |
| `inventory` | stock_movements log, is_service check |
| `user_shifts` | attendance.js late calculation |

---

## 🚀 DEPLOYMENT

### Vercel Projects:
- **Backend (snowy)**: `mobile-shop-snowy.vercel.app`
  - Root Dir: `backend`
  - vercel.json: has `builds` + `maxDuration: 60` (inside builds config)
  - ⚠️ Cannot have both `builds` AND `functions` — use builds.config.maxDuration
- **Frontend (ttur)**: `mobile-shop-ttur.vercel.app`
  - Root Dir: `frontend`
  - Build Command: `npm run build`
  - Output Dir: `build`

### DB Config:
- Pool max: 10 connections
- connectionTimeout: 30s
- statement_timeout: 55s

---

## ❌ HISTORICAL MISTAKES — NEVER REPEAT THESE

### Chat 002-003 Mistakes:
1. **Backend code in frontend file** — Put `require('../config/database')` in `frontend/src/pages/Expenses.js`. Always check file path before writing code — backend uses `require`, frontend uses `import`.
2. **Overwriting user's custom design** — Replaced entire Sales.js/Purchases.js losing user's UI design. Rule: **only add/modify specific features, never rewrite entire files unless explicitly asked**.
3. **CORS fix never committed** — Made fix but forgot to commit. Always verify file is saved AND committed AND pushed.
4. **Wrong route order** — `/:productId` caught `/export` and `/import` routes. Dynamic routes must always come LAST.
5. **React code in backend expenses.js** — Pasted `import React` in a Node.js file.

### Chat 004-005 Mistakes:
6. **markPaymentReceived always marked paid** — Did not check if partial amount covers full due. Always calculate newAmountDue and check before setting status.
7. **COUNT(s.id) inflation with JOINs** — Using JOIN + COUNT gives wrong numbers. Use `COUNT(DISTINCT s.id)` or subquery.
8. **Date filter cutting off end of day** — `sale_date <= $to` misses records after midnight. Use `< $to::date + interval '1 day'`.
9. **Orphan SQL fragment left in file** — Left incomplete SQL code in reports.js causing server crash. Always syntax-check after edits: `node --check file.js`.
10. **Promise.all with same client** — Used `Promise.all([client.query(), client.query()])` inside transaction. PostgreSQL single connection cannot run concurrent queries. Always sequential `await`.

### This Chat (Chat 006-008) Mistakes:
11. **ec.name column does not exist** — expense_categories has `category` and `sub_category`, NOT `name`. Check column names before writing queries.
12. **Silent fallback when register closed** — System was silently creating manual entries when register was closed. Rule: register closed = hard error, no fallback.
13. **Double cash entry on return** — Both `total_sales_cash` deduction AND `cash_manual_entries` OUT were created. Now: only manual OUT entry, sales stay in total_sales_cash.
14. **UNION ALL double counting purchases** — Using `purchase_date` AND `supplier_ledger.transaction_date` in UNION caused same purchase to appear twice. Fixed: use only supplier_ledger for purchases paid.
15. **Service products getting inventory** — purchase controller was upserting inventory for ALL products including is_service=true. Always check is_service before inventory operations.
16. **Layout.js overwritten** — User had custom colors/design in Layout.js. I replaced entire file losing all customizations. Rule: only add new nav items and icons, never rewrite Layout.js.
17. **Duplicate icon declarations** — Added FinanceIcon and UserLogIcon but file already had them from user's version. Always grep for existing declarations before adding.
18. **JSX sibling elements without Fragment** — `{condition && (<elem1/><elem2/>)}` is invalid JSX. Must wrap in `<>...</>` Fragment.
19. **vercel.json builds + functions conflict** — Cannot have both `builds` and `functions` at top level. Use `builds[].config.maxDuration` instead.
20. **userLog params mismatch** — purchases query used `[from, to]` but params array had 3 items (including user_id). Always use separate params array for queries that don't filter by user.
21. **Stock validation used invoice shop_id** — Was checking `stockMap[product_id]` (flat) instead of `stockMap[product_id][shop_id]` (per shop). Fixed: nested map by shop.
22. **User log filtered by transaction_date not created_at** — User wanted to see actual entries by when they were created, not the back-date user entered. Use `created_at::date` for filtering.

---

## ✅ PRE-CHANGE CHECKLIST

Before ANY change, answer these questions:

1. [ ] Does this file have `node --check` passing currently?
2. [ ] Are there any column names I'm using — do they actually exist in DB?
3. [ ] Am I inside a transaction? If yes, NO Promise.all
4. [ ] Will this affect cash_register? If yes, does register need to be open?
5. [ ] Is this a service product? Skip inventory operations
6. [ ] Am I adding to Layout.js? grep existing icons/nav items first
7. [ ] Am I changing a query? Check if column names are correct for that table
8. [ ] Will this create duplicate entries anywhere?
9. [ ] Is there a userFilter being used? Make sure params array matches $N placeholders
10. [ ] Have I checked what the user's existing file looks like before replacing?
- Purchase form CSV upload — deployed, needs testing with large files
- Register reopen UI — done but needs testing
- Mashriq Bank account — user needs to create manually in Finance page
- Investment/Committee expenses migration to Finance — pending
- Product master code system — discussed, not built yet
- Attendance report — date range working, needs user testing
