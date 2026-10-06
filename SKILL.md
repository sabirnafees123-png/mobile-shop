---
name: mobile-shop-system
description: Operating manual for the Mobile Shop Management System (AlAman / Blessing / Wholesale) — a React / Node / Express / Supabase (Postgres) app for a used-phone retail business in the UAE. Use whenever the user asks anything about their shop system - reports, inventory and stock, purchases, sales, product categories, stock adjustments, SQL or scripts, deploying code changes, or verifying numbers. Contains the verified data model, stock and money flows, the file map, the product-category rules (where every category lives), reusable SQL, how code is tested and delivered on the user's Windows PC, and the list of pending tasks.
---

# Mobile Shop Management System — Operating Manual
*Last updated: 6 Oct 2026. Everything below was verified by reading the code or running it, unless marked (assumed).*

## 0. Read this first
1. **Language.** The user is not a developer. Reply in Roman Urdu (match their style), give copy-pasteable commands, explain *why* before touching live data. **Text inside reports / PDFs is English only** (no Urdu words).
2. **"Pehly batao" means: stop.** When the user asks to be told the plan first, describe what you will build (columns, filters, limitations) and wait for their confirmation. Never build before it. Clear bugs found while verifying may be fixed, but say exactly what changed.
3. **Never guess the schema.** `backend/sql/001_create_tables.sql` is STALE (no shop_id on most tables, wrong table names). The truth is what the code INSERTs / UPDATEs / SELECTs in `backend/src/controllers` and `routes`. If unsure, ask the user to run an `information_schema.columns` query.
4. **Data changes = check → update → re-check.** Read-only preview first (shows old value, new value, what is skipped), then one atomic statement (a CTE with `UPDATE ... RETURNING`, ending in a count), then run the preview again. The user declined extra backup tables for category cleanups (the preview output is the record). Still take a backup table before any inventory wipe / reload.
5. **SQL is run by the user in the Supabase SQL editor** (no psql). Give one self-contained block. Test every SQL on a local Postgres first (section 9).
6. **Test before delivering.** Syntax-checking is not testing. Run the real controller/route against a mock database and the real page in jsdom (section 9). Say what was and was not tested.
7. **Delivery** is `present_files` + CMD copy / git commands (section 8). Use unique file names (Windows is case-insensitive: `Inventory.js` and `inventory.js` collide).
8. **Dates.** UAE and Pakistan are ahead of UTC. Never build a date list with `new Date('YYYY-MM-DDT00:00:00')` + `toISOString()` (shifts one day back). Use `...T00:00:00Z`, `setUTCDate`, `timeZone:'UTC'`.
9. **Join fan-out.** Never `SUM(invoice.total_amount)` after joining `sale_items` (double-counts multi-item invoices). Sum invoice columns and item columns in separate subqueries.
10. **Categories** are exactly `MOBILE`, `TAB`, `LAPTOP`, `ACCESSORIES` (+ the special `Exchange`, `Service`). Never reintroduce `Mobile Phone`, `Ipad`, `Mobile`, title-case names (section 6).
11. **Do not touch what was not asked.** List extra findings and ask. Keep changes small.
12. **Be honest** about verified vs assumed; a number that "looks right" is not verified.

## 1. Business and hosting
- 3 shops: **AlAman (id 1)**, **Blessing (id 2)**, **Wholesale (id 3)**; shop ids are integers; currency AED. Mostly used phones, plus tabs, laptops (MacBooks), accessories.
- Special suppliers: **"Walk in Customer"** = phones bought from the public (also used for *buy-backs* of a phone the shop sold earlier); **"LAB BLESSING"** = the internal repair lab (a phone that comes back from the lab is entered as a purchase).
- Repo: `https://github.com/sabirnafees123-png/mobile-shop.git` (React frontend, Node/Express backend, Postgres on Supabase).
- Frontend: Netlify `https://lucky-frangollo-af3c89.netlify.app`. Backend: Render `https://mobile-shop-backend-sjuj.onrender.com` (free tier sleeps after 15 min; first request takes 30-60 s). Both auto-deploy on `git push`.
- **Vercel was abandoned** (random 403 bot challenges). Stale Vercel URLs were removed from the Inventory export and the Customers page on 6 Oct. `Login.js` still has a Vercel fallback that is used only if `REACT_APP_API_URL` is unset. Do not suggest moving back to Vercel.
- API base = `${REACT_APP_API_URL || render}/api/v1` (`frontend/src/utils/api.js`, JWT in `localStorage.token`). Every route except `/api/v1/auth` is behind `protect`. Roles: `admin`, `accountant`, `staff`; staff only get Inventory and Sales; `/user-log` and `/users` are admin-only; every other page except Inventory and Sales is admin + accountant.

