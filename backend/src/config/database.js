// src/config/database.js
// Connects to Supabase PostgreSQL using the pg library

const { Pool } = require('pg');
require('dotenv').config();

// Supabase requires SSL in production
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // ✅ force SSL
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Log when pool connects
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ Connected to Supabase PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
  process.exit(-1);
});

// Helper: run a query
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DB] query executed in ${duration}ms | rows: ${result.rowCount}`);
    }
    return result;
  } catch (error) {
    console.error('[DB] Query Error:', error.message);
    throw error;
  }
};

// Helper: get a client for transactions
const getClient = async () => {
  return await pool.connect();
};

module.exports = { pool, query, getClient };
