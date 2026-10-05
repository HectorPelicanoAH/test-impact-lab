import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { analyzeSourceEdits, type ImpactGraph, type TestMetadata } from '@test-impact/impact-engine';
import { executeTests } from './execution';
import type { DemoAnalysis, DemoAnalysisRequest, DemoExecution, DemoExecutionRequest, DemoFile, DemoSnapshot } from './src/types';

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

function validateExecutionRequest(value: unknown): DemoExecutionRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid execution request.');
  const candidate = value as Partial<DemoExecutionRequest>;
  const keys = Object.keys(candidate);
  if (keys.length !== 3 || !keys.every(key => ['snapshotId', 'analysisId', 'mode'].includes(key))
    || candidate.snapshotId !== snapshotId || typeof candidate.analysisId !== 'string' || !['selected', 'full'].includes(candidate.mode ?? '')) {
    throw new Error('Snapshot mismatch or invalid execution request.');
  }
  return candidate as DemoExecutionRequest;
}

type Executor = typeof executeTests;

export function createDemoApi(executor: Executor = executeTests) {
  const analyses = new Map<string, { analysis: DemoAnalysis; edits: DemoAnalysisRequest['edits'] }>();
  const executions = new Map<string, DemoExecution>();
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/api/health') return json(response, 200, { status: 'ok', snapshotId });
    if (request.method === 'GET' && request.url === '/api/snapshot') return json(response, 200, snapshot);
    if (request.method === 'POST' && request.url === '/api/analyses') {
      try {
        const body = validateRequest(await readBody(request));
        const analysis = analyzeSourceEdits({ originalFiles, edits: body.edits, graph, catalogue });
        const id = hash(`${snapshotId}:${JSON.stringify(body.edits)}`).slice(0, 24);
        const result: DemoAnalysis = { id, snapshotId, ...analysis };
        analyses.set(id, { analysis: result, edits: body.edits });
        if (analyses.size > 32) analyses.delete(analyses.keys().next().value!);
        return json(response, 200, result);
      } catch (error) {
        return json(response, 400, { error: error instanceof Error ? error.message : 'Unable to analyze edits.' });
      }
    }
    if (request.method === 'POST' && request.url === '/api/executions') {
      try {
        const body = validateExecutionRequest(await readBody(request));
        const stored = analyses.get(body.analysisId);
        if (!stored) throw new Error('Analysis is unknown or expired. Calculate regression again.');
        if ([...executions.values()].some(execution => execution.status === 'queued' || execution.status === 'running')) {
          return json(response, 409, { error: 'Another test execution is already running.' });
        }
        const selectedIds = new Set(stored.analysis.result.selectedTests);
        const tests = body.mode === 'full' ? catalogue : catalogue.filter(test => selectedIds.has(test.id));
        if (!tests.length) throw new Error('The analysis selected no tests.');
        const id = randomUUID();
        const queued: DemoExecution = {
          id, analysisId: body.analysisId, snapshotId, mode: body.mode, status: 'queued',
          results: tests.map(test => ({ testId: test.id, name: test.name.replace(/^\[[^\]]+\]\s*/, ''), kind: test.kind, status: 'queued' })),
        };
        executions.set(id, queued);
        void executor({ id, analysisId: body.analysisId, snapshotId, mode: body.mode, root, edits: stored.edits, tests, onUpdate: execution => executions.set(id, execution) })
          .catch(error => executions.set(id, { ...queued, status: 'failed', error: error instanceof Error ? error.message : 'Execution failed.' }));
        return json(response, 202, executions.get(id));
      } catch (error) {
        return json(response, 400, { error: error instanceof Error ? error.message : 'Unable to start execution.' });
      }
    }
    if (request.method === 'GET' && request.url?.startsWith('/api/executions/')) {
      const id = request.url.slice('/api/executions/'.length);
      const execution = executions.get(id);
      return execution ? json(response, 200, execution) : json(response, 404, { error: 'Execution not found.' });
    }
    return json(response, 404, { error: 'Not found' });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const port = Number(process.env.DEMO_API_PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DEMO_API_PORT');
  createDemoApi().listen(port, '127.0.0.1', () => console.log(`Demo API: http://127.0.0.1:${port}`));
}
