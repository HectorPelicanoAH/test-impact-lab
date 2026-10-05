import { INVENTORY_PATH, parseStock, type StockResponse } from '@test-impact/api-contract/inventory';

export class InventoryFailure extends Error {
  constructor(readonly reason: 'timeout' | 'unavailable' | 'invalid-contract') { super(reason); }
}

export function createInventoryClient(origin: string, fetcher: typeof fetch = fetch, timeoutMs = 700) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || !['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/') throw new Error('Inventory URL must be a local HTTP origin.');
  return async function getStock(sku: string): Promise<StockResponse> {
    if (!/^[a-z0-9-]{1,40}$/.test(sku)) throw new InventoryFailure('invalid-contract');
    let response: Response;
    try {
      response = await fetcher(new URL(INVENTORY_PATH.replace(':sku', sku), parsed), { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new InventoryFailure(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'unavailable');
    }
    if (response.status === 404) return { version: 1, sku, available: 0 };
    if (!response.ok) throw new InventoryFailure('unavailable');
    try { return parseStock(await response.json(), sku); }
    catch { throw new InventoryFailure('invalid-contract'); }
  };
}