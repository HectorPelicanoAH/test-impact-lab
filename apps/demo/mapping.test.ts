import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, test } from 'vitest';
import { createDemoApi } from './server';
import { SnapshotStore, WorkspaceSnapshots } from '../../scripts/graph/store';
import { loadWorkspace } from '../../scripts/graph/snapshot';
import { journeyEdits } from './src/journeys';
import type { DemoAnalysis, DemoMapping, DemoOperation, DemoSnapshot } from './src/types';

test('deleted mapping stays inactive, forced rebuilding records real phases, and prior analyses cannot execute', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'impact-guided-api-'));
  const input = loadWorkspace(process.cwd());
  let fail = false;
  const workspace = new WorkspaceSnapshots(process.cwd(), new SnapshotStore(directory), () => { if (fail) throw new Error('Injected capture failure'); return input; });
  const api = createDemoApi(async () => { throw new Error('No real runner expected in the API state test.'); }, workspace);
  try {
    await new Promise<void>(done => api.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    const snapshot = await fetch(`${url}/api/snapshot`).then(reply => reply.json()) as DemoSnapshot;
    const headers = { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot.sessionToken };
    const body = JSON.stringify({ snapshotId: snapshot.id, edits: journeyEdits('consumer', input.sources) });
    const poll = async (id: string) => {
      let operation: DemoOperation | undefined;
      await expect.poll(async () => { operation = await fetch(`${url}/api/operations/${id}`, { headers }).then(reply => reply.json()) as DemoOperation; return operation.status; }).not.toMatch(/queued|running/);
      return operation!;
    };
    const initial = await fetch(`${url}/api/analysis-operations`, { method: 'POST', headers, body }).then(reply => reply.json()) as DemoOperation;
    const complete = await poll(initial.id);
    expect(complete.status).toBe('completed');
    const analysis = await fetch(`${url}/api/analyses/${complete.analysisId}`, { headers }).then(reply => reply.json()) as DemoAnalysis;
    expect(analysis.result.selectionMode).toBe('conservative-full');
    expect(complete.events.at(-1)?.phase).toBe('selection');
    expect((await fetch(`${url}/api/mapping`, { method: 'DELETE', headers })).status).toBe(200);
    await fetch(`${url}/api/snapshot`);
    expect((await fetch(`${url}/api/mapping`, { headers }).then(reply => reply.json()) as DemoMapping).state).toBe('empty');
    expect((await fetch(`${url}/api/analysis-operations`, { method: 'POST', headers, body })).status).toBe(409);
    expect((await fetch(`${url}/api/analyses/${analysis.id}`, { headers })).status).toBe(409);
    expect((await fetch(`${url}/api/executions`, { method: 'POST', headers, body: JSON.stringify({ snapshotId: snapshot.id, analysisId: analysis.id, mode: 'full' }) })).status).toBe(400);
    const generate = async () => fetch(`${url}/api/mapping`, { method: 'POST', headers, body: JSON.stringify({ snapshotId: snapshot.id }) }).then(reply => reply.json()) as Promise<DemoOperation>;
    const first = await poll((await generate()).id), second = await poll((await generate()).id);
    expect(first.id).not.toBe(second.id);
    expect(first.snapshotId).toBe(snapshot.id); expect(second.snapshotId).toBe(snapshot.id);
    expect(first.events.some(event => event.phase === 'typescript' && event.status === 'completed')).toBe(true);
    expect(first.events.every(event => event.status === 'completed')).toBe(true);
    fail = true;
    const failed = await poll((await generate()).id);
    expect(failed.status).toBe('failed'); expect(failed.events[0]?.status).toBe('failed');
    expect(failed.error).toContain('Injected capture failure');
    expect(workspace.store.read(snapshot.id).graph.id).toBe(snapshot.id);
    expect((await fetch(`${url}/api/mapping`, { headers }).then(reply => reply.json()) as DemoMapping).state).toBe('error');
    expect((await fetch(`${url}/api/mapping`, { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body: JSON.stringify({ snapshotId: snapshot.id }) })).status).toBe(403);
  } finally {
    await new Promise<void>(done => { api.close(() => done()); api.closeAllConnections(); });
    rmSync(directory, { recursive: true, force: true });
  }
}, 60_000);
