import { createInventoryServer } from './server.ts';

const port = Number(process.env.INVENTORY_PORT ?? 3003);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid INVENTORY_PORT');
const server = createInventoryServer();
server.listen(port, '127.0.0.1', () => console.log(`External inventory: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));