import { expect, test } from 'vitest';
import { buildLoginRequest } from './buildLoginRequest';

test('[FU2] Login request builder normalizes email without changing password', () => {
  expect(buildLoginRequest(' Demo@EXAMPLE.COM ', ' Keep Spaces ')).toEqual({
    email: 'demo@example.com',
    password: ' Keep Spaces ',
  });
});
