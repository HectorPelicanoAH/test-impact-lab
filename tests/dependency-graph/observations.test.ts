import { beforeAll, expect, test } from 'vitest';
import type { DiscoveryArchive } from '../../packages/impact-engine/src/schema-v2';
import { buildArchive, loadWorkspace, validateArchive } from '../../scripts/graph/snapshot';
import { correlate, readCollector, type ObservationDataset, type ObservedSpan } from '../../scripts/graph/observations';
import { hash } from '../../scripts/graph/core';
import { analyzeOverlay } from '../../scripts/graph/analyze';
let baseline: DiscoveryArchive;
beforeAll(() => { baseline = buildArchive(loadWorkspace(process.cwd(), '')); });
function span(overrides: Partial<ObservedSpan> = {}): ObservedSpan {
  return { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), parentSpanId: '', name: 'http.orders', kind: 2,
    startTimeUnixNano: '1791200000000000000', endTimeUnixNano: '1791200000015000000',
    service: 'orders-api', version: '1', environment: 'impact.local', product: 'test-impact-lab', repository: 'login', revision: baseline.graph.repositories[0]!.revision,
    attributes: { 'code.file.path': 'apps/backend/src/http.ts', 'code.function.name': 'createHttpServer' }, status: { code: 0, message: '' }, links: [], ...overrides };
}
function dataset(...spans: ObservedSpan[]): ObservationDataset { return { schemaVersion: 1, spans }; }
test('exact identity links code, archives times and errors; absent traffic never deletes static dependencies', () => {
  const input = loadWorkspace(process.cwd(), '');
  const observed = buildArchive({ ...input, observationDataset: dataset(span({ status: { code: 2, message: 'failed' } })) });
  expect(observed.graph.edges).toEqual(baseline.graph.edges);
  expect(observed.graph.nodes).toEqual(baseline.graph.nodes);
  expect(observed.graph.observations[0]).toMatchObject({ correlation: { status: 'resolved' }, window: { start: '2026-10-05T11:33:20.000Z', end: '2026-10-05T11:33:20.015Z' } });
  expect(observed.graph.observations[0]!.span!.status.code).toBe(2);
  expect(observed.graph.inputs.observationsHash).toBe(hash(observed.observationDataset));
  validateArchive(observed);
});
test('incompatible code revisions, service versions and environments remain pending', () => {
  const data = dataset(span({ revision: 'different' }), span({ spanId: 'c'.repeat(16), version: '2' }), span({ spanId: 'd'.repeat(16), environment: 'production' }));
  const observations = correlate(data, baseline.graph);
  expect(observations.every(item => item.correlation.status === 'pending' && !item.correlation.nodeIds.length && !item.correlation.edgeIds.length)).toBe(true);
});
test('missing and ambiguous symbols remain explicit; temporal proximity is never a match', () => {
  const missing = correlate(dataset(span({ attributes: { 'code.file.path': 'unknown.ts', 'code.function.name': 'createHttpServer' } })), baseline.graph);
  expect(missing[0]!.correlation.status).toBe('pending');
  const target = baseline.graph.nodes.find(node => node.kind === 'symbol' && node.label === 'createHttpServer')!;
  const ambiguous = correlate(dataset(span()), { ...baseline.graph, nodes: [...baseline.graph.nodes, { ...target, id: 'other' }] });
  expect(ambiguous[0]!.correlation.status).toBe('ambiguous');
});
test('retry attempts preserve separate span/link evidence and a single existing consumer dependency', () => {
  const attrs = { 'code.file.path': 'packages/messaging/src/consumer.ts', 'code.function.name': 'startConsumer', 'messaging.subscription.name': 'notifications', 'messaging.message.id': 'event-1', 'impact.handler.path': 'apps/notifications/src/main.ts', 'impact.handler.symbol': 'notify' };
  const observations = correlate(dataset(span({ service: 'notifications', name: 'messaging.process', attributes: { ...attrs, 'messaging.delivery.attempt': 1 } }), span({ service: 'notifications', name: 'messaging.process', spanId: 'c'.repeat(16), parentSpanId: 'b'.repeat(16), attributes: { ...attrs, 'messaging.delivery.attempt': 2 }, links: [{ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }] })), baseline.graph);
  expect(observations).toHaveLength(2);
  expect(observations[0]!.correlation.edgeIds.length).toBeGreaterThan(0);
  expect(observations[0]!.correlation.edgeIds).toEqual(observations[1]!.correlation.edgeIds);
  expect(observations.every(item => item.correlation.nodeIds.every(id => baseline.graph.nodes.find(node => node.id === id)?.label !== 'preparation'))).toBe(true);
});
test('pinned data is reproducible, changing a span changes snapshot, selection still uses static policies', () => {
  const input = loadWorkspace(process.cwd(), '');
  const first = buildArchive({ ...input, observationDataset: dataset(span()) });
  expect(buildArchive({ ...input, observationDataset: dataset(span()) }).graph.id).toBe(first.graph.id);
  expect(buildArchive({ ...input, observationDataset: dataset(span({ name: 'different' })) }).graph.id).not.toBe(first.graph.id);
  const edits = [{ path: 'apps/notifications/src/main.ts', content: `${baseline.sources['apps/notifications/src/main.ts']}\n// change` }];
  const plain = analyzeOverlay(baseline, edits), observed = analyzeOverlay(first, edits);
  expect(observed.federated.suites).toEqual(plain.federated.suites);
  expect(observed.after.graph.inputs.observationsHash).toBe(first.graph.inputs.observationsHash);
  expect(observed.after.graph.observations[0]!.correlation.status).toBe('pending');
});
test('tampering with archived datasets or correlation fails validation', () => {
  const archive = buildArchive({ ...loadWorkspace(process.cwd(), ''), observationDataset: dataset(span()) });
  const changed = structuredClone(archive); changed.observationDataset!.spans[0]!.name = 'tampered';
  expect(() => validateArchive(changed)).toThrow();
  const changedCorrelation = structuredClone(archive); changedCorrelation.graph.observations[0]!.correlation.status = 'invented';
  const { id, ...body } = changedCorrelation.graph; changedCorrelation.graph.id = hash(body);
  expect(() => validateArchive(changedCorrelation)).toThrow('dataset/correlation');
});
test('Collector imports deduplicate exports; conflicting span identities and malformed exports fail closed', () => {
  const item = span();
  const batch = JSON.stringify({ resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'orders-api' } }] }, scopeSpans: [{ spans: [{ traceId: item.traceId, spanId: item.spanId, name: item.name, kind: 2, startTimeUnixNano: item.startTimeUnixNano, endTimeUnixNano: item.endTimeUnixNano }] }] }] });
  expect(readCollector(`${batch}\n${batch}\n`).spans).toHaveLength(1);
  expect(() => readCollector(`${batch}\n${batch.replace('http.orders', 'other')}\n`)).toThrow('Conflicting');
  expect(() => readCollector('{}')).toThrow('Invalid Collector');
});
