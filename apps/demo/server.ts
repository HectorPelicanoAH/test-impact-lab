import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import ts from 'typescript';
import { executeTests } from './execution';
import type { DemoAnalysis, DemoAnalysisRequest, DemoExecution, DemoExecutionRequest, DemoFile, DemoSnapshot } from './src/types';
import type { DiscoveryArchive } from '../../packages/impact-engine/src/schema-v2';
import { WorkspaceSnapshots } from '../../scripts/graph/store';
import { compatibilityGraph } from '../../scripts/graph/snapshot';
import { authorizedPath, applyEdits } from '../../scripts/graph/files';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { canonical, hash } from '../../scripts/graph/core';
import { locateSource } from '../../scripts/graph/locator';
import { readFederatedSuites } from '../../packages/impact-engine/src/federated';

const root = resolve(process.cwd());
function demoSnapshot(archive: DiscoveryArchive, sessionToken: string): DemoSnapshot {
const { catalogue } = archive;
const files: DemoFile[] = Object.keys(archive.sources).sort().filter(path => authorizedPath(path, archive.config)).map(path => ({
  path, content: archive.sources[path]!, language: path.endsWith('.css') ? 'css' : path.endsWith('.json') ? 'json' : 'typescript',
}));
const testFiles = [...new Set(catalogue.map(test => test.file))].sort().map(path => ({ path, content: archive.sources[path]! }));
const testLocations = Object.fromEntries(catalogue.map(test => {
  const content = testFiles.find(file => file.path === test.file)!.content;
  const source = ts.createSourceFile(test.file, content, ts.ScriptTarget.Latest, true, test.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const statement = source.statements.find(item => ts.isExpressionStatement(item) && ts.isCallExpression(item.expression)
    && ts.isIdentifier(item.expression.expression) && ['test', 'it'].includes(item.expression.expression.text)
    && item.expression.arguments.length > 0 && ts.isStringLiteral(item.expression.arguments[0]!) && item.expression.arguments[0]!.text === test.title);
  if (!statement) throw new Error(`Cannot locate source for test ${test.id}`);
  return [test.id, {
    startLine: source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1,
    endLine: source.getLineAndCharacterOfPosition(statement.getEnd()).line + 1,
  }];
}));
return { id: archive.graph.id, sourceHash: archive.graph.inputs.sourcesHash, graphHash: archive.graph.id,
  catalogueHash: archive.graph.inputs.catalogueHash, sessionToken, files, testFiles, testLocations,
  graph: compatibilityGraph(archive), catalogue, externalCatalogue: archive.externalCatalogue ?? [], discovery: archive.graph, editableRoots: archive.config.roots };
}

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

function validateRequest(value: unknown, archive: DiscoveryArchive): DemoAnalysisRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid analysis request.');
  const candidate = value as Partial<DemoAnalysisRequest>;
  const keys = Object.keys(candidate);
  if (keys.length !== 2 || !keys.every(key => ['snapshotId', 'edits'].includes(key))
    || candidate.snapshotId !== archive.graph.id || !Array.isArray(candidate.edits)) {
    throw new Error('Snapshot mismatch or invalid edit list.');
  }
  applyEdits(archive.sources, candidate.edits, archive.config);
  return candidate as DemoAnalysisRequest;
}

function validateExecutionRequest(value: unknown, snapshotId: string): DemoExecutionRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid execution request.');
  const candidate = value as Partial<DemoExecutionRequest>;
  const keys = Object.keys(candidate);
  if (keys.length !== 3 || !keys.every(key => ['snapshotId', 'analysisId', 'mode'].includes(key))
    || candidate.snapshotId !== snapshotId || typeof candidate.analysisId !== 'string' || !['selected', 'full'].includes(candidate.mode ?? '')) {
    throw new Error('Snapshot mismatch or invalid execution request.');
  }
  return candidate as DemoExecutionRequest;
}

function isAuthorized(request: IncomingMessage, sessionToken: string): boolean {
  if (request.headers['x-test-impact-session'] !== sessionToken) return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  } catch {
    return false;
  }
}

type Executor = typeof executeTests;

