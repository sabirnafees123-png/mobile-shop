---
name: mobile-shop-system
description: Operating manual for the Mobile Shop Management System (AlAman/Blessing/Wholesale) — a React/Node/Express/Supabase(Postgres) app for a used-phone retail business in the UAE. Use this whenever the user asks about their shop system: entering sales/purchases backfill, fixing invoices, stock counts, database structure, or asks for SQL/scripts for this project. Also covers how the user shares local files and how batch scripts are run on their Windows PC.
---

# Mobile Shop Management System — Operating Manual

This is a running business tool for a used-mobile-phone retail operation with 3 shops:
**AlAman (shop_id=1)**, **Blessing (shop_id=2)**, **Wholesale (shop_id=3)**.

Repo: `https://github.com/sabirnafees123-png/mobile-shop.git`
Stack: React frontend, Node/Express backend, PostgreSQL via Supabase.

**Hosting (as of this doc):**
- Frontend: Netlify — `https://lucky-frangollo-af3c89.netlify.app`
- Backend: Render — `https://mobile-shop-backend-sjuj.onrender.com`
  (Render free tier sleeps after 15 min idle — first request after a gap takes 30-60s)
- ⚠️ Vercel was abandoned for both frontend and backend — its Hobby-tier automatic
  bot/DDoS "challenge" system randomly 403-blocked legitimate traffic (including
  login) with no reliable way to disable it on the free plan. Don't suggest moving
  back to Vercel unless the user asks.

---

## 1. How This Project's Conversations Work

The user is not a developer — communicate in Roman Urdu/Hindi (matching their
language), give copy-pasteable commands, and explain *why* before doing anything
that touches live data.

**Core working pattern for any bulk data-entry task (backfilling old sales/purchases,
stock counts, etc.):**

1. **Read the raw data the user pastes/uploads carefully.** It's usually a messy
   handwritten-register transcription or a spreadsheet with inconsistent formatting
   (combo items, "2 pcs" cost splits, missing costs, ambiguous names).
2. **Flag every ambiguity BEFORE processing** — don't guess silently. Multiple past
   rounds of guessing wrong (fuzzy name-matching mismatches like "iPhone 17 Pro" ↔
   "iPhone 11 Pro", "iPad Mini 2" ↔ "iPad Pro 2nd Gen") caused real, costly errors
   that had to be manually found and fixed later. **Always ask, never assume**, for:
   - Combo/multi-item bills — how to split the total across items
   - "2 pcs"/"3 pcs" cost notation — total for all pieces, or per-piece?
   - Missing cost prices
   - Suspicious matches (different model number, big date gap, brand mismatch)
   - Which shop, which date range
3. **Match against system inventory using exact identifiers only** — last-4-digits
   of serial/IMEI, or full serial/IMEI exact match. Never trust fuzzy token/name
   matching alone; it has repeatedly produced false-positive matches. If matching
   by name is unavoidable, manually eyeball every match before using it — don't
   trust an automated score.
4. **Cost/sell price policy:** the user's sheet's own cost/sell numbers are ALWAYS
   used, never the system's stored price — even when an item matches an existing
   product. This is a standing rule, confirmed multiple times.
5. **Prefer creating data via the real backend API (a Node.js batch script), not
   raw SQL**, whenever the operation is "create a sale" or "create a purchase".
   The API's controllers handle side effects raw SQL would otherwise have to
   replicate by hand and risks getting wrong: creating/matching products, updating
   `inventory`, logging `stock_movements`, updating `supplier_ledger` /
   `customers.balance`, and cash register totals. Reserve raw SQL for: pure
   corrections to existing rows, register housekeeping, and stock-count
   backup/wipe/reload operations.
6. **Dry run first, always.** Every batch script defaults to a dry run (prints what
   it would do, changes nothing) and only executes for real with an explicit
   `--live` flag. Review the dry run output line by line before approving `--live`.
7. **Registers must be OPEN for every date a sale/purchase will be dated.** Check
   and open missing registers before running any batch script — the app blocks
   writes to a date with no open register.
8. **Sales require a cost price > 0 — this is a hard backend rule** (added
   deliberately, see `salesController.js`). A sale with a missing/zero cost is
   rejected outright, by design, to protect gross-margin accuracy. If a purchase
   is entered with cost=0 for a genuinely free/bundled item (adapters, cables),
   that's fine for *purchases*; but that product can't be *sold* until its cost is
   set above 0.
9. **Before any bulk update/wipe of inventory (e.g. loading a fresh stock count),
   always take a full backup table first**, e.g.:
   ```sql
   CREATE TABLE inventory_backup_<label>_<date> AS
   SELECT i.*, p.name, p.brand, p.serial_number, p.base_cost, p.selling_price,
          s.name as shop_name, NOW() as backed_up_at
   FROM inventory i JOIN products p ON p.id = i.product_id
   LEFT JOIN shops s ON s.id = i.shop_id
   WHERE i.shop_id = <shop_id>;   -- omit WHERE to back up all shops
   ```
   Wrap the actual wipe+reload in `BEGIN; ... COMMIT;` so a mid-way error rolls
   back everything automatically — nothing partial ever gets saved.

**Known CSV-import gotchas** (Supabase's "Import from CSV" table creator often
mis-types columns): a column you expect to be `uuid` or numeric may import as
`text`, or vice-versa. If a query throws `operator does not exist: uuid = text` or
`function ... does not exist` on a column, cast explicitly
(`col::text`, `col::uuid`) rather than assuming the DDL you wrote was honored.

---

## 2. Database Structure (Postgres, via Supabase)

Core tables and how they relate:

