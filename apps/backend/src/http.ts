import { createServer, type IncomingMessage } from 'node:http';
import { LOGIN_PATH } from '@test-impact/api-contract';
import type { LoginController } from './auth/infrastructure/inbound/http/LoginController';

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

export function createHttpServer(controller: LoginController) {
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && request.url === '/health') {
      response.end(JSON.stringify({ status: 'ok' }));
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