## 2. Bulk data-entry working pattern (backfilling sales / purchases, stock counts)
1. Read the pasted / uploaded data (messy handwritten-register transcriptions). 2. **Flag every ambiguity before processing** (combo bills, "2 pcs" cost notation, missing costs, suspicious matches, shop, date range). Always ask, never assume. 3. Match to inventory by exact identifiers only (IMEI/serial exact, or last-4 digits). Never fuzzy name matching ("iPhone 17 Pro" vs "iPhone 11 Pro" caused real errors). 4. The user's sheet cost/sell prices are always used, never the stored product price. 5. Create sales/purchases through the real backend API (Node batch script), not raw SQL, so inventory, stock_movements, supplier_ledger, customer balance and cash register stay consistent. Raw SQL only for corrections, register housekeeping and stock-count backup/wipe/reload. 6. **Dry run first**, `--live` only after the dry run is reviewed. 7. Registers must be OPEN for every date a sale/purchase is dated. 8. A sale needs cost price > 0 (hard backend rule). 9. Backup table before any bulk inventory wipe/reload, wrapped in `BEGIN; ... COMMIT;`. 10. Batch scripts prompt for email/password (never hardcode), write a `*_log.json` after each step (resume-safe). Batch scripts call the purchase API **without a category** (the API then defaults new products to `MOBILE`).
CSV-import gotcha in Supabase: a column may import as the wrong type; cast explicitly (`col::text`, `col::uuid`).

