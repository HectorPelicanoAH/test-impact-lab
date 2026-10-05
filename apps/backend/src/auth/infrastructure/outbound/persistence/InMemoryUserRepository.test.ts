import { expect, test } from 'vitest';
import { Email } from '../../../domain/Email';
import { PasswordHash } from '../../../domain/PasswordHash';
import { User } from '../../../domain/User';
import { InMemoryUserRepository } from './InMemoryUserRepository';

async function user(id: string, email: string) {
  return new User(id, new Email(email), await PasswordHash.fromPassword('secret'));
}

test('[BU16] Repository finds users by the Email value object', async () => {
  const expected = await user('u1', 'demo@example.com');
  const repository = new InMemoryUserRepository([expected]);
  expect(await repository.findByEmail(new Email(' DEMO@EXAMPLE.COM '))).toBe(expected);
  expect(repository.size).toBe(1);
});

test('[BU17] Repository rejects duplicate normalized emails', async () => {
  const first = await user('u1', 'demo@example.com');
  const duplicate = await user('u2', 'DEMO@example.com');
  expect(() => new InMemoryUserRepository([first, duplicate])).toThrow('Duplicate email');
});
