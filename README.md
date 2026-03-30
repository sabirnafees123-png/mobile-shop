# 📱 Mobile Shop Management System — Sharjah

Used mobile phone shop management system.
**Stack:** Node.js + Express + PostgreSQL (Supabase) + React.js + Vercel

---

## 📁 Folder Structure

```
mobile-shop/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js          ← Supabase connection
│   │   │   └── testConnection.js    ← Run to verify DB works
│   │   ├── controllers/
│   │   │   ├── productsController.js
│   │   │   ├── purchasesController.js  ← Full business logic
│   │   │   ├── salesController.js      ← Full business logic
│   │   │   ├── suppliersController.js
│   │   │   └── dashboardController.js
│   │   ├── routes/
│   │   │   ├── products.js
│   │   │   ├── purchases.js
│   │   │   ├── sales.js
│   │   │   ├── suppliers.js
│   │   │   ├── customers.js
│   │   │   ├── inventory.js
│   │   │   ├── expenses.js
│   │   │   └── dashboard.js
│   │   └── server.js                ← Express app entry point
│   ├── sql/
│   │   └── 001_create_tables.sql    ← Run in Supabase SQL Editor
│   ├── .env.example                 ← Copy to .env and fill in
│   ├── vercel.json
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Layout.js            ← Sidebar navigation
│   │   ├── pages/
│   │   │   ├── Dashboard.js
│   │   │   ├── Products.js
│   │   │   ├── Inventory.js
│   │   │   ├── Purchases.js
│   │   │   ├── Sales.js
│   │   │   ├── Suppliers.js
│   │   │   ├── Customers.js
│   │   │   └── Expenses.js
│   │   ├── utils/
│   │   │   └── api.js               ← Axios instance
│   │   ├── styles/
│   │   │   └── global.css
│   │   ├── App.js
│   │   └── index.js
│   ├── public/
│   │   └── index.html
│   ├── .env.example
│   ├── vercel.json
│   └── package.json
│
├── setup.sh                         ← One-time setup script
└── README.md
```

---

## 🚀 SETUP GUIDE (Step by Step)

### STEP 1 — Download & Extract Project

If you have a zip file, extract it. Then open terminal:
```bash
cd mobile-shop
```

---

### STEP 2 — Run the Setup Script

This installs all packages automatically:

```bash
bash setup.sh
```

Or do it manually:
```bash
# Install backend
cd backend
npm install

# Install frontend
cd ../frontend
npm install
```

---

