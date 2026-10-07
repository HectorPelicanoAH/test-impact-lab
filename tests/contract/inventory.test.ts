import { expect, test } from 'vitest';
import { INVENTORY_CONTRACT_VERSION, INVENTORY_ENVIRONMENT, INVENTORY_PATH, INVENTORY_SERVICE, parseStock } from '../../packages/api-contract/src/inventory';
import { createInventoryClient, InventoryFailure } from '../../apps/backend/src/orders/InventoryClient';
import binding from '../../impact/inventory-binding.json';
import contract from '../../packages/api-contract/src/inventory-contract.json';

test('inventory consumer contract is the qualified local v1 GET endpoint, not a coincident URL', async () => {
  expect(contract).toMatchObject({ environment: INVENTORY_ENVIRONMENT, service: INVENTORY_SERVICE,
    version: INVENTORY_CONTRACT_VERSION, method: 'GET', path: INVENTORY_PATH });
  expect(binding.contract).toMatchObject({ version: contract.version, method: contract.method, path: contract.path });
  expect(binding.environment).toBe(contract.environment);
  expect(binding.service).toBe(contract.service);
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe('http://127.0.0.1:3003/v1/stock/demo-widget');
    expect(init?.method).toBe('GET');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return new Response(JSON.stringify({ version: 1, sku: 'demo-widget', available: 8 }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  expect(await createInventoryClient('http://127.0.0.1:3003', fetcher)('demo-widget')).toEqual({ version: 1, sku: 'demo-widget', available: 8 });
});

test('inventory response validation rejects mismatched version, sku and stock value', async () => {
  for (const body of [
    { version: 2, sku: 'demo-widget', available: 8 },
    { version: 1, sku: 'another-item', available: 8 },
    { version: 1, sku: 'demo-widget', available: -1 },
    { version: 1, sku: 'demo-widget', available: 0.5 },
  ]) {
    expect(() => parseStock(body, 'demo-widget')).toThrow();
    const fetcher = async () => new Response(JSON.stringify(body));
    await expect(createInventoryClient('http://127.0.0.1:3003', fetcher)('demo-widget'))
      .rejects.toMatchObject({ reason: 'invalid-contract' } satisfies Partial<InventoryFailure>);
  }
  expect(() => createInventoryClient('https://inventory.example.com')).toThrow(/local HTTP origin/);
});
