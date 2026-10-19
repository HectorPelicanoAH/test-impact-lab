import { createServer as createViteServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDemoApi } from '../apps/demo/server';
import { materializeInventory } from './inventory/materialize.mjs';

// Ephemeral servers, genuine extractors. No reuse of the developer's services.
const external = materializeInventory(), previousInventory = process.env.INVENTORY_ROOT;
process.env.INVENTORY_ROOT = external.root;
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
  await page.addInitScript(() => {
    (window as typeof window & { browserErrors: string[] }).browserErrors = [];
    window.addEventListener('error', event => (window as typeof window & { browserErrors: string[] }).browserErrors.push(event.message));
  });
  if (process.argv.includes('--diagnose-resize')) {
    await page.addInitScript(() => {
      const Native = window.ResizeObserver;
      const recent: { origin: string; targets: string[] }[] = [];
      window.ResizeObserver = class extends Native {
        constructor(callback: ResizeObserverCallback) {
          const origin = new Error().stack ?? '';
          super((entries, observer) => {
            recent.push({ origin: origin.split('\n').slice(0, 4).join('\n'), targets: entries.slice(0, 2).map(entry => entry.target.className.toString()) });
            if (recent.length > 8) recent.shift();
            callback(entries, observer);
          });
        }
      };
      window.addEventListener('error', event => {
        if (event.message.includes('ResizeObserver')) console.log('RESIZE_ORIGINS', JSON.stringify(recent));
      });
    });
    page.on('console', message => { if (message.text().startsWith('RESIZE_ORIGINS')) console.log(message.text()); });
  }
  await page.goto(`http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`);
  await expect(page.getByRole('heading', { name: 'El grafo está vacío' })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.screenshot({ path: resolve(reports, '01-empty.png') });
  await page.getByRole('navigation').getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('button', { name: 'Ver test y resultado', exact: true }).first().click();
  await expect(page.locator('.test-inspector')).toContainText('Vitest');
  await expect(page.locator('.test-source-editor .monaco-editor')).toBeVisible();
  await expect(page.getByRole('button', { name: /RUN SELECTED TESTS/ })).toBeDisabled();
  await page.getByRole('navigation').getByRole('button', { name: 'Grafos', exact: true }).click();
  async function next() {
    const button = page.getByRole('button', { name: 'Ejecutar siguiente paso', exact: true });
    await expect(button).toBeEnabled({ timeout: 30000 });
    const sequence = Number(await page.locator('.live-step').getAttribute('data-sequence'));
    await button.click();
    await expect(page.locator('.live-step')).toHaveAttribute('data-sequence', String(sequence + 1), { timeout: 60000 });
    await expect(page.locator('.process-loader')).toHaveCount(0, { timeout: 30000 });
    await expect(page.locator('.error-banner')).toHaveCount(0);
    console.log(await page.locator('.live-step b').first().innerText());
  }
  if (process.argv.includes('--fast-flow')) {
    const phases: { id: string; sequence: number }[] = [];
    page.on('request', request => {
      const match = request.url().match(/graph-sessions\/([^/]+)\/next$/);
      if (match && request.method() === 'POST') phases.push({ id: match[1]!, sequence: request.postDataJSON().sequence });
    });
    await page.getByRole('navigation').getByRole('button', { name: 'Tests', exact: true }).click();
    await expect(page.getByLabel('Selected tests')).toContainText('Waiting for code change to calculate regression.');
    await expect(page.getByLabel('Selected tests').locator('.test-row')).toHaveCount(0);
    expect(await page.locator('.tests-view > section').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label') ?? element.className))).toEqual([
      'Selected tests', 'execution-panel', 'Test code viewer', 'Distributed suites', 'All tests',
    ]);
    await page.getByRole('navigation').getByRole('button', { name: 'Grafos', exact: true }).click();
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/graph-sessions/*/next', async route => {
      const response = await route.fetch(); await gate; await route.fulfill({ response });
    }, { times: 1 });
    await page.getByRole('button', { name: 'Generar grafo completo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ejecutando todo…', exact: true })).toBeDisabled();
    await expect.poll(() => phases.length).toBe(1);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    release();
    await expect(page.locator('.process-loader')).toHaveCount(0);
    await expect(page.locator('.live-step')).toContainText('Proceso cancelado');
    expect(phases).toHaveLength(1);
    await page.getByRole('button', { name: 'Reiniciar grafo', exact: true }).click();
    await next(); // A partly discovered graph can be completed automatically.
    const discovery = phases.at(-1)!.id;
    await page.getByRole('button', { name: 'Generar grafo completo', exact: true }).click();
    await expect(page.locator('.live-step')).toHaveAttribute('data-sequence', '10', { timeout: 180000 });
    await expect(page.getByRole('button', { name: 'Generar grafo completo', exact: true })).toBeDisabled();
    expect(phases.filter(item => item.id === discovery).map(item => item.sequence)).toEqual(Array.from({ length: 10 }, (_, index) => index));
    await expect(page.locator('.process-console-log article[data-phase]')).toHaveCount(10);
    await expect(page.locator('.process-console-log article[data-phase=imports]')).toContainText('ts.resolveModuleName()');
    await expect(page.locator('.phase-process')).toContainText('validateSnapshot()');
    await page.screenshot({ path: resolve(reports, 'process-console.png') });
    for (const [scenario, count, expected] of [['screen', 1, '1 tests · 0 suites seleccionadas'], ['event', 5, '0 tests · 5 suites seleccionadas']] as const) {
      await page.getByRole('navigation').getByRole('button', { name: 'Código', exact: true }).click();
      await page.getByLabel('Escenario').selectOption(scenario);
      await page.getByRole('button', { name: 'Aplicar cambio', exact: true }).click();
      await page.getByRole('navigation').getByRole('button', { name: 'Grafos', exact: true }).click();
      const start = phases.length;
      await page.getByRole('button', { name: 'Analizar impacto completo', exact: true }).click();
      await expect(page.getByLabel('Selected tests')).toBeVisible({ timeout: 180000 });
      await expect(page.locator('.tests-heading')).toContainText(expected);
      await expect(page.getByLabel('Selected tests').locator('.test-row')).toHaveCount(count);
      await expect(page.getByLabel('Selected tests').locator('.test-row.excluded')).toHaveCount(0);
      await expect(page.getByLabel('All tests').locator('.test-row')).toHaveCount(39);
      expect(phases.slice(start).map(item => item.sequence)).toEqual(Array.from({ length: 14 }, (_, index) => index));
      await expect(page.locator('.process-console-log article[data-phase]')).toHaveCount(14);
      await expect(page.locator('.process-console-log article[data-phase=selection]')).toContainText('calculateFederatedImpact(');
      await page.getByLabel('Selected tests').getByRole('button', { name: 'VIEW CODE', exact: true }).first().click();
      await expect(page.getByLabel('Test code viewer').locator('.test-source-editor .monaco-editor')).toBeVisible();
      await page.getByLabel('Selected tests').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(reports, `fast-${scenario}-selected.png`) });
    }
    await page.getByRole('navigation').getByRole('button', { name: 'Código', exact: true }).click();
    await page.getByRole('button', { name: 'Restaurar código', exact: true }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Tests', exact: true }).click();
    await expect(page.getByLabel('Selected tests')).toContainText('Waiting for code change to calculate regression.');
    await expect(page.getByLabel('Selected tests').locator('.test-row')).toHaveCount(0);
    expect(await page.evaluate(() => (window as typeof window & { browserErrors: string[] }).browserErrors)).toEqual([]);
    expect(errors).toEqual([]);
    console.log('Fast flow: cancellation, partial discovery, 10/14 real phases, selected-first ordering, screen/event rows, source viewer and invalidation passed. No browser errors.');
  } else   if (process.argv.includes('--quick-changes')) {
    await page.getByRole('navigation').getByRole('button', { name: 'Código', exact: true }).click();
    const quick = page.getByLabel('Quick changes de v1');
    await expect(quick.getByRole('button')).toHaveCount(4);
    for (const [title, path, changed] of [
      ['Change LoginButton', 'apps/frontend/src/components/LoginButton.tsx', 'Continue'],
      ['Change login normalization', 'apps/frontend/src/auth/normalizeEmail.ts', 'value.trim()'],
      ['Change User.authenticate()', 'apps/backend/src/auth/domain/User.ts', "if (this.locked) return 'invalid-credentials'"],
      ['Change POST /login contract', 'packages/api-contract/src/login.ts', "'/session'"],
    ] as const) {
      const button = quick.getByRole('button', { name: title, exact: false });
      await expect(button.locator('small')).not.toHaveText('');
      await button.click();
      await expect(page.locator('.editor-header')).toContainText(path);
      await expect(page.locator('.editor-header')).toContainText('MODIFIED');
      await expect(page.locator('.diff-editor .modified-in-monaco-diff-editor .view-lines')).toContainText(changed);
      await expect.poll(async () => (await page.locator('.diff-editor .monaco-diff-editor').boundingBox())?.height ?? 0).toBeGreaterThan(200);
    }
    await page.screenshot({ path: resolve(reports, 'quick-changes-v1.png') });
    await page.getByRole('button', { name: 'Restaurar código', exact: true }).click();
    await expect(page.locator('.top-actions')).toContainText('0 MODIFIED');
    await page.getByRole('navigation').getByRole('button', { name: 'Grafos', exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    expect(await page.evaluate(() => (window as typeof window & { browserErrors: string[] }).browserErrors)).toEqual([]);
    expect(errors).toEqual([]);
    console.log('Four v1 quick changes: visible descriptions, correct source/diff, reset, no extraction or browser errors.');
  } else {
  await next(); await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await next(); expect(await page.locator('.react-flow__node').count()).toBeGreaterThan(0);
  await next(); await expect(page.locator('.react-flow__edge')).not.toHaveCount(0);
  const node = page.locator('.react-flow__node').filter({ hasText: 'LoginPage' }).first();
  await node.click({ force: true }); await expect(page.getByText('ENLACES DEL NODO', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Ver declaración/ }).first().click();
  await expect(page.locator('.live-source')).toBeVisible();
  await page.screenshot({ path: resolve(reports, '02-partial-proof.png') });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  if (!process.argv.includes('--diagnose-resize')) {
    for (let i = 0; i < 7; i++) await next();
    await expect(page.getByRole('button', { name: 'Ejecutar siguiente paso', exact: true })).toBeDisabled();
  }
  if (process.argv.includes('--scoped-selection')) {
    for (const [scenario, counts, total] of [['screen', '1 tests · 0 suites seleccionadas', 1], ['event', '0 tests · 5 suites seleccionadas', 5]] as const) {
      await page.getByRole('navigation').getByRole('button', { name: 'Código', exact: true }).click();
      await page.getByLabel('Escenario').selectOption(scenario);
      await page.getByRole('button', { name: 'Aplicar cambio', exact: true }).click();
      await page.getByRole('button', { name: 'Analizar impacto', exact: true }).click();
      for (let i = 0; i < 14; i++) await next();
      await page.getByRole('navigation').getByRole('button', { name: 'Tests', exact: true }).click();
      await expect(page.locator('.tests-heading')).toContainText(counts);
      await expect(page.getByRole('button', { name: `RUN SELECTED TESTS + SUITES · ${total}`, exact: true })).toBeEnabled();
      await page.screenshot({ path: resolve(reports, `scoped-${scenario}.png`) });
    }
    const response = page.waitForResponse(response => response.url().endsWith('/api/executions') && response.request().method() === 'POST');
    await page.getByRole('button', { name: /RUN SELECTED TESTS/ }).click();
    const started = await response; expect(started.status()).toBe(202);
    const id = (await started.json()).id as string;
    await expect(page.locator('.run-card header strong')).toHaveText(/FAILED|INCOMPLETE|PASSED/, { timeout: 300000 });
    const execution = await page.evaluate(async id => {
      const editor = await fetch('/api/editor-input').then(response => response.json());
      return fetch('/api/executions/' + id, { headers: { 'X-Test-Impact-Session': editor.sessionToken } }).then(response => response.json());
    }, id);
    expect(execution.results).toEqual([]);
    expect(execution.suiteResults.map((item: { id: string }) => item.id)).toEqual([
      'messaging-browser', 'messaging-runtime', 'notifications-consumer', 'order-created-contract', 'preparation-consumer',
    ]);
    expect(execution.suiteResults.find((item: { id: string }) => item.id === 'order-created-contract').status).toBe('failed');
    expect(execution.suiteResults.find((item: { id: string }) => item.id === 'messaging-runtime').status).toBe('unavailable');
    expect(await page.evaluate(() => (window as typeof window & { browserErrors: string[] }).browserErrors)).toEqual([]);
    expect(errors).toEqual([]);
    console.log(`Scoped selection browser passed: screen 1 local / 0 suites, event 0 local / 5 suites. Real event run ${id}: ${execution.durationMs} ms. No browser errors.`);
  } else {
  await page.getByRole('navigation').getByRole('button', { name: 'Código', exact: true }).click();
  await page.getByLabel('Escenario').selectOption('consumer'); await page.getByRole('button', { name: 'Aplicar cambio', exact: true }).click();
  await expect(page.locator('.diff-editor .view-lines').filter({ hasText: 'runConsumerService' })).not.toHaveCount(0);
  await expect.poll(async () => (await page.locator('.diff-editor .monaco-diff-editor').boundingBox())?.height ?? 0).toBeGreaterThan(200);
  await page.screenshot({ path: resolve(reports, '03-consumer-diff.png') });
  if (process.argv.includes('--diagnose-resize')) { console.log('Diagnostic browser errors:', await page.evaluate(() => (window as typeof window & { browserErrors: string[] }).browserErrors)); }
  else {
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
  await page.getByLabel('Encuadrar grafo').selectOption('http');
  await page.screenshot({ path: resolve(reports, '06-http-impact.png') });
  await expect(page.locator('.live-edge.retired')).not.toHaveCount(0);
  // Retired edges still open the original source. The inspector is not restricted
  // to the after graph where this binding no longer exists.
  const clientOption = page.getByLabel('Buscar nodo').locator('option').filter({ hasText: /^createInventoryClient · symbol$/ });
  await page.getByLabel('Buscar nodo').selectOption(await clientOption.getAttribute('value') as string);
  await page.locator('.node-link-list').getByRole('button', { name: /invoca endpoint/ }).click();
  await page.getByRole('button', { name: /Abrir evidencia/ }).first().click();
  await expect(page.locator('.live-source')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Tests', exact: true }).click();
  const runResponse = page.waitForResponse(response => response.url().endsWith('/api/executions') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /RUN SELECTED TESTS/ }).click();
  const started = await runResponse; expect(started.status()).toBe(202);
  const executionId = (await started.json()).id as string;
  await expect(page.locator('.run-card header strong')).toHaveText(/FAILED|INCOMPLETE|PASSED/, { timeout: 300000 });
  await expect(page.locator('.error-banner')).toHaveCount(0);
  const execution = await page.evaluate(async id => {
    const editor = await fetch('/api/editor-input').then(response => response.json());
    return fetch('/api/executions/' + id, { headers: { 'X-Test-Impact-Session': editor.sessionToken } }).then(response => response.json());
  }, executionId);
  expect(execution.suiteResults.find((item: { id: string }) => item.id === 'inventory-contract').status).toBe('failed');
  expect(execution.suiteResults.find((item: { id: string }) => item.id === 'inventory-provider').status).toBe('passed');
  expect(execution.suiteResults.find((item: { id: string }) => item.id === 'messaging-runtime').status).toBe('unavailable');
  expect(execution.results.filter((item: { durationMs?: number }) => item.durationMs !== undefined).length).toBeGreaterThan(0);
  await expect(page.getByLabel('Resumen de tests locales')).toContainText('0 failed');
  await expect(page.getByLabel('Resumen de suites distribuidas')).toContainText('1 failed');
  await expect(page.getByLabel('Resumen de suites distribuidas')).toContainText('2 unavailable');
  await page.getByRole('button', { name: 'Ver test y resultado', exact: true }).first().click();
  await expect(page.locator('.test-inspector')).toContainText('failed');
  await expect(page.locator('.test-inspector .test-failure')).toBeVisible();
  await page.locator('.test-inspector').scrollIntoViewIfNeeded();
  await expect(page.locator('.test-inspector')).toBeInViewport();
  await page.screenshot({ path: resolve(reports, '07-real-contract-failure.png') });
  console.log(`Real run ${executionId}: ${execution.results.length} local tests, ${execution.suiteResults.length} suites; contract failed, pinned provider passed, broker explicitly unavailable. ${execution.durationMs} ms.`);
  await page.getByRole('navigation').getByRole('button', { name: 'Grafos', exact: true }).click();
  await page.getByRole('button', { name: 'Reiniciar grafo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'El grafo está vacío' })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Código', exact: true }).click();
  await expect(page.locator('.editor-header')).toContainText('MODIFIED');
  expect(await page.evaluate(() => (window as typeof window & { browserErrors: string[] }).browserErrors)).toEqual([]);
  expect(errors).toEqual([]);
  console.log('Live graph browser: empty → partial evidence → new consumer → suite detail → retired HTTP source → real contract failure. No browser errors.');
  }
  }
  }
} finally {
  await browser?.close(); await vite?.close(); api.closeAllConnections();
  if (api.listening) await new Promise<void>(resolve => api.close(() => resolve()));
  if (previousInventory === undefined) delete process.env.INVENTORY_ROOT; else process.env.INVENTORY_ROOT = previousInventory;
  rmSync(external.root, { recursive: true, force: true });
}