export function createDemoApi(executor: Executor = executeTests, workspace = new WorkspaceSnapshots(root)) {
  const sessionToken = randomBytes(32).toString('hex');
  const analyses = new Map<string, { analysis: DemoAnalysis; edits: DemoAnalysisRequest['edits']; after: DiscoveryArchive }>();
  const executions = new Map<string, DemoExecution>();
  return createServer(async (request, response) => {
    if (request.method === 'GET' && /^\/api\/snapshots\/[a-f0-9]{64}\/mesh$/.test(request.url ?? '')) {
      try { const archive = workspace.store.read(request.url!.split('/')[3]); return archive.meshDataset ? json(response, 200, archive.meshDataset) : json(response, 404, { error: 'No archived mesh evidence' }); }
      catch { return json(response, 404, { error: 'Archived mesh evidence unavailable' }); }
    }
    // Resolve a verified locator by identity, never by a browser-supplied path/line.
    if (request.method === 'GET' && request.url?.startsWith('/api/snapshots/')) {
      const url = new URL(request.url, 'http://127.0.0.1');
      const match = /^\/api\/snapshots\/([a-f0-9]{64})\/locators$/.exec(url.pathname);
      if (match) {
        try {
          const entries = [...url.searchParams.entries()];
          const evidence = entries.length === 1 && entries[0]?.[0] === 'evidence' ? entries[0][1] : undefined;
          const node = entries.length === 2 && url.searchParams.has('node') && url.searchParams.has('index') ? url.searchParams.get('node') : undefined;
          const index = url.searchParams.get('index') ?? '';
          if (!evidence && !(node && /^(0|[1-9]\d*)$/.test(index))) return json(response, 400, { error: 'Select exactly one evidence ID or one node ID and location index.' });
          const archive = workspace.store.read(match[1]);
          const located = locateSource(archive, evidence ? { evidenceId: evidence } : { nodeId: node!, index: Number(index) });
          return located ? json(response, 200, located) : json(response, 404, { error: 'No verified source/range in this snapshot; navigation unavailable.' });
        } catch { return json(response, 404, { error: 'Snapshot or verified source unavailable.' }); }
      }
    }
    // Immutable history is readable even while a new extraction is failing.
    if (request.method === 'GET' && request.url?.startsWith('/api/snapshots/')) {
      try { return json(response, 200, demoSnapshot(workspace.store.read(request.url.slice('/api/snapshots/'.length)), sessionToken)); }
      catch { return json(response, 404, { error: 'Snapshot not available.' }); }
    }
    let current: DiscoveryArchive;
    try { current = workspace.refresh(); }
    catch (error) { return json(response, 503, { error: `Snapshot rebuild failed; previous version retained: ${error instanceof Error ? error.message : error}` }); }
    const snapshotId = current.graph.id;
    if (request.method === 'GET' && request.url === '/api/health') return json(response, 200, { status: 'ok', snapshotId });
    if (request.method === 'GET' && request.url === '/api/snapshot') return json(response, 200, demoSnapshot(current, sessionToken));
    const protectedRoute = (request.method === 'POST' && ['/api/analyses', '/api/executions'].includes(request.url ?? ''))
      || (request.method === 'GET' && request.url?.startsWith('/api/executions/'));
    if (protectedRoute && !isAuthorized(request, sessionToken)) return json(response, 403, { error: 'Invalid local demo session.' });
    if (request.method === 'POST' && request.url === '/api/analyses') {
      try {
        const body = validateRequest(await readBody(request), current);
        const canonicalEdits = [...body.edits].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        const analysis = analyzeOverlay(current, canonicalEdits);
        const id = hash(`${snapshotId}:${canonical(canonicalEdits)}`);
        const result: DemoAnalysis = { id, snapshotId, result: analysis.result, diff: analysis.diff, graph: analysis.graph,
          beforeGraphId: current.graph.id, afterGraphId: analysis.after.graph.id, delta: analysis.delta, discovery: analysis.after.graph, federated: analysis.federated };
        workspace.store.publish(analysis.after, false);
        analyses.set(id, { analysis: result, edits: canonicalEdits, after: analysis.after });
        if (analyses.size > 32) analyses.delete(analyses.keys().next().value!);
        return json(response, 200, result);
      } catch (error) {
        return json(response, 400, { error: error instanceof Error ? error.message : 'Unable to analyze edits.' });
      }
    }
    if (request.method === 'POST' && request.url === '/api/executions') {
      try {
        const body = validateExecutionRequest(await readBody(request), snapshotId);
        const stored = analyses.get(body.analysisId);
        if (!stored) throw new Error('Analysis is unknown or expired. Calculate regression again.');
        if (stored.analysis.snapshotId !== snapshotId) throw new Error('Analysis inputs changed. Reload the snapshot and calculate again.');
        if ([...executions.values()].some(execution => execution.status === 'queued' || execution.status === 'running')) {
          return json(response, 409, { error: 'Another test execution is already running.' });
        }
        const selectedIds = new Set(stored.analysis.result.selectedTests);
        const tests = body.mode === 'full' ? current.catalogue : current.catalogue.filter(test => selectedIds.has(test.id));
        const suiteIds = new Set(stored.analysis.federated.suites.filter(item => item.selected).map(item => item.id));
        const federatedSuites = readFederatedSuites(current).filter(item => body.mode === 'full' || suiteIds.has(item.id));
        if (!tests.length && !federatedSuites.length) throw new Error('The analysis selected no tests.');
        const id = randomUUID();
        const queued: DemoExecution = {
          id, analysisId: body.analysisId, snapshotId, mode: body.mode, status: 'queued',
          results: tests.map(test => ({ testId: test.id, name: test.name.replace(/^\[[^\]]+\]\s*/, ''), kind: test.kind, status: 'queued' })),
          suiteResults: federatedSuites.map(item => ({ id: item.id, file: item.file,
            availability: stored.analysis.federated.suites.find(decision => decision.id === item.id)!.availability, status: 'queued' })),
        };
        executions.set(id, queued);
        void executor({ id, analysisId: body.analysisId, snapshotId, mode: body.mode, root: workspace.root, edits: stored.edits,
          sourceSnapshot: current.executionFiles, discoveryConfig: current.config, tests, federatedSuites,
          onUpdate: execution => executions.set(id, execution) })
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
