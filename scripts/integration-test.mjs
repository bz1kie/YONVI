import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const origin = 'http://127.0.0.1:3001';
const server = spawn(process.execPath, ['apps/api/dist/server.js'], {
  stdio: 'pipe',
  env: { ...process.env, PORT: '3001', ALLOW_DEMO_AUTH: 'false' },
});
let errors = '';
server.stderr.on('data', chunk => { errors += chunk.toString(); });
async function request(path) {
  const r = await fetch(origin + path);
  return { status: r.status, body: await r.json() };
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Server exited early: ' + errors);
    try {
      const health = await request('/health');
      if (health.status === 200 && health.body.ok === true) { ready = true; break; }
    } catch { /* starting */ }
    await sleep(150);
  }
  assert.ok(ready, 'Health endpoint did not start: ' + errors);

  const catalog = await request('/api/listings');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.items.length, 2, 'Only approved active demo listings should be visible');
  assert.ok(catalog.body.items.every(x => x.title !== 'Проданный велосипед'));

  const sold = await request('/api/listings/33333333-3333-4333-8333-333333333333');
  assert.equal(sold.status, 404, 'Sold listing must not be publicly accessible');

  const invalid = await request('/api/listings/not-a-uuid');
  assert.equal(invalid.status, 400);

  const filter = await request('/api/listings?category=gaming');
  assert.equal(filter.status, 200);
  assert.equal(filter.body.items.length, 0);

  console.log('API + PostgreSQL integration passed: health, approved listings, sold hiding, validation, category filter');
} finally {
  server.kill('SIGTERM');
  await sleep(100);
}
