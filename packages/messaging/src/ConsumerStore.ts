import { DatabaseSync } from 'node:sqlite';
import type { OrderCreated } from '@test-impact/api-contract/order-created';

export class ConsumerStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS inbox (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS effects (order_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, body TEXT NOT NULL);');
  }
  has(eventId: string) { return Boolean(this.db.prepare('SELECT event_id FROM inbox WHERE event_id=?').get(eventId)); }
  accept(event: OrderCreated, effect: Record<string, unknown>): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.has(event.eventId)) {
        const previous = this.db.prepare('SELECT payload FROM inbox WHERE event_id=?').get(event.eventId) as { payload: string };
        if (previous.payload !== JSON.stringify(event)) throw new Error('Event identity collision');
        this.db.exec('COMMIT'); return false;
      }
      this.db.prepare('INSERT INTO inbox VALUES (?, ?)').run(event.eventId, JSON.stringify(event));
      this.db.prepare('INSERT INTO effects VALUES (?, ?, ?)').run(event.order.id, event.eventId, JSON.stringify(effect));
      this.db.exec('COMMIT'); return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  find(orderId: string) { const row = this.db.prepare('SELECT body FROM effects WHERE order_id=?').get(orderId) as { body: string } | undefined; return row ? JSON.parse(row.body) as Record<string, unknown> : undefined; }
  count() { return (this.db.prepare('SELECT count(*) AS total FROM effects').get() as { total: number }).total; }
  close() { this.db.close(); }
}