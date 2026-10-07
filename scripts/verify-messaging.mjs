import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { startBroker } from './messaging/broker.mjs';

const broker = await startBroker();
const data = mkdtempSync(resolve(tmpdir(), 'impact-g5-data-'));
let active;
let stopping = false;
const cleanup = async () => { await broker.close(); rmSync(data, { recursive: true, force: true }); };
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  if (active?.pid) { try { process.platform === 'win32' ? active.kill(signal) : process.kill(-active.pid, signal); } catch { /* Exited. */ } }
});
function run(args, extra = {}) {
  return new Promise((resolveRun, reject) => {
    active = spawn('pnpm', args, { stdio: 'inherit', detached: process.platform !== 'win32',
      env: { ...process.env, BROKER_URL: broker.url, G5_BROKER_CONTAINER: broker.name, DATA_DIR: data, BROKER_NAMESPACE: broker.name, CI: '1', ...extra } });
    active.once('error', reject);
    active.once('close', code => { active = undefined; code === 0 && !stopping ? resolveRun() : reject(new Error(`G5 verification exited ${code}`)); });
  });
}
try {
  await run(['exec', 'vitest', 'run', 'tests/messaging']);
  if (process.argv.includes('--compiled')) await run(['exec', 'vitest', 'run', 'tests/messaging'], { G5_COMPILED: '1' });
  await run(['test:e2e']);
  console.log('G5 real RabbitMQ: integration, failures/recovery and Chromium passed.');
} finally { await cleanup(); }