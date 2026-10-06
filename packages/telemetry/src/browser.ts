import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { code, inject, trace, ROOT_CONTEXT, SpanKind, SpanStatusCode } from './context';

let provider: WebTracerProvider | undefined;
export function startBrowserTelemetry(revision?: string) {
  if (!revision || provider) return;
  provider = new WebTracerProvider({ resource: resourceFromAttributes({ 'service.name': 'orders-screen', 'service.version': '1',
    'deployment.environment.name': 'impact.local', 'impact.product': 'test-impact-lab', 'impact.repository': 'login', 'impact.revision': revision }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: '/otel/v1/traces', timeoutMillis: 700 }), { scheduledDelayMillis: 100 })] });
  provider.register({ propagator: new W3CTraceContextPropagator() });
}
/** Explicit span context survives browser await boundaries without global async patching. */
export async function placeOrder(body: string) {
  const span = trace.getTracer('test-impact-lab', '1').startSpan('screen.place-order', { kind: SpanKind.CLIENT,
    attributes: code('apps/frontend/src/OrdersPage.tsx', 'OrdersPage', { 'http.request.method': 'POST', 'http.route': '/orders' }) }, ROOT_CONTEXT);
  try {
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...inject(trace.setSpan(ROOT_CONTEXT, span)) }, body });
    span.setAttribute('http.response.status_code', response.status);
    if (!response.ok) span.setStatus({ code: SpanStatusCode.ERROR });
    return response;
  } catch (error) { span.recordException(error instanceof Error ? error : String(error)); span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
  finally { span.end(); }
}
