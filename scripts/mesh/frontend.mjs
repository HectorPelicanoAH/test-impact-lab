import { createServer, request as proxyRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('apps/frontend/dist');
const backend = 'http://orders-api.impact-g8.svc.cluster.local:3001';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  if (request.url === '/health') { response.end('ok'); return; }
  if (request.url?.startsWith('/api/orders') || request.url === '/login') {
    const outgoing = proxyRequest(new URL(request.url.replace(/^\/api/, ''), backend), { method: request.method, headers: { ...request.headers, host: new URL(backend).host } }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(response);
    });
    outgoing.on('error', () => response.writeHead(502).end('Backend unavailable'));
    request.pipe(outgoing); return;
  }
  const path = request.url?.split('?')[0] ?? '/';
  const file = path.startsWith('/assets/') && /^\/assets\/[a-zA-Z0-9_.-]+$/.test(path) ? resolve(root, `.${path}`) : resolve(root, 'index.html');
  try { const bytes = await readFile(file); response.setHeader('Content-Type', types[Object.keys(types).find(extension => file.endsWith(extension))] ?? 'application/octet-stream'); response.end(bytes); }
  catch { response.writeHead(404).end('Not found'); }
});
server.listen(8080, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
