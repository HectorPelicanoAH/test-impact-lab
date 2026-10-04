import { defineConfig, devices } from '@playwright/test';
// scripts/e2e.mjs allocates ports once, before Playwright reloads config in workers.
const backend = process.env.BACKEND_PORT ?? '3101';
const frontend = process.env.FRONTEND_PORT ?? '5174';
if (![backend, frontend].every(value => /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 65535)) {
  throw new Error('Invalid test service ports');
}
if (backend === frontend) throw new Error('Backend and frontend need distinct ports');
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${frontend}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm dev:backend', url: `http://127.0.0.1:${backend}/health`, env: { BACKEND_PORT: backend }, reuseExistingServer: false },
    { command: 'pnpm dev:frontend', url: `http://127.0.0.1:${frontend}`, env: { BACKEND_PORT: backend, FRONTEND_PORT: frontend }, reuseExistingServer: false },
  ],
});
