import { after, before, test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';
import { createInventoryServer } from '../src/server.ts';

const server = createInventoryServer();
let base = '';
before(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
test('GET v1 stock returns available quantity and fixed contract', async () => {
  const response = await fetch(`${base}/v1/stock/demo-widget`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { version: 1, sku: 'demo-widget', available: 8 });
  assert.equal((await fetch(`${base}/v1/stock/unknown`)).status, 404);
  assert.equal((await fetch(`${base}/v1/stock/%2F`)).status, 404);
  assert.equal((await fetch(`${base}/v1/stock/demo-widget`, { method: 'POST' })).status, 404);
});