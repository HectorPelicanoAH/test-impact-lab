import { context, propagation, trace, ROOT_CONTEXT, SpanKind, SpanStatusCode, type Attributes, type Context, type Span } from '@opentelemetry/api';
export { context, trace, ROOT_CONTEXT, SpanKind, SpanStatusCode };
export type Carrier = Record<string, string>;
export function carrier(headers: Record<string, unknown> = {}): Carrier {
  return Object.fromEntries(['traceparent', 'tracestate'].flatMap(key => typeof headers[key] === 'string' ? [[key, headers[key] as string]] : []));
}
export function extract(carrier: Carrier = {}): Context { return propagation.extract(ROOT_CONTEXT, carrier); }
export function inject(ctx = context.active()): Carrier { const carrier: Carrier = {}; propagation.inject(ctx, carrier); return carrier; }
export function code(path: string, symbol: string, attributes: Attributes = {}): Attributes {
  return { 'code.file.path': path, 'code.function.name': symbol, ...attributes };
}
export async function inSpan<T>(name: string, attributes: Attributes, work: (span: Span) => Promise<T>, parent = context.active(), kind = SpanKind.INTERNAL, links: Context[] = []): Promise<T> {
  const span = trace.getTracer('test-impact-lab', '1').startSpan(name, { kind, attributes,
    links: links.flatMap(ctx => { const sc = trace.getSpanContext(ctx); return sc ? [{ context: sc }] : []; }) }, parent);
  try { return await context.with(trace.setSpan(parent, span), () => work(span)); }
  catch (error) { span.recordException(error instanceof Error ? error : String(error)); span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) }); throw error; }
  finally { span.end(); }
}
