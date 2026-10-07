import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

let provider: NodeTracerProvider | undefined;
/** Disabled unless explicitly configured. Export failure never changes product control flow. */
export function startTelemetry(service: string) {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!endpoint || provider) return;
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Telemetry endpoint must be local HTTP');
  provider = new NodeTracerProvider({ resource: resourceFromAttributes({ 'service.name': service, 'service.version': '1',
    'deployment.environment.name': 'impact.local', 'impact.product': 'test-impact-lab', 'impact.repository': 'login',
    'impact.revision': process.env.OTEL_CODE_REVISION ?? 'unknown' }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint, timeoutMillis: 700 }), { scheduledDelayMillis: 100, exportTimeoutMillis: 1000, maxQueueSize: 2048 })] });
  provider.register({ contextManager: new AsyncLocalStorageContextManager(), propagator: new W3CTraceContextPropagator() });
}
export async function stopTelemetry() { await provider?.shutdown(); }
