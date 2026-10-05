import { createLoginController } from './composition';
import { createHttpServer } from './http';
import { createInventoryClient } from './orders/InventoryClient';
import { createOrdersController } from './orders/OrdersController';
import { OrderStore } from './orders/OrderStore';
import { startOutboxPublisher } from './orders/OutboxPublisher';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const port = Number(process.env.BACKEND_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid BACKEND_PORT');
const directory = resolve(process.env.DATA_DIR ?? '.impact-data');
mkdirSync(directory, { recursive: true });
const store = new OrderStore(resolve(directory, 'orders.sqlite'));
const publisher = process.env.BROKER_URL ? startOutboxPublisher(store, process.env.BROKER_URL) : undefined;
const orders = createOrdersController(createInventoryClient(process.env.INVENTORY_URL ?? `http://127.0.0.1:${process.env.INVENTORY_PORT ?? 3003}`), store);
const server = createHttpServer(await createLoginController(), orders);
server.listen(port, '127.0.0.1', () => console.log(`Login API: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { server.closeAllConnections(); server.close(() => { void (publisher?.close() ?? Promise.resolve()).then(() => { store.close(); process.exit(0); }); }); });
}
