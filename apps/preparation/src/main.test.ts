import { expect, test, vi } from 'vitest';
import type { OrderCreated } from '@test-impact/api-contract/order-created';
vi.mock('@test-impact/messaging/service', () => ({ runConsumerService: vi.fn() }));
import { prepare } from './main';

test('preparation records only its own order effect', () => {
  const event: OrderCreated = { eventId: 'event-1', correlationId: 'trace-1', type: 'OrderCreated', version: 1,
    occurredAt: '2026-10-05T00:00:00.000Z', order: { id: 'order-1', sku: 'demo-widget', quantity: 2, status: 'accepted' } };
  expect(prepare(event)).toEqual({ orderId: 'order-1', eventId: 'event-1', correlationId: 'trace-1',
    status: 'ready', sku: 'demo-widget', quantity: 2 });
});
