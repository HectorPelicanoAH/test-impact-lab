import { expect, test, vi } from 'vitest';
import type { OrderCreated } from '@test-impact/api-contract/order-created';
vi.mock('@test-impact/messaging/service', () => ({ runConsumerService: vi.fn() }));
import { notify } from './main';

test('notification records the accepted order in the local mailbox with correlation', () => {
  const event: OrderCreated = { eventId: 'event-1', correlationId: 'trace-1', type: 'OrderCreated', version: 1,
    occurredAt: '2026-10-05T00:00:00.000Z', order: { id: 'order-1', sku: 'demo-widget', quantity: 2, status: 'accepted' } };
  expect(notify(event)).toEqual({ orderId: 'order-1', eventId: 'event-1', correlationId: 'trace-1',
    status: 'stored', message: 'Order order-1 accepted.', delivery: 'local-mailbox-only' });
});
