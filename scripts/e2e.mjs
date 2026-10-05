import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to allocate test port');
  return { port: String(address.port), close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

// Hold both reservations until allocated; no shared server is reused.
const reservations = await Promise.all([reservePort(), reservePort()]);
const env = { ...process.env, BACKEND_PORT: process.env.BACKEND_PORT ?? reservations[0].port, FRONTEND_PORT: process.env.FRONTEND_PORT ?? reservations[1].port };
await Promise.all(reservations.map(reservation => reservation.close()));
const child = spawn('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], { env, stdio: 'inherit', detached: process.platform !== 'win32' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.pid) return;
    try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); } catch { /* Already exited. */ }
  });
}
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
