import pg from 'pg';
import { readFile } from 'node:fs/promises';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const path of ['packages/database/migrations/001_init.sql', 'packages/database/seeds/001_demo.sql']) {
    const sql = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    await pool.query(sql);
    console.log('Applied ' + path);
  }
} finally {
  await pool.end();
}
