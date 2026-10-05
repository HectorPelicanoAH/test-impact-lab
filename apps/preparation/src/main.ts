import { runConsumerService } from '@test-impact/messaging/service';
import type { OrderCreated } from '@test-impact/api-contract/order-created';
export function prepare(event: OrderCreated) {
  return { orderId: event.order.id, eventId: event.eventId, correlationId: event.correlationId,
    status: 'ready', sku: event.order.sku, quantity: event.order.quantity };
}
runConsumerService('preparation', prepare, 3005);