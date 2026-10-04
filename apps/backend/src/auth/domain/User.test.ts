import { expect, test } from 'vitest';
import { User } from './User';
import { Email } from './Email';
import { PasswordHash } from './PasswordHash';

test('[BU1] User authenticates the correct password', async () => {
  const user = new User('u1', new Email('demo@example.com'), await PasswordHash.fromPassword('secret'));
  expect(await user.authenticate('secret')).toBe('authenticated');
});

test('[BU2] User rejects an incorrect password', async () => {
  const user = new User('u1', new Email('demo@example.com'), await PasswordHash.fromPassword('secret'));
  expect(await user.authenticate('wrong')).toBe('invalid-credentials');
});

test('[BU3] Locked user rejects the correct password', async () => {
  const user = new User('u1', new Email('demo@example.com'), await PasswordHash.fromPassword('secret'), true);
  expect(await user.authenticate('secret')).toBe('locked');
});

test('[BU4] User requires a non-empty identity', async () => {
  const hash = await PasswordHash.fromPassword('secret');
  expect(() => new User('  ', new Email('demo@example.com'), hash)).toThrow('identity');
});

test('[BU5] User exposes its normalized email identity', async () => {
  const user = new User('u1', new Email(' Demo@EXAMPLE.COM '), await PasswordHash.fromPassword('secret'));
  expect(user.email.value).toBe('demo@example.com');
});
