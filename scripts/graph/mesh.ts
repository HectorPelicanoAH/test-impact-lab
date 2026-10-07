import type { GraphSnapshotV2, MeshBinding, MeshComparison, MeshDataset, MeshSeries, MeshView } from '../../packages/impact-engine/src/schema-v2';
import { canonical, hash } from './core';
export function validateMeshDataset(dataset: MeshDataset) {
  if (!dataset || dataset.schemaVersion !== 1 || !/^impact-g8-[a-f0-9]{8}$/.test(dataset.clusterId) || dataset.namespace !== 'impact-g8'
    || !Array.isArray(dataset.bindings) || !Array.isArray(dataset.captures) || dataset.captures.length > 10 || dataset.bindings.length > 100
    || !Array.isArray(dataset.declarations) || !dataset.versions || dataset.kialiGraph === undefined) throw new Error('Invalid mesh dataset');
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(dataset.bindings.map(item => item.service)) || !unique(dataset.bindings.map(item => `${item.namespace}/${item.workload}`)) || !unique(dataset.captures.map(item => item.id))) throw new Error('Duplicate mesh identity');
  for (const item of dataset.bindings) if (item.namespace !== dataset.namespace || ![item.service, item.workload, item.version, item.revision, item.productId, item.repositoryId, item.image].every(value => typeof value === 'string' && value)
    || !item.selector || typeof item.selector.kind !== 'string') throw new Error('Invalid mesh binding');
  for (const declaration of dataset.declarations) if (!dataset.bindings.some(item => item.service === declaration.from) || !dataset.bindings.some(item => item.service === declaration.to)
    || !['http', 'tcp'].includes(declaration.protocol) || typeof declaration.configuration !== 'string' || !declaration.reason) throw new Error('Invalid declared mesh relation');
  for (const capture of dataset.captures) {
    if (!capture.id || !Number.isFinite(Date.parse(capture.window?.start)) || !Number.isFinite(Date.parse(capture.window?.end)) || Date.parse(capture.window.end) <= Date.parse(capture.window.start)) throw new Error('Invalid mesh window');
    for (const series of [capture.httpBefore, capture.httpAfter, capture.tcpBefore, capture.tcpAfter]) {
      if (!Array.isArray(series) || series.length > 10_000) throw new Error('Invalid mesh series');
      for (const item of series) if (!item.metric || !Object.values(item.metric).every(value => typeof value === 'string') || !Array.isArray(item.value) || item.value.length !== 2
        || !Number.isFinite(item.value[0]) || !Number.isFinite(Number(item.value[1])) || Number(item.value[1]) < 0) throw new Error('Invalid mesh counter');
      if (!unique(series.map(item => canonical(item.metric)))) throw new Error('Duplicate mesh counter series');
    }
  }
}
function bindingNode(binding: MeshBinding, graph: Pick<GraphSnapshotV2, 'nodes' | 'repositories'>) {
  const repo = graph.repositories.find(repo => repo.productId === binding.productId && repo.repositoryId === binding.repositoryId);
  if (!repo || repo.revision !== binding.revision) return [];
  return graph.nodes.filter(node => node.productId === binding.productId && node.repositoryId === binding.repositoryId && node.kind === binding.selector.kind
    && (!binding.selector.label || node.label === binding.selector.label) && (!binding.selector.path || node.locations.some(loc => loc.path === binding.selector.path)));
}
function groups(series: MeshSeries[]) {
  const result = new Map<string, { source: string; destination: string; sourceVersion: string; destinationVersion: string; sourceNamespace: string; destinationNamespace: string; value: number }>();
  for (const item of series) {
    const value = { source: item.metric.source_workload ?? 'unknown', destination: item.metric.destination_workload ?? 'unknown',
      sourceVersion: item.metric.source_canonical_revision ?? 'unknown', destinationVersion: item.metric.destination_canonical_revision ?? 'unknown',
      sourceNamespace: item.metric.source_workload_namespace ?? '', destinationNamespace: item.metric.destination_workload_namespace ?? '', value: Number(item.value[1]) };
    const key = JSON.stringify([value.source, value.destination, value.sourceVersion, value.destinationVersion, value.sourceNamespace, value.destinationNamespace]);
    const previous = result.get(key); value.value += previous?.value ?? 0; result.set(key, value);
  }
  return result;
}
/** Service communication is an observation. It never establishes event/schema/handler edges. */
export function correlateMesh(dataset: MeshDataset, graph: Pick<GraphSnapshotV2, 'nodes' | 'edges' | 'repositories'>): MeshView {
  validateMeshDataset(dataset);
  const comparisons: MeshComparison[] = [];
  for (const capture of dataset.captures) for (const protocol of ['http', 'tcp'] as const) {
    const beforeSeries = protocol === 'http' ? capture.httpBefore : capture.tcpBefore, afterSeries = protocol === 'http' ? capture.httpAfter : capture.tcpAfter;
    const baseline = new Map(beforeSeries.map(item => [canonical(item.metric), Number(item.value[1])]));
    const deltas = afterSeries.map(item => {
      const delta = Number(item.value[1]) - (baseline.get(canonical(item.metric)) ?? 0);
      if (delta < 0) throw new Error('Mesh counter reset: capture a new baseline after workload restart');
      return { metric: item.metric, value: [item.value[0], String(delta)] as [number, string] };
    });
    const candidates = [...groups(deltas).values()].map(item => ({ ...item, measured: item.value }))
      .filter(item => item.measured > 0);
    for (const declaration of dataset.declarations.filter(item => item.protocol === protocol)) {
      const source = dataset.bindings.find(item => item.service === declaration.from)!, destination = dataset.bindings.find(item => item.service === declaration.to)!;
      if (!candidates.some(item => item.source === source.workload && item.destination === destination.workload && item.sourceVersion === source.version && item.destinationVersion === destination.version
        && item.sourceNamespace === source.namespace && item.destinationNamespace === destination.namespace)) candidates.push({ source: source.workload, destination: destination.workload,
        sourceVersion: source.version, destinationVersion: destination.version, sourceNamespace: source.namespace, destinationNamespace: destination.namespace, value: 0, measured: 0 });
    }
    for (const item of candidates) {
      const source = dataset.bindings.find(binding => binding.workload === item.source && binding.namespace === item.sourceNamespace), destination = dataset.bindings.find(binding => binding.workload === item.destination && binding.namespace === item.destinationNamespace);
      const sourceNodes = source ? bindingNode(source, graph) : [], destinationNodes = destination ? bindingNode(destination, graph) : [];
      const resolved = sourceNodes.length === 1 && destinationNodes.length === 1 && source?.version === item.sourceVersion && destination?.version === item.destinationVersion;
      const declared = dataset.declarations.some(declaration => declaration.from === source?.service && declaration.to === destination?.service && declaration.protocol === protocol);
      const staticEdgeIds = resolved && protocol === 'http' && source?.service === 'orders-api' && destination?.service === 'inventory'
        ? graph.edges.filter(edge => {
          const from = graph.nodes.find(node => node.id === edge.from), to = graph.nodes.find(node => node.id === edge.to);
          return edge.type === 'invokes-endpoint' && from?.productId === source.productId && from.repositoryId === source.repositoryId
            && from.locations.some(loc => loc.path === 'apps/backend/src/orders/InventoryClient.ts') && to?.attributes.service === 'inventory'
            && to.productId === destination.productId && to.repositoryId === destination.repositoryId;
        }).map(edge => edge.id).sort() : [];
      comparisons.push({ from: source?.service ?? item.source, to: destination?.service ?? item.destination, protocol, captureId: capture.id, sourceVersion: item.sourceVersion, destinationVersion: item.destinationVersion,
        declared, staticEdgeIds, observed: item.measured > 0, measured: item.measured, unit: protocol === 'http' ? 'requests' : 'bytes',
        correlation: { status: resolved ? 'resolved' : 'pending', nodeIds: resolved ? [sourceNodes[0]!.id, destinationNodes[0]!.id] : [],
          reason: !resolved ? 'Workload/namespace/version/source revision absent or incompatible; communication remains pending.' : protocol === 'tcp' ? 'Mapped transport endpoints only. Broker traffic cannot identify event, subscription or consumer handler.'
            : staticEdgeIds.length ? 'Exact workload versions/revisions mapped to an existing static HTTP contract edge; traffic is limited to this window.' : 'Mapped workload identities and declared configuration only; no static code call edge is invented.' } });
    }
  }
  return { datasetHash: hash(dataset), clusterId: dataset.clusterId, namespace: dataset.namespace, captures: dataset.captures.map(({ id, window }) => ({ id, window })), bindings: dataset.bindings,
    comparisons: comparisons.sort((a, b) => JSON.stringify([a.captureId, a.protocol, a.from, a.to, a.sourceVersion, a.destinationVersion]).localeCompare(JSON.stringify([b.captureId, b.protocol, b.from, b.to, b.sourceVersion, b.destinationVersion]))) };
}
export function observationsHash(traceDataset: unknown, meshDataset?: MeshDataset) {
  return meshDataset ? hash({ traces: traceDataset ?? null, mesh: meshDataset }) : traceDataset ? hash(traceDataset) : null;
}
