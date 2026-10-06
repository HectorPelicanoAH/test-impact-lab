import { inject, type Carrier } from '@test-impact/telemetry/context';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { parseOrderCreated, type AcceptedOrder, type OrderCreated } from '@test-impact/api-contract/order-created';

export class OrderStore {
  readonly db: DatabaseSync;
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS outbox (event_id TEXT PRIMARY KEY, body TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0);');
    if (!(this.db.prepare('PRAGMA table_info(outbox)').all() as { name: string }[]).some(column => column.name === 'trace_context')) this.db.exec("ALTER TABLE outbox ADD COLUMN trace_context TEXT NOT NULL DEFAULT '{}'");
  }
  traceContext(eventId: string): Carrier {
    const row = this.db.prepare('SELECT trace_context FROM outbox WHERE event_id=?').get(eventId) as { trace_context: string } | undefined;
    return row ? JSON.parse(row.trace_context) as Carrier : {};
  }
  save(order: AcceptedOrder): OrderCreated {
    const event = parseOrderCreated({ eventId: randomUUID(), correlationId: order.id, type: 'OrderCreated', version: 1, occurredAt: new Date().toISOString(), order });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO orders VALUES (?, ?)').run(order.id, JSON.stringify(order));
      this.db.prepare('INSERT INTO outbox (event_id, body, trace_context) VALUES (?, ?, ?)').run(event.eventId, JSON.stringify(event), JSON.stringify(inject()));
      this.db.exec('COMMIT'); return event;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  find(id: string): AcceptedOrder | undefined { const row = this.db.prepare('SELECT body FROM orders WHERE id=?').get(id) as { body: string } | undefined; return row ? JSON.parse(row.body) as AcceptedOrder : undefined; }
  pending(): OrderCreated[] { return (this.db.prepare('SELECT body FROM outbox WHERE published=0 ORDER BY rowid LIMIT 50').all() as { body: string }[]).map(row => parseOrderCreated(JSON.parse(row.body))); }
  published(eventId: string) { this.db.prepare('UPDATE outbox SET published=1 WHERE event_id=?').run(eventId); }
  close() { this.db.close(); }
}