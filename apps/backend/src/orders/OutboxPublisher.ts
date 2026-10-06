import { code, extract, inject, inSpan, SpanKind } from '@test-impact/telemetry/context';
import { closeBroker, confirmed, declareTopology, openBroker, topology, definition } from '@test-impact/messaging/transport';
import type { OrderStore } from './OrderStore';

export async function flushOutbox(store: OrderStore, url: string, namespace?: string): Promise<number> {
  const pending = store.pending();
  if (!pending.length) return 0;
  const connection = await openBroker(url);
  try {
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => { /* The confirm rejects and leaves the row pending. */ });
    const layout = topology(namespace);
    await declareTopology(channel, layout);
    for (const event of pending) {
      await inSpan('outbox.publish', code('apps/backend/src/orders/OutboxPublisher.ts', 'flushOutbox', { 'messaging.message.id': event.eventId, 'order.id': event.order.id, 'messaging.destination.name': layout.exchange, ...Object.fromEntries(['broker', 'environment', 'exchange', 'routingKey', 'schema', 'version'].map(key => [`impact.messaging.${key}`, String((definition as unknown as Record<string, unknown>)[key])])) }), async () => {
        await confirmed(channel, layout.exchange, layout.routingKey, Buffer.from(JSON.stringify(event)),
          { contentType: 'application/json', type: event.type, messageId: event.eventId, correlationId: event.correlationId, headers: inject() });
        store.published(event.eventId);
      }, extract(store.traceContext(event.eventId)), SpanKind.PRODUCER, [extract(store.traceContext(event.eventId))]);
      // Crash before the SQLite acknowledgement can redeliver the event.
    }
    return pending.length;
  } finally { await closeBroker(connection); }
}
export function startOutboxPublisher(store: OrderStore, url: string) {
  let stopped = false, wake: (() => void) | undefined;
  let lastError: string | undefined;
  const done = (async () => {
    while (!stopped) {
      try { await flushOutbox(store, url); lastError = undefined; }
      catch (error) { lastError = error instanceof Error ? error.message : 'Publication failed'; }
      if (!stopped) await new Promise<void>(resolve => { const timer = setTimeout(resolve, 250); wake = () => { clearTimeout(timer); resolve(); }; });
    }
  })();
  return { get lastError() { return lastError; }, async close() { stopped = true; wake?.(); await done; } };
}