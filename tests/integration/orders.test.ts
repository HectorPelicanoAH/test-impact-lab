import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { createServer as createHttpServerRaw } from 'node:http';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createLoginController } from '../../apps/backend/src/composition';
import { createHttpServer } from '../../apps/backend/src/http';
import { createInventoryClient } from '../../apps/backend/src/orders/InventoryClient';
import { createOrdersController } from '../../apps/backend/src/orders/OrdersController';

async function freePort() {
  const server = createNetServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

// Federated overlays supply the archived provider; never replace or remove that pinned input.
const ownsInventory = !process.env.INVENTORY_ROOT;
const materialized = process.env.INVENTORY_ROOT ? { root: process.env.INVENTORY_ROOT }
  : JSON.parse(execFileSync(process.execPath, ['scripts/inventory/materialize.mjs'], { encoding: 'utf8' })) as { root: string };
let inventory: ChildProcess;
let server: ReturnType<typeof createHttpServer>;
let base: string;
let inventoryUrl: string;
beforeAll(async () => {
  const port = await freePort();
  inventoryUrl = `http://127.0.0.1:${port}`;
  inventory = spawn(process.execPath, ['--experimental-strip-types', 'src/main.ts'], {
    cwd: materialized.root, env: { ...process.env, INVENTORY_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('External inventory did not start.')), 8_000);
    inventory.once('error', reject);
    inventory.once('exit', code => reject(new Error(`External inventory exited (${code}).`)));
    inventory.stdout!.on('data', chunk => { if (chunk.toString().includes('External inventory:')) { clearTimeout(timer); resolve(); } });
  });
  server = createHttpServer(await createLoginController(), createOrdersController(createInventoryClient(inventoryUrl)));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  if (server?.listening) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  if (inventory && inventory.exitCode === null) {
    inventory.kill('SIGTERM');
    await new Promise<void>(resolve => inventory.once('exit', () => resolve()));
  }
  if (ownsInventory) rmSync(materialized.root, { recursive: true, force: true });
});

async function place(sku: string, quantity: number, host = base) {
  return fetch(`${host}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, quantity }) });
}

test('orders HTTP talks to a distinct inventory process and reads back the created order', async () => {
  expect((await fetch(`${inventoryUrl}/health`).then(reply => reply.json()) as { version: number }).version).toBe(1);
  const result = await place('demo-widget', 2);
  expect(result.status).toBe(201);
  const order = await result.json() as { id: string; sku: string; quantity: number; status: string };
  expect(order).toMatchObject({ sku: 'demo-widget', quantity: 2, status: 'accepted' });
  expect(await fetch(`${base}/orders/${order.id}`).then(reply => reply.json())).toEqual(order);
  expect((await place('demo-gadget', 1)).status).toBe(409);
  expect((await place('no-such-item', 1)).status).toBe(409);
  expect((await fetch(`${base}/orders/missing`)).status).toBe(404);
  expect((await place('bad/sku', 1)).status).toBe(400);
});

test('an unreachable inventory produces 502; timeout produces 504; neither creates an order', async () => {
  const closedPort = await freePort();
  const offline = createHttpServer(await createLoginController(), createOrdersController(createInventoryClient(`http://127.0.0.1:${closedPort}`)));
  await new Promise<void>(resolve => offline.listen(0, '127.0.0.1', resolve));
  const offlineHost = `http://127.0.0.1:${(offline.address() as AddressInfo).port}`;
  try {
    const response = await place('demo-widget', 1, offlineHost);
    expect(response.status).toBe(502);
    expect((await response.json() as { error: string }).error).toContain('order was not created');
  } finally { await new Promise<void>(resolve => { offline.close(() => resolve()); offline.closeAllConnections(); }); }

  const slow = createHttpServerRaw((_request, _response) => { /* hang deliberately; client must abort */ });
  await new Promise<void>(resolve => slow.listen(0, '127.0.0.1', resolve));
  const slowPort = (slow.address() as AddressInfo).port;
  const orders = createHttpServer(await createLoginController(), createOrdersController(createInventoryClient(`http://127.0.0.1:${slowPort}`, fetch, 40)));
  await new Promise<void>(resolve => orders.listen(0, '127.0.0.1', resolve));
  try {
    const response = await place('demo-widget', 1, `http://127.0.0.1:${(orders.address() as AddressInfo).port}`);
    expect(response.status).toBe(504);
  } finally {
    await new Promise<void>(resolve => { orders.close(() => resolve()); orders.closeAllConnections(); });
    slow.closeAllConnections();
    await new Promise<void>(resolve => slow.close(() => resolve()));
  }
});
