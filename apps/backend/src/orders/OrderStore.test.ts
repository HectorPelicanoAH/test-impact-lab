import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { OrderStore } from './OrderStore';
import { ConsumerStore } from '../../../../packages/messaging/src/ConsumerStore';

test('order and outbox commit atomically and pending publication survives reopening', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'impact-outbox-'));
  const file = resolve(root, 'orders.sqlite');
  const store = new OrderStore(file);
  const order = { id: randomUUID(), sku: 'demo-widget', quantity: 2, status: 'accepted' as const };
  try {
    store.db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
    expect(() => store.save(order)).toThrow('storage failure');
    expect(store.find(order.id)).toBeUndefined();
    store.db.exec('DROP TRIGGER fail_outbox');
    const event = store.save(order);
    expect(store.find(order.id)).toEqual(order);
    expect(store.pending()).toEqual([event]);
    store.close();
    const reopened = new OrderStore(file);
    try { expect(reopened.pending()).toEqual([event]); reopened.published(event.eventId); expect(reopened.pending()).toEqual([]); }
    finally { reopened.close(); }
  } finally { if (store.db.isOpen) store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('consumer commits inbox and effect together and deduplicates after restart', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'impact-inbox-'));
  const orders = new OrderStore(), file = resolve(root, 'inbox.sqlite');
  const event = orders.save({ id: randomUUID(), sku: 'demo-widget', quantity: 1, status: 'accepted' });
  const inbox = new ConsumerStore(file);
  try {
    inbox.db.exec("CREATE TRIGGER fail_effect BEFORE INSERT ON effects BEGIN SELECT RAISE(ABORT, 'effect failure'); END");
    expect(() => inbox.accept(event, { status: 'ready' })).toThrow();
    expect(inbox.has(event.eventId)).toBe(false);
    inbox.db.exec('DROP TRIGGER fail_effect');
    expect(inbox.accept(event, { status: 'ready' })).toBe(true);
    inbox.close();
    const reopened = new ConsumerStore(file);
    try { expect(reopened.accept(event, { status: 'ready' })).toBe(false); expect(reopened.count()).toBe(1); expect(() => reopened.accept({ ...event, correlationId: randomUUID() }, {})).toThrow('identity collision'); }
    finally { reopened.close(); }
  } finally { if (inbox.db.isOpen) inbox.close(); orders.close(); rmSync(root, { recursive: true, force: true }); }
});