import { serviceHostAllowed } from '@test-impact/messaging/network';
import { code, inject, inSpan, SpanKind, SpanStatusCode } from '@test-impact/telemetry/context';
import { INVENTORY_PATH, parseStock, type StockResponse } from '@test-impact/api-contract/inventory';

export class InventoryFailure extends Error {
  constructor(readonly reason: 'timeout' | 'unavailable' | 'invalid-contract') { super(reason); }
}

export function createInventoryClient(origin: string, fetcher: typeof fetch = fetch, timeoutMs = 700) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || !serviceHostAllowed(parsed.hostname, 'inventory') || parsed.pathname !== '/') throw new Error('Inventory URL must identify a local HTTP origin (loopback or the explicitly enabled mesh service).');
  return async function getStock(sku: string): Promise<StockResponse> {
    if (!/^[a-z0-9-]{1,40}$/.test(sku)) throw new InventoryFailure('invalid-contract');
    return inSpan('http.inventory', code('apps/backend/src/orders/InventoryClient.ts', 'createInventoryClient', { 'http.request.method': 'GET', 'http.route': INVENTORY_PATH }), async span => {
      let response: Response;
      try {
        response = await fetcher(new URL(INVENTORY_PATH.replace(':sku', sku), parsed), { method: 'GET', headers: inject(), signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        throw new InventoryFailure(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'unavailable');
      }
      span.setAttribute('http.response.status_code', response.status);
      if (!response.ok) span.setStatus({ code: SpanStatusCode.ERROR });
      if (response.status === 404) return { version: 1, sku, available: 0 };
      if (!response.ok) throw new InventoryFailure('unavailable');
      try { return parseStock(await response.json(), sku); }
      catch { throw new InventoryFailure('invalid-contract'); }
    }, undefined, SpanKind.CLIENT);
  };
}
