export interface AcceptedOrder { id: string; sku: string; quantity: number; status: 'accepted' }
export interface OrderCreated {
  eventId: string; correlationId: string; type: 'OrderCreated'; version: 1; occurredAt: string; order: AcceptedOrder;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function parseOrderCreated(value: unknown): OrderCreated {
  if (!value || typeof value !== 'object') throw new Error('Invalid OrderCreated');
  const item = value as Partial<OrderCreated>, order = item.order;
  if (item.type !== 'OrderCreated' || item.version !== 1 || typeof item.eventId !== 'string' || !uuid.test(item.eventId)
    || typeof item.correlationId !== 'string' || !uuid.test(item.correlationId)
    || typeof item.occurredAt !== 'string' || !Number.isFinite(Date.parse(item.occurredAt))
    || !order || typeof order.id !== 'string' || !uuid.test(order.id) || typeof order.sku !== 'string' || !/^[a-z0-9-]{1,40}$/.test(order.sku)
    || !Number.isSafeInteger(order.quantity) || order.quantity < 1 || order.quantity > 50 || order.status !== 'accepted') throw new Error('Incompatible OrderCreated v1');
  return { eventId: item.eventId, correlationId: item.correlationId, type: item.type, version: item.version,
    occurredAt: item.occurredAt, order: { id: order.id, sku: order.sku, quantity: order.quantity, status: order.status } };
}