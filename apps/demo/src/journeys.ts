import type { OverlayEdit } from '../../../packages/impact-engine/src/schema-v2';

export const journeys = [
  { id: 'screen', title: 'New screen', description: 'Add a component and connect it to LoginPage with an import and JSX. Inspect added nodes and renders; no runtime route is claimed.' },
  { id: 'http', title: 'External HTTP contract', description: 'Declare inventory response v2 while the pinned provider and parser still use v1. Inspect missing-contract and the removed HTTP binding. Contract tests should fail.' },
  { id: 'event', title: 'Incompatible event', description: 'Declare OrderCreated v2 while publication and consumers still use v1. Inspect missing-contract and removed messaging relationships. Contract tests should fail.' },
  { id: 'consumer', title: 'New consumer', description: 'Add an audit handler and its independent queue binding. Inspect subscribes, realizes and processes. This overlay does not deploy a service or register new test coverage.' },
  { id: 'retry', title: 'Retry / failure', description: 'Make notifications throw and reduce maxAttempts to one. Inspect configuration and consumer impact. Real tests should fail; broker execution requires the RabbitMQ profile.' },
  { id: 'unresolved', title: 'Unresolved dependency', description: 'Replace the literal HTTP method with a runtime variable. The bounded adapter cannot prove this binding: inspect diagnostics and conservative selection. Runtime behavior still uses GET.' },
] as const;
export type JourneyId = typeof journeys[number]['id'];

/** Browser-side source transformations only. The API receives snapshotId + edits, never a journey ID. */
export function journeyEdits(id: JourneyId, files: Record<string, string>): OverlayEdit[] {
  const read = (path: string) => {
    if (files[path] === undefined) throw new Error(`Journey source is absent: ${path}`);
    return files[path]!;
  };
  const replace = (path: string, before: string, after: string): Exclude<OverlayEdit, { operation: 'delete' }> => {
    const content = read(path);
    if (content.split(before).length !== 2) throw new Error(`Journey source has changed; review ${path} before applying.`);
    return { path, content: content.replace(before, after) };
  };
  const add = (path: string, content: string): OverlayEdit => {
    if (path in files) throw new Error(`Journey cannot overwrite ${path}.`);
    return { path, operation: 'add', content };
  };
  const json = (path: string, transform: (value: any) => void): OverlayEdit => {
    const value = JSON.parse(read(path)); transform(value);
    return { path, content: `${JSON.stringify(value, null, 2)}\n` };
  };
  switch (id) {
    case 'screen': return [
      add('apps/frontend/src/GuidedScreen.tsx', 'export function GuidedScreen() {\n  return <section aria-label="Guided screen"><h2>Guided screen</h2><p>Overlay-only example. No runtime route is claimed.</p></section>;\n}\n'),
      { ...replace('apps/frontend/src/LoginPage.tsx', '<h1>Sign in</h1>', '<h1>Sign in</h1><GuidedScreen />'), content: "import { GuidedScreen } from './GuidedScreen';\n" + read('apps/frontend/src/LoginPage.tsx').replace('<h1>Sign in</h1>', '<h1>Sign in</h1><GuidedScreen />') },
    ];
    case 'http': return [json('packages/api-contract/src/inventory-contract.json', value => { value.version = 2; value.response.version = '2'; })];
    case 'event': return [json('packages/api-contract/src/order-created-v1.json', value => { value.version = 2; value.routingKey = 'order.created.v2'; })];
    case 'consumer': return [
      add('apps/notifications/src/AuditConsumer.ts', "import { runConsumerService } from '@test-impact/messaging/service';\nimport type { OrderCreated } from '@test-impact/api-contract/order-created';\nexport function audit(event: OrderCreated) {\n  return { eventId: event.eventId, orderId: event.order.id, status: 'audited' };\n}\nrunConsumerService('audit', audit, 3006);\n"),
      json('packages/messaging/src/topology.json', value => {
        if (value.subscriptions.some((item: { id: string }) => item.id === 'audit')) throw new Error('Audit consumer already exists.');
        value.subscriptions.push({ id: 'audit', queue: 'audit.order-created.v1', failedQueue: 'audit.failed.v1', source: 'apps/notifications/src/AuditConsumer.ts', handler: 'audit' });
      }),
    ];
    case 'retry': return [
      replace('apps/notifications/src/main.ts', "status: 'stored'", "status: (() => { throw new Error('Guided notification failure'); })()"),
      json('packages/messaging/src/topology.json', value => { value.maxAttempts = 1; }),
    ];
    case 'unresolved': return [replace('apps/backend/src/orders/InventoryClient.ts', "{ method: 'GET', headers: inject()", "{ method: parsed.protocol === 'http:' ? 'GET' : 'POST', headers: inject()")];
  }
}
