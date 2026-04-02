# Supplier Ledger + Payment — Integration Guide

## Files
- `backend/routes/supplierLedger.js`   → drop into your routes folder
- `frontend/SuppliersLedgerPage.jsx`   → drop into your pages folder

---

## Step 1: Database Setup

Hit this URL once to create the `supplier_payments` table:

```
GET https://mobile-shop-snowy.vercel.app/api/v1/suppliers/setup
```

Expected response: `{ "ok": true, "message": "supplier_payments table ready" }`

Or run this SQL directly in Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS supplier_payments (
  id             SERIAL PRIMARY KEY,
  supplier_id    INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  payment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) DEFAULT 'cash',
  cheque_no      VARCHAR(100),
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sp_date     ON supplier_payments(payment_date);
```

---

## Step 2: Backend (Node.js)

Replace your existing `suppliers.js` route file with `supplierLedger.js`,
OR add only the new routes if you want to keep existing supplier CRUD.

In your `app.js` / `server.js`:
```js
const supplierRoutes = require("./routes/supplierLedger");
app.use("/api/v1/suppliers", supplierRoutes);
```

Make sure your `db.js` exports a pg `Pool`. If it's named differently, update the require at the top of the route file.

---

## Step 3: Frontend (React)

1. Copy `SuppliersLedgerPage.jsx` to your `src/pages/` folder.
2. Update the `API` constant at the top if needed (it's already set to your backend URL).
3. Add to your router:

```jsx
import SuppliersLedgerPage from "./pages/SuppliersLedgerPage";

// In your routes:
<Route path="/suppliers" element={<SuppliersLedgerPage />} />
```

4. Add to your sidebar nav:
```jsx
<NavLink to="/suppliers">Suppliers</NavLink>
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/suppliers | List all with balance totals |
| GET | /api/v1/suppliers/:id | Single supplier with balance |
| GET | /api/v1/suppliers/:id/ledger | Full ledger (purchases + payments) |
| GET | /api/v1/suppliers/:id/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD | Filtered ledger |
| GET | /api/v1/suppliers/:id/payments | List payments only |
| POST | /api/v1/suppliers/:id/payments | Record new payment |
| DELETE | /api/v1/suppliers/:id/payments/:pid | Delete a payment |

### POST /payments body:
```json
{
  "amount": 5000,
  "payment_date": "2025-01-15",
  "payment_method": "cash",  // cash | bank | cheque
  "cheque_no": "CHQ-001",    // only for cheque
  "note": "Partial payment"
}
```

---

## How the Ledger Works

- **Purchases** = DEBIT (increases what you owe supplier)
- **Payments** = CREDIT (reduces what you owe supplier)
- **Balance** = Running total of (purchases - payments)
- All amounts in AED, no decimals (integers)

---

## What's Next: Customer Ledger

The customer ledger follows the same pattern but reversed:
- Sales = CREDIT (customer owes you)
- Receipts = DEBIT (customer pays you)

I can build that next with a `customer_receipts` table using identical structure.
