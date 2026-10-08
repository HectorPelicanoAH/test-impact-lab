import { beforeAll, expect, test } from 'vitest';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import type { DiscoveryArchive } from '../../packages/impact-engine/src/schema-v2';

let baseline: DiscoveryArchive;
beforeAll(() => { baseline = buildArchive(loadWorkspace(process.cwd(), '')); });
function edited(path: string, content: string) { return analyzeOverlay(baseline, [{ path, content }]).federated; }
function selected(result: ReturnType<typeof edited>) { return result.suites.filter(item => item.selected).map(item => item.id); }

test('orders screen has a causal path to its browser journey', () => {
  const path = 'apps/frontend/src/OrdersPage.tsx';
  const result = edited(path, `${baseline.sources[path]}\n// screen change`);
  const journey = result.suites.find(item => item.id === 'orders-browser');
  expect(journey).toMatchObject({ selected: true, availability: 'available' });
  expect(journey?.reason).toContain('Reviewed subject');
});

test('notification implementation selects its own checks without a preparation dependency', () => {
  const path = 'apps/notifications/src/main.ts';
  const result = edited(path, `${baseline.sources[path]}\n// local implementation change`);
  expect(result.mode).toBe('graph');
  expect(selected(result)).toContain('notifications-consumer');
  expect(selected(result)).not.toContain('preparation-consumer');
  expect(result.affectedNodes).not.toContain(baseline.graph.nodes.find(node => node.kind === 'consumer' && node.label === 'preparation')?.id);
});

test('publisher behavior and event schema changes reach both consumers', () => {
  const publisher = 'apps/backend/src/orders/OutboxPublisher.ts';
  const changedPublisher = edited(publisher, `${baseline.sources[publisher]}\n// behavior change with same schema`);
  expect(selected(changedPublisher)).toEqual(expect.arrayContaining(['messaging-runtime', 'notifications-consumer', 'preparation-consumer']));
  const schema = 'packages/api-contract/src/order-created-v1.json';
  const json = JSON.parse(baseline.sources[schema]!) as { version: number };
  json.version = 2;
  const changedSchema = edited(schema, `${JSON.stringify(json, null, 2)}\n`);
  expect(changedSchema.mode).toBe('graph');
  expect(selected(changedSchema)).not.toContain('orders-store');
  expect(selected(changedSchema)).not.toContain('inventory-contract');
  expect(selected(changedSchema)).toEqual(expect.arrayContaining(['order-created-contract', 'notifications-consumer', 'preparation-consumer']));
});

test('inventory contract includes provider checks but marks inaccessible source honestly', () => {
  const path = 'packages/api-contract/src/inventory-contract.json';
  const json = JSON.parse(baseline.sources[path]!) as { version: number };
  json.version = 2;
  const result = edited(path, `${JSON.stringify(json, null, 2)}\n`);
  expect(selected(result)).toEqual(expect.arrayContaining(['inventory-contract', 'orders-controller', 'inventory-provider']));
  expect(result.suites.find(item => item.id === 'inventory-provider')).toMatchObject({ selected: true, availability: 'source-inaccessible' });
});

test('removed notification subscription retains old evidence and does not connect sibling consumer', () => {
  const path = 'packages/messaging/src/topology.json';
  const json = JSON.parse(baseline.sources[path]!) as { subscriptions: { id: string }[] };
  json.subscriptions = json.subscriptions.filter(item => item.id !== 'notifications');
  const analysis = analyzeOverlay(baseline, [{ path, content: `${JSON.stringify(json, null, 2)}\n` }]);
  expect(analysis.delta.edges.removed.some(edge => edge.type === 'subscribes')).toBe(true);
  expect(analysis.federated.mode).toBe('graph');
  expect(selected(analysis.federated)).toContain('messaging-runtime');
  expect(selected(analysis.federated)).toContain('notifications-consumer');
  expect(selected(analysis.federated)).not.toContain('preparation-consumer');
  expect(analysis.federated.affectedNodes).not.toContain(baseline.graph.nodes.find(node => node.kind === 'consumer' && node.label === 'preparation')?.id);
});

test('unmapped source expands to all available and reports unavailable external checks', () => {
  const result = analyzeOverlay(baseline, [{ path: 'apps/frontend/src/UnknownPage.tsx', operation: 'add', content: 'export const UnknownPage = () => null;\n' }]).federated;
  expect(result.mode).toBe('conservative-full');
  expect(result.suites.every(item => item.selected)).toBe(true);
  expect(result.suites.find(item => item.id === 'inventory-provider')?.availability).toBe('source-inaccessible');
});

test('unverified HTTP destination expands selection instead of assuming a safe route', () => {
  const path = 'apps/backend/src/orders/InventoryClient.ts';
  const content = baseline.sources[path]!.replace("method: 'GET'", "method: 'POST'");
  expect(content).not.toBe(baseline.sources[path]);
  const result = edited(path, content);
  expect(result.mode).toBe('conservative-full');
  expect(result.warnings.join(' ')).toContain('could not be verified');
  expect(result.suites.every(item => item.selected)).toBe(true);
});
