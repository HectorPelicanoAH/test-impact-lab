// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function fill(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  return user;
}

test('[C4] LoginForm submits normalized credentials and reports success', async () => {
  const onSuccess = vi.fn();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ user: { id: 'u1', email: 'demo@example.com' }, redirectTo: '/home' }));
  vi.stubGlobal('fetch', fetcher);
  render(<LoginForm onSuccess={onSuccess} />);
  const user = await fill(' Demo@EXAMPLE.COM ', 'secret');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith('/home'));
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ email: 'demo@example.com', password: 'secret' });
});

test('[C5] LoginForm validates malformed email before calling the service', async () => {
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  render(<LoginForm onSuccess={vi.fn()} />);
  const user = await fill('invalid', 'secret');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
  expect(fetcher).not.toHaveBeenCalled();
});

test('[C6] LoginForm explains both empty required fields', async () => {
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  render(<LoginForm onSuccess={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  const alerts = screen.getAllByRole('alert');
  expect(alerts.map(alert => alert.textContent)).toEqual(['Enter a valid email address.', 'Enter your password.']);
  expect(fetcher).not.toHaveBeenCalled();
});

test('[C7] LoginForm disables all controls while the request is pending', async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal('fetch', fetcher);
  render(<LoginForm onSuccess={vi.fn()} />);
  const user = await fill('demo@example.com', 'secret');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
  expect(screen.getByLabelText('Email')).toBeDisabled();
  expect(screen.getByLabelText('Password')).toBeDisabled();
  resolve(jsonResponse({ user: { id: 'u1', email: 'demo@example.com' }, redirectTo: '/home' }));
  await screen.findByRole('button', { name: 'Sign in' });
});

test('[C8] LoginForm displays service errors without navigating', async () => {
  const onSuccess = vi.fn();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
  }, 401));
  vi.stubGlobal('fetch', fetcher);
  render(<LoginForm onSuccess={onSuccess} />);
  const user = await fill('demo@example.com', 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  expect(onSuccess).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});
