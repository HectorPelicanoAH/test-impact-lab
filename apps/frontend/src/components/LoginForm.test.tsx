// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test('[C2] LoginForm displays service errors without navigating', async () => {
  const onSuccess = vi.fn();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
  }), { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  const user = userEvent.setup();
  render(<LoginForm onSuccess={onSuccess} />);
  await user.type(screen.getByLabelText('Email'), 'demo@example.com');
  await user.type(screen.getByLabelText('Password'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  expect(onSuccess).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledWith('/login', expect.objectContaining({ method: 'POST' }));
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});
