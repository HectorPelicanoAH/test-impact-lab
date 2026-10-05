import { createServer } from 'node:http';
import { INVENTORY_PATH, INVENTORY_VERSION } from './contract.ts';

const stock: Readonly<Record<string, number>> = { 'demo-widget': 8, 'demo-gadget': 0 };

/** No shared memory, imports, or test-selection catalogue with the orders application. */
export function createInventoryServer() {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && request.url === '/health') {
      response.end(JSON.stringify({ status: 'ok', version: INVENTORY_VERSION }));
      return;
    }
    const match = /^\/v1\/stock\/([a-z0-9-]{1,40})$/.exec(request.url ?? '');
    if (request.method !== 'GET' || !match || INVENTORY_PATH !== '/v1/stock/:sku') {
      response.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    const sku = match[1]!;
    if (!(sku in stock)) {
      response.writeHead(404).end(JSON.stringify({ error: 'Unknown SKU' }));
      return;
    }
    response.end(JSON.stringify({ version: INVENTORY_VERSION, sku, available: stock[sku] }));
  });
  server.requestTimeout = 5_000;
  return server;
}