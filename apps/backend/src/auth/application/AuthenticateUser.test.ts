import { expect, test } from 'vitest';
import { AuthenticateUser } from './AuthenticateUser';
import { Email } from '../domain/Email';
import { PasswordHash } from '../domain/PasswordHash';
import { User } from '../domain/User';
import type { UserRepository } from '../domain/UserRepository';

test('[BU6] Use case queries the port and returns public identity', async () => {
  const requested: string[] = [];
  const user = new User('u1', new Email('demo@example.com'), await PasswordHash.fromPassword('secret'));
  const repository: UserRepository = { async findByEmail(email) { requested.push(email.value); return user; } };
  const result = await new AuthenticateUser(repository).execute(' DEMO@EXAMPLE.COM ', 'secret');
  expect(requested).toEqual(['demo@example.com']);
  expect(result).toEqual({ kind: 'authenticated', user: { id: 'u1', email: 'demo@example.com' } });
});

test('[BU7] Use case hides unknown user identity', async () => {
  const repository: UserRepository = { async findByEmail() { return undefined; } };
  expect(await new AuthenticateUser(repository).execute('absent@example.com', 'secret')).toEqual({ kind: 'invalid-credentials' });
});

test('[BU8] Use case preserves the locked account outcome', async () => {
  const user = new User('u1', new Email('locked@example.com'), await PasswordHash.fromPassword('secret'), true);
  const repository: UserRepository = { async findByEmail() { return user; } };
  expect(await new AuthenticateUser(repository).execute('locked@example.com', 'secret')).toEqual({ kind: 'locked' });
});

test('[BU9] Use case validates email before querying the port', async () => {
  let queried = false;
  const repository: UserRepository = { async findByEmail() { queried = true; return undefined; } };
  await expect(new AuthenticateUser(repository).execute('not-an-email', 'secret')).rejects.toThrow('Invalid email');
  expect(queried).toBe(false);
});
