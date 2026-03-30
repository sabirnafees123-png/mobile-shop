// src/config/testConnection.js
require('dotenv').config();
const { pool } = require('./database'); // Make sure database.js exports pool directly

async function testConnection() {
  console.log('\n🔍 Testing Supabase connection...');
  console.log('📍 Host:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'Not set');

  try {
    const client = await pool.connect();

    // Basic connection test
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('\n✅ CONNECTION SUCCESSFUL!');
    console.log('🕐 Server time:', result.rows[0].current_time);
    console.log('🐘 PostgreSQL:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);

    // Check if tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    if (tablesResult.rows.length === 0) {
      console.log('\n⚠️  No tables found yet. Run the SQL setup script in Supabase first!');
    } else {
      console.log(`\n📋 Tables found (${tablesResult.rows.length}):`);
      tablesResult.rows.forEach(row => console.log('   ✓', row.table_name));
    }

    client.release();
    console.log('\n🎉 Database connection test complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ CONNECTION FAILED!');
    console.error('Error:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check your DATABASE_URL in .env file');
    console.error('   2. Make sure your Supabase project is active');
    console.error('   3. Check your password is correct (special chars must be URL encoded)');
    console.error('   4. Make sure NODE_ENV=development/production matches your SSL requirement\n');
    process.exit(1);
  }
}

testConnection();