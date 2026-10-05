import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { analyzeSourceEdits, type ImpactGraph, type TestMetadata } from '@test-impact/impact-engine';
import type { DemoAnalysis, DemoAnalysisRequest, DemoFile, DemoSnapshot } from './src/types';

const root = resolve(process.cwd());
const graph = JSON.parse(readFileSync(resolve(root, 'impact/graph.json'), 'utf8')) as ImpactGraph;
const catalogue = JSON.parse(readFileSync(resolve(root, 'impact/catalogue.json'), 'utf8')) as TestMetadata[];
const allowedPaths = [...new Set(graph.nodes.flatMap(node => node.kind !== 'test' && node.source ? [node.source.path] : []))].sort();
const files: DemoFile[] = allowedPaths.map(path => ({
  path,
  content: readFileSync(resolve(root, path), 'utf8'),
  language: path.endsWith('.json') ? 'json' : 'typescript',
}));
const originalFiles = Object.fromEntries(files.map(file => [file.path, file.content]));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sourceHash = hash(files.map(file => `${file.path}\0${file.content}`).join('\0'));
const graphHash = hash(JSON.stringify(graph));
const catalogueHash = hash(JSON.stringify(catalogue));
const snapshotId = hash(`${sourceHash}:${graphHash}:${catalogueHash}`).slice(0, 24);
const snapshot: DemoSnapshot = { id: snapshotId, sourceHash, graphHash, catalogueHash, files, graph, catalogue };

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }).end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Content-Type must be application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 2_000_000) throw new Error('Request body exceeds 2 MB.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function validateRequest(value: unknown): DemoAnalysisRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid analysis request.');
  const candidate = value as Partial<DemoAnalysisRequest>;
  if (candidate.snapshotId !== snapshotId || !Array.isArray(candidate.edits) || candidate.edits.length > allowedPaths.length) {
    throw new Error('Snapshot mismatch or invalid edit list.');
  }
  const seen = new Set<string>();
  for (const edit of candidate.edits) {
    if (!edit || typeof edit.path !== 'string' || typeof edit.content !== 'string' || edit.content.length > 200_000
      || !allowedPaths.includes(edit.path) || seen.has(edit.path)) throw new Error('An edit is not allowed.');
    seen.add(edit.path);
  }
  return candidate as DemoAnalysisRequest;
}

export function createDemoApi() {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/api/health') return json(response, 200, { status: 'ok', snapshotId });
    if (request.method === 'GET' && request.url === '/api/snapshot') return json(response, 200, snapshot);
    if (request.method === 'POST' && request.url === '/api/analyses') {
      try {
        const body = validateRequest(await readBody(request));
        const analysis = analyzeSourceEdits({ originalFiles, edits: body.edits, graph, catalogue });
        const id = hash(`${snapshotId}:${JSON.stringify(body.edits)}`).slice(0, 24);
        const result: DemoAnalysis = { id, snapshotId, ...analysis };
        return json(response, 200, result);
      } catch (error) {
        return json(response, 400, { error: error instanceof Error ? error.message : 'Unable to analyze edits.' });
      }
    }
    return json(response, 404, { error: 'Not found' });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const port = Number(process.env.DEMO_API_PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DEMO_API_PORT');
  createDemoApi().listen(port, '127.0.0.1', () => console.log(`Demo API: http://127.0.0.1:${port}`));
}
