import { defineConfig, devices } from '@playwright/test';
// scripts/e2e.mjs allocates ports once, before Playwright reloads config in workers.
const backend = process.env.BACKEND_PORT ?? '3101';
const frontend = process.env.FRONTEND_PORT ?? '5174';
const inventory = process.env.INVENTORY_PORT ?? '3103';
if (![backend, frontend, inventory].every(value => /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 65535)) {
  throw new Error('Invalid test service ports');
}
if (new Set([backend, frontend, inventory]).size !== 3) throw new Error('Backend, frontend and inventory need distinct ports');
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${frontend}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    ...(process.env.BROKER_URL ? [
      { command: 'pnpm dev:notifications', url: `${process.env.NOTIFICATIONS_URL}/health`, env: { CONSUMER_PORT: process.env.NOTIFICATIONS_PORT! }, reuseExistingServer: false },
      { command: 'pnpm dev:preparation', url: `${process.env.PREPARATION_URL}/health`, env: { CONSUMER_PORT: process.env.PREPARATION_PORT! }, reuseExistingServer: false },
    ] : []),
    { command: 'pnpm dev:inventory', url: `http://127.0.0.1:${inventory}/health`, env: { INVENTORY_PORT: inventory }, reuseExistingServer: false },
    { command: 'pnpm dev:backend', url: `http://127.0.0.1:${backend}/health`, env: { BACKEND_PORT: backend, INVENTORY_PORT: inventory }, reuseExistingServer: false },
    { command: 'pnpm dev:frontend', url: `http://127.0.0.1:${frontend}`, env: { BACKEND_PORT: backend, FRONTEND_PORT: frontend }, reuseExistingServer: false },
  ],
});
