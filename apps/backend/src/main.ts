import { createLoginController } from './composition';
import { createHttpServer } from './http';

const port = Number(process.env.BACKEND_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid BACKEND_PORT');
const server = createHttpServer(await createLoginController());
server.listen(port, '127.0.0.1', () => console.log(`Login API: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
