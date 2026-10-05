import { afterAll, beforeAll, expect, test } from 'vitest';
import { isLoginError, isLoginRequest, isLoginSuccess } from '../../packages/api-contract/src/login';
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

test('[CT2] POST login satisfies the invalid credentials contract', async () => {
  const response = await fetch(`${api.url}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@example.com', password: 'wrong' }),
  });
  const body: unknown = await response.json();
  expect(response.status).toBe(401);
  expect(isLoginError(body, response.status)).toBe(true);
  expect(body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) } });
  expect(isLoginError({ error: { code: 'INVALID_REQUEST', message: 'wrong code' } }, 401)).toBe(false);
});

test('[CT3] POST login satisfies the request validation error contract', async () => {
  const response = await fetch(`${api.url}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: '' }),
  });
  const body: unknown = await response.json();
  expect(response.status).toBe(400);
  expect(isLoginError(body, response.status)).toBe(true);
  expect(body).toEqual({ error: { code: 'INVALID_REQUEST', message: expect.any(String) } });
  expect(isLoginRequest({ email: 'demo@example.com', password: 'secret', role: 'admin' })).toBe(false);
});
