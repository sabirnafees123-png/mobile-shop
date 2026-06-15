// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  statement_timeout: 55000,      // kill any single query taking > 55s
});

pool.on('error', (err) => {
  // Log but don't exit — Vercel serverless must not call process.exit
  console.error('❌ DB pool error:', err.message);
});

const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('[DB] Query Error:', error.message);
    throw error;
  }
};

const getClient = async () => {
  return await pool.connect();
};

module.exports = { pool, query, getClient };
