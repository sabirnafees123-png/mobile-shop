const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: false
}));
app.use(cors({
  origin: [
  'https://mobile-shop-snowy.vercel.app',   // ← your real frontend
  'https://mobile-shop-ttur.vercel.app',
  'https://frontend-chi-jet-38.vercel.app',
  'http://localhost:3000'
],

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors({
  origin: [
  'https://mobile-shop-snowy.vercel.app',   // ← your real frontend
  'https://mobile-shop-ttur.vercel.app',
  'https://frontend-chi-jet-38.vercel.app',
  'http://localhost:3000'
],

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Ensure runtime tables exist ─────────────────────────────────────────────
const { query: dbQuery } = require('./config/database');
dbQuery(`
  CREATE TABLE IF NOT EXISTS cash_manual_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id INTEGER REFERENCES shops(id),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type VARCHAR(3) NOT NULL CHECK (entry_type IN ('in','out')),
    amount NUMERIC(12,2) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('Migration error:', err.message));

// ─── Auth routes (PUBLIC) ────────────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
app.use('/api/v1/auth', authRoutes);

// ─── Protected middleware ────────────────────────────────────────────────────
const { protect } = require('./middleware/authMiddleware');
app.use('/api/v1', protect);

// ─── All protected routes ────────────────────────────────────────────────────
const dashboardRoutes    = require('./routes/dashboard');
const productRoutes      = require('./routes/products');
const inventoryRoutes    = require('./routes/inventory');
const purchaseRoutes     = require('./routes/purchases');
const salesRoutes        = require('./routes/sales');
const supplierRoutes     = require('./routes/suppliers');
const customerRoutes     = require('./routes/customers');
const expenseRoutes      = require('./routes/expenses');
const chequeRoutes       = require('./routes/cheques');
const reportRoutes       = require('./routes/reports');
const cashRegisterRoutes = require('./routes/cashRegister');
const shopRoutes         = require('./routes/shops');
const obligationRoutes   = require('./routes/obligations');
const attendanceRoutes   = require('./routes/attendance');
const stockCountRoutes   = require('./routes/stockCount');

app.use('/api/v1/dashboard',      dashboardRoutes);
app.use('/api/v1/products',       productRoutes);
app.use('/api/v1/inventory',      inventoryRoutes);
app.use('/api/v1/purchases',      purchaseRoutes);
app.use('/api/v1/sales',          salesRoutes);
app.use('/api/v1/suppliers',      supplierRoutes);
app.use('/api/v1/customers',      customerRoutes);
app.use('/api/v1/expenses',       expenseRoutes);
app.use('/api/v1/cheques',        chequeRoutes);
app.use('/api/v1/reports',        reportRoutes);
app.use('/api/v1/cash-register',  cashRegisterRoutes);
app.use('/api/v1/shops',          shopRoutes);
app.use('/api/v1/obligations',    obligationRoutes);
app.use('/api/v1/attendance',     attendanceRoutes);
app.use('/api/v1/stock-count',    stockCountRoutes);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
