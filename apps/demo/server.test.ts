import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDemoApi } from './server';
import { applySuggestion, suggestions } from './src/suggestions';
import type { DemoAnalysis, DemoSnapshot } from './src/types';

const server = createDemoApi();
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
