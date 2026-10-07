import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { materializeInventory } from './materialize.mjs';

const temporary = !process.env.INVENTORY_ROOT;
const root = temporary ? materializeInventory().root : resolve(process.env.INVENTORY_ROOT);
const port = Number(process.env.INVENTORY_PORT ?? 3003);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid INVENTORY_PORT');
const { createInventoryServer } = await import(pathToFileURL(resolve(root, 'src/server.ts')).href);
const server = createInventoryServer();
server.listen(port, '127.0.0.1', () => console.log(`External inventory: http://127.0.0.1:${port}`));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (closing) return;
  closing = true;
  server.close(() => {
    if (temporary) rmSync(root, { recursive: true, force: true });
    process.exit(0);
  });
  server.closeAllConnections();
});