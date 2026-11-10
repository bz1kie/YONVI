import { spawn } from 'node:child_process';
const origin = process.env.RENDER_EXTERNAL_URL || process.env.WEB_ORIGIN;
if (!origin || !origin.startsWith('https://')) throw new Error('HTTPS WEB_ORIGIN is required');
const migration = spawn(process.execPath, ['scripts/migrate-db.mjs'], { stdio: 'inherit' });
const migrated = await new Promise(resolve => { migration.on('exit', resolve); migration.on('error', () => resolve(1)); });
if (migrated !== 0) process.exit(1);
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
  setTimeout(() => { children.forEach(child => child.kill('SIGKILL')); process.exit(code); }, 5000).unref();
  Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve)))).then(() => process.exit(code));
}
children.push(spawn(process.execPath, ['apps/api/dist/server.js'], { stdio: 'inherit', env: { ...process.env, PORT: '3001', WEB_ORIGIN: origin } }));
children.push(spawn('caddy', ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], { stdio: 'inherit' }));
children.forEach(child => { child.on('error', () => stop(1)); child.on('exit', () => stop(1)); });
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
