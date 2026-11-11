import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const migrations = ['001_init.sql', '002_moderation_audit.sql', '003_max_sessions.sql', '004_listing_photos.sql', '005_max_channel_links.sql', '006_max_channel_posts.sql'];
if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error('DATABASE_URL or PGHOST must be configured');

const client = new pg.Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
await client.connect();
let locked = false;
try {
  await client.query('SELECT pg_advisory_lock(94213591)');
  locked = true;
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const version of migrations) {
    const sql = await readFile(new URL('../packages/database/migrations/' + version, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [version]);
    if (previous.rowCount) {
      if (previous.rows[0].checksum !== checksum) throw new Error('An applied migration has changed: ' + version);
      console.log('Already applied: ' + version);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [version, checksum]);
      await client.query('COMMIT');
      console.log('Applied: ' + version);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('Migration finished without loading demo data.');
} finally {
  if (locked) {
    try { await client.query('SELECT pg_advisory_unlock(94213591)'); } catch {}
  }
  await client.end();
}
