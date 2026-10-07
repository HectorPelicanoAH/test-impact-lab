import type { GraphSnapshotV2, ObservationV2 } from '../../packages/impact-engine/src/schema-v2';
import { canonical, hash } from './core';
import type { ObservedSpan, ObservationDataset } from '../../packages/impact-engine/src/schema-v2';
export type { ObservedSpan, ObservationDataset } from '../../packages/impact-engine/src/schema-v2';
interface KV { key: string; value: { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean } }
function attributes(list: KV[] = []) {
  return Object.fromEntries(list.map(({ key, value }) => [key, value.stringValue ?? value.doubleValue ?? (value.intValue !== undefined ? Number(value.intValue) : value.boolValue ?? '')]));
}
function identifier(value: string | undefined, length: number) {
  if (!value) return '';
  if (new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(value)) return value.toLowerCase();
  return Buffer.from(value, 'base64').toString('hex');
}
/** Collector file backend emits OTLP JSON, one export per complete line. */
export function readCollector(text: string): ObservationDataset {
  const spans: ObservedSpan[] = [];
  for (const line of text.split('\n').filter(line => line.trim())) {
    const batch = JSON.parse(line) as { resourceSpans?: { resource?: { attributes?: KV[] }; scopeSpans?: { spans?: Record<string, any>[] }[] }[] };
    if (!Array.isArray(batch.resourceSpans)) throw new Error('Invalid Collector OTLP export');
    for (const group of batch.resourceSpans) {
      const resource = attributes(group.resource?.attributes);
      for (const scope of group.scopeSpans ?? []) for (const item of scope.spans ?? []) {
        spans.push({ traceId: identifier(item.traceId, 32), spanId: identifier(item.spanId, 16), parentSpanId: identifier(item.parentSpanId, 16),
          name: String(item.name ?? ''), kind: Number(item.kind ?? 0), startTimeUnixNano: String(item.startTimeUnixNano), endTimeUnixNano: String(item.endTimeUnixNano),
          service: String(resource['service.name'] ?? ''), version: String(resource['service.version'] ?? ''), environment: String(resource['deployment.environment.name'] ?? ''),
          product: String(resource['impact.product'] ?? ''), repository: String(resource['impact.repository'] ?? ''), revision: String(resource['impact.revision'] ?? ''),
          attributes: attributes(item.attributes), status: { code: Number(item.status?.code ?? 0), message: String(item.status?.message ?? '') },
          links: (item.links ?? []).map((link: { traceId: string; spanId: string }) => ({ traceId: identifier(link.traceId, 32), spanId: identifier(link.spanId, 16) })) });
      }
    }
  }
  // Delivery of OTLP itself can be retried. Identical spans are one observation; conflicting identities fail closed.
  const byId = new Map<string, ObservedSpan>();
  for (const span of spans) { const id = `${span.traceId}/${span.spanId}`; const old = byId.get(id); if (old && canonical(old) !== canonical(span)) throw new Error('Conflicting span identity'); byId.set(id, span); }
  const dataset: ObservationDataset = { schemaVersion: 1, spans: [...byId.values()].sort((a, b) => `${a.traceId}/${a.spanId}`.localeCompare(`${b.traceId}/${b.spanId}`)) };
  validateDataset(dataset);
  return dataset;
}
export function validateDataset(dataset: ObservationDataset) {
  if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.spans) || dataset.spans.length > 20_000) throw new Error('Invalid or oversized observation dataset');
  const seen = new Set<string>();
  for (const span of dataset.spans) {
    const key = `${span.traceId}/${span.spanId}`;
    if (!/^[a-f0-9]{32}$/.test(span.traceId) || !/^[a-f0-9]{16}$/.test(span.spanId) || (span.parentSpanId !== '' && !/^[a-f0-9]{16}$/.test(span.parentSpanId))
      || !span.name || !/^\d{1,20}$/.test(span.startTimeUnixNano) || !/^\d{1,20}$/.test(span.endTimeUnixNano) || BigInt(span.endTimeUnixNano) < BigInt(span.startTimeUnixNano)
      || seen.has(key) || ![span.service, span.version, span.environment, span.product, span.repository, span.revision, span.status?.message].every(item => typeof item === 'string')
      || !Number.isInteger(span.status.code) || !Number.isInteger(span.kind) || !span.attributes || typeof span.attributes !== 'object'
      || !Object.values(span.attributes).every(item => ['string', 'number', 'boolean'].includes(typeof item))
      || !Array.isArray(span.links) || !span.links.every(link => /^[a-f0-9]{32}$/.test(link.traceId) && /^[a-f0-9]{16}$/.test(link.spanId))) throw new Error('Invalid observation span');
    // Both dates must be representable before exposing a window to the UI.
    for (const time of [span.startTimeUnixNano, span.endTimeUnixNano]) new Date(Number(BigInt(time) / 1_000_000n)).toISOString();
    seen.add(key);
  }
}
export function correlate(dataset: ObservationDataset, graph: Pick<GraphSnapshotV2, 'nodes' | 'edges' | 'repositories'>): ObservationV2[] {
  validateDataset(dataset);
  const datasetHash = hash(dataset);
  return dataset.spans.map(span => {
    const repo = graph.repositories.find(repo => repo.productId === span.product && repo.repositoryId === span.repository);
    const compatible = repo?.revision === span.revision && span.version === '1' && span.environment === 'impact.local';
    const path = span.attributes['code.file.path'], symbol = span.attributes['code.function.name'];
    const candidates = compatible ? graph.nodes.filter(node => node.kind === 'symbol' && node.productId === span.product && node.repositoryId === span.repository
      && node.label === symbol && node.locations.some(loc => loc.path === path)) : [];
    const matched = candidates.length === 1;
    const nodeIds = matched ? [candidates[0]!.id] : [];
    const edgeIds: string[] = [];
    if (matched && span.name === 'outbox.publish') {
      for (const edge of graph.edges) if (edge.type === 'publishes' && edge.from === candidates[0]!.id
        && ['broker', 'environment', 'exchange', 'routingKey', 'schema', 'version'].every(key => edge.qualifiers[key] === String(span.attributes[`impact.messaging.${key}`] ?? ''))) edgeIds.push(edge.id);
    }
    if (matched && span.name === 'messaging.process') {
      const consumer = graph.nodes.find(node => node.kind === 'consumer' && node.label === span.service && span.attributes['messaging.subscription.name'] === span.service);
      const handler = graph.nodes.find(node => node.kind === 'symbol' && node.label === span.attributes['impact.handler.symbol'] && node.locations.some(loc => loc.path === span.attributes['impact.handler.path']));
      const registration = consumer && handler && graph.edges.find(edge => edge.type === 'realizes' && edge.from === handler.id && edge.to === consumer.id);
      if (consumer && handler && registration) {
        nodeIds.push(consumer.id, handler.id);
        for (const edge of graph.edges) if (edge.type === 'processes' && edge.from === consumer.id) edgeIds.push(edge.id);
      }
    }
    return { id: hash([datasetHash, span.traceId, span.spanId]), serviceId: span.service, serviceVersion: span.version, environment: span.environment,
      window: { start: new Date(Number(BigInt(span.startTimeUnixNano) / 1_000_000n)).toISOString(), end: new Date(Number(BigInt(span.endTimeUnixNano) / 1_000_000n)).toISOString() },
      traceRefs: [`${span.traceId}/${span.spanId}`], datasetHash, span,
      correlation: { status: matched ? 'resolved' : candidates.length > 1 ? 'ambiguous' : 'pending', nodeIds: [...new Set(nodeIds)].sort(), edgeIds: [...new Set(edgeIds)].sort(),
        reason: !compatible ? 'Repository revision, service version or environment incompatible; observation kept pending.' : matched ? 'Exact versioned code identity. Logical edges require an existing declared routing/handler identity; no temporal inference.' : 'Code symbol absent or ambiguous in this snapshot; observation kept pending.' } };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
