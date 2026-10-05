import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { materializeInventory } from './inventory/materialize.mjs';

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to allocate test port');
  return { port: String(address.port), close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

// Hold both reservations until allocated; no shared server is reused.
const reservations = await Promise.all(Array.from({ length: 5 }, () => reservePort()));
const data = mkdtempSync(resolve(tmpdir(), 'impact-e2e-data-'));
const temporary = !process.env.INVENTORY_ROOT;
const root = temporary ? materializeInventory().root : process.env.INVENTORY_ROOT;
const env = { ...process.env, INVENTORY_ROOT: root, BACKEND_PORT: process.env.BACKEND_PORT ?? reservations[0].port,
  FRONTEND_PORT: process.env.FRONTEND_PORT ?? reservations[1].port, INVENTORY_PORT: process.env.INVENTORY_PORT ?? reservations[2].port,
  NOTIFICATIONS_PORT: reservations[3].port, PREPARATION_PORT: reservations[4].port,
  NOTIFICATIONS_URL: `http://127.0.0.1:${reservations[3].port}`, PREPARATION_URL: `http://127.0.0.1:${reservations[4].port}`,
  BROKER_NAMESPACE: `e2e-${randomUUID()}`, DATA_DIR: data };
await Promise.all(reservations.map(reservation => reservation.close()));
const child = spawn('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], { env, stdio: 'inherit', detached: process.platform !== 'win32' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.pid) return;
    try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); } catch { /* Already exited. */ }
  });
}
let spawnFailed = false;
child.on('error', error => { console.error(error); spawnFailed = true; process.exitCode = 1; });
child.on('close', code => { if (temporary) rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); process.exitCode = spawnFailed ? 1 : code ?? 1; });
