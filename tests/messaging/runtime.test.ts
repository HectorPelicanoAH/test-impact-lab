import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { OrderStore } from '../../apps/backend/src/orders/OrderStore';
import { flushOutbox } from '../../apps/backend/src/orders/OutboxPublisher';
import { closeBroker, confirmed, declareTopology, openBroker, topology } from '../../packages/messaging/src/transport';

const enabled = Boolean(process.env.BROKER_URL && process.env.G5_BROKER_CONTAINER);
const brokerTest = test.skipIf(!enabled);
const url = process.env.BROKER_URL ?? '';
const namespace = `g5-${randomUUID()}`;
const entry = (name: string) => process.env.G5_COMPILED === '1' ? [`apps/${name}/dist/main.js`] : ['--import', 'tsx', `apps/${name}/src/main.ts`];
let data: string, external: string;
const children: ChildProcess[] = [];
let notifications: string, preparation: string, backend: string;
async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function service(args: string[], port: number, extra: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, args, { env: { ...process.env, BROKER_NAMESPACE: namespace, DATA_DIR: data, CONSUMER_PORT: String(port), ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  child.stdout!.on('data', chunk => { output += chunk; }); child.stderr!.on('data', chunk => { output += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  await vi.waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Service exited: ${output}`);
    expect(await fetch(`${origin}/health`).then(response => response.ok).catch(() => false)).toBe(true);
  }, { timeout: 12_000, interval: 100 });
  return origin;
}
async function health(origin: string) { return await fetch(`${origin}/health`).then(response => response.json()) as { effects: number; duplicates: number; failed: number; attempts: number; brokerReady: boolean }; }
async function hasEffect(origin: string, id: string) { return (await fetch(`${origin}/orders/${id}`)).status === 200; }
beforeAll(async () => {
  if (!enabled) return;
  data = mkdtempSync(resolve(tmpdir(), 'impact-g5-runtime-'));
  external = (JSON.parse(execFileSync(process.execPath, ['scripts/inventory/materialize.mjs'], { encoding: 'utf8' })) as { root: string }).root;
  const inventoryPort = await freePort();
  await service(['--experimental-strip-types', resolve(external, 'src/main.ts')], inventoryPort, { INVENTORY_PORT: String(inventoryPort) });
  notifications = await service(entry('notifications'), await freePort(), { CONSUMER_FAIL_FIRST: '1', CONSUMER_FAIL_SKU: 'failure-widget' });
  preparation = await service(entry('preparation'), await freePort());
  const backendPort = await freePort();
  backend = await service(entry('backend'), backendPort, { BACKEND_PORT: String(backendPort), INVENTORY_PORT: String(inventoryPort), NOTIFICATIONS_URL: notifications, PREPARATION_URL: preparation });
  await vi.waitFor(async () => { expect((await health(notifications)).brokerReady && (await health(preparation)).brokerReady).toBe(true); }, { timeout: 15_000 });
}, 30_000);
afterAll(async () => {
  await Promise.all(children.map(child => new Promise<void>(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    const timer = setTimeout(() => child.kill('SIGKILL'), 7_000);
    child.once('close', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM');
  })));
  if (data) rmSync(data, { recursive: true, force: true });
  if (external) rmSync(external, { recursive: true, force: true });
}, 15_000);

brokerTest('real order reaches both isolated consumers; transient failure retries without blocking preparation', async () => {
  const response = await fetch(`${backend}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'demo-widget', quantity: 1 }) });
  expect(response.status).toBe(201);
  const order = await response.json() as { id: string };
  await expect.poll(() => hasEffect(preparation, order.id), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => hasEffect(notifications, order.id), { timeout: 15_000 }).toBe(true);
  expect((await health(notifications)).attempts).toBeGreaterThanOrEqual(2);
  const progress = await fetch(`${backend}/orders/${order.id}/progress`).then(response => response.json());
  expect(progress).toMatchObject({ mode: 'events', preparation: { status: 'ready' }, notifications: { status: 'stored', delivery: 'local-mailbox-only' } });
}, 30_000);

