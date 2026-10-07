import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readState } from './lifecycle.mjs';
import { SnapshotStore, WorkspaceSnapshots } from '../graph/store';
import { createDemoApi } from '../../apps/demo/server';

const id = process.argv[2];
if (!id) throw new Error('Usage: pnpm mesh:inspect <owned profile ID>');
const state = readState(id);
const summary = JSON.parse(readFileSync(resolve(state.directory, 'summary.json'), 'utf8'));
const store = new SnapshotStore(resolve(state.directory, 'snapshots'));
const archive = store.read(summary.snapshotId);
// Replay captured bytes, including the independent provider, after cluster/source cleanup.
const workspace = new WorkspaceSnapshots(process.cwd(), store, () => archive);
assert.equal(workspace.current.graph.id, archive.graph.id, 'Extractor version changed; use the archived JSON directly');
const api = createDemoApi(undefined, workspace); api.listen(0, '127.0.0.1'); await once(api, 'listening');
const apiPort = (api.address() as { port: number }).port;
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const demoPort = (reservation.address() as { port: number }).port; await new Promise<void>(done => reservation.close(() => done()));
const demo = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/demo/vite.config.ts', 'apps/demo'], {
  env: { ...process.env, DEMO_PORT: String(demoPort), DEMO_API_PORT: String(apiPort) }, stdio: ['ignore', 'inherit', 'inherit'],
});
console.log(`Archived mesh inspector: http://127.0.0.1:${demoPort} → IMPACT GRAPH → Service mesh\nSnapshot ${archive.graph.id}; Ctrl+C closes only these servers.`);
let closing = false;
async function close() {
  if (closing) return; closing = true;
  if (demo.exitCode === null) { const done = once(demo, 'exit'); demo.kill('SIGTERM'); await done; }
  api.closeAllConnections(); await new Promise<void>(done => api.close(() => done()));
}
demo.once('error', error => { console.error(error); void close(); });
demo.once('exit', () => { void close(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void close(); });
