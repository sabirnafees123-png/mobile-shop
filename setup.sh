#!/bin/bash
# ============================================================
# MOBILE SHOP - ONE-TIME SETUP SCRIPT
# Run this from inside the mobile-shop/ folder:
#   bash setup.sh
# ============================================================

set -e  # Stop on any error

echo ""
echo "============================================"
echo "  Mobile Shop Setup Script"
echo "  Sharjah Used Mobile Management System"
echo "============================================"
echo ""

# ── STEP 1: Check Node.js ──────────────────────
echo "▶ Checking Node.js..."
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found! Install from https://nodejs.org (LTS version)"
  exit 1
fi
echo "✅ Node.js $(node -v) found"

# ── STEP 2: Check Git ─────────────────────────
echo "▶ Checking Git..."
if ! command -v git &> /dev/null; then
  echo "❌ Git not found! Install from https://git-scm.com"
  exit 1
fi
echo "✅ Git $(git --version | cut -d' ' -f3) found"

# ── STEP 3: Install Vercel CLI ────────────────
echo ""
echo "▶ Installing Vercel CLI globally..."
npm install -g vercel
echo "✅ Vercel CLI installed"

# ── STEP 4: Install Backend packages ──────────
echo ""
echo "▶ Installing backend dependencies..."
cd backend
npm install
echo "✅ Backend packages installed"

# ── STEP 5: Create backend .env ───────────────
if [ ! -f .env ]; then
  echo ""
  echo "▶ Creating backend .env file..."
  cp .env.example .env
  echo "✅ .env created — IMPORTANT: Edit backend/.env with your Supabase credentials!"
else
  echo "ℹ️  backend/.env already exists — skipping"
fi

cd ..

# ── STEP 6: Install Frontend packages ─────────
echo ""
echo "▶ Installing frontend dependencies..."
cd frontend
npm install
echo "✅ Frontend packages installed"

# ── STEP 7: Create frontend .env ──────────────
if [ ! -f .env ]; then
  echo ""
  echo "▶ Creating frontend .env..."
  cp .env.example .env
  echo "✅ frontend/.env created"
else
  echo "ℹ️  frontend/.env already exists — skipping"
fi

cd ..

# ── DONE ──────────────────────────────────────
echo ""
echo "============================================"
echo "  ✅ SETUP COMPLETE!"
echo "============================================"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Edit backend/.env → add your Supabase DATABASE_URL"
echo "  2. Run the SQL in Supabase SQL Editor:"
echo "     → backend/sql/001_create_tables.sql"
echo "  3. Test your DB connection:"
echo "     → cd backend && node src/config/testConnection.js"
echo "  4. Start backend dev server:"
echo "     → cd backend && npm run dev"
echo "  5. Start frontend (new terminal):"
echo "     → cd frontend && npm start"
echo ""
echo "  Backend runs on: http://localhost:5000"
echo "  Frontend runs on: http://localhost:3000"
echo ""
