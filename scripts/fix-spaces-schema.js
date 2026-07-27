/**
 * One-shot DB fix when TypeORM synchronize fails on spaces.slug
 * (varchar widen / NOT NULL with existing rows).
 *
 * Usage: node scripts/fix-spaces-schema.js
 */
require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');

async function main() {
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

  const q = async (sql) => {
    await client.query(sql);
    console.log('OK:', sql.slice(0, 100).replace(/\s+/g, ' '));
  };

  await q(
    'ALTER TABLE spaces ALTER COLUMN slug TYPE character varying(160)',
  ).catch(async (e) => {
    console.log('slug type:', e.message);
  });

  const nulls = await client.query(
    "SELECT id, title FROM spaces WHERE slug IS NULL OR btrim(slug) = ''",
  );
  for (const row of nulls.rows) {
    const base =
      String(row.title || 'space')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'space';
    const slug = `${base}-${crypto.randomUUID()}`;
    await client.query('UPDATE spaces SET slug = $1 WHERE id = $2', [
      slug,
      row.id,
    ]);
    console.log('filled slug', row.id, slug);
  }

  await q('ALTER TABLE spaces ALTER COLUMN slug SET NOT NULL');
  await q(
    'ALTER TABLE spaces ADD COLUMN IF NOT EXISTS star_count integer NOT NULL DEFAULT 0',
  );
  await q(
    'ALTER TABLE spaces ADD COLUMN IF NOT EXISTS fork_count integer NOT NULL DEFAULT 0',
  );
  await q(
    'ALTER TABLE spaces ADD COLUMN IF NOT EXISTS parent_space_id uuid',
  );
  await q(
    "UPDATE spaces SET visibility = 'public' WHERE visibility IN ('draft', 'unlisted') OR visibility IS NULL",
  );
  await q(
    "ALTER TABLE spaces ALTER COLUMN visibility SET DEFAULT 'public'",
  );

  await q(`CREATE TABLE IF NOT EXISTS space_stars (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(space_id, user_id)
  )`);

  await q(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS username character varying(32)',
  );
  await q(
    'ALTER TABLE user_privacy ADD COLUMN IF NOT EXISTS profile_public boolean NOT NULL DEFAULT true',
  );

  await client.end();
  console.log('Schema fix complete — restart the Nest server.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
