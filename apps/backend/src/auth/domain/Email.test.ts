import { expect, test } from 'vitest';
import { Email } from './Email';

test('[BU10] Email trims and lowercases its value', () => {
  expect(new Email('  Demo@EXAMPLE.COM ').value).toBe('demo@example.com');
});

test('[BU11] Email rejects malformed addresses', () => {
  for (const value of ['', 'missing-at.example.com', 'missing@domain', 'spaces @example.com']) {
    expect(() => new Email(value)).toThrow('Invalid email');
  }
});

test('[BU12] Email rejects values longer than the contract limit', () => {
  expect(() => new Email(`${'a'.repeat(244)}@example.com`)).toThrow('Invalid email');
});
