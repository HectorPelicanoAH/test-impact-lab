import { afterEach, expect, test, vi } from 'vitest';
import { listenHost, serviceHostAllowed } from './network';
afterEach(() => vi.unstubAllEnvs());
test('basic profile binds loopback and rejects cluster or remote hosts', () => {
  vi.stubEnv('IMPACT_MESH_NAMESPACE', '');
  expect(listenHost()).toBe('127.0.0.1'); expect(serviceHostAllowed('127.0.0.1', 'inventory')).toBe(true);
  expect(serviceHostAllowed('inventory.impact-g8.svc.cluster.local', 'inventory')).toBe(false);
  expect(serviceHostAllowed('example.com', 'rabbitmq')).toBe(false);
});
test('explicit mesh profile permits only the matching service in the owned namespace', () => {
  vi.stubEnv('IMPACT_MESH_NAMESPACE', 'impact-g8'); expect(listenHost()).toBe('0.0.0.0');
  expect(serviceHostAllowed('inventory.impact-g8.svc.cluster.local', 'inventory')).toBe(true);
  for (const host of ['rabbitmq.impact-g8.svc.cluster.local', 'inventory.foreign.svc.cluster.local', 'inventory.impact-g8.svc.cluster.local.example.com', 'example.com']) expect(serviceHostAllowed(host, 'inventory')).toBe(false);
  vi.stubEnv('IMPACT_MESH_NAMESPACE', 'foreign'); expect(listenHost()).toBe('127.0.0.1');
});
