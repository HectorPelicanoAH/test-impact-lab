import { afterAll, beforeAll, expect, test } from 'vitest';
import { isLoginRequest, isLoginSuccess } from '../../packages/api-contract/src/login';
import { startTestApi } from '../support/http';

let api: Awaited<ReturnType<typeof startTestApi>>;
beforeAll(async () => { api = await startTestApi(); });
afterAll(async () => { await api?.close(); });

test('[CT1] POST login satisfies the success consumer contract', async () => {
  const request = { email: 'demo@example.com', password: 'impact-demo' };
  expect(isLoginRequest(request)).toBe(true);
  const response = await fetch(`${api.url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  const body: unknown = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(isLoginSuccess(body)).toBe(true);
  // Consumer assertions also catch an accidentally weakened shared validator.
  expect(body).toEqual({ user: { id: expect.any(String), email: 'demo@example.com' }, redirectTo: '/home' });
  expect(isLoginSuccess({ user: { id: 'u1', email: 'demo@example.com' } })).toBe(false);
});