## 3. Data model (verified from code)
- **shops**(id, name, is_active). **users**(name, role, is_active) — deactivate, never delete/rename.
- **products**: id (uuid), name, brand, color, **serial_number (UNIQUE; used phones = IMEI, bulk/accessories = NULL)**, type (New (Box Pack) / Used / Refurbished / Parts / Accessories / Wholesale), model, **category**, sub_category, storage, condition, description, **base_cost** (per-unit cost, used for all stock value), selling_price, barcode, is_active, **is_service** (e.g. REPAIR: never gets inventory or movements), created_at, updated_at.
- **inventory**: key (product_id, shop_id) with `ON CONFLICT` upserts; quantity, min_stock (5 when created by a purchase, a transfer or the CSV import; 0 when created by the exchange flow, a sale return or the Products-page Adjust), last_updated. Inventory page: "Total Products" = number of inventory rows (product x shop, incl. zero), "Low Stock" = 0 < qty <= min_stock (meaningless for single-unit phones with min_stock 5).
- **stock_movements**: product_id, type (`in` / `out` / `adjustment`), quantity, note, created_by, created_at. **No shop_id and no cost.** Note formats and meaning of `quantity` per source: section 4.
- **stock_transfers**: product_id, from_shop_id, to_shop_id, quantity, transfer_date, notes, created_by. **stock_counts** (shop_id, count_date, status, notes, created_by) + **stock_count_items** (stock_count_id, product_id, system_qty, actual_qty, notes).
- **purchases**: purchase_number `PUR-YYYY-NNN`, supplier_id, purchase_date (bill date; can be back-dated, entry time = stock movement time), total_amount, amount_paid, amount_due, payment_status, notes, shop_id (= first item's shop), created_by. **purchase_items**: purchase_id, product_id, serial_number, imei, qty, unit_cost, recommended_selling_price, **shop_id (each item has its own shop)**.
- **suppliers**(name, balance). **supplier_ledger**: supplier_id, transaction_type (`purchase` / `payment`), reference_id, reference_type (`purchase` / `manual`), amount (purchase +, payment −), balance_after, description, transaction_date, shop_id, payment_method.
- **sales_invoices**: invoice_number `INV-YYYY-NNNN`, shop_id, user_id (salesperson), customer_id, sale_date, subtotal, **discount (invoice-level)**, total_amount, amount_paid, amount_due, payment_status (seen: `paid`, `payment_pending`, `returned`; code also sets `partial` / `unpaid`), payment_method, is_exchange, exchange_product_name, exchange_serial_number, exchange_trade_in_value, payment_received_date. **sale_items**: invoice_id, product_id, qty, unit_cost, unit_price, discount (item-level, stored but ignored by item-based reports), serial_number; total_price and profit are generated columns.
- **customers**(name, phone, balance). **customer_receipts**(customer_id, amount, receipt_date, payment_method, note) — **no shop_id**; also holds `refund` rows created by sale returns.
- **cash_register**(shop_id, register_date, opening_balance, closing_balance, status open/closed, total_sales_cash, ...). **cash_manual_entries**(shop_id, entry_date, entry_type in/out, amount, category, description); its `category` is a whitelist enforced in `frontend/src/pages/CashRegister.js` AND `backend/src/routes/cashRegister.js`.
- **expenses**(shop_id, expense_date, **category TEXT**, sub_category, description, amount, payment_method, ...) — v2 schema, no `category_id`. **expense_categories**(category, sub_category, is_active) — has **no `name` column**. **obligations**(title, person_name, notes, category_id -> expense_categories, amount, due_date, status, obligation_model `cheque`|`confirmed`, cheque_number, bank, payee_payer, `cheque_id` is never written). **cheques**(type `inbound`|`outbound`, cheque_number, bank, payee_payer, amount, due_date, status, notes, shop_id).
- **attendance**(user_id, shop_id, date, clock_in TIME, clock_out, late_minutes, is_late, status `present|absent|annual_leave|half_day|wfh`) + **user_shifts**(shift_start, shift_end, grace_minutes).

## 4. Stock and money flows (verified)
**Purchase** (`purchasesController.createPurchase`, one transaction): creates products not found (by serial / product_id), upserts inventory `+qty` at each item's shop, logs a movement `in`, adds supplier balance + a `purchase` ledger row, and if a paid amount was given ALSO a `payment` ledger row `Payment with purchase PUR-…`. Service items skip inventory and movements. Category comes from the form (required); the backend normalises it (section 6). Later payments: `recordPayment` (ledger reference_type `purchase`, description `Payment for PUR-…`) and manual supplier payments (`suppliers.js`, reference_type `manual`). A payment row therefore comes in 3 kinds; reports that list "payments only" must exclude `Payment with purchase%`.

**Sale** (`salesController.createSale`): stock is validated and deducted on the **invoice's shop** only (the form never sends a per-item shop). Movement `out` note `Sale INV-…`. Customer balance, cash register totals updated. **Exchange (trade-in)**: finds the traded phone by serial or creates a new product with category `'Exchange'`, `inventory +1` at the invoice shop, **writes NO stock movement** (known gap), and a cash-out `cash_manual_entries` row with category `'Exchange'` (that one is a cash-entry category, not a product category).
**Payments received later on an invoice** (`markPaymentReceived`): raises `amount_paid`; if the invoice was not originally `cash`, a `cash_manual_entries` row is written (`Payment received (...) — INV-…`, category `Payment Received` or the method name). Later payments on invoices that were originally cash only raise `amount_paid` (no dated record exists). **Return** (`salesReturn.js` / `salesController`): stock `+qty`, movement `in` note `Return: INV-…`, invoice status `returned`, a `customer_receipts` row with method `refund`; removing a trade-in phone on return logs nothing.
**Transfer** (`POST /shops/transfers`): `stock_transfers` row + two movements (`out` "Transfer to shop N", `in` "Transfer from shop N").

**Where quantity can change, and what each leaves behind (stock_movements):**
| Source | type | `quantity` holds | note | other record |
|---|---|---|---|---|
| Purchase | in | qty | `Purchase PUR-… — <serial>` | purchase_items |
| Sale | out | qty | `Sale INV-…` | sale_items |
| Sale return | in | qty | `Return: INV-… — …` | invoice `returned` |
| Transfer | out + in | qty | `Transfer to/from shop N` | stock_transfers (shops, date) |
| Stock count (StockCount page) | in / out | abs(variance) | `Stock count adjustment — <date>` | stock_counts + stock_count_items (shop, system_qty, actual_qty) |
| Inventory page Import (CSV/Excel) | in / out | abs(change) | `CSV/Excel import — quantity set to N` | — |
| Inventory page > Adjust > Stock In / Stock Out | in / out | qty | free text | created_by saved |
| Inventory page > Adjust > **Set Exact** (admin only) | **adjustment** | **the NEW stock level, not the change** | free text | created_by saved |
| Products page > Adjust | in / out | abs(delta) | note, else reason (Opening Stock / Stock Found / Damaged / Written Off / Returned from Customer / Supplier Return / Manual Correction) | created_by NOT saved; stock clamped at 0 but full delta logged |
| Exchange trade-in | **none** | — | — | inventory +1 only |
| Raw SQL in Supabase (stock-count reload, direct edits) | **none** | — | — | — |
Any report built on `stock_movements` can never see the last two rows, and cannot know the shop or cost of a movement.

**Cash register** (`cashRegister.js`): the Cash Register page computes opening/closing as a running chain from `2026-05-01` (live closing for open days, stored `closing_balance` once closed). `GET /cash-register/history?from&to&shop_id` returns those same numbers: reuse it instead of re-implementing.

## 5. Where things are (file map)
**Backend** (`backend/src`): `server.js` mounts `/api/v1/` `auth` (open), then `protect`, then `dashboard, products, inventory, purchases, sales, suppliers, customers, expenses, cheques, reports, cash-register, shops, obligations, attendance, user-log, finance, stock-count`. `config/database.js` exports `{ pool, query, getClient }` (forces SSL).
- controllers: `purchasesController` (createPurchase, recordPayment, revisePurchasePrice), `salesController` (createSale incl. exchange, payments received, returns), `salesReturn.js`, `suppliersController` (supplier payments + an old return function), `inventoryController` (list, stats, category-stats, adjustStock, movements, min-stock, cost), `productsController`, `dashboardController`, `authController`.
- routes: `reports.js` (ALL reports), `cashRegister.js`, `attendance.js`, `inventory.js` (export + CSV import), `shops.js` (shops, transfers, shop inventory), `stockCount.js`, `products.js` (+ `/:id/adjust`, history, serial lookup), `expenses.js`, `obligations.js`, `cheques.js`, `customers.js` (+ receipts), `suppliers.js`, `finance.js`, `userLog.js`. middleware: `authMiddleware` (`protect`), `checkRegisterLock` (blocks writes to a date with no open register). `utils/category.js` (section 6).
**Frontend** (`frontend/src`): routed pages in `App.js`: Dashboard, Products, Inventory, Purchases, Sales, Suppliers = **`SuppliersLedgerPage.jsx`**, Customers = **`CustomersLedgerPage.jsx`** (the older `Suppliers.js` and `Customers.js` are NOT routed), Expenses, Cheques, Users, Reports, CashRegister, Obligations, Finance, UserLog, Transfers, Attendance, StockCount, Login. Components: Layout, ShopSelector, TransferModal, UI, ErrorBoundary. `utils/api.js` = axios instance.
- **Purchases.js** (new purchase modal): per item Serial/IMEI (debounced lookup `GET /products/serial/:v`), Shop, Product name, Brand, Type, **Category (required)**, Cost, Sell, Qty; "Set category for all"; CSV/Excel upload (template has a `category` column).
- **Inventory.js**: cards (Total Products / Units / Out of stock / Low stock / Stock value / Retail value), category-wise stock value panel, filters (search, shop, status, **Category**, from/to), one-line product cell (name + category), row menu (Adjust Stock, Transfer, ...), Export (CSV via the shared api client) and Import.
- **Reports.js**: report cards (`REPORT_TYPES`); Full Business Report, Daily Business Report and Attendance (Late Report) open a print window, the rest render inline.

## 6. PRODUCT CATEGORIES — single source of truth
- **Canonical names:** `MOBILE`, `TAB`, `LAPTOP`, `ACCESSORIES` (uppercase). **Special:** `Exchange` (trade-in phones, created by the exchange flow — to be replaced, section 11) and `Service` (service products). Stored only in `products.category`; `inventory` has no category (everything joins products). `sub_category` is a separate field (Mobile, Tab, Ipad, Laptop, Macbook, Surface, Chromebook, Earbuds, Smartwatch, Charger, Cable, ...) and was left unchanged.
- **Aliases -> canonical:** Mobile / Mobile Phone -> MOBILE; Ipad / IPAD / Tablet / Tab -> TAB; Laptop / Macbook -> LAPTOP; Accessories -> ACCESSORIES (case and extra spaces ignored).
- **Rules:** new data is always saved canonical; filters are case-insensitive and also match the aliases; never match `p.category = 'Mobile'` exactly; the purchase form has NO default (the user must choose per item); API callers / batch scripts that send no category get `MOBILE`.
- **Where it lives — if the set changes, update ALL of these** (`grep -rn "ALIASES\|ITEM_CATEGORIES\|CATEGORIES" backend/src frontend/src`):
  - Backend shared helper: `utils/category.js` (`canonicalCategory`, `categoryForSave`, `categoryFilterList`) used by `productsController` (filter, create, update) and `routes/inventory.js` (CSV import).
  - Backend local copies of the alias list: `purchasesController.js` (`normCategory`, saves the form's choice on new AND existing non-service products), `inventoryController.js` (`categoryList` for the Inventory Category filter), `reports.js` (`CATEGORY_ALIASES` for Product Wise Margin; `dailyCat()` for the Daily Business Report buckets).
  - Frontend: `Purchases.js` (`ITEM_CATEGORIES`, `normalizeCategory`), `Inventory.js` (`ITEM_CATEGORIES`, filter), `Products.js` (`CATEGORIES`, `SUB_CATEGORIES` keyed by category, `normalizeCategory`; old spellings are shown clean and fixed on save; an unknown category such as Exchange stays visible), `Reports.js` (`CATEGORIES` for the margin filter). `StockCount.js` builds its category tabs from whatever `products.category` returns.
  - Defaults: `createProduct` and CSV import -> MOBILE; exchange flow -> `'Exchange'` (hardcoded in `salesController.js`).
- **Reports that use categories:** Inventory category-wise panel (`getCategoryStats`, groups the raw value), Stock Value by Shop, Full Business Report, Product Wise Margin, Daily Business Report (only MOBILE / TAB / LAPTOP buckets; Accessories, Exchange and Service are not in its stock value).
- **NOT product categories (do not confuse):** `expenses.category`, `cash_manual_entries.category` (including its `'Exchange'` cash-out), `expense_categories`, `obligations.category_id`.
- **History:** 27 Sep: Mobile / Mobile Phone -> MOBILE, Ipad / Tab -> TAB, Accessories unified in the database, but the purchase code kept creating `'Mobile Phone'` until it was fixed on 6 Oct. 15 bills from 15 Sep (by purchase number) were moved to LAPTOP / TAB. 6 Oct: full cleanup (31 products). Result: MOBILE 3365, TAB 161, LAPTOP 94, ACCESSORIES 65, Exchange 7, Service 1.
- **Health check:** run SQL (a) in section 10 now and then; every row must say `no change`.

## 7. Reports (`GET /api/v1/reports/...`)
`summary`, `sales`, `purchases`, `expenses`, `inventory`, `stock-value`, `top-products`, `salesperson`, `print-summary`, `purchase-invoice`, `product-margin`, `daily-inventory`, `full-business-report`, `upcoming-expenses`, `daily-business`; report pages also call `/attendance/report` and `/cash-register/history`.
- **Daily Business Report** (AlAman + Blessing only, date picker, print window): Sales (sale amount, cost, margin per shop, computed in separate subqueries); Purchases new (by supplier) and Payments only (excludes `Payment with purchase%`); Expenses by category; Cash Register (from `/cash-register/history`, same numbers as the register page); Customer receipts (`customer_receipts` non-refund + `cash_manual_entries` `Payment received%`); Stock value at end of the date by MOBILE / TAB / LAPTOP (`dailyCat()`; past dates are an estimate = current stock + cost sold after the date − cost bought after it, ignoring transfers / returns / adjustments).
- **Attendance (Late Report):** staff in columns, dates in rows, late minutes + clock-in time, totals row, shift-timings table; only staff with a shift or a record in the range; UTC-safe dates.
- **Upcoming Expenses:** pending outbound cheques + pending obligations, de-duplicated (an obligation is hidden when a pending outbound cheque has the same number inside its cheque_number/title, same due date and amount); detail = payee / category.
- **Print window pattern:** `window.open`, grey background with a centered A4 white page, `@media print` resets it, `window.print()` after 500 ms. English text only.
- **Known limitations (open, ask before changing):** Stock Value by Shop ignores its date field; Product Wise Margin and Top Products ignore the invoice-level discount; `summary` and `print-summary` build SQL by string interpolation (injection risk); a second `/stock-value` route in `reports.js` is dead code; Daily report "Paid / Due" of new purchases are current values.

## 8. Running SQL, delivering files, deploying (Windows)
- **SQL** only through the Supabase SQL editor; one complete block; wrap multi-statement changes in `BEGIN; ... COMMIT;`; after a risky change give ONE verification query. Supabase warns when a created table has no RLS: enable RLS on any backup table you create.
- **Files:** produce them with `create_file` / edits, copy to `/mnt/user-data/outputs`, call `present_files`. **Use unique output names** when a basename could collide in Downloads (e.g. `Inventory_page.js`, `inventory_route.js`, `Products_page.js`) and map them in the copy commands. New folders need `mkdir` first.
- **Standard commands (CMD, not PowerShell):**
```cmd
cd path\to\your\mobile-shop
copy /Y "%USERPROFILE%\Downloads\<file>" "<repo path>\<file>"
git add .
git commit -m "<message>"
git push
```
  Render and Netlify deploy by themselves (2-3 min). If both backend and frontend files changed, **both** must deploy before testing.
- **Always start from a fresh `git clone`** of the repo before editing: other sessions overwrote files before (the 29 Sep "Upcoming Expenses" commit removed the whole Daily Business Report). Compare the file with GitHub's before handing it over.
- **Netlify build** once failed on an ESLint error (TransferModal). Run ESLint with react-app rules before and after; a change must add no new warning.
- PowerShell needs `&` to run a quoted path; CMD has no `grep` (use `findstr`); scripts read credentials with `readline` prompts.

## 9. Testing toolkit (all of this works in the sandbox)
- **Environment:** network allows GitHub, npm and apt; it does NOT reach Render, Netlify or Supabase, so the live app and database can never be queried. Say so.
- **Backend / SQL:** `apt-get update && apt-get install -y postgresql`; `service postgresql start`; create `testdb`; set a password for `postgres`; replace `config/database.js` with a non-SSL `pg` Pool exporting `{ pool, query, getClient }`; `npm i express pg`; create a mock schema with only the needed tables/columns and deliberately planted edge cases; run the REAL controller/route through express + `fetch` and assert the results. Test every SQL handed to the user the same way (including re-running an update: it must change 0 rows).
- **Frontend:** `npm i react@18 react-dom@18 jsdom @babel/core @babel/preset-env @babel/preset-react`; compile the real page with babel (commonjs); mock `../utils/api`, `react-hot-toast`, `../components/UI`, `../components/TransferModal`; render with `react-dom/client` + `act`; drive with native value setters + `change`/`input` events; assert the DOM and the API payloads. JSX syntax: `@babel/parser` with the `jsx` plugin. Lint: `eslint@8` + `eslint-config-react-app@7`, `NODE_ENV=development`, compare before/after.
- **Time zones:** run date logic with `TZ=Asia/Karachi` and `TZ=Asia/Dubai`.

## 10. Reusable SQL (tested)
**(a) Category check — every product, what would change (read-only):**
```sql
WITH m AS (
  SELECT p.id, p.category, p.is_active,
         CASE
           WHEN UPPER(TRIM(REGEXP_REPLACE(p.category, '[[:space:]\u00A0]+', ' ', 'g'))) IN ('MOBILE', 'MOBILE PHONE') THEN 'MOBILE'
           WHEN UPPER(TRIM(REGEXP_REPLACE(p.category, '[[:space:]\u00A0]+', ' ', 'g'))) IN ('TAB', 'IPAD', 'TABLET')   THEN 'TAB'
           WHEN UPPER(TRIM(REGEXP_REPLACE(p.category, '[[:space:]\u00A0]+', ' ', 'g'))) IN ('LAPTOP', 'MACBOOK')      THEN 'LAPTOP'
           WHEN UPPER(TRIM(REGEXP_REPLACE(p.category, '[[:space:]\u00A0]+', ' ', 'g'))) = 'ACCESSORIES'              THEN 'ACCESSORIES'
         END AS new_cat
  FROM products p
),
stock AS (SELECT product_id, SUM(quantity) AS units FROM inventory GROUP BY product_id)
SELECT COALESCE(m.category, '(empty)')                         AS current_category,
       COALESCE(m.new_cat, '(left as it is)')                  AS will_become,
       CASE WHEN m.new_cat IS NULL OR m.category = m.new_cat THEN 'no change' ELSE 'WILL CHANGE' END AS action,
       COUNT(*)                                                AS products,
       COUNT(*) FILTER (WHERE m.is_active)                     AS active,
       COALESCE(SUM(s.units), 0)                               AS units_in_stock
FROM m
LEFT JOIN stock s ON s.product_id = m.id
GROUP BY m.category, m.new_cat
ORDER BY action DESC, products DESC;
```
**(b) Category update — only known old spellings, atomic, safe to re-run (0 rows the second time):**
```sql
WITH m AS (
  SELECT p.id,
         CASE
           WHEN UPPER(TRIM(REGEXP_REPLACE(p.category, '[[:space:]\u00A0]+', ' ', 'g'))) IN ('MOBILE', 'MOBILE PHONE') THEN 'MOBILE'
           WHEN UPPER(TRIM(REGEXP_REPLACE(p.category, '[[:space:]\u00A0]+', ' ', 'g'))) IN ('TAB', 'IPAD', 'TABLET')   THEN 'TAB'
           WHEN UPPER(TRIM(REGEXP_REPLACE(p.category, '[[:space:]\u00A0]+', ' ', 'g'))) IN ('LAPTOP', 'MACBOOK')      THEN 'LAPTOP'
           WHEN UPPER(TRIM(REGEXP_REPLACE(p.category, '[[:space:]\u00A0]+', ' ', 'g'))) = 'ACCESSORIES'              THEN 'ACCESSORIES'
         END AS new_cat
  FROM products p
),
upd AS (
  UPDATE products p
  SET category = m.new_cat
  FROM m
  WHERE p.id = m.id AND m.new_cat IS NOT NULL AND p.category <> m.new_cat
  RETURNING m.new_cat
)
SELECT new_cat AS new_category, COUNT(*) AS products_changed
FROM upd
GROUP BY new_cat
ORDER BY new_cat;
```
**(c) Stock reconciliation — products bought since a date: bought − sold should equal stock now; rows = mismatch (read-only).** A row is not automatically a bug: buy-backs, lab round trips, stock counts and trade-ins explain most (the first version of this query hid `out` movements; use (d) to see the whole story).
```sql
WITH scope AS (          -- stock items bought on/after 15 Sep 2026 (service items like REPAIR never go to inventory)
  SELECT DISTINCT pi.product_id
  FROM purchase_items pi
  JOIN purchases pu ON pu.id = pi.purchase_id
  JOIN products p   ON p.id = pi.product_id
  WHERE pu.purchase_date >= DATE '2026-09-15' AND p.is_service IS NOT TRUE
),
bought AS (
  SELECT pi.product_id,
         SUM(pi.qty) AS qty_total,
         SUM(pi.qty) FILTER (WHERE pu.purchase_date >= DATE '2026-09-15') AS qty_since,
         string_agg(DISTINCT pu.purchase_number, ', ') FILTER (WHERE pu.purchase_date >= DATE '2026-09-15') AS bills_since_15sep
  FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
  WHERE pi.product_id IN (SELECT product_id FROM scope)
  GROUP BY pi.product_id
),
sold AS (
  SELECT sli.product_id, SUM(sli.qty) AS qty,
         string_agg(DISTINCT si.invoice_number, ', ') AS invoices
  FROM sale_items sli JOIN sales_invoices si ON si.id = sli.invoice_id
  WHERE si.payment_status <> 'returned' AND sli.product_id IN (SELECT product_id FROM scope)
  GROUP BY sli.product_id
),
stock AS (
  SELECT i.product_id, SUM(i.quantity) AS qty,
         string_agg(COALESCE(sh.name,'?') || ': ' || i.quantity, ', ' ORDER BY sh.name) AS where_now
  FROM inventory i LEFT JOIN shops sh ON sh.id = i.shop_id
  WHERE i.product_id IN (SELECT product_id FROM scope)
  GROUP BY i.product_id
),
manual AS (              -- stock changes that are NOT a plain purchase 'in' / sale 'out' (adjustments, stock count, ...)
  SELECT sm.product_id,
         string_agg(sm.type || ' ' || sm.quantity || ' [' || COALESCE(sm.note,'') || '] ' || to_char(sm.created_at,'DD-Mon'), ' | ' ORDER BY sm.created_at) AS other_movements
  FROM stock_movements sm
  WHERE sm.type NOT IN ('in','out') AND sm.product_id IN (SELECT product_id FROM scope)
  GROUP BY sm.product_id
)
SELECT p.id AS product_id, p.name, p.serial_number, p.category,
       b.bills_since_15sep,
       b.qty_total                              AS bought_total,
       COALESCE(s.qty,0)                        AS sold_total,
       b.qty_total - COALESCE(s.qty,0)          AS should_be_in_stock,
       COALESCE(st.qty,0)                       AS in_stock_now,
       st.where_now, s.invoices AS sold_on_invoices, m.other_movements,
       CASE WHEN COALESCE(st.qty,0) > b.qty_total - COALESCE(s.qty,0)
            THEN 'MORE stock than expected (sold, but still showing in inventory?)'
            ELSE 'LESS stock than expected (not sold, but missing from inventory?)' END AS problem
FROM scope sc
JOIN products p ON p.id = sc.product_id
JOIN bought b   ON b.product_id = p.id
LEFT JOIN sold s   ON s.product_id = p.id
LEFT JOIN stock st ON st.product_id = p.id
LEFT JOIN manual m ON m.product_id = p.id
WHERE COALESCE(st.qty,0) <> b.qty_total - COALESCE(s.qty,0)
ORDER BY problem, p.name;
```
**(d) Product timeline — purchases, movements, sales, trade-ins, transfers and current stock in order (put the product ids in the list):**
```sql
SELECT pr.name, ev.at::text AS "when", ev.event, ev.detail
FROM products pr
CROSS JOIN LATERAL (
  SELECT pu.purchase_date::timestamp AS at, 1 AS ord, 'PURCHASE' AS event,
         pu.purchase_number || ' | qty ' || pi.qty || ' | into ' || COALESCE(sh.name,'?') AS detail
  FROM purchase_items pi
  JOIN purchases pu ON pu.id = pi.purchase_id
  LEFT JOIN shops sh ON sh.id = pi.shop_id
  WHERE pi.product_id = pr.id
  UNION ALL
  SELECT sm.created_at::timestamp, 2, 'STOCK MOVEMENT',
         sm.type || ' ' || sm.quantity || ' | ' || COALESCE(sm.note,'')
  FROM stock_movements sm
  WHERE sm.product_id = pr.id
  UNION ALL
  SELECT si.sale_date::timestamp, 3, 'SALE',
         si.invoice_number || ' | ' || si.payment_status || ' | shop ' || COALESCE(sh.name,'?') || ' | qty ' || sli.qty
  FROM sale_items sli
  JOIN sales_invoices si ON si.id = sli.invoice_id
  LEFT JOIN shops sh ON sh.id = si.shop_id
  WHERE sli.product_id = pr.id
  UNION ALL
  SELECT si.sale_date::timestamp, 4, 'EXCHANGE TRADE-IN (this serial came back)',
         si.invoice_number || ' | shop ' || COALESCE(sh.name,'?') || ' | trade-in value ' || COALESCE(si.exchange_trade_in_value,0)
  FROM sales_invoices si
  LEFT JOIN shops sh ON sh.id = si.shop_id
  WHERE pr.serial_number IS NOT NULL AND si.exchange_serial_number = pr.serial_number
  UNION ALL
  SELECT st.transfer_date::timestamp, 5, 'TRANSFER',
         fs.name || ' -> ' || ts.name || ' | qty ' || st.quantity
  FROM stock_transfers st
  JOIN shops fs ON fs.id = st.from_shop_id
  JOIN shops ts ON ts.id = st.to_shop_id
  WHERE st.product_id = pr.id
  UNION ALL
  SELECT i.last_updated::timestamp, 9, 'INVENTORY NOW (last changed)',
         COALESCE(sh.name,'?') || ': ' || i.quantity
  FROM inventory i
  LEFT JOIN shops sh ON sh.id = i.shop_id
  WHERE i.product_id = pr.id
) ev
WHERE pr.id IN (
  '<product-uuid-1>',
  '<product-uuid-2>'
)
ORDER BY pr.name, ev.at, ev.ord;
```

## 11. Pending tasks and open items
1. **Exchange (trade-in) product category — the user asked to do this LATER ("thory time baad"). Do NOT start without their go-ahead.** When an exchange is entered on the Sales page, ask what the traded product is: a required dropdown MOBILE / TAB / LAPTOP / ACCESSORIES, sent in the payload (e.g. `exchange_category`). In `salesController.createSale` ("Exchange product handling" block) save it with `categoryForSave` instead of the hardcoded `'Exchange'`; decide with the user whether an existing product found by serial gets its category updated; migrate the 7 existing `Exchange` products (run a check first); consider logging a stock movement for trade-ins (none today). Until done, the Daily Business Report stock value leaves `Exchange` items out.
2. **Stock Adjustments report (asked 6 Oct) — plan first, build only after the user confirms.** Scope: only manual adjustments (Inventory page Adjust Stock, Products page Adjust, CSV/Excel import, Stock count), and only how many products and how much quantity was added or removed. Identify them in `stock_movements` by type `adjustment` or a note that is NOT `Purchase …`, `Sale …`, `Return: …`, `Transfer to/from shop …`. Known gaps: movements have no shop and no cost; **Set Exact** stores the new level, not the change; trade-ins and raw SQL leave no record.
3. **Open items (ask first):** Stock Value by Shop date; string-built SQL in `summary` / `print-summary`; `Login.js` Vercel fallback; the unused `Customers.js` / `Suppliers.js`; mixed `sub_category` spelling; the Low Stock card is meaningless for single-unit phones (min_stock 5; set 0 for serialized phones?); 151 in-stock units had no selling price on 6 Oct (cost AED 71,698); add `shop_id` to `stock_movements` (ALTER TABLE + the insert sites) so adjustment reports can be exact; Products page Adjust saves no `created_by` and drops the reason when a note is typed.

## 12. Bugs already found (do not repeat)
- Daily report sale amount double-counted multi-item invoices (join fan-out); the same bug was in the Salesperson report (fixed).
- "Payments only" counted the payment made together with the purchase twice.
- Report stock value used today's stock for any date; used exact category names (missed Mobile Phone / Ipad / Macbook).
- Reports still read `expenses.category_id` / `expense_categories.name` (columns that do not exist); Full Business Report used cheque type `outgoing` (real: `outbound`).
- The purchase form's serial lookup was dead from 20 Jun to 6 Oct (a missing `serialTimers` line); validation errors left the button on "Creating…".
- Attendance dates shifted one day back in Pakistan/UAE time zones.
- Hardcoded Vercel URLs broke the inventory export and the Customers page.
- Category dropdowns (title-case) re-created old spellings in the database; the purchase code hardcoded `'Mobile Phone'`.

## 13. Sanity baseline (6 Oct 2026, for comparing later)
Inventory: 755 pcs / AED 334,522 (AlAman 300 pcs / 152,640; Blessing 455 pcs / 181,882); 679 inventory rows (534 in stock, 145 zero). Products by category: MOBILE 3365, TAB 161, LAPTOP 94, ACCESSORIES 65, Exchange 7, Service 1. Stock reconciliation since 15 Sep: only 4 products mismatched (3 buy-backs / lab round trips explained, 1 pending-payment sale), the user accepted them.
