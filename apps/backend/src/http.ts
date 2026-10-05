import { createServer, type IncomingMessage } from 'node:http';
import { LOGIN_PATH } from '@test-impact/api-contract';
import type { LoginController } from './auth/infrastructure/inbound/http/LoginController';
import type { createOrdersController } from './orders/OrdersController';
import { orderProgress } from './orders/OrderProgress';

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('JSON required');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 16_384) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export function createHttpServer(controller: LoginController, orders?: ReturnType<typeof createOrdersController>) {
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && request.url === '/health') {
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (orders && request.method === 'GET' && /^\/orders\/[a-f0-9-]{36}$/.test(request.url ?? '')) {
      const order = orders.find(request.url!.slice('/orders/'.length));
      response.writeHead(order ? 200 : 404).end(JSON.stringify(order ?? { error: 'Order not found.' }));
      return;
    }
    const progress = /^\/orders\/([a-f0-9-]{36})\/progress$/.exec(request.url ?? '');
    if (orders && request.method === 'GET' && progress) {
      if (!orders.find(progress[1]!)) { response.writeHead(404).end(JSON.stringify({ error: 'Order not found' })); return; }
      try { response.end(JSON.stringify(await orderProgress(progress[1]!))); }
      catch { response.writeHead(502).end(JSON.stringify({ error: 'Consumer integration unavailable' })); }
      return;
    }
    if (orders && request.method === 'POST' && request.url === '/orders') {
      let body: unknown;
      try { body = await readJson(request); }
      catch { response.writeHead(400).end(JSON.stringify({ error: 'A valid JSON order request is required.' })); return; }
      try {
        const result = await orders.place(body);
        response.writeHead(result.status).end(JSON.stringify(result.body));
      } catch { response.writeHead(502).end(JSON.stringify({ error: 'Inventory could not be checked; order was not created.' })); }
      return;
    }
    if (request.method !== 'POST' || request.url !== LOGIN_PATH) {
      response.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    let body: unknown;
    try { body = await readJson(request); } catch {
      response.writeHead(400).end(JSON.stringify({ error: { code: 'INVALID_REQUEST', message: 'A valid JSON login request is required.' } }));
      return;
    }
    const result = await controller.handle(body);
    response.writeHead(result.status).end(JSON.stringify(result.body));
  });
  server.requestTimeout = 10_000;
  return server;
}
