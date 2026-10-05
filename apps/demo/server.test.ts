import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDemoApi } from './server';
import type { RunInput } from './execution';
import { applySuggestion, suggestions } from './src/suggestions';
import type { DemoAnalysis, DemoExecution, DemoSnapshot } from './src/types';

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
  expect(snapshot.id).toHaveLength(24);
  expect(snapshot.sourceHash).toHaveLength(64);
  expect(snapshot.graph.nodes).toHaveLength(69);
  expect(snapshot.catalogue).toHaveLength(39);
  expect(snapshot.files.some(file => file.path === 'apps/backend/src/auth/domain/User.ts')).toBe(true);
});

test('maps edited source text through the real engine without changing the checkout', async () => {
  const snapshot = await fetch(`${url}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
  const suggestion = suggestions.find(candidate => candidate.id === 'domain')!;
  const file = snapshot.files.find(candidate => candidate.path === suggestion.path)!;
  const diskPath = resolve(process.cwd(), suggestion.path);
  const diskBefore = readFileSync(diskPath, 'utf8');

  const response = await fetch(`${url}/api/analyses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId: snapshot.id, edits: [{ path: file.path, content: editedContent }] }),
  }).then(response => response.json()) as DemoAnalysis;

  const response = await fetch(`${url}/api/executions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId: snapshot.id, analysisId: analysis.id, mode: 'selected' }),
  });
  const execution = await response.json() as DemoExecution;
  expect(response.status).toBe(202);
  expect(execution.results).toHaveLength(13);
  expect(receivedExecution?.tests.map(test => test.id)).toEqual(analysis.result.selectedTests);
  expect(receivedExecution?.edits).toEqual([{ path: file.path, content: editedContent }]);

  const rejected = await fetch(`${url}/api/executions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId: snapshot.id, analysisId: analysis.id, mode: 'selected', command: 'echo unsafe' }),
  });
  expect(rejected.status).toBe(400);
});
