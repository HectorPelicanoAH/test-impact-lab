import { connect, type ConfirmChannel, type ChannelModel, type Options } from 'amqplib';
import definition from './topology.json';

export { definition };
export type Subscription = typeof definition.subscriptions[number];
export function topology(namespace = process.env.BROKER_NAMESPACE ?? 'impact.local') {
  if (!/^[a-zA-Z0-9.-]{1,100}$/.test(namespace)) throw new Error('Invalid broker namespace');
  return { ...definition, exchange: `${namespace}.${definition.exchange}`, subscriptions: definition.subscriptions.map(item => ({ ...item,
    queue: `${namespace}.${item.queue}`, failedQueue: `${namespace}.${item.failedQueue}` })) };
}
export async function openBroker(url: string): Promise<ChannelModel> {
  const address = new URL(url);
  if (address.protocol !== 'amqp:' || !['127.0.0.1', 'localhost'].includes(address.hostname)) throw new Error('Broker must be a local AMQP endpoint');
  const connection = await connect(url, { timeout: 2_000 });
  connection.on('error', () => { /* Channel operations surface the failure; reconnect loop owns recovery. */ });
  return connection;
}
export async function declareTopology(channel: ConfirmChannel, layout = topology()) {
  await channel.assertExchange(layout.exchange, 'direct', { durable: true });
  for (const subscription of layout.subscriptions) {
    await channel.assertQueue(subscription.queue, { durable: true });
    await channel.assertQueue(subscription.failedQueue, { durable: true });
    await channel.bindQueue(subscription.queue, layout.exchange, layout.routingKey);
  }
}
/** Mandatory publication + confirm. A publisher confirm is not a consumer acknowledgement. */
export async function confirmed(channel: ConfirmChannel, exchange: string, routingKey: string, content: Buffer, properties: Options.Publish = {}) {
  let returned = false;
  const onReturn = () => { returned = true; };
  channel.on('return', onReturn);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Publisher confirmation timed out')), 5_000);
      try {
        channel.publish(exchange, routingKey, content, { ...properties, persistent: true, mandatory: true }, error => {
          clearTimeout(timer); error ? reject(error) : resolve();
        });
      } catch (error) { clearTimeout(timer); reject(error); }
    });
    if (returned) throw new Error('Unroutable mandatory publication');
  } finally { channel.off('return', onReturn); }
}
export async function closeBroker(connection: ChannelModel) { try { await connection.close(); } catch { /* Already lost. */ } }