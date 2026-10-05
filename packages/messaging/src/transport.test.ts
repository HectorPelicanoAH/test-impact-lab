import { EventEmitter } from 'node:events';
import type { ConfirmChannel } from 'amqplib';
import { expect, test, vi } from 'vitest';
import { confirmed } from './transport';

test('synchronous publish failure clears timer and mandatory-return listener', async () => {
  vi.useFakeTimers();
  const channel = Object.assign(new EventEmitter(), { publish() { throw new Error('Closed channel'); } });
  try {
    await expect(confirmed(channel as unknown as ConfirmChannel, '', 'queue', Buffer.from('event'))).rejects.toThrow('Closed channel');
    expect(vi.getTimerCount()).toBe(0);
    expect(channel.listenerCount('return')).toBe(0);
  } finally { vi.useRealTimers(); }
});

test('publisher confirm alone cannot hide an unroutable mandatory return', async () => {
  const channel = Object.assign(new EventEmitter(), { publish(...args: unknown[]) { channel.emit('return', {}); (args.at(-1) as (error: null) => void)(null); } });
  await expect(confirmed(channel as unknown as ConfirmChannel, '', 'queue', Buffer.from('event'))).rejects.toThrow('Unroutable');
  expect(channel.listenerCount('return')).toBe(0);
});