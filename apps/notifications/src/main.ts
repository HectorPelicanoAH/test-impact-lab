import { runConsumerService } from '@test-impact/messaging/service';
import type { OrderCreated } from '@test-impact/api-contract/order-created';
export function notify(event: OrderCreated) {
  return { orderId: event.order.id, eventId: event.eventId, correlationId: event.correlationId,
    status: 'stored', message: `Order ${event.order.id} accepted.`, delivery: 'local-mailbox-only' };
}
runConsumerService('notifications', notify, 3004);