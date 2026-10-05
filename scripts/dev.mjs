import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { materializeInventory } from './inventory/materialize.mjs';

const temporary = !process.env.INVENTORY_ROOT;
const inventoryRoot = temporary ? materializeInventory().root : process.env.INVENTORY_ROOT;
const services = ['dev:inventory', 'dev:backend', 'dev:frontend', 'dev:demo-api', 'dev:demo', ...(process.env.BROKER_URL ? ['dev:notifications', 'dev:preparation'] : [])];
const children = services.map(script => spawn('pnpm', [script], {
  stdio: 'inherit', detached: process.platform !== 'win32', env: { ...process.env, INVENTORY_ROOT: inventoryRoot,
    ...(script === 'dev:notifications' ? { CONSUMER_PORT: process.env.NOTIFICATIONS_PORT ?? '3004' } : {}),
    ...(script === 'dev:preparation' ? { CONSUMER_PORT: process.env.PREPARATION_PORT ?? '3005' } : {}) },
}));
let stopping = false;
const exited = new Set();
function cleanup() {
  if (temporary && exited.size === children.length) rmSync(inventoryRoot, { recursive: true, force: true });
}
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  }
  cleanup();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', error => { console.error(error); exited.add(child); stop(1); cleanup(); });
  child.on('exit', code => { exited.add(child); stop(code ?? 1); cleanup(); });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
