import { expect, test } from 'vitest';
import { validateLogin } from './validateLogin';

test('[FU3] Login validation reports fields independently', () => {
  expect(validateLogin('invalid', '')).toEqual({ email: 'Enter a valid email address.', password: 'Enter your password.' });
  expect(validateLogin('demo@example.com', 'secret')).toEqual({});
});
