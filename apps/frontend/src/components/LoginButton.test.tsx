// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LoginButton } from './LoginButton';

afterEach(cleanup);
test('[C1] LoginButton renders an enabled submit action', () => {
  render(<LoginButton loading={false} />);
  expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('type', 'submit');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

test('[C2] LoginButton honors an explicit disabled state', () => {
  render(<LoginButton loading={false} disabled />);
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
});

test('[C3] LoginButton exposes its loading state', () => {
  render(<LoginButton loading />);
  expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveAttribute('aria-busy', 'true');
});
