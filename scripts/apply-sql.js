/**
 * Apply a .sql file against Postgres using .env credentials.
 * Usage: node scripts/apply-sql.js scripts/add-notification-prefs.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/apply-sql.js <path-to.sql>');
    process.exit(1);
  }
  const abs = path.resolve(file);
  const sql = fs.readFileSync(abs, 'utf8');

  const ssl =
    process.env.DB_SSL === 'true' ||
    (process.env.DB_HOST || '').includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined;

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Applied', abs);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
