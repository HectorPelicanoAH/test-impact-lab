import { expect, test } from 'vitest';
import { PasswordHash } from './PasswordHash';

test('[BU13] PasswordHash verifies the original password', async () => {
  expect(await (await PasswordHash.fromPassword('secret')).matches('secret')).toBe(true);
});

test('[BU14] PasswordHash rejects a different password', async () => {
  expect(await (await PasswordHash.fromPassword('secret')).matches('different')).toBe(false);
});

test('[BU15] PasswordHash enforces password length bounds', async () => {
  await expect(PasswordHash.fromPassword('')).rejects.toThrow('length');
  await expect(PasswordHash.fromPassword('a'.repeat(257))).rejects.toThrow('length');
  expect(await (await PasswordHash.fromPassword('secret')).matches('a'.repeat(257))).toBe(false);
});
