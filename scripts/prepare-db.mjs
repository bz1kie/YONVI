import pg from 'pg';
import { readFile } from 'node:fs/promises';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const path of ['packages/database/migrations/001_init.sql', 'packages/database/migrations/002_moderation_audit.sql', 'packages/database/migrations/003_max_sessions.sql', 'packages/database/migrations/004_listing_photos.sql', 'packages/database/migrations/005_max_channel_links.sql', 'packages/database/migrations/006_max_channel_posts.sql', 'packages/database/migrations/007_seller_contact.sql', 'packages/database/seeds/001_demo.sql']) {
    const sql = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    await pool.query(sql);
    console.log('Applied ' + path);
  }
} finally {
  await pool.end();
}
