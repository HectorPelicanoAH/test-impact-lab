import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { parseOrderCreated, type OrderCreated } from '@test-impact/api-contract/order-created';
import { closeBroker, confirmed, declareTopology, openBroker, topology } from './transport';
import { ConsumerStore } from './ConsumerStore';

export interface ConsumerOptions { url: string; namespace?: string; subscription: string; store: ConsumerStore; effect: (event: OrderCreated) => Record<string, unknown>; beforeEffect?: (event: OrderCreated, attempt: number) => void }
/** One channel/prefetch per consumer: faults and retries never share another consumer's subscription. */
export function startConsumer(options: ConsumerOptions) {
  let stopped = false, connection: ChannelModel | undefined, ready = false;
  let wake: (() => void) | undefined;
  const stats = { attempts: 0, duplicates: 0, failed: 0, processed: 0, reconnects: 0 };
  const layout = topology(options.namespace), subscription = layout.subscriptions.find(item => item.id === options.subscription);
  if (!subscription) throw new Error('Unknown configured subscription');
  async function deliver(channel: ConfirmChannel, message: ConsumeMessage) {
    stats.attempts++;
    const rawAttempt = message.properties.headers?.['x-attempt'];
    const attempt = Number.isSafeInteger(rawAttempt) && rawAttempt >= 0 ? Math.min(rawAttempt as number, layout.maxAttempts - 1) : 0;
    try {
      const event = parseOrderCreated(JSON.parse(message.content.toString('utf8')));
      if (message.properties.messageId !== event.eventId || message.properties.correlationId !== event.correlationId) throw new Error('Envelope properties differ');
      if (!options.store.has(event.eventId)) options.beforeEffect?.(event, attempt);
      if (options.store.accept(event, options.effect(event))) stats.processed++; else stats.duplicates++;
    } catch (error) {
      const exhausted = attempt + 1 >= layout.maxAttempts;
      await confirmed(channel, '', exhausted ? subscription!.failedQueue : subscription!.queue, message.content,
        { ...message.properties, headers: { ...message.properties.headers, 'x-attempt': attempt + 1, 'x-error': error instanceof Error ? error.message : 'Processing failed' } });
      if (exhausted) stats.failed++;
    }
    channel.ack(message); // effect or retry/DLQ is durable and confirmed first
  }
  const done = (async () => {
    const deliveries = new Set<Promise<unknown>>();
    while (!stopped) {
      try {
        const current = await openBroker(options.url);
        connection = current;
        const lost = new Promise<void>(resolve => { current.once('close', resolve); wake = resolve; });
        const channel = await current.createConfirmChannel();
        channel.on('error', () => { void closeBroker(current); });
        await declareTopology(channel, layout);
        await channel.prefetch(1);
        await channel.consume(subscription.queue, message => {
          if (!message) { void closeBroker(current); return; }
          const delivery = deliver(channel, message).catch(() => closeBroker(current));
          deliveries.add(delivery);
          void delivery.finally(() => deliveries.delete(delivery));
        }, { noAck: false });
        ready = true;
        if (stopped) await closeBroker(connection);
        await lost;
      } catch { stats.reconnects++; }
      finally { ready = false; if (connection) await closeBroker(connection); await Promise.allSettled(deliveries); connection = undefined; }
      if (!stopped) await new Promise<void>(resolve => { const timer = setTimeout(resolve, 250); wake = () => { clearTimeout(timer); resolve(); }; });
    }
  })();
  return { stats, get ready() { return ready; }, async close() { stopped = true; wake?.(); if (connection) await closeBroker(connection); await done; } };
}