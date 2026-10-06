import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDemoApi } from './server';
import { runnerEnvironment, type RunInput } from './execution';
import { applySuggestion, suggestions } from './src/suggestions';
import type { DemoAnalysis, DemoExecution, DemoSnapshot } from './src/types';
import { SnapshotStore, WorkspaceSnapshots } from '../../scripts/graph/store';
import { loadWorkspace } from '../../scripts/graph/snapshot';

let receivedExecution: RunInput | undefined;
const server = createDemoApi(async input => {
  receivedExecution = input;
  const execution: DemoExecution = {
    id: input.id, analysisId: input.analysisId, snapshotId: input.snapshotId, mode: input.mode, status: 'passed', durationMs: 42,
    results: input.tests.map(test => ({ testId: test.id, name: test.name, kind: test.kind, status: 'passed', durationMs: 1 })),
  };
  input.onUpdate(execution);
  return execution;
});
let url = '';

function sessionHeaders(snapshot: DemoSnapshot) {
  return { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot.sessionToken };
}

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

test('serves an immutable, hashed snapshot of allowlisted repository files', async () => {
  const response = await fetch(`${url}/api/snapshot`);
  const snapshot = await response.json() as DemoSnapshot;

  expect(response.status).toBe(200);
  expect(snapshot.id).toHaveLength(64);
  expect(snapshot.sessionToken).toHaveLength(64);
  expect(snapshot.sourceHash).toHaveLength(64);
  expect(snapshot.discovery.schemaVersion).toBe(2);
  expect(snapshot.discovery.nodes.filter(node => node.legacyId)).toHaveLength(69);
  expect(snapshot.graph.nodes.length).toBeGreaterThan(69);
  expect(snapshot.catalogue).toHaveLength(39);
  expect(snapshot.files.some(file => file.path === 'apps/backend/src/auth/domain/User.ts')).toBe(true);
  for (const item of snapshot.catalogue) {
    const file = snapshot.testFiles.find(candidate => candidate.path === item.file);
    const location = snapshot.testLocations[item.id];
    expect(file, item.id).toBeDefined();
    expect(location, item.id).toBeDefined();
    const testSource = file!.content.split('\n').slice(location!.startLine - 1, location!.endLine).join('\n');
    expect(testSource, item.id).toContain(item.name);
  }
});

test('maps edited source text through the real engine without changing the checkout', async () => {
  const snapshot = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  const suggestion = suggestions.find(candidate => candidate.id === 'domain')!;
  const file = snapshot.files.find(candidate => candidate.path === suggestion.path)!;
  const diskPath = resolve(process.cwd(), suggestion.path);
  const diskBefore = readFileSync(diskPath, 'utf8');

  const response = await fetch(`${url}/api/analyses`, {
    method: 'POST',
    headers: sessionHeaders(snapshot),
    body: JSON.stringify({
      snapshotId: snapshot.id,
      edits: [{ path: file.path, content: applySuggestion(file.content, suggestion) }],
    }),
  });
  const analysis = await response.json() as DemoAnalysis;

  expect(response.status).toBe(200);
  expect(analysis.result.changedEntities).toEqual(['User.authenticate']);
  expect(analysis.result.selectedTests).toHaveLength(13);
  expect(analysis.result.selectionMode).toBe('graph');
  expect(readFileSync(diskPath, 'utf8')).toBe(diskBefore);
});

test('executes only server-derived selected IDs and rejects command-shaped input', async () => {
  const snapshot = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  const suggestion = suggestions.find(candidate => candidate.id === 'domain')!;
  const file = snapshot.files.find(candidate => candidate.path === suggestion.path)!;
  const editedContent = applySuggestion(file.content, suggestion);
  const analysis = await fetch(`${url}/api/analyses`, {
    method: 'POST', headers: sessionHeaders(snapshot),
    body: JSON.stringify({ snapshotId: snapshot.id, edits: [{ path: file.path, content: editedContent }] }),
  }).then(response => response.json()) as DemoAnalysis;

  const response = await fetch(`${url}/api/executions`, {
    method: 'POST', headers: sessionHeaders(snapshot),
    body: JSON.stringify({ snapshotId: snapshot.id, analysisId: analysis.id, mode: 'selected' }),
  });
  const execution = await response.json() as DemoExecution;
  expect(response.status).toBe(202);
  expect(execution.results).toHaveLength(13);
  expect(receivedExecution?.tests.map(test => test.id)).toEqual(analysis.result.selectedTests);
  expect(receivedExecution?.edits).toEqual([{ path: file.path, content: editedContent }]);

  const rejected = await fetch(`${url}/api/executions`, {
    method: 'POST', headers: sessionHeaders(snapshot),
    body: JSON.stringify({ snapshotId: snapshot.id, analysisId: analysis.id, mode: 'selected', command: 'echo unsafe' }),
  });
  expect(rejected.status).toBe(400);
});

