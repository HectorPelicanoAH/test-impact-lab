import { afterAll, beforeAll, expect, test } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createDemoApi } from './server';
import type { DemoEditorInput, DemoGraphSession } from './src/types';
import { buildArchive, createDiscoveryPipeline, loadWorkspace } from '../../scripts/graph/snapshot';
import { locateSource } from '../../scripts/graph/locator';
import { journeyEdits } from './src/journeys';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { GraphSessions } from './graph-sessions';

test('cancel before dispatch prevents extraction; stale inputs and an invalidated base cannot advance', async () => {
  const live = loadWorkspace(process.cwd(), '');
  const sessions = new GraphSessions(() => structuredClone(live), () => {}, () => {});
  const { id } = sessions.capture();
  const advance = async (state: DemoGraphSession) => {
    sessions.next(state.id, state.sequence, `${state.id}:${state.sequence}`);
    await new Promise(resolve => setImmediate(resolve));
    return sessions.view(state.id);
  };
  const pending = sessions.start({ kind: 'discovery', inputId: id });
  sessions.next(pending.id, 0, 'cancel-before-dispatch');
  sessions.cancel(pending.id);
  await new Promise(resolve => setImmediate(resolve));
  expect(sessions.view(pending.id)).toMatchObject({ status: 'cancelled', sequence: 0 });
  expect(sessions.view(pending.id).graph.nodes).toHaveLength(0);
  let base = sessions.start({ kind: 'discovery', inputId: id });
  while (base.status !== 'completed') base = await advance(base);
  const impact = sessions.start({ kind: 'impact', inputId: id, baseSessionId: base.id, edits: [] });
  sessions.cancel(base.id);
  expect(() => sessions.next(impact.id, 0, 'invalid-base')).toThrow('grafo base');
  expect(sessions.view(impact.id).status).toBe('stale');
  const stale = sessions.start({ kind: 'discovery', inputId: id });
  live.sources['apps/frontend/src/LoginPage.tsx'] += '\n// Changed after capture\n';
  expect(() => sessions.next(stale.id, 0, 'new-input')).toThrow('fuentes base');
  expect(sessions.view(stale.id).status).toBe('stale');
});

test('discovery genuinely pauses before imports and behavior, with navigable partial sources', () => {
  const input = loadWorkspace(process.cwd(), ''), pipeline = createDiscoveryPipeline(input);
  const view = () => pipeline.partial('partial:test').graph;
  expect(view().nodes).toHaveLength(0);
  pipeline.next(); expect(view().nodes).toHaveLength(0);
  pipeline.next(); expect(view().nodes.length).toBeGreaterThan(0);
  expect(view().edges.every(edge => edge.type === 'contains')).toBe(true);
  pipeline.next(); expect(view().edges.some(edge => edge.type === 'imports')).toBe(true);
  expect(view().edges.some(edge => edge.type === 'calls')).toBe(false);
  const edge = view().edges.find(edge => edge.type === 'imports')!;
  expect(locateSource(pipeline.partial('partial:test'), { evidenceId: edge.evidenceIds[0]! })?.content).toContain('import');
  pipeline.next(); expect(view().edges.some(edge => edge.type === 'calls')).toBe(true);
  expect(pipeline.archive).toBeUndefined();
  while (pipeline.nextPhase) pipeline.next();
  expect(pipeline.archive).toEqual(buildArchive(input));
});

test('a failing adapter restores its facts and remains on the same phase', () => {
  const input = loadWorkspace(process.cwd(), '');
  input.legacyGraph = { ...input.legacyGraph, nodes: [...input.legacyGraph.nodes, { ...input.legacyGraph.nodes[0]!, label: 'Conflicting reviewed label' }] };
  const pipeline = createDiscoveryPipeline(input);
  for (let i = 0; i < 4; i++) pipeline.next();
  const previous = pipeline.partial('partial:test');
  expect(() => pipeline.next()).toThrow();
  expect(pipeline.completed).toBe(4);
  expect(pipeline.partial('partial:test')).toEqual(previous);
  expect(pipeline.archive).toBeUndefined();
});

