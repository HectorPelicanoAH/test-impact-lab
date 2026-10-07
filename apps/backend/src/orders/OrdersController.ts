import { code, inSpan } from '@test-impact/telemetry/context';
import { randomUUID } from 'node:crypto';
import { InventoryFailure } from './InventoryClient';
import type { StockResponse } from '@test-impact/api-contract/inventory';
import { OrderStore } from './OrderStore';

export interface Order { id: string; sku: string; quantity: number; status: 'accepted' }

export function createOrdersController(getStock: (sku: string) => Promise<StockResponse>, store = new OrderStore()) {
  return {
    async place(body: unknown): Promise<{ status: number; body: Order | { error: string } }> {
      if (!body || typeof body !== 'object' || !('sku' in body) || !('quantity' in body)
        || typeof body.sku !== 'string' || !/^[a-z0-9-]{1,40}$/.test(body.sku)
        || !Number.isSafeInteger(body.quantity) || (body.quantity as number) < 1 || (body.quantity as number) > 50) {
        return { status: 400, body: { error: 'A SKU and quantity from 1 to 50 are required.' } };
      }
      try {
        const available = await getStock(body.sku);
        if (available.available < (body.quantity as number)) return { status: 409, body: { error: 'Not enough inventory available.' } };
        const order: Order = { id: randomUUID(), sku: body.sku, quantity: body.quantity as number, status: 'accepted' };
        await inSpan('outbox.save', code('apps/backend/src/orders/OrderStore.ts', 'OrderStore.save', { 'order.id': order.id }), async span => { const event = store.save(order); span.setAttribute('messaging.message.id', event.eventId); });
        return { status: 201, body: order };
      } catch (error) {
        if (error instanceof InventoryFailure) return { status: error.reason === 'timeout' ? 504 : 502, body: { error: `Inventory ${error.reason}; order was not created.` } };
        throw error;
      }
    },
    find(id: string): Order | undefined { return store.find(id); },
  };
}