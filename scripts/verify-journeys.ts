import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { createDemoApi } from '../apps/demo/server';
import { executeTests } from '../apps/demo/execution';
import { journeys } from '../apps/demo/src/journeys';
import { calculateInBrowser } from './browser-analysis';
import type { DemoAnalysis, DemoExecution, DemoSnapshot } from '../apps/demo/src/types';
import { materializeInventory } from './inventory/materialize.mjs';
import { startBroker } from './messaging/broker.mjs';

const report = resolve('.impact-runs', `g9-journeys-${randomUUID()}`);
mkdirSync(report, { recursive: true });
const inventory = materializeInventory();
const previousInventory = process.env.INVENTORY_ROOT;
process.env.INVENTORY_ROOT = inventory.root;
// Always drain actual accepted runs before cleanup, even when a browser assertion fails.
const running = new Set<Promise<DemoExecution>>();
const api = createDemoApi(input => {
  const run = executeTests(input); running.add(run);
  void run.then(() => running.delete(run), () => running.delete(run));
  return run;
});
let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let broker: Awaited<ReturnType<typeof startBroker>> | undefined;
const previousBroker = { url: process.env.BROKER_URL, name: process.env.G5_BROKER_CONTAINER };
const results: unknown[] = [];
let retriedReads = 0;
async function readJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { ...headers, Connection: 'close' }, signal: AbortSignal.timeout(10_000) });
      assert.equal(response.status, 200);
      return await response.json() as T;
    } catch (error) {
      if (!(error instanceof TypeError) || attempt >= 2) throw error;
      retriedReads++; console.log('G9: retrying an idempotent status read after a connection failure');
      await new Promise(done => setTimeout(done, 100));
    }
  }
}
try {
  if (process.argv.includes('--broker')) {
    broker = await startBroker(); process.env.BROKER_URL = broker.url; process.env.G5_BROKER_CONTAINER = broker.name;
  }
  await new Promise<void>((done, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', done); });
  const apiOrigin = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  vite = await createViteServer({ root: resolve('apps/demo'), configFile: resolve('apps/demo/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': apiOrigin } } });
  await vite.listen(); browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const baseline = await readJson<DemoSnapshot>(`${apiOrigin}/api/snapshot`);
  await page.goto(`http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`);
  for (const journey of journeys) {
    console.log(`G9 Chromium: ${journey.title} — source → delta → evidence → impact → real execution`);
    await page.getByLabel('LEARNING JOURNEY', { exact: true }).selectOption(journey.id);
    await page.getByRole('button', { name: 'APPLY JOURNEY', exact: true }).click();
    await expect(page.getByLabel('Journey evidence')).toContainText(`Applied: ${journey.title}`);
    const analysis = await calculateInBrowser(page);
    await page.getByRole('button', { name: 'Explorador técnico', exact: true }).click();
    assert.notEqual(analysis.beforeGraphId, analysis.afterGraphId);
    await page.getByText('TOPOLOGY DELTA', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'INSPECT JOURNEY EVIDENCE', exact: true }).click();
    await page.getByRole('button', { name: /^OPEN VERIFIED (CODE|CONFIGURATION)/ }).first().click();
    await page.getByRole('region', { name: /Archived .* source/ }).waitFor();
    assert.ok(await page.locator('.evidence-lines mark').first().innerText());
    await page.screenshot({ path: resolve(report, `${journey.id}-evidence.png`), fullPage: true });
    await page.getByRole('button', { name: '← BACK TO PATH' }).click();
    await page.getByRole('button', { name: /^IMPACT → EXECUTION/ }).click();
    const run = async (mode: 'selected' | 'full') => {
      const started = page.waitForResponse(response => response.url().endsWith('/api/executions') && response.request().method() === 'POST');
      await page.getByRole('button', { name: mode === 'selected' ? /^RUN SELECTED TESTS/ : /^RUN FULL SUITE/ }).click();
      const runResponse = await started;
      assert.deepEqual(Object.keys(runResponse.request().postDataJSON()).sort(), ['analysisId', 'mode', 'snapshotId']);
      const initial = await runResponse.json() as DemoExecution;
      let execution = initial;
      const deadline = Date.now() + 600_000;
      while (execution.status === 'queued' || execution.status === 'running') {
        assert.ok(Date.now() < deadline, 'Real execution timed out');
        await new Promise(done => setTimeout(done, 500));
        execution = await readJson<DemoExecution>(`${apiOrigin}/api/executions/${initial.id}`, { 'X-Test-Impact-Session': baseline.sessionToken });
      }
      await expect(page.getByLabel('Journey evidence')).toContainText(`Execution: ${execution.status}`, { timeout: 10_000 });
      assert.ok(execution.results.length > 0);
      assert.equal(execution.error, undefined, 'Runner preparation/reporting failed instead of exercising the mutation');
      assert.ok(execution.results.every(item => item.status === 'passed'), 'Journey changed login behavior');
      assert.ok(execution.results.every(item => item.status !== 'passed' || typeof item.durationMs === 'number'));
      writeFileSync(resolve(report, `${journey.id}-${mode}.json`), JSON.stringify(execution, null, 2));
      return execution;
    };
    const selected = await run('selected');
    const expectedFailure = { http: 'inventory-contract', event: 'order-created-contract', retry: 'notifications-consumer' }[journey.id as 'http' | 'event' | 'retry'];
    if (expectedFailure) assert.ok(selected.suiteResults?.some(item => item.id === expectedFailure && item.status === 'failed'), `Mutation not detected: ${expectedFailure}`);
    else assert.equal(selected.results.filter(item => item.status === 'failed').length, 0, 'Login regression');
    if (journey.id !== 'retry') for (const suite of selected.suiteResults ?? []) {
      if (suite.availability === 'available') assert.equal(suite.status, suite.id === expectedFailure ? 'failed' : 'passed', `Unexpected suite outcome: ${suite.id}`);
      else assert.equal(suite.status, 'unavailable', `Unavailable suite was reported as executed: ${suite.id}`);
    }
    let full: DemoExecution | undefined;
    if (journey.id === 'retry') {
      full = await run('full');
      const failed = (run: DemoExecution) => [...run.results.filter(item => item.status === 'failed').map(item => item.testId),
        ...(run.suiteResults ?? []).filter(item => item.status === 'failed').map(item => item.id)];
      assert.ok(failed(full).includes('notifications-consumer'));
      for (const id of failed(full)) assert.ok(failed(selected).includes(id), `Full failure escaped selection: ${id}`);
    }
    await page.screenshot({ path: resolve(report, `${journey.id}-execution.png`), fullPage: true });
    results.push({ journey: journey.id, before: analysis.beforeGraphId, after: analysis.afterGraphId,
      delta: { added: analysis.delta.edges.added.length, removed: analysis.delta.edges.removed.length },
      mode: analysis.federated.mode, diagnostics: analysis.discovery.diagnostics.filter(item => !baseline.discovery.diagnostics.some(old => old.id === item.id)).map(item => item.code),
      selected: { status: selected.status, tests: selected.results.length, suites: selected.suiteResults?.map(({ id, status }) => ({ id, status })), durationMs: selected.durationMs },
      ...(full ? { full: { status: full.status, tests: full.results.length, suites: full.suiteResults?.map(({ id, status }) => ({ id, status })), durationMs: full.durationMs } } : {}) });
  }
  await page.setViewportSize({ width: 390, height: 850 });
  await page.screenshot({ path: resolve(report, 'narrow.png'), fullPage: true });
  assert.ok((await page.getByLabel('Learning journeys').boundingBox())!.width <= 390);
  await page.getByRole('button', { name: 'RESET', exact: true }).click();
  await expect(page.getByLabel('Journey evidence')).toHaveCount(0);
  assert.equal((await readJson<DemoSnapshot>(`${apiOrigin}/api/snapshot`)).id, baseline.id);
  assert.deepEqual(errors, []);
  writeFileSync(resolve(report, 'summary.json'), JSON.stringify({ status: 'passed', snapshot: baseline.id, inventoryRevision: inventory.revision, brokerEnabled: Boolean(broker), retriedReads, browserErrors: errors, results }, null, 2));
  console.log(`G9 journeys passed: ${report}`);
} finally {
  await Promise.allSettled([...running]);
  await browser?.close(); await vite?.close();
  await new Promise<void>(done => { api.close(() => done()); api.closeAllConnections(); });
  rmSync(inventory.root, { recursive: true, force: true });
  await broker?.close();
  if (previousBroker.url === undefined) delete process.env.BROKER_URL; else process.env.BROKER_URL = previousBroker.url;
  if (previousBroker.name === undefined) delete process.env.G5_BROKER_CONTAINER; else process.env.G5_BROKER_CONTAINER = previousBroker.name;
  if (previousInventory === undefined) delete process.env.INVENTORY_ROOT; else process.env.INVENTORY_ROOT = previousInventory;
}