const server = createDemoApi(); let url = '';
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
test('step API is idempotent, proves partial evidence and matches full impact for a new consumer', async () => {
  const input = await fetch(`${url}/api/editor-input`).then(r => r.json()) as DemoEditorInput;
  expect(input).not.toHaveProperty('graph'); expect(input).not.toHaveProperty('discovery');
  expect(input.suites.find(suite => suite.id === 'inventory-contract')?.source).toContain('expect');
  const headers = { 'Content-Type': 'application/json', 'X-Test-Impact-Session': input.sessionToken };
  const create = async (body: unknown) => fetch(`${url}/api/graph-sessions`, { method: 'POST', headers, body: JSON.stringify(body) }).then(r => r.json()) as Promise<DemoGraphSession>;
  let base = await create({ kind: 'discovery', inputId: input.id }); expect(base.graph.nodes).toHaveLength(0);
  const advance = async (state: DemoGraphSession) => {
    const body = JSON.stringify({ sequence: state.sequence, key: `${state.id}:${state.sequence}` });
    const post = await fetch(`${url}/api/graph-sessions/${state.id}/next`, { method: 'POST', headers, body }); expect(post.status).toBe(202);
    let next = await post.json() as DemoGraphSession;
    for (let i = 0; i < 20 && next.status === 'running'; i++) next = await fetch(`${url}/api/graph-sessions/${state.id}`, { headers }).then(r => r.json()) as DemoGraphSession;
    expect(next.status, next.error).not.toBe('error');
    expect(next.sequence).toBe(state.sequence + 1);
    const duplicate = await fetch(`${url}/api/graph-sessions/${state.id}/next`, { method: 'POST', headers, body }).then(r => r.json()) as DemoGraphSession;
    expect(duplicate.sequence).toBe(next.sequence);
    return next;
  };
  base = await advance(base); base = await advance(base); base = await advance(base);
  const edge = base.graph.edges.find(item => item.type === 'imports')!;
  const proof = await fetch(`${url}/api/graph-sessions/${base.id}/locators?sequence=3&evidence=${edge.evidenceIds[0]}`, { headers }).then(r => r.json());
  expect(proof.content).toContain('import'); expect(proof.snapshotId).toContain('partial:');
  while (base.status !== 'completed') base = await advance(base);
  const edits = journeyEdits('consumer', Object.fromEntries(input.files.map(file => [file.path, file.content])));
  let impact = await create({ kind: 'impact', inputId: input.id, baseSessionId: base.id, edits });
  while (impact.status !== 'completed') impact = await advance(impact);
  const batch = analyzeOverlay(buildArchive(loadWorkspace(process.cwd())), edits);
  expect(impact.analysis?.result).toEqual(batch.result);
  expect(impact.analysis?.federated).toEqual(batch.federated);
  expect(impact.analysis?.discovery).toEqual(batch.after.graph);
  expect(impact.analysis?.discovery.nodes.some(item => item.label === 'audit')).toBe(true);
  const previous = await fetch(`${url}/api/graph-sessions/${impact.id}?sequence=9`, { headers }).then(r => r.json()) as DemoGraphSession;
  expect(previous.step?.id).toBe('messaging'); expect(previous.analysis).toBeUndefined();
  expect(previous.step?.newNodeIds.length).toBeGreaterThan(0);
  expect(previous.step?.updatedEdgeIds.length).toBeGreaterThan(0);
  const local = await fetch(`${url}/api/graph-sessions/${impact.id}?sequence=13`, { headers }).then(r => r.json()) as DemoGraphSession;
  expect(local.localImpact).toEqual(impact.analysis!.result); expect(local.analysis).toBeUndefined();
  // The same immutable baseline produces genuine removals, retained through selection.
  let http = await create({ kind: 'impact', inputId: input.id, baseSessionId: base.id,
    edits: journeyEdits('http', Object.fromEntries(input.files.map(file => [file.path, file.content]))) });
  while (http.status !== 'completed') http = await advance(http);
  const retired = http.analysis!.delta.edges.removed.find(item => item.type === 'invokes-endpoint')!;
  expect(retired).toBeDefined(); expect(http.step?.removedEdgeIds).toContain(retired.id);
  expect(http.beforeGraph?.edges.map(item => item.id)).toContain(retired.id);
  const original = await fetch(`${url}/api/graph-sessions/${http.id}/locators?sequence=14&side=before&evidence=${retired.evidenceIds[0]}`, { headers }).then(r => r.json());
  expect(original.content).toContain('GET');
  const cancelled = await fetch(`${url}/api/graph-sessions/${impact.id}`, { method: 'DELETE', headers }).then(r => r.json()) as DemoGraphSession;
  expect(cancelled.status).toBe('cancelled'); expect(cancelled.analysis).toBeUndefined();
  const rejected = await fetch(`${url}/api/graph-sessions/${impact.id}/next`, { method: 'POST', headers, body: JSON.stringify({ sequence: impact.sequence, key: 'after-cancel' }) });
  expect(rejected.status).toBe(400);
}, 60000);
