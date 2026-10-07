import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { startBroker, image as brokerImage } from './messaging/broker.mjs';
import { startCollector, image as collectorImage } from './observability/collector.mjs';
import { materializeInventory } from './inventory/materialize.mjs';
import { buildArchive, loadWorkspace } from './graph/snapshot';
import { readCollector, type ObservationDataset } from './graph/observations';
import { canonical, hash } from './graph/core';
import { SnapshotStore, WorkspaceSnapshots } from './graph/store';
import { createDemoApi } from '../apps/demo/server';
import { analyzeOverlay } from './graph/analyze';

const report = resolve('.impact-runs', `g7-${randomUUID()}`);
mkdirSync(report, { recursive: true });
const logs = new Map<string, string>();
const children: ChildProcess[] = [];
let broker: Awaited<ReturnType<typeof startBroker>> | undefined;
let collector: Awaited<ReturnType<typeof startCollector>> | undefined;
let inventory: ReturnType<typeof materializeInventory> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let api: ReturnType<typeof createDemoApi> | undefined;
async function until<T>(probe: () => Promise<T> | T, test: (value: T) => boolean, timeout = 30_000): Promise<T> {
  const deadline = Date.now() + timeout;
  let last: unknown;
  while (true) {
    try { const value = await probe(); if (test(value)) return value; } catch (error) { last = error; }
    if (Date.now() > deadline) throw new Error(`G7 condition timed out: ${String(last ?? 'condition not met')}`);
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
}
async function health(url: string) { return until(async () => (await fetch(url, { signal: AbortSignal.timeout(700) })).ok, Boolean); }
function child(name: string, args: string[], env: NodeJS.ProcessEnv) {
  const processChild = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  processChild.on('error', error => logs.set(name, `${logs.get(name) ?? ''}\n${String(error)}`));
  for (const stream of [processChild.stdout, processChild.stderr]) stream!.on('data', data => logs.set(name, `${logs.get(name) ?? ''}${data}`));
  children.push(processChild); return processChild;
}
async function stopChild(processChild: ChildProcess) {
  if (processChild.exitCode !== null || processChild.signalCode !== null) return;
  const done = once(processChild, 'exit'); processChild.kill('SIGTERM');
  const timer = setTimeout(() => processChild.kill('SIGKILL'), 10_000);
  try { await done; } finally { clearTimeout(timer); }
}
try {
  const reservations = await Promise.all(Array.from({ length: 6 }, async () => { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server; }));
  const ports = reservations.map(server => (server.address() as { port: number }).port);
  await Promise.all(reservations.map(server => new Promise<void>(resolveClose => server.close(() => resolveClose()))));
  broker = await startBroker(); collector = await startCollector(resolve(report, 'collector')); inventory = materializeInventory();
  const input = loadWorkspace(process.cwd(), inventory.root), baseline = buildArchive(input);
  const revision = baseline.graph.repositories[0]!.revision;
  const env = { ...process.env, BROKER_URL: broker.url, BROKER_NAMESPACE: broker.name, DATA_DIR: resolve(report, 'data'), INVENTORY_ROOT: inventory.root,
    BACKEND_PORT: String(ports[0]), INVENTORY_PORT: String(ports[1]), FRONTEND_PORT: String(ports[2]), NOTIFICATIONS_PORT: String(ports[3]), PREPARATION_PORT: String(ports[4]),
    NOTIFICATIONS_URL: `http://127.0.0.1:${ports[3]}`, PREPARATION_URL: `http://127.0.0.1:${ports[4]}`, CONSUMER_FAIL_FIRST: '1',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: collector.endpoint, OTEL_CODE_REVISION: revision, VITE_OTEL_CODE_REVISION: revision };
  child('inventory', ['--experimental-strip-types', 'scripts/inventory/serve.mjs'], env);
  child('notifications', ['--import', 'tsx', 'apps/notifications/src/main.ts'], { ...env, CONSUMER_PORT: String(ports[3]) });
  child('preparation', ['--import', 'tsx', 'apps/preparation/src/main.ts'], { ...env, CONSUMER_PORT: String(ports[4]), CONSUMER_FAIL_FIRST: '0' });
  let backend = child('backend', ['--import', 'tsx', 'apps/backend/src/main.ts'], env);
  child('frontend', ['node_modules/vite/bin/vite.js', '--config', 'apps/frontend/vite.config.ts', 'apps/frontend'], env);
  await Promise.all([health(`http://127.0.0.1:${ports[0]}/health`), health(`http://127.0.0.1:${ports[1]}/health`), health(`http://127.0.0.1:${ports[2]}`),
    until(async () => (await fetch(`${env.NOTIFICATIONS_URL}/health`)).json() as Promise<{ brokerReady: boolean }>, value => value.brokerReady),
    until(async () => (await fetch(`${env.PREPARATION_URL}/health`)).json() as Promise<{ brokerReady: boolean }>, value => value.brokerReady)]);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(`http://127.0.0.1:${ports[2]}/orders`);
  const placed = page.waitForResponse(response => response.url().endsWith('/api/orders') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  const order = await (await placed).json() as { id: string };
  await page.getByRole('heading', { name: 'Order accepted' }).waitFor();
  async function effects(id: string) { return until(async () => (await fetch(`http://127.0.0.1:${ports[0]}/orders/${id}/progress`)).json() as Promise<{ preparation: { status: string }; notifications: { status: string } }>, value => value.preparation?.status === 'ready' && value.notifications?.status === 'stored'); }
  await effects(order.id);
  function recorded(): ObservationDataset { return existsSync(collector!.path) ? readCollector(readFileSync(collector!.path, 'utf8').split('\n').slice(0, -1).join('\n')) : { schemaVersion: 1, spans: [] }; }
  const data = await until(recorded, data => ['screen.place-order', 'http.orders', 'http.inventory', 'outbox.save', 'outbox.publish', 'messaging.retry'].every(name => data.spans.some(span => span.name === name))
    && data.spans.filter(span => span.name === 'messaging.process').length >= 3);
  const screen = data.spans.find(span => span.name === 'screen.place-order')!;
  const journey = data.spans.filter(span => span.traceId === screen.traceId);
  assert.equal(journey.length, data.spans.length, 'Every first-order span has propagated screen trace identity');
  const ids = new Set(journey.map(span => span.spanId));
  assert(journey.filter(span => span !== screen).every(span => ids.has(span.parentSpanId)), 'Every child points to a recorded parent');
  const publish = journey.find(span => span.name === 'outbox.publish')!;
  assert(journey.some(span => span.service === 'notifications' && span.name === 'messaging.process' && span.parentSpanId === publish.spanId));
  assert(journey.some(span => span.service === 'preparation' && span.name === 'messaging.process' && span.parentSpanId === publish.spanId));
  const retried = journey.find(span => span.name === 'messaging.process' && span.service === 'notifications' && span.attributes['messaging.delivery.attempt'] === 2)!;
  assert(retried.links.some(link => link.spanId === publish.spanId));
  assert(journey.some(span => span.name === 'messaging.process' && span.status.code === 2));
  console.log(`G7 propagated trace verified: ${journey.length} spans, both consumers and retry. Checking archive and browser inspector.`);
  const pinned = buildArchive({ ...input, observationDataset: data });
  assert.deepEqual(pinned.graph.edges, baseline.graph.edges);
  assert(pinned.graph.observations.every(item => item.correlation.status === 'resolved'), 'Exact source identities resolve');
  const attempts = pinned.graph.observations.filter(item => item.span?.name === 'messaging.process' && item.serviceId === 'notifications');
  assert(attempts[0]!.correlation.edgeIds.length > 0);
  assert.deepEqual(attempts[0]!.correlation.edgeIds, attempts[1]!.correlation.edgeIds);
  assert(pinned.graph.observations.find(item => item.span?.name === 'outbox.publish')!.correlation.edgeIds.length > 0);
  const incompatibleData = structuredClone(data); incompatibleData.spans[0]!.version = '2';
  assert(buildArchive({ ...input, observationDataset: incompatibleData }).graph.observations.some(item => item.correlation.status === 'pending'));
  const store = new SnapshotStore(resolve(report, 'snapshots')); store.publish(pinned);
  assert.equal(store.read(pinned.graph.id).graph.id, pinned.graph.id);
  assert.equal(buildArchive({ ...input, observationDataset: data }).graph.id, pinned.graph.id);
  const edit = [{ path: 'apps/notifications/src/main.ts', content: `${input.sources['apps/notifications/src/main.ts']}\n// verify static selection` }];
  assert.deepEqual(analyzeOverlay(pinned, edit).federated.suites, analyzeOverlay(baseline, edit).federated.suites);
  // Verify the web can navigate observation -> exact archived code, desktop and narrow screen.
  const workspace = new WorkspaceSnapshots(process.cwd(), store, () => ({ ...input, observationDataset: data }));
  api = createDemoApi(undefined, workspace); api.listen(0, '127.0.0.1'); await once(api, 'listening');
  const apiPort = (api.address() as { port: number }).port;
  child('demo', ['node_modules/vite/bin/vite.js', '--config', 'apps/demo/vite.config.ts', 'apps/demo'], { ...env, DEMO_PORT: String(ports[5]), DEMO_API_PORT: String(apiPort) });
  await health(`http://127.0.0.1:${ports[5]}`);
  await page.goto(`http://127.0.0.1:${ports[5]}`);
  await page.getByRole('button', { name: 'IMPACT GRAPH', exact: true }).click();
  await page.getByRole('heading', { name: 'Observed traces', exact: true }).waitFor();
  await page.getByText(/orders-screen · screen.place-order/).click();
  await page.getByRole('button', { name: /INSPECT ARCHIVED CODE · OrdersPage/ }).click();
  await page.getByRole('button', { name: /apps\/frontend\/src\/OrdersPage.tsx.*OPEN ARCHIVED CODE/ }).click();
  await page.getByRole('region', { name: 'Archived apps/frontend/src/OrdersPage.tsx source' }).waitFor();
  await page.screenshot({ path: resolve(report, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(report, 'narrow.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false, 'No narrow-screen horizontal overflow');
  // Observability outage/restart must not prevent orders/effects. Test with Collector stopped.
  await collector.stop();
  const duringOutage = await fetch(`http://127.0.0.1:${ports[0]}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'demo-widget', quantity: 1 }) });
  assert.equal(duringOutage.status, 201); await effects((await duringOutage.json() as { id: string }).id);
  await collector.restart();
  const afterRestart = await fetch(`http://127.0.0.1:${ports[0]}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'demo-widget', quantity: 1 }) });
  assert.equal(afterRestart.status, 201); const third = await afterRestart.json() as { id: string }; await effects(third.id);
  await until(recorded, data => data.spans.some(span => span.name === 'outbox.publish' && span.attributes['order.id'] === third.id));
  // Restart producer with telemetry disabled; basic flow still works and no SDK is needed.
  await stopChild(backend);
  backend = child('backend-no-telemetry', ['--import', 'tsx', 'apps/backend/src/main.ts'], { ...env, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '' });
  await health(`http://127.0.0.1:${ports[0]}/health`);
  const disabled = await fetch(`http://127.0.0.1:${ports[0]}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'demo-widget', quantity: 1 }) });
  assert.equal(disabled.status, 201); await effects((await disabled.json() as { id: string }).id);
  writeFileSync(resolve(report, 'dataset.json'), `${canonical(data)}\n`);
  writeFileSync(resolve(report, 'summary.json'), JSON.stringify({ phase: 'G7', snapshot: pinned.graph.id, datasetHash: hash(data), revision, traceId: screen.traceId, spans: journey.length,
    services: [...new Set(journey.map(span => span.service))], retryObserved: true, staticEdgesPreserved: true, incompatibleVersionPending: true, collectorOutageAndRestart: true,
    disabledTelemetry: true, archivedNavigation: true, desktopAndNarrow: true, brokerImage, collectorImage, ownedContainers: [broker.name, collector.name] }, null, 2));
  console.log(`G7 real browser/HTTP/outbox/RabbitMQ/consumers trace, retry, restart and archived navigation passed: ${report}`);
} finally {
  await browser?.close();
  api?.closeAllConnections(); if (api) await new Promise<void>(resolveClose => api!.close(() => resolveClose()));
  await Promise.all(children.map(stopChild));
  await collector?.close(); await broker?.close();
  for (const [name, log] of logs) writeFileSync(resolve(report, `${name}.log`), log);
  if (inventory) rmSync(inventory.root, { recursive: true, force: true });
}
