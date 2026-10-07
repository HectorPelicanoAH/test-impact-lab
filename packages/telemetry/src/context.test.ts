import { afterAll, beforeAll, expect, test } from 'vitest';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { code, extract, inject, inSpan } from './context';
import { OrderStore } from '../../../apps/backend/src/orders/OrderStore';
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
beforeAll(() => provider.register({ contextManager: new AsyncLocalStorageContextManager(), propagator: new W3CTraceContextPropagator() }));
afterAll(() => provider.shutdown());
test('concurrent asynchronous requests retain their own W3C contexts, including tracestate', async () => {
  const parents = ['a', 'b'].map(letter => ({ traceparent: `00-${letter.repeat(32)}-${letter.repeat(16)}-01`, tracestate: `demo=${letter}` }));
  const results = await Promise.all(parents.map(parent => inSpan('request', code('request.ts', 'request'), async () => {
    await Promise.resolve();
    const first = inject();
    const nested = await inSpan('child', code('child.ts', 'child'), async () => { await Promise.resolve(); return inject(); });
    return { first, nested };
  }, extract(parent))));
  for (let index = 0; index < 2; index++) {
    expect(results[index]!.first.traceparent!.split('-')[1]).toBe(parents[index]!.traceparent.split('-')[1]);
    expect(results[index]!.nested.traceparent!.split('-')[1]).toBe(parents[index]!.traceparent.split('-')[1]);
    expect(results[index]!.nested.tracestate).toBe(parents[index]!.tracestate);
  }
});
test('pre-G7 SQLite schema migrates; context survives a store restart without entering the event contract', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'impact-g7-outbox-')), path = join(directory, 'orders.sqlite');
  const old = new DatabaseSync(path);
  old.exec('CREATE TABLE orders (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE outbox (event_id TEXT PRIMARY KEY, body TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0);');
  old.close();
  const store = new OrderStore(path);
  try {
    const parent = { traceparent: `00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`, tracestate: 'demo=persisted' };
    const saved = await inSpan('save', code('store.ts', 'save'), async () => {
      const expected = inject();
      const event = store.save({ id: randomUUID(), sku: 'demo-widget', quantity: 1, status: 'accepted' });
      return { event, expected };
    }, extract(parent));
    expect(saved.event).not.toHaveProperty('traceparent');
    store.close();
    const restarted = new OrderStore(path);
    try {
      expect(restarted.pending()).toEqual([saved.event]);
      expect(restarted.traceContext(saved.event.eventId)).toEqual(saved.expected);
      const published = await inSpan('publish-after-restart', {}, async () => inject(), extract(restarted.traceContext(saved.event.eventId)));
      expect(published.traceparent!.split('-')[1]).toBe('c'.repeat(32));
      expect(published.tracestate).toBe('demo=persisted');
    } finally { restarted.close(); }
  } finally { if (store.db.isOpen) store.close(); rmSync(directory, { recursive: true, force: true }); }
});
