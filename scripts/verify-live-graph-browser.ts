import { createServer as createViteServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDemoApi } from '../apps/demo/server';

// Ephemeral servers, genuine extractors. No reuse of the developer's services.
const api = createDemoApi();
let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const reports = resolve('.impact-runs/live-graph-browser'); mkdirSync(reports, { recursive: true });
try {
  await new Promise<void>((resolve, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', resolve); });
  const apiPort = (api.address() as AddressInfo).port;
  vite = await createViteServer({ root: resolve('apps/demo'), configFile: resolve('apps/demo/vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } });
  await vite.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`);
  await expect(page.getByRole('heading', { name: 'El grafo está vacío' })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.screenshot({ path: resolve(reports, '01-empty.png') });
  async function next() {
    const button = page.getByRole('button', { name: 'Ejecutar siguiente paso', exact: true });
    await expect(button).toBeEnabled(); await button.click();
    await expect(button).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.process-loader')).toHaveCount(0, { timeout: 30000 });
    await expect(page.locator('.error-banner')).toHaveCount(0);
  }
  await next(); await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await next(); expect(await page.locator('.react-flow__node').count()).toBeGreaterThan(0);
  await next(); expect(await page.locator('.react-flow__edge').count()).toBeGreaterThan(0);
  const node = page.locator('.react-flow__node').filter({ hasText: 'LoginPage' }).first();
  await node.click({ force: true }); await expect(page.getByText('ENLACES DEL NODO', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Ver declaración/ }).first().click();
  await expect(page.locator('.live-source')).toBeVisible();
  await page.screenshot({ path: resolve(reports, '02-partial-proof.png') });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  for (let i = 0; i < 7; i++) await next();
  await expect(page.getByRole('button', { name: 'Ejecutar siguiente paso', exact: true })).toBeDisabled();
  await page.getByRole('navigation').getByRole('button', { name: 'Código', exact: true }).click();
  await page.getByLabel('Escenario').selectOption('consumer'); await page.getByRole('button', { name: 'Aplicar cambio', exact: true }).click();
  await page.screenshot({ path: resolve(reports, '03-consumer-diff.png') });
  await page.getByRole('button', { name: 'Analizar impacto', exact: true }).click();
  for (let i = 0; i < 9; i++) await next();
  await expect(page.locator('.live-step')).toContainText('Conectar eventos y consumidores');
  await page.getByRole('button', { name: 'Ver novedades', exact: true }).click();
  await expect(page.locator('.live-node.fresh')).not.toHaveCount(0);
  await page.screenshot({ path: resolve(reports, '04-consumer-messaging.png') });
  for (let i = 0; i < 5; i++) await next();
  await page.getByRole('navigation').getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('button', { name: 'Ver test y resultado', exact: true }).first().click();
  await expect(page.locator('.test-inspector')).toContainText('SUITE DISTRIBUIDA');
  await page.screenshot({ path: resolve(reports, '05-suite-inspector.png') });
  await page.getByRole('navigation').getByRole('button', { name: 'Código', exact: true }).click();
  await page.getByLabel('Escenario').selectOption('http'); await page.getByRole('button', { name: 'Aplicar cambio', exact: true }).click();
  await page.getByRole('button', { name: 'Analizar impacto', exact: true }).click();
  for (let i = 0; i < 14; i++) await next();
  await expect(page.locator('.live-edge.retired')).not.toHaveCount(0);
  await page.screenshot({ path: resolve(reports, '06-http-impact.png') });
  expect(errors).toEqual([]);
  console.log('Live graph browser: empty → partial evidence → new consumer → suite detail → HTTP removed binding. No browser errors.');
} finally {
  await browser?.close(); await vite?.close(); api.closeAllConnections();
  if (api.listening) await new Promise<void>(resolve => api.close(() => resolve()));
}
