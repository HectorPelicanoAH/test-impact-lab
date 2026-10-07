import { expect, test, vi } from 'vitest';
import { createInventoryClient, InventoryFailure } from './InventoryClient';
import { createOrdersController } from './OrdersController';

test('creates and retrieves an order only after the versioned stock check', async () => {
  const controller = createOrdersController(async sku => ({ version: 1, sku, available: 8 }));
  const created = await controller.place({ sku: 'demo-widget', quantity: 2 });
  expect(created.status).toBe(201);
  if (!('id' in created.body)) throw new Error('Expected an order.');
  expect(controller.find(created.body.id)).toEqual(created.body);
  expect((await controller.place({ sku: 'demo-widget', quantity: 0 })).status).toBe(400);
  expect(controller.find('unknown')).toBeUndefined();
});

test('out-of-stock, contract mismatch, unreachable server and timeout never accept an order', async () => {
  const out = createOrdersController(async sku => ({ version: 1, sku, available: 0 }));
  expect((await out.place({ sku: 'demo-gadget', quantity: 1 })).status).toBe(409);
  const failure = createOrdersController(async () => { throw new InventoryFailure('unavailable'); });
  expect((await failure.place({ sku: 'demo-widget', quantity: 1 })).status).toBe(502);
  const timed = createOrdersController(async () => { throw new InventoryFailure('timeout'); });
  expect((await timed.place({ sku: 'demo-widget', quantity: 1 })).status).toBe(504);
  const mismatch = createInventoryClient('http://127.0.0.1:3003', vi.fn(async () => new Response(JSON.stringify({ version: 2, sku: 'demo-widget', available: 10 }), { status: 200 })));
  await expect(mismatch('demo-widget')).rejects.toMatchObject({ reason: 'invalid-contract' });
  const client = createInventoryClient('http://127.0.0.1:3003', vi.fn(async (_url, options) => {
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    throw new DOMException('timeout', 'TimeoutError');
  }));
  await expect(client('demo-widget')).rejects.toMatchObject({ reason: 'timeout' });
  expect(() => createInventoryClient('https://example.org')).toThrow(/local HTTP/);
});