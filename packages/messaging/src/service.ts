import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { OrderCreated } from '@test-impact/api-contract/order-created';
import { ConsumerStore } from './ConsumerStore';
import { startConsumer } from './consumer';

export function runConsumerService(subscription: string, effect: (event: OrderCreated) => Record<string, unknown>, defaultPort: number) {
  const path = resolve(process.env.DATA_DIR ?? '.impact-data', `${subscription}.sqlite`);
  mkdirSync(dirname(path), { recursive: true });
  const store = new ConsumerStore(path);
  const runtime = startConsumer({ url: process.env.BROKER_URL ?? 'amqp://guest:guest@127.0.0.1:5672', subscription, store, effect,
    beforeEffect(event, attempt) {
      // Explicit local fault-injection knobs, not production test-selection rules.
      if (event.order.sku === process.env.CONSUMER_FAIL_SKU || attempt < Number(process.env.CONSUMER_FAIL_FIRST ?? 0)) throw new Error('Configured local consumer failure');
    } });
  const port = Number(process.env.CONSUMER_PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid consumer port');
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && request.url === '/health') { response.end(JSON.stringify({ service: subscription, brokerReady: runtime.ready, ...runtime.stats, effects: store.count() })); return; }
    const match = /^\/orders\/([a-f0-9-]{36})$/.exec(request.url ?? '');
    const effect = request.method === 'GET' && match ? store.find(match[1]!) : undefined;
    response.writeHead(effect ? 200 : 404).end(JSON.stringify(effect ?? { error: 'Not processed yet' }));
  });
  server.listen(port, '127.0.0.1', () => console.log(`${subscription} HTTP ${JSON.stringify(server.address())}`));
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
    if (closing) return; closing = true;
    void runtime.close().then(() => { server.closeAllConnections(); server.close(() => { store.close(); process.exit(0); }); });
  });
}