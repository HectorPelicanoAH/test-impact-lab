import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { parseOrderCreated } from '../../packages/api-contract/src/order-created';
import schema from '../../packages/api-contract/src/order-created-v1.json';
import topology from '../../packages/messaging/src/topology.json';

test('OrderCreated v1 requires identity, correlation and a valid accepted order', () => {
  const event = { eventId: randomUUID(), correlationId: randomUUID(), type: 'OrderCreated', version: 1, occurredAt: new Date().toISOString(), order: { id: randomUUID(), sku: 'demo-widget', quantity: 2, status: 'accepted' } };
  expect(parseOrderCreated(event)).toEqual(event);
  expect(topology.schema).toBe(schema.name); expect(topology.version).toBe(schema.version); expect(topology.routingKey).toBe(schema.routingKey);
  for (const invalid of [{ ...event, version: 2 }, { ...event, correlationId: '' }, { ...event, eventId: '' }, { ...event, order: { ...event.order, quantity: 0 } }]) {
    expect(() => parseOrderCreated(invalid)).toThrow();
  }
});