test('requires the local session token and rejects a foreign browser origin', async () => {
  const snapshot = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  const body = JSON.stringify({ snapshotId: snapshot.id, edits: [] });
  const missing = await fetch(`${url}/api/analyses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  expect(missing.status).toBe(403);
  const foreign = await fetch(`${url}/api/analyses`, {
    method: 'POST', headers: { ...sessionHeaders(snapshot), Origin: 'https://example.com' }, body,
  });
  expect(foreign.status).toBe(403);
});

test('canonicalizes edit order into the same analysis identity and selection', async () => {
  const snapshot = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  const edits = suggestions.slice(0, 2).map(suggestion => {
    const file = snapshot.files.find(candidate => candidate.path === suggestion.path)!;
    return { path: file.path, content: applySuggestion(file.content, suggestion) };
  });
  async function analyze(ordered: typeof edits) {
    const response = await fetch(`${url}/api/analyses`, {
      method: 'POST', headers: sessionHeaders(snapshot), body: JSON.stringify({ snapshotId: snapshot.id, edits: ordered }),
    });
    expect(response.status).toBe(200);
    return await response.json() as DemoAnalysis;
  }
  const forward = await analyze(edits);
  const reversed = await analyze([...edits].reverse());
  expect(reversed.id).toBe(forward.id);
  expect(reversed.result).toEqual(forward.result);
});

test('syntax errors fail closed through the analysis API', async () => {
  const snapshot = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  const file = snapshot.files.find(candidate => candidate.path === 'apps/backend/src/auth/domain/User.ts')!;
  const response = await fetch(`${url}/api/analyses`, {
    method: 'POST', headers: sessionHeaders(snapshot),
    body: JSON.stringify({ snapshotId: snapshot.id, edits: [{ path: file.path, content: `${file.content}\nexport const broken = (` }] }),
  });
  const analysis = await response.json() as DemoAnalysis;
  expect(response.status).toBe(200);
  expect(analysis.result.selectionMode).toBe('conservative-full');
  expect(analysis.result.selectedTests).toHaveLength(39);
  expect(analysis.result.warnings).toContain(`Edited file contains syntax errors: ${file.path}`);
});

test('runner environment retains required tool paths without inheriting secrets', () => {
  const environment = runnerEnvironment({
    PATH: '/tools', HOME: '/home/demo', PLAYWRIGHT_BROWSERS_PATH: '/browsers',
    DATABASE_PASSWORD: 'secret', API_TOKEN: 'secret', SSH_AUTH_SOCK: '/private/socket',
    INVENTORY_ROOT: '/mutable/provider', BROKER_URL: 'amqp://unreviewed-host',
  });
  expect(environment).toEqual({ PATH: '/tools', HOME: '/home/demo', PLAYWRIGHT_BROWSERS_PATH: '/browsers' });
});

test('CRUD analyses return topology deltas and historical sources without changing checkout', async () => {
  const snapshot = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  const path = 'apps/frontend/src/deep/ApiPage.tsx';
  const response = await fetch(`${url}/api/analyses`, {
    method: 'POST', headers: sessionHeaders(snapshot), body: JSON.stringify({ snapshotId: snapshot.id,
      edits: [{ path, operation: 'add', content: 'export const ApiPage = () => <main>Added</main>;' }, { path: 'apps/frontend/src/LoginPage.tsx', operation: 'delete' }] }),
  });
  const analysis = await response.json() as DemoAnalysis;
  expect(response.status).toBe(200);
  expect(analysis.diff.map(file => file.status).sort()).toEqual(['added', 'deleted']);
  expect(analysis.delta.nodes.added.some(node => node.locations[0]?.path === path)).toBe(true);
  expect(analysis.delta.nodes.removed.some(node => node.locations[0]?.path === 'apps/frontend/src/LoginPage.tsx')).toBe(true);
  expect(analysis.result.selectionMode).toBe('conservative-full');
  const historical = await fetch(`${url}/api/snapshots/${analysis.afterGraphId}`).then(response => response.json()) as DemoSnapshot;
  expect(historical.files.some(file => file.path === path)).toBe(true);
  expect(historical.files.some(file => file.path === 'apps/frontend/src/LoginPage.tsx')).toBe(false);
  const current = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  expect(current.id).toBe(snapshot.id);
  for (const unsafe of ['../escape.ts', 'apps/frontend/src/%2e%2e/escape.ts', 'apps/frontend/src/LoginPage.tsx', 'apps/frontend/src/LoginPage.test.tsx']) {
    const invalid = await fetch(`${url}/api/analyses`, { method: 'POST', headers: sessionHeaders(snapshot), body: JSON.stringify({ snapshotId: snapshot.id, edits: [{ path: unsafe, operation: 'add', content: '' }] }) });
    expect(invalid.status).toBe(400);
  }
});

test('changed input invalidates execution while old snapshots remain readable', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'impact-g2-api-'));
  let input = loadWorkspace(process.cwd());
  const workspace = new WorkspaceSnapshots(process.cwd(), new SnapshotStore(directory), () => input);
  const isolated = createDemoApi(async () => { throw new Error('Stale analysis must never execute.'); }, workspace);
  try {
    await new Promise<void>(resolve => isolated.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(isolated.address() as AddressInfo).port}`;
    const snapshot = await fetch(`${base}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
    const analysis = await fetch(`${base}/api/analyses`, { method: 'POST', headers: sessionHeaders(snapshot), body: JSON.stringify({ snapshotId: snapshot.id, edits: [] }) }).then(response => response.json()) as DemoAnalysis;
    input = { ...input, sources: { ...input.sources, 'apps/frontend/src/Changed.ts': 'export const changed = true;' } };
    const response = await fetch(`${base}/api/executions`, { method: 'POST', headers: sessionHeaders(snapshot), body: JSON.stringify({ snapshotId: snapshot.id, analysisId: analysis.id, mode: 'full' }) });
    expect(response.status).toBe(400);
    const old = await fetch(`${base}/api/snapshots/${snapshot.id}`).then(response => response.json()) as DemoSnapshot;
    expect(old.id).toBe(snapshot.id);
    expect(old.files.some(file => file.path === 'apps/frontend/src/Changed.ts')).toBe(false);
    const current = await fetch(`${base}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
    expect(current.id).not.toBe(snapshot.id);
  } finally {
    await new Promise<void>(resolve => { isolated.close(() => resolve()); isolated.closeAllConnections(); });
    rmSync(directory, { recursive: true, force: true });
  }
});

test('serves only verified historical source and reviewed configuration at their real range', async () => {
  const snapshot = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  const legacy = snapshot.discovery.edges.find(edge => edge.qualifiers.legacyId && edge.type === 'exercises')!;
  const proofId = legacy.evidenceIds[0]!;
  const endpoint = `${url}/api/snapshots/${snapshot.id}/locators`;
  const reviewed = await fetch(`${endpoint}?evidence=${encodeURIComponent(proofId)}`);
  const declaration = await reviewed.json() as { path: string; content: string; start: { line: number }; revision: string; pointer: string; snapshotId: string };
  expect(reviewed.status).toBe(200);
  expect(declaration.snapshotId).toBe(snapshot.id);
  expect(declaration.revision).toBe(snapshot.discovery.repositories[0]?.revision);
  expect(declaration.path).toBe('impact/evidence/architecture.json');
  expect(declaration.content.split('\n')[declaration.start.line - 1]).toBeDefined();
  expect(declaration.pointer).toMatch(/^\/tests\//);
  const sourceNode = snapshot.discovery.nodes.find(node => node.kind === 'file' && node.locations[0]?.path.endsWith('LoginPage.tsx'))!;
  const source = await fetch(`${endpoint}?node=${encodeURIComponent(sourceNode.id)}&index=0`);
  expect((await source.json() as { path: string }).path).toBe('apps/frontend/src/LoginPage.tsx');
  for (const query of ['?evidence=unknown', `?evidence=${encodeURIComponent(proofId)}&node=bad`, '?node=bad&index=-1', '?path=../../secrets']) {
    const invalid = await fetch(endpoint + query);
    expect([400, 404]).toContain(invalid.status);
  }
  expect((await fetch(`${url}/api/snapshots/${'a'.repeat(64)}/locators?evidence=${proofId}`)).status).toBe(404);
});

test('archived evidence remains navigable after checkout changes and even when current refresh fails', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'impact-g3-api-'));
  let input = loadWorkspace(process.cwd());
  let fails = false;
  const workspace = new WorkspaceSnapshots(process.cwd(), new SnapshotStore(directory), () => {
    if (fails) throw new Error('Current source unavailable');
    return input;
  });
  const isolated = createDemoApi(async () => { throw new Error('No execution expected.'); }, workspace);
  try {
    await new Promise<void>(resolve => isolated.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(isolated.address() as AddressInfo).port}`;
    const previous = await fetch(`${base}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
    const oldNode = previous.discovery.nodes.find(node => node.kind === 'file' && node.locations[0]?.path === 'apps/frontend/src/LoginPage.tsx')!;
    input = { ...input, sources: { ...input.sources, 'apps/frontend/src/NewScreen.tsx': 'export function NewScreen() { return <main>New</main>; }' } };
    const next = await fetch(`${base}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
    expect(next.id).not.toBe(previous.id);
    fails = true;
    expect((await fetch(`${base}/api/snapshot`)).status).toBe(503);
    const old = await fetch(`${base}/api/snapshots/${previous.id}/locators?node=${encodeURIComponent(oldNode.id)}&index=0`);
    expect(old.status).toBe(200);
    const located = await old.json() as { snapshotId: string; path: string; content: string };
    expect(located.snapshotId).toBe(previous.id);
    expect(located.path).toBe('apps/frontend/src/LoginPage.tsx');
    expect(located.content).toContain('<h1>Sign in</h1>');
  } finally {
    await new Promise<void>(resolve => { isolated.close(() => resolve()); isolated.closeAllConnections(); });
    rmSync(directory, { recursive: true, force: true });
  }
});