- **`shops`** — id, name. Fixed 3 rows: 1=AlAman, 2=Blessing, 3=Wholesale.
- **`products`** — the catalog. `id (uuid)`, `name`, `brand`, `serial_number`
  (**unique** — inserting a duplicate serial throws a constraint violation),
  `base_cost`, `selling_price`, `category`, `is_active`.
- **`inventory`** — per-shop stock. `product_id + shop_id` is the natural key
  (has an `ON CONFLICT (product_id, shop_id)` upsert target), `quantity`,
  `min_stock`.
- **`stock_movements`** — audit log of stock changes (`type`: in/out/adjustment,
  `quantity`, `note`, `created_at`).
- **`purchases`** + **`purchase_items`** — a purchase header (`purchase_number`,
  `purchase_date`, `supplier_id`, `amount_paid`, `shop_id`) and its line items
  (`product_id`, `qty`, `unit_cost`). ⚠️ `total_cost` on `purchase_items` is a
  **generated column** — never `UPDATE` it directly, only `unit_cost`; the total
  recalculates itself.
- **`sales_invoices`** + **`sale_items`** — an invoice header (`invoice_number`,
  `sale_date`, `shop_id`, `customer_id`, `subtotal`, `total_amount`,
  `amount_paid`, `amount_due`, `payment_status`: unpaid/partial/paid,
  `payment_method`, `is_exchange`, `exchange_product_name`,
  `exchange_trade_in_value`) and its line items (`product_id`, `qty`,
  `unit_cost`, `unit_price`). ⚠️ `total_price` and `profit` on `sale_items` are
  **generated columns** — only `unit_price`/`unit_cost` are writable directly.
- **`suppliers`** — `id`, `name`, `balance` (running debt owed to them).
- **`supplier_ledger`** — one row per purchase/payment transaction against a
  supplier (`transaction_type`: purchase/payment, `amount`, `balance_after`,
  `description`, `reference_id`, `reference_type`).
- **`customers`** — `id`, `name`, `phone`, `balance` (positive = they owe the shop).
- **`cash_register`** — one row per `(shop_id, register_date)`, `status`
  open/closed, `opening_balance`, `closing_balance`. Cash-sales totals are
  computed **live** from `sales_invoices` at report time — not from a stored
  running total — so correcting an invoice's `amount_paid`/`sale_date`
  automatically corrects the register without a separate manual adjustment.
- **`cash_manual_entries`** — manual cash in/out (`entry_type`: in/out, `amount`,
  `category` — a fixed whitelist enforced in both frontend dropdown and backend
  validation array; adding a new category means editing both
  `frontend/src/pages/CashRegister.js` and
  `backend/src/routes/cashRegister.js`).
- **`users`** — `id`, `name`, `email`, `role` (admin/accountant/staff),
  `is_active` (deactivate, never delete or rename, a departed employee's account
  — deleting orphans their historical sale/purchase records, renaming corrupts
  the audit trail on old records).

---

## 3. How DB Commands Are Run

The user has **no direct database client** — all SQL is run by them pasting it
into the **Supabase SQL editor** in their browser and reading back the result,
which they paste into the chat. Practical implications:

- Every SQL block given to the user must be **complete and self-contained** —
  they copy-paste the whole thing, they don't type anything extra.
- For anything that changes data, wrap it in `BEGIN; ... COMMIT;`. If a query
  inside errors, Postgres auto-rolls-back the whole transaction — reassure the
  user of this when they're nervous about running something risky (nothing
  partial ever lands; if it fails, nothing changed).
- After any risky bulk operation, always give a verification `SELECT` (ideally
  one single query so the user doesn't have to run several) that reports counts
  matching what was expected, so the result can be checked at a glance.
- Give the user credit for having Supabase's dashboard, not a terminal —
  never suggest `psql` commands unless they specifically bring up a local Postgres
  client.

---

## 4. Getting Files From the User's Local PC / Giving Them Runnable Commands

The user works on Windows (`C:\Users\AIMS TECH\...`), using CMD or PowerShell.

**Files flow one way at a time — there's no live sync:**
- **User → Claude:** they upload files through the chat's attachment picker.
  Uploaded files land in `/mnt/user-data/uploads/` in this environment.
- **Claude → User:** files created with `create_file` and passed to
  `present_files` appear as download cards in the chat; the user manually saves
  them to a folder (commonly `Downloads`) on their PC.

**For anything that must run on their machine (Node.js batch scripts):**
1. Build the script + any data file (e.g. `batch.js` + `batch_data.json` +
   `package.json`) and present them together.
2. Tell them explicitly to put all the files **in the same folder**.
3. Give the exact commands, in order, assuming CMD (not bash) syntax:
   ```cmd
   cd Downloads
   npm install
   node batch.js
   ```
   (dry run first; only add `--live` once the dry-run output has been reviewed
   and approved)
4. If they already have a folder with `node_modules` installed from an earlier
   script, tell them they can skip `npm install` and just drop the new `.js`/
   `.json` files into that same folder — no need to resend `package.json` or
   reinstall dependencies every time.
5. Batch scripts should prompt for login email/password interactively (never
   hardcode credentials in the script) and should be **resume-safe** — write a
   local `*_log.json` after each successful step, and skip anything already
   marked done on a re-run. This matters because scripts get re-run after fixing
   a bug partway through a big batch.
6. Windows-specific gotchas already hit in this project:
   - PowerShell needs `&` prefix to run a quoted path (`pg_dump.exe` etc.);
     CMD does not. Default to CMD-compatible instructions.
   - `grep` doesn't exist in plain CMD — use `findstr` instead.
   - Git Bash / CMD credential prompts can hang silently; scripts should read
     credentials via `readline` prompts, not rely on any password manager.

