const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'https://mobile-shop-ttur.vercel.app',
    'https://frontend-chi-jet-38.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Auth routes (PUBLIC — no protect middleware here) ───────────────────────
const authRoutes = require('./routes/authRoutes');
app.use('/api/v1/auth', authRoutes);

// ─── Protected middleware (ALL routes below require valid JWT) ────────────────
const { protect } = require('./middleware/authMiddleware');
app.use('/api/v1', protect);

// ─── All protected routes ────────────────────────────────────────────────────
const dashboardRoutes = require('./routes/dashboard');
const productRoutes   = require('./routes/products');
const inventoryRoutes = require('./routes/inventory');
const purchaseRoutes  = require('./routes/purchases');
const salesRoutes     = require('./routes/sales');
const supplierRoutes  = require('./routes/suppliers');
const customerRoutes  = require('./routes/customers');
const expenseRoutes   = require('./routes/expenses');

app.use('/api/v1/dashboard',  dashboardRoutes);
app.use('/api/v1/products',   productRoutes);
app.use('/api/v1/inventory',  inventoryRoutes);
app.use('/api/v1/purchases',  purchaseRoutes);
app.use('/api/v1/sales',      salesRoutes);
app.use('/api/v1/suppliers',  supplierRoutes);
app.use('/api/v1/customers',  customerRoutes);
app.use('/api/v1/expenses',   expenseRoutes);

// ─── Health check (public) ───────────────────────────────────────────────────
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