brokerTest('duplicate publication has one durable effect in each consumer', async () => {
  const store = new OrderStore();
  const event = store.save({ id: randomUUID(), sku: 'demo-widget', quantity: 1, status: 'accepted' });
  try {
    await flushOutbox(store, url, namespace);
    await expect.poll(() => hasEffect(notifications, event.order.id), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => hasEffect(preparation, event.order.id), { timeout: 15_000 }).toBe(true);
    const before = [await health(notifications), await health(preparation)];
    const connection = await openBroker(url);
    try {
      const channel = await connection.createConfirmChannel();
      const layout = topology(namespace);
      await confirmed(channel, layout.exchange, layout.routingKey, Buffer.from(JSON.stringify(event)), { messageId: event.eventId, correlationId: event.correlationId });
    } finally { await closeBroker(connection); }
    for (const [index, origin] of [notifications, preparation].entries()) {
      await expect.poll(async () => (await health(origin)).duplicates, { timeout: 15_000 }).toBe(before[index]!.duplicates + 1);
      expect((await health(origin)).effects).toBe(before[index]!.effects);
    }
  } finally { store.close(); }
}, 30_000);

brokerTest('permanent failure reaches that consumer failed queue after three attempts; other consumer succeeds', async () => {
  const store = new OrderStore();
  const event = store.save({ id: randomUUID(), sku: 'failure-widget', quantity: 1, status: 'accepted' });
  const initial = await health(notifications);
  try {
    await flushOutbox(store, url, namespace);
    await expect.poll(() => hasEffect(preparation, event.order.id), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await health(notifications)).failed, { timeout: 15_000 }).toBe(initial.failed + 1);
    expect((await health(notifications)).attempts - initial.attempts).toBe(3);
    expect(await hasEffect(notifications, event.order.id)).toBe(false);
    const connection = await openBroker(url);
    try {
      const channel = await connection.createConfirmChannel();
      const message = await channel.get(topology(namespace).subscriptions.find(item => item.id === 'notifications')!.failedQueue);
      expect(message).not.toBe(false);
      if (message) { expect(message.properties.messageId).toBe(event.eventId); expect(message.properties.headers?.['x-attempt']).toBe(3); channel.ack(message); }
    } finally { await closeBroker(connection); }
  } finally { store.close(); }
}, 30_000);

brokerTest('broker outage keeps a persisted outbox row; publisher recovers after broker restarts', async () => {
  const container = process.env.G5_BROKER_CONTAINER!;
  if (!/^impact-g5-[a-f0-9-]+$/.test(container)) throw new Error('Refusing to stop an unowned broker');
  execFileSync('docker', ['exec', container, 'rabbitmqctl', 'stop_app'], { timeout: 30_000, stdio: 'pipe' });
  let order: { id: string };
  try {
    const response = await fetch(`${backend}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'demo-widget', quantity: 1 }) });
    expect(response.status).toBe(201); order = await response.json() as { id: string };
    const store = new OrderStore(resolve(data, 'orders.sqlite'));
    try { expect(store.pending().some(event => event.order.id === order.id)).toBe(true); } finally { store.close(); }
  } finally { execFileSync('docker', ['exec', container, 'rabbitmqctl', 'start_app'], { timeout: 30_000, stdio: 'pipe' }); }
  await expect.poll(() => hasEffect(preparation, order!.id), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => hasEffect(notifications, order!.id), { timeout: 20_000 }).toBe(true);
  const store = new OrderStore(resolve(data, 'orders.sqlite'));
  try { await expect.poll(() => store.pending().some(event => event.order.id === order!.id), { timeout: 10_000 }).toBe(false); }
  finally { store.close(); }
}, 60_000);

brokerTest('incompatible event ends in both failed queues without creating effects', async () => {
  const connection = await openBroker(url);
  const eventId = randomUUID();
  const before = [await health(notifications), await health(preparation)];
  try {
    const channel = await connection.createConfirmChannel(), layout = topology(namespace);
    await declareTopology(channel, layout);
    await confirmed(channel, layout.exchange, layout.routingKey, Buffer.from(JSON.stringify({ eventId, type: 'OrderCreated', version: 2 })), { messageId: eventId });
    for (const [index, origin] of [notifications, preparation].entries()) {
      await expect.poll(async () => (await health(origin)).failed, { timeout: 15_000 }).toBe(before[index]!.failed + 1);
      expect((await health(origin)).effects).toBe(before[index]!.effects);
    }
  } finally { await closeBroker(connection); }
}, 30_000);