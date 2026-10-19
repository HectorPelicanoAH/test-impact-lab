import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createIndex, queryGraph, summary } from './core.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);
export function createViewer(snapshot) {
  const index = createIndex(snapshot);
  return createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const json = (code, value) => {
      response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.method !== 'GET') return json(405, { error: 'Read-only viewer.' });
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/summary') return json(200, summary(index));
      if (url.pathname === '/api/diagnostics') {
        const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
        const limit = Math.max(1, Math.min(50, Math.trunc(Number(url.searchParams.get('limit')) || 10)));
        return json(200, { items: index.snapshot.diagnostics.slice(offset, offset + limit), total: index.snapshot.diagnostics.length, offset, limit });
      }
      if (url.pathname === '/api/graph') return json(200, queryGraph(index, Object.fromEntries(url.searchParams)));
      if (url.pathname === '/api/node') {
        const node = index.nodes.get(url.searchParams.get('id'));
        if (!node) return json(404, { error: 'Unknown node.' });
        const links = [...(index.incoming.get(node.id) ?? []), ...(index.outgoing.get(node.id) ?? [])];
        const unique = [...new Map(links.map(edge => [edge.id, edge])).values()];
        const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
        return json(200, {
          node, totalLinks: unique.length, offset,
          links: unique.slice(offset, offset + 50).map(edge => ({
            ...edge, fromLabel: index.nodes.get(edge.from).label, toLabel: index.nodes.get(edge.to).label
          }))
        });
      }
      if (url.pathname === '/api/evidence') {
        const evidence = index.evidence.get(url.searchParams.get('id'));
        if (!evidence) return json(404, { error: 'Unknown evidence.' });
        const path = evidence.locator?.path;
        return json(200, {
          evidence,
          source: path && Object.hasOwn(index.snapshot.sources, path) ? { path, content: index.snapshot.sources[path] } : null
        });
      }
      const asset = assets.get(url.pathname);
      if (!asset) return json(404, { error: 'Not found.' });
      const body = await readFile(new URL('../ui/' + asset[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': asset[1] });
      response.end(body);
    } catch {
      if (!response.headersSent) json(500, { error: 'Could not read the requested view.' });
      else response.end();
    }
  });
}

export async function listenViewer(snapshot, port = 0) {
  const server = createViewer(snapshot);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
