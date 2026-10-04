// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LoginButton } from './LoginButton';

afterEach(cleanup);
test('[C1] LoginButton disables submission while loading', () => {
  const { rerender } = render(<LoginButton loading={false} />);
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  rerender(<LoginButton loading />);
  expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
});
