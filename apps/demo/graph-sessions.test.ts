import { afterAll, beforeAll, expect, test } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createDemoApi } from './server';
import type { DemoEditorInput, DemoGraphSession } from './src/types';
import { buildArchive, createDiscoveryPipeline, loadWorkspace } from '../../scripts/graph/snapshot';
import { locateSource } from '../../scripts/graph/locator';
import { journeyEdits } from './src/journeys';
import { analyzeOverlay } from '../../scripts/graph/analyze';

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
  const cancelled = await fetch(`${url}/api/graph-sessions/${impact.id}`, { method: 'DELETE', headers }).then(r => r.json()) as DemoGraphSession;
  expect(cancelled.status).toBe('cancelled'); expect(cancelled.analysis).toBeUndefined();
  const rejected = await fetch(`${url}/api/graph-sessions/${impact.id}/next`, { method: 'POST', headers, body: JSON.stringify({ sequence: impact.sequence, key: 'after-cancel' }) });
  expect(rejected.status).toBe(400);
}, 60000);
