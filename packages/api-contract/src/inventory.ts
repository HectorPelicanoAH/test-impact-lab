/** v1 is an HTTP contract, not an import of the inventory implementation. */
export const INVENTORY_ENVIRONMENT = 'local';
export const INVENTORY_SERVICE = 'inventory';
export const INVENTORY_CONTRACT_VERSION = 1;
export const INVENTORY_PATH = '/v1/stock/:sku';

export interface StockResponse { version: 1; sku: string; available: number }

export function parseStock(value: unknown, sku: string): StockResponse {
  if (!value || typeof value !== 'object') throw new Error('Invalid inventory response');
  const item = value as Partial<StockResponse>;
  if (item.version !== 1 || item.sku !== sku || !Number.isSafeInteger(item.available) || item.available! < 0) {
    throw new Error('Incompatible inventory contract');
  }
  return { version: 1, sku, available: item.available! };
}