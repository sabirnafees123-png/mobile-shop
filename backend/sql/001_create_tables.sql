-- ============================================================
-- USED MOBILE SHOP MANAGEMENT SYSTEM - DATABASE SCHEMA
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension (already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS (shop staff / admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'accountant')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(150) NOT NULL,
  phone         VARCHAR(30),
  email         VARCHAR(150),
  address       TEXT,
  city          VARCHAR(100) DEFAULT 'Sharjah',
  country       VARCHAR(100) DEFAULT 'UAE',
  balance       NUMERIC(12,2) NOT NULL DEFAULT 0.00,  -- positive = we owe them
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(150) NOT NULL,
  phone         VARCHAR(30),
  email         VARCHAR(150),
  address       TEXT,
  city          VARCHAR(100),
  country       VARCHAR(100) DEFAULT 'UAE',
  id_number     VARCHAR(50),               -- Emirates ID or passport
  balance       NUMERIC(12,2) NOT NULL DEFAULT 0.00, -- positive = they owe us
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. PRODUCTS (master catalog)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(200) NOT NULL,       -- e.g. "iPhone 14 Pro Max"
  brand          VARCHAR(100),                -- Apple, Samsung, etc.
  model          VARCHAR(100),                -- 14 Pro Max
  category       VARCHAR(100) DEFAULT 'Mobile Phone',
  storage        VARCHAR(50),                 -- 128GB, 256GB
  color          VARCHAR(50),
  condition      VARCHAR(30) DEFAULT 'Used'   -- New, Used, Refurbished
                 CHECK (condition IN ('New', 'Used', 'Refurbished', 'For Parts')),
  description    TEXT,
  imei_required  BOOLEAN DEFAULT true,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. PURCHASES (purchase orders from suppliers)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_number VARCHAR(30) UNIQUE NOT NULL, -- PUR-2024-001
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  user_id         UUID REFERENCES users(id),   -- who created it
  purchase_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  amount_due      NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  payment_status  VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                  CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. PURCHASE ITEMS (line items for each purchase)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id  UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  imei         VARCHAR(20),                  -- IMEI number
  qty          INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_cost    NUMERIC(10,2) NOT NULL,       -- what we paid per unit
  total_cost   NUMERIC(12,2) GENERATED ALWAYS AS (qty * unit_cost) STORED,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. INVENTORY STOCK (one row per purchase item = stock line)
-- Each phone purchased creates a separate stock line
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_stock (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      UUID NOT NULL REFERENCES products(id),
  purchase_id     UUID NOT NULL REFERENCES purchases(id),
  purchase_item_id UUID REFERENCES purchase_items(id),
  imei            VARCHAR(20),
  unit_cost       NUMERIC(10,2) NOT NULL,    -- cost from purchase
  selling_price   NUMERIC(10,2),             -- optional preset selling price
  qty_purchased   INTEGER NOT NULL DEFAULT 1,
  qty_sold        INTEGER NOT NULL DEFAULT 0,
  qty_remaining   INTEGER GENERATED ALWAYS AS (qty_purchased - qty_sold) STORED,
  status          VARCHAR(20) NOT NULL DEFAULT 'in_stock'
                  CHECK (status IN ('in_stock', 'sold', 'reserved', 'returned', 'damaged')),
  location        VARCHAR(100) DEFAULT 'Main Store', -- shelf/location
  notes           TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. SUPPLIER LEDGER (auto-tracks all supplier transactions)
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_ledger (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  transaction_type VARCHAR(30) NOT NULL
                  CHECK (transaction_type IN ('purchase', 'payment', 'return', 'adjustment')),
  reference_id    UUID,                      -- purchase_id or payment_id
  reference_type  VARCHAR(30),               -- 'purchase', 'payment'
  amount          NUMERIC(12,2) NOT NULL,    -- positive = we owe more, negative = we paid
  balance_after   NUMERIC(12,2) NOT NULL,    -- running balance
  description     TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. SALES INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  VARCHAR(30) UNIQUE NOT NULL, -- INV-2024-001
  customer_id     UUID REFERENCES customers(id),
  user_id         UUID REFERENCES users(id),
  sale_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  tax_amount      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  amount_due      NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  payment_method  VARCHAR(30) DEFAULT 'cash'
                  CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'installment', 'mixed')),
  payment_status  VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                  CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. SALE ITEMS (line items on each invoice)
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id        UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  inventory_stock_id UUID REFERENCES inventory_stock(id), -- which stock line was sold
  imei              VARCHAR(20),
  qty               INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_cost         NUMERIC(10,2) NOT NULL,     -- our cost (for profit calc)
  unit_price        NUMERIC(10,2) NOT NULL,     -- selling price
  discount          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_price       NUMERIC(12,2) GENERATED ALWAYS AS (qty * unit_price - discount) STORED,
  profit            NUMERIC(12,2) GENERATED ALWAYS AS (qty * (unit_price - unit_cost) - discount) STORED,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category        VARCHAR(100) NOT NULL,    -- Rent, Utilities, Salary, etc.
  description     TEXT,
  amount          NUMERIC(10,2) NOT NULL,
  payment_method  VARCHAR(30) DEFAULT 'cash',
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_number  VARCHAR(100),
  user_id         UUID REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. CASH REGISTER (daily opening/closing + transactions)
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_register (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  register_date   DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  closing_balance NUMERIC(12,2),
  total_sales_cash NUMERIC(12,2) DEFAULT 0.00,
  total_expenses  NUMERIC(12,2) DEFAULT 0.00,
  total_payments  NUMERIC(12,2) DEFAULT 0.00,
  status          VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by       UUID REFERENCES users(id),
  closed_by       UUID REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. PAYMENT SCHEDULES (for installment sales)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES sales_invoices(id),
  customer_id     UUID REFERENCES customers(id),
  installment_no  INTEGER NOT NULL,
  due_date        DATE NOT NULL,
  amount_due      NUMERIC(10,2) NOT NULL,
  amount_paid     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  paid_date       DATE,
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES (for fast queries)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase ON inventory_stock(purchase_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_stock(status);
CREATE INDEX IF NOT EXISTS idx_inventory_imei ON inventory_stock(imei);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_invoice ON sale_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier ON supplier_ledger(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_invoices(sale_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','suppliers','customers','products','purchases','inventory_stock','sales_invoices','cash_register','payment_schedules']
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON %I;
      CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ', t, t);
  END LOOP;
END;
$$;

-- ============================================================
-- SEQUENCE HELPERS (for invoice/purchase numbering)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS purchase_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- ============================================================
-- SAMPLE DATA (optional - for testing)
-- ============================================================
-- Insert a default admin user (password: admin123 - change immediately!)
INSERT INTO users (name, email, password_hash, role)
VALUES ('Admin', 'admin@mobileshop.com', '$2b$10$placeholder_change_this', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Insert sample supplier
INSERT INTO suppliers (name, phone, city, country)
VALUES ('Dubai Mobile Wholesale', '+971-4-000-0000', 'Dubai', 'UAE')
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFICATION - Run after setup to confirm all tables created
-- ============================================================
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
