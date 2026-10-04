import { afterAll, beforeAll, expect, test } from 'vitest';
import { startTestApi } from '../support/http';
import type { UserRepository } from '../../apps/backend/src/auth/domain/UserRepository';

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

test('[I3] HTTP login hides whether an email is unknown', async () => {
  const response = await fetch(`${api.url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'absent@example.com', password: 'impact-demo' }) });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
});

test('[I4] HTTP login reports a locked account', async () => {
  const response = await fetch(`${api.url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'locked@example.com', password: 'impact-demo' }) });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { code: 'USER_LOCKED', message: 'This account is locked.' } });
});

test('[I5] HTTP login rejects malformed JSON before invoking authentication', async () => {
  const response = await fetch(`${api.url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":' });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: 'A valid JSON login request is required.' } });
});

test('[I6] HTTP login maps repository failures without leaking details', async () => {
  const repository: UserRepository = { async findByEmail() { throw new Error('database credentials leaked'); } };
  const failingApi = await startTestApi(repository);
  try {
    const response = await fetch(`${failingApi.url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'demo@example.com', password: 'secret' }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Unable to sign in. Try again later.' } });
  } finally {
    await failingApi.close();
  }
});
