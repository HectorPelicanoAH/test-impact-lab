import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', '**/node_modules/**'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