### STEP 3 — Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click **New Project**
3. Fill in:
   - **Name:** mobile-shop-sharjah
   - **Database Password:** (save this! you'll need it)
   - **Region:** Middle East (Bahrain) — closest to UAE
4. Wait ~2 minutes for project to be ready

---

### STEP 4 — Get Your Supabase Database URL

1. In your Supabase project → **Settings** (gear icon)
2. Click **Database**
3. Scroll to **Connection String** → choose **URI**
4. Copy the URI — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the password you chose

---

### STEP 5 — Configure Backend .env

```bash
# In the mobile-shop/backend/ folder
cp .env.example .env
```

Open `backend/.env` and fill in:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres
NODE_ENV=production
PORT=5000
FRONTEND_URL=http://localhost:3000
```

> ⚠️ Use `NODE_ENV=production` even in development when using Supabase — it enables SSL which Supabase requires.

---

### STEP 6 — Run the SQL in Supabase

1. In Supabase → click **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open `backend/sql/001_create_tables.sql`
4. Copy the **entire** file content
5. Paste it into Supabase SQL Editor
6. Click **Run** (green button)
7. You should see: all table names listed at the bottom ✅

---

### STEP 7 — Test Database Connection

```bash
cd backend
node src/config/testConnection.js
```

Expected output:
```
✅ CONNECTION SUCCESSFUL!
🕐 Server time: 2024-01-15T...
📋 Tables found (13):
   ✓ cash_register
   ✓ customers
   ✓ expenses
   ✓ inventory_stock
   ...
```

---

### STEP 8 — Configure Frontend .env

```bash
cd frontend
cp .env.example .env
```

For local development, the default works:
```env
REACT_APP_API_URL=http://localhost:5000/api/v1
```

---

### STEP 9 — Run Locally (Development)

Open **two terminals**:

**Terminal 1 — Backend:**
```bash
cd mobile-shop/backend
npm run dev
```
Runs on http://localhost:5000

**Terminal 2 — Frontend:**
```bash
cd mobile-shop/frontend
npm start
```
Opens http://localhost:3000 in browser automatically

---

## 🌐 DEPLOY TO VERCEL

### Deploy Backend

```bash
cd backend

# Login to Vercel (first time only)
vercel login

# Deploy
vercel

# Follow prompts:
# - Set up and deploy? Y
# - Which scope? (your account)
# - Link to existing project? N
# - Project name: mobile-shop-backend
# - Directory: ./   (just press Enter)
# - Override settings? N

# After deploy, you get a URL like:
# https://mobile-shop-backend-xxx.vercel.app
```

**Add environment variables in Vercel:**
```bash
vercel env add DATABASE_URL
# Paste your Supabase DATABASE_URL

vercel env add NODE_ENV
# Type: production

vercel env add FRONTEND_URL
# Type your frontend Vercel URL (set after frontend deploy)
```

Or add via Vercel Dashboard → Your Project → Settings → Environment Variables.

**Redeploy after adding env vars:**
```bash
vercel --prod
```

---

### Deploy Frontend

First update `frontend/.env`:
```env
REACT_APP_API_URL=https://mobile-shop-backend-xxx.vercel.app/api/v1
```

Then:
```bash
cd frontend
vercel

# Project name: mobile-shop-frontend
# After deploy you get: https://mobile-shop-frontend-xxx.vercel.app
```

Add env var:
```bash
vercel env add REACT_APP_API_URL
# Paste: https://mobile-shop-backend-xxx.vercel.app/api/v1
```

```bash
vercel --prod
```

---

## 🔗 API ENDPOINTS REFERENCE

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/dashboard/summary | Dashboard stats |
| GET/POST | /api/v1/products | List / Create products |
| GET/POST | /api/v1/suppliers | List / Create suppliers |
| GET/POST | /api/v1/customers | List / Create customers |
| GET/POST | /api/v1/purchases | List / Create purchases |
| POST | /api/v1/purchases/:id/pay | Record supplier payment |
| GET/POST | /api/v1/sales | List / Create invoices |
| GET | /api/v1/inventory | View stock lines |
| PATCH | /api/v1/inventory/:id | Update stock item |
| GET/POST | /api/v1/expenses | List / Add expenses |
| DELETE | /api/v1/expenses/:id | Delete expense |

### Test API with curl:
```bash
# Health check
curl http://localhost:5000/health

# Get all products
curl http://localhost:5000/api/v1/products

# Create a product
curl -X POST http://localhost:5000/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{"name":"iPhone 14 Pro Max","brand":"Apple","model":"14 Pro Max","storage":"256GB","color":"Deep Purple","condition":"Used"}'

# Create a supplier
curl -X POST http://localhost:5000/api/v1/suppliers \
  -H "Content-Type: application/json" \
  -d '{"name":"Dubai Mobile Wholesale","phone":"+971-4-111-2222","city":"Dubai"}'

# Create a purchase (auto-creates stock + updates supplier ledger)
curl -X POST http://localhost:5000/api/v1/purchases \
  -H "Content-Type: application/json" \
  -d '{
    "supplier_id": "YOUR_SUPPLIER_UUID",
    "amount_paid": 500,
    "items": [
      {"product_id": "YOUR_PRODUCT_UUID", "imei": "123456789012345", "qty": 1, "unit_cost": 1200}
    ]
  }'
```

---

## 🗃️ DATABASE TABLES

| Table | Purpose |
|-------|---------|
| users | Staff / admin accounts |
| products | Master product catalog |
| inventory_stock | One row per purchased item (stock line) |
| purchases | Purchase orders from suppliers |
| purchase_items | Line items within each purchase |
| supplier_ledger | Auto-tracks all supplier transactions |
| sales_invoices | Customer invoices |
| sale_items | Line items on each invoice |
| suppliers | Supplier accounts + balance |
| customers | Customer accounts + credit balance |
| expenses | Operating expenses |
| cash_register | Daily cash opening/closing |
| payment_schedules | Installment payment tracking |

---

## ⚡ Business Logic Summary

**When you create a Purchase:**
1. `purchases` row created with totals
2. `purchase_items` rows created (one per phone)
3. `inventory_stock` rows created (one per item = stock line)
4. `suppliers.balance` increased by amount_due
5. `supplier_ledger` entry created automatically

**When you record a Sale:**
1. `sales_invoices` row created
2. `sale_items` rows created
3. `inventory_stock.qty_sold` incremented → status = 'sold' when depleted
4. `customers.balance` increased if amount_due > 0

---

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| `SSL error` connecting to Supabase | Set `NODE_ENV=production` in .env |
| `relation does not exist` | Run the SQL file in Supabase SQL Editor |
| `CORS error` in browser | Check FRONTEND_URL in backend .env |
| Frontend blank page | Check REACT_APP_API_URL in frontend .env |
| `Cannot find module` | Run `npm install` in that folder |
| Vercel deploy fails | Check all env vars are added in Vercel dashboard |
