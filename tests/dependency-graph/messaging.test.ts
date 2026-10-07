import { expect, test } from 'vitest';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { locateSource } from '../../scripts/graph/locator';
import { hash } from '../../scripts/graph/core';

const base = () => buildArchive(loadWorkspace(process.cwd(), ''));
test('messaging facts have qualified broker identities and navigable source/config evidence, never sibling dependencies', () => {
  const archive = base();
  const graph = archive.graph;
  for (const [kind, count] of [['publishes', 1], ['subscribes', 2], ['processes', 2]] as const) {
    const edges = graph.edges.filter(edge => edge.type === kind);
    expect(edges).toHaveLength(count);
    for (const edge of edges) {
      expect(edge.qualifiers).toMatchObject({ broker: 'orders-rabbitmq', environment: 'local', schema: 'OrderCreated', version: '1' });
      for (const evidence of edge.evidenceIds) expect(locateSource(archive, { evidenceId: evidence })?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    }
  }
  const consumers = graph.nodes.filter(node => node.kind === 'consumer').map(node => node.id);
  expect(graph.edges.some(edge => consumers.includes(edge.from) && consumers.includes(edge.to))).toBe(false);
  expect(hash(graph)).toBe(hash(base().graph));
});

test('adding then removing a consumer yields exact delta and retains historical handler source', () => {
  const archive = base();
  const path = 'packages/messaging/src/topology.json';
  const topology = JSON.parse(archive.sources[path]!);
  const source = 'apps/notifications/src/extra.ts';
  topology.subscriptions.push({ id: 'audit', queue: 'audit.orders', failedQueue: 'audit.failed', source, handler: 'audit' });
  const added = analyzeOverlay(archive, [
    { path, content: JSON.stringify(topology) },
    { path: source, operation: 'add', content: "import { runConsumerService } from '@test-impact/messaging/service';\nexport function audit(event: any) { return { orderId: event.order.id }; }\nrunConsumerService('audit', audit, 3006);\n" },
  ]);
  expect(added.delta.nodes.added.some(node => node.kind === 'consumer' && node.label === 'audit')).toBe(true);
  expect(added.delta.edges.added.some(edge => edge.type === 'processes')).toBe(true);
  const removed = analyzeOverlay(added.after, [{ path, content: archive.sources[path]! }, { path: source, operation: 'delete' }]);
  expect(removed.delta.edges.removed.some(edge => edge.type === 'processes')).toBe(true);
  const previous = added.after.graph.nodes.find(node => node.kind === 'consumer' && node.label === 'audit')!;
  expect(locateSource(added.after, { nodeId: previous.id, index: 0 })?.content).toContain('function audit');
  expect(removed.result.selectionMode).toBe('conservative-full');
});

test('dynamic publication target or removed handler gives a diagnostic, not an authoritative relationship', () => {
  const archive = base(), path = 'apps/backend/src/orders/OutboxPublisher.ts';
  const dynamic = analyzeOverlay(archive, [{ path, content: archive.sources[path]!.replace('channel, layout.exchange, layout.routingKey,', 'channel, layout.exchange, process.env.ROUTING_KEY!,') }]);
  expect(dynamic.after.graph.edges.some(edge => edge.type === 'publishes')).toBe(false);
  expect(dynamic.after.graph.diagnostics.some(item => item.code === 'dynamic-reference' && item.message.includes('publication'))).toBe(true);
  const removed = analyzeOverlay(archive, [{ path: 'apps/notifications/src/main.ts', operation: 'delete' }]);
  expect(removed.after.graph.edges.filter(edge => edge.type === 'processes')).toHaveLength(1);
  expect(removed.after.graph.diagnostics.some(item => item.message.includes('Consumer notifications'))).toBe(true);
});

test('same queue in another broker/environment has distinct channel and subscription identities', () => {
  const archive = base(), path = 'packages/messaging/src/topology.json';
  const config = JSON.parse(archive.sources[path]!); config.environment = 'other-local'; config.broker = 'another-broker';
  const changed = analyzeOverlay(archive, [{ path, content: JSON.stringify(config) }]);
  const before = archive.graph.nodes.filter(node => node.kind === 'channel' || node.kind === 'subscription').map(node => node.id);
  const after = changed.after.graph.nodes.filter(node => node.kind === 'channel' || node.kind === 'subscription').map(node => node.id);
  expect(after.every(id => !before.includes(id))).toBe(true);
});

test('homonymous publication helper cannot impersonate the imported AMQP transport', () => {
  const archive = base(), path = 'apps/backend/src/orders/OutboxPublisher.ts';
  const content = archive.sources[path]!.replace('closeBroker, confirmed,', 'closeBroker,')
    .replace('export async function flushOutbox', 'async function confirmed(...args: unknown[]) {}\nexport async function flushOutbox');
  expect(analyzeOverlay(archive, [{ path, content }]).after.graph.edges.some(edge => edge.type === 'publishes')).toBe(false);
});

test('dynamic binding and a replaced topology source are diagnostic, not resolved subscriptions', () => {
  const archive = base(), path = 'packages/messaging/src/transport.ts';
  for (const content of [archive.sources[path]!.replace('layout.exchange, layout.routingKey);', 'layout.exchange, process.env.ROUTE!);'),
    archive.sources[path]!.replace("import definition from './topology.json';", "const definition = JSON.parse(process.env.TOPOLOGY!);")]) {
    const result = analyzeOverlay(archive, [{ path, content }]);
    expect(result.after.graph.edges.some(edge => edge.type === 'subscribes')).toBe(false);
    expect(result.after.graph.diagnostics.some(item => item.code === 'dynamic-reference')).toBe(true);
  }
});

test('consumer service must forward the registered subscription and handler without substitution', () => {
  const archive = base(), path = 'packages/messaging/src/service.ts';
  const content = archive.sources[path]!.replace('subscription, store, effect,', "subscription: 'preparation', store, effect,");
  const result = analyzeOverlay(archive, [{ path, content }]);
  expect(result.after.graph.edges.some(edge => edge.type === 'processes')).toBe(false);
  expect(result.after.graph.diagnostics.some(item => item.message.includes('registration/handler/transport'))).toBe(true);
});

test('non-object topology is a diagnostic rather than an invented messaging graph', () => {
  const archive = base();
  const result = analyzeOverlay(archive, [{ path: 'packages/messaging/src/topology.json', content: 'null' }]);
  expect(result.after.graph.edges.some(edge => edge.type === 'publishes')).toBe(false);
  expect(result.after.graph.diagnostics.some(item => item.message.includes('Unsupported messaging topology'))).toBe(true);
});