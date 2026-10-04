import { expect, test } from 'vitest';
import { normalizeEmail } from './normalizeEmail';

test('[FU1] Email normalization trims and lowercases', () => {
  expect(normalizeEmail('  Demo@EXAMPLE.COM ')).toBe('demo@example.com');
});
