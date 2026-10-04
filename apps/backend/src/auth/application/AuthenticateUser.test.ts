import { expect, test } from 'vitest';
import { AuthenticateUser } from './AuthenticateUser';
import { Email } from '../domain/Email';
import { PasswordHash } from '../domain/PasswordHash';
import { User } from '../domain/User';
import type { UserRepository } from '../domain/UserRepository';

test('[BU4] Use case queries the port and returns public identity', async () => {
  const requested: string[] = [];
  const user = new User('u1', new Email('demo@example.com'), await PasswordHash.fromPassword('secret'));
  const repository: UserRepository = { async findByEmail(email) { requested.push(email.value); return user; } };
  const result = await new AuthenticateUser(repository).execute(' DEMO@EXAMPLE.COM ', 'secret');
  expect(requested).toEqual(['demo@example.com']);
  expect(result).toEqual({ kind: 'authenticated', user: { id: 'u1', email: 'demo@example.com' } });
});

test('[BU5] Use case hides unknown user identity', async () => {
  const repository: UserRepository = { async findByEmail() { return undefined; } };
  expect(await new AuthenticateUser(repository).execute('absent@example.com', 'secret')).toEqual({ kind: 'invalid-credentials' });
});
