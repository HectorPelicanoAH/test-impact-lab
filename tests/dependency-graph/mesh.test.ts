import { beforeAll, expect, test } from 'vitest';
import type { DiscoveryArchive, MeshDataset, MeshSeries } from '../../packages/impact-engine/src/schema-v2';
import { buildArchive, loadWorkspace, validateArchive } from '../../scripts/graph/snapshot';
import { correlateMesh, observationsHash } from '../../scripts/graph/mesh';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { hash } from '../../scripts/graph/core';
let baseline: DiscoveryArchive;
beforeAll(() => { baseline = buildArchive(loadWorkspace(process.cwd(), '')); });
function series(from = 'orders-api', to = 'inventory', value = '6', overrides: Record<string, string> = {}): MeshSeries {
  return { metric: { source_workload: from, destination_workload: to, source_workload_namespace: 'impact-g8', destination_workload_namespace: 'impact-g8', source_canonical_revision: 'v1', destination_canonical_revision: 'v1', ...overrides }, value: [1791280000, value] };
}
function dataset(): MeshDataset {
  return { schemaVersion: 1, clusterId: 'impact-g8-1234abcd', namespace: 'impact-g8', versions: { istio: '1.31.0' }, kialiGraph: { testFixture: true },
    bindings: [{ service: 'orders-api', selector: { kind: 'symbol' as const, label: 'createHttpServer', path: 'apps/backend/src/http.ts' }, repo: baseline.graph.repositories[0]! },
      { service: 'inventory', selector: { kind: 'service' as const, label: 'local/inventory' }, repo: baseline.graph.repositories[1]! },
      { service: 'rabbitmq', selector: { kind: 'broker-resource' as const, label: 'local/orders-rabbitmq' }, repo: baseline.graph.repositories[0]! }].map(({ service, selector, repo }) => ({ service, workload: service, namespace: 'impact-g8', version: 'v1', revision: repo.revision,
        productId: repo.productId, repositoryId: repo.repositoryId, selector, image: 'sha256:test-fixture' })),
    declarations: [{ from: 'orders-api', to: 'inventory', protocol: 'http', configuration: 'scripts/mesh/manifests.mjs', reason: 'INVENTORY_URL' }, { from: 'orders-api', to: 'rabbitmq', protocol: 'tcp', configuration: 'scripts/mesh/manifests.mjs', reason: 'BROKER_URL' }],
    captures: [{ id: 'orders', window: { start: '2026-10-06T09:00:00.000Z', end: '2026-10-06T09:01:00.000Z' }, httpBefore: [series('orders-api', 'inventory', '1')], httpAfter: [series('orders-api', 'inventory', '7')], tcpBefore: [], tcpAfter: [series('orders-api', 'rabbitmq', '400')] },
      { id: 'read-only', window: { start: '2026-10-06T09:01:00.000Z', end: '2026-10-06T09:02:00.000Z' }, httpBefore: [series('orders-api', 'inventory', '7')], httpAfter: [series('orders-api', 'inventory', '7')], tcpBefore: [], tcpAfter: [] }] };
}
test('window deltas preserve absent static dependencies and distinguish broker transport from event semantics', () => {
  const archive = buildArchive({ ...loadWorkspace(process.cwd(), ''), meshDataset: dataset() }); validateArchive(archive);
  expect(archive.graph.nodes).toEqual(baseline.graph.nodes); expect(archive.graph.edges).toEqual(baseline.graph.edges);
  const http = archive.graph.mesh!.comparisons.filter(item => item.protocol === 'http');
  expect(http.find(item => item.captureId === 'orders')).toMatchObject({ declared: true, observed: true, measured: 6, correlation: { status: 'resolved' } });
  expect(http.find(item => item.captureId === 'read-only')).toMatchObject({ declared: true, observed: false, measured: 0 });
  expect(http.every(item => item.staticEdgeIds.length > 0)).toBe(true);
  expect(archive.graph.mesh!.comparisons.filter(item => item.protocol === 'tcp').every(item => item.staticEdgeIds.length === 0)).toBe(true);
});
test('foreign namespace, mismatched workload version and source revision cannot link code', () => {
  for (const overrides of [{ destination_canonical_revision: 'v2' }, { destination_workload_namespace: 'foreign' }, { destination_workload: 'unknown' }] as Record<string, string>[]) {
    const data = dataset(); data.captures[0]!.httpAfter = [series('orders-api', 'inventory', '7', overrides)];
    const observed = correlateMesh(data, baseline.graph).comparisons.find(item => item.protocol === 'http' && item.observed)!;
    expect(observed.correlation.status).toBe('pending'); expect(observed.correlation.nodeIds).toEqual([]); expect(observed.staticEdgeIds).toEqual([]);
  }
  const data = dataset(); data.bindings[1]!.revision = 'incompatible';
  expect(correlateMesh(data, baseline.graph).comparisons.filter(item => item.to === 'inventory').every(item => item.correlation.status === 'pending')).toBe(true);
  const unrelated = dataset(); unrelated.bindings[1] = { ...unrelated.bindings[0]!, service: 'inventory', workload: 'inventory' };
  expect(correlateMesh(unrelated, baseline.graph).comparisons.filter(item => item.to === 'inventory').every(item => item.staticEdgeIds.length === 0)).toBe(true);
});
test('counter resets are rejected before aggregation even when another response-code series grows', () => {
  const data = dataset(); data.captures[0]!.httpBefore = [series('orders-api', 'inventory', '10', { response_code: '200' })];
  data.captures[0]!.httpAfter = [series('orders-api', 'inventory', '1', { response_code: '200' }), series('orders-api', 'inventory', '20', { response_code: '500' })];
  expect(() => correlateMesh(data, baseline.graph)).toThrow('counter reset');
  const duplicate = dataset(); duplicate.captures[0]!.httpAfter.push(structuredClone(duplicate.captures[0]!.httpAfter[0]!));
  expect(() => correlateMesh(duplicate, baseline.graph)).toThrow('Duplicate mesh counter');
});
test('raw mesh data and derived correlation are archived, hashed and validated; overlays recheck code revision', () => {
  const input = loadWorkspace(process.cwd(), ''), data = dataset();
  const archive = buildArchive({ ...input, meshDataset: data });
  expect(buildArchive({ ...input, meshDataset: data }).graph.id).toBe(archive.graph.id);
  const raw = structuredClone(archive); raw.meshDataset!.versions.istio = 'other'; expect(() => validateArchive(raw)).toThrow();
  const derived = structuredClone(archive); derived.graph.mesh!.comparisons[0]!.observed = !derived.graph.mesh!.comparisons[0]!.observed;
  const { id, ...body } = derived.graph; derived.graph.id = hash(body); expect(() => validateArchive(derived)).toThrow('Mesh dataset/correlation');
  const edits = [{ path: 'apps/backend/src/http.ts', content: `${baseline.sources['apps/backend/src/http.ts']}\n// overlay` }];
  const plain = analyzeOverlay(baseline, edits), observed = analyzeOverlay(archive, edits);
  expect(observed.federated.suites).toEqual(plain.federated.suites);
  expect(observed.after.graph.mesh!.comparisons.every(item => item.correlation.status === 'pending')).toBe(true);
});
test('G7 hash compatibility is preserved and traces plus mesh have a single checked input identity', () => {
  const traces = { schemaVersion: 1 as const, spans: [] };
  expect(observationsHash(traces)).toBe(hash(traces));
  const archive = buildArchive({ ...loadWorkspace(process.cwd(), ''), meshDataset: dataset(), observationDataset: traces }); validateArchive(archive);
  expect(archive.graph.inputs.observationsHash).toBe(hash({ traces, mesh: archive.meshDataset }));
  const changed = structuredClone(archive); delete changed.observationDataset; expect(() => validateArchive(changed)).toThrow();
});
