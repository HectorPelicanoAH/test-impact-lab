import { afterAll, beforeAll, expect, test } from 'vitest';
import { startTestApi } from '../support/http';

let api: Awaited<ReturnType<typeof startTestApi>>;
beforeAll(async () => { api = await startTestApi(); });
afterAll(async () => { await api?.close(); });

test('[I1] HTTP login composes the real repository and aggregate', async () => {
  const response = await fetch(`${api.url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ' DEMO@EXAMPLE.COM ', password: 'impact-demo' }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user: { id: 'demo-user', email: 'demo@example.com' }, redirectTo: '/home' });
});

test('[I2] HTTP login rejects the wrong password', async () => {
  const response = await fetch(`${api.url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'demo@example.com', password: 'wrong' }) });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
});
