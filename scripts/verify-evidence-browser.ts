import { createServer as createViteServer } from 'vite';
import { chromium } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDemoApi } from '../apps/demo/server';
import { materializeInventory } from './inventory/materialize.mjs';
import type { DemoAnalysis, DemoSnapshot } from '../apps/demo/src/types';

const inventory = materializeInventory();
process.env.INVENTORY_ROOT = inventory.root;
const api = createDemoApi();
await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
const apiPort = (api.address() as AddressInfo).port;
const vite = await createViteServer({ root: resolve('apps/demo'), configFile: resolve('apps/demo/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } });
await vite.listen();
const url = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
if (process.argv.includes('--serve')) {
  console.log(`G3 review: ${url}`);
  const close = async () => { await vite.close(); api.close(); api.closeAllConnections(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
} else {
  const browser = await chromium.launch();
  const errors: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.on('pageerror', error => errors.push(error.message));
  const reports = resolve('.impact-runs/g3-browser');
  mkdirSync(reports, { recursive: true });
  try {
    const baseline = await fetch(`http://127.0.0.1:${apiPort}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
    await page.goto(url);
    await page.getByRole('button', { name: 'IMPACT GRAPH', exact: true }).click();
    await page.getByRole('button', { name: 'SYSTEM', exact: true }).click();
    await page.getByRole('button', { name: /test-impact-lab \/ login/ }).click();
    await page.getByRole('button', { name: /apps\/frontend\/src.*Inspect code/ }).click();
    await page.getByLabel('Source area').selectOption('all');
    await page.getByLabel('Relation type').selectOption('imports');
    await page.getByLabel('Evidence kind').selectOption('static');
    await page.getByLabel('Relation type').selectOption('all');
    await page.getByLabel('Evidence kind').selectOption('all');
    await page.getByLabel('Search graph nodes').fill('LoginPage.tsx');
    await page.getByRole('list', { name: 'Graph nodes' }).getByRole('button', { name: /file · apps\/frontend\/src\/LoginPage\.tsx/ }).first().press('Enter');
    await page.getByRole('heading', { name: 'Dependencies · outgoing facts' }).waitFor();
    await page.getByRole('button', { name: /imports → apps\/frontend\/src\/components\/LoginForm\.tsx/ }).click();
    await page.getByText('static · resolved').first().waitFor();
    await page.getByRole('button', { name: 'OPEN VERIFIED CODE' }).first().click();
    const staticSource = await page.getByRole('region', { name: /Archived .*LoginPage\.tsx source/ }).innerText();
    if (!staticSource.includes("'./components/LoginForm'")) throw new Error('Static evidence did not open the import from its archived revision.');
    if (await page.locator('.evidence-lines mark').first().innerText() !== "'./components/LoginForm'") throw new Error('Static highlight did not match the archived import range.');
    await page.getByRole('button', { name: '← BACK TO PATH' }).click();
    await page.getByLabel('Search graph nodes').fill('createInventoryServer');
    await page.getByRole('list', { name: 'Graph nodes' }).getByRole('button', { name: /symbol · createInventoryServer/ }).first().press('Enter');
    await page.getByRole('button', { name: /external\/inventory\/src\/server\.ts:.*OPEN ARCHIVED CODE/ }).first().click();
    await page.getByText(`revision ${inventory.revision}`).first().waitFor();
    const inventorySource = await page.getByRole('region', { name: /Archived external\/inventory\/src\/server\.ts source/ }).innerText();
    if (!inventorySource.includes('INVENTORY_PATH')) throw new Error('External provider code was not read from its Git revision.');
    await page.getByRole('button', { name: '← BACK TO PATH' }).click();
    await page.getByRole('button', { name: /→ exposes/ }).first().click();
    await page.getByRole('button', { name: 'OPEN VERIFIED CODE' }).first().click();
    await page.getByRole('region', { name: /Archived external\/inventory\/src\/server\.ts source/ }).waitFor();
    await page.getByRole('button', { name: '← BACK TO PATH' }).click();
    for (const [search, node, relation, snippet] of [
      ['flushOutbox', /symbol · flushOutbox unchanged$/, /publishes → orders\.events/, 'confirmed('],
      ['notifications.order-created.v1', /subscription · notifications\.order-created\.v1 unchanged$/, /subscribes → orders\.events/, 'channel.bindQueue('],
      ['notifications', /consumer · notifications unchanged$/, /processes → notifications\.order-created\.v1/, 'runConsumerService('],
    ] as const) {
      await page.getByLabel('Search graph nodes').fill(search);
      await page.getByRole('list', { name: 'Graph nodes' }).getByRole('button', { name: node }).press('Enter');
      await page.getByRole('button', { name: relation }).click();
      await page.getByText('rabbitmq-topology').first().waitFor();
      const buttons = page.getByRole('button', { name: 'OPEN VERIFIED CODE' });
      await buttons.first().waitFor();
      let matched = false;
      for (let index = 0; index < await buttons.count(); index++) {
        await buttons.nth(index).click();
        matched ||= (await page.getByRole('region', { name: /Archived .* source/ }).innerText()).includes(snippet);
        await page.getByRole('button', { name: '← BACK TO PATH' }).click();
      }
      if (!matched) throw new Error(`Messaging source evidence missing: ${search}`);
      await page.getByRole('button', { name: 'OPEN VERIFIED CONFIGURATION' }).first().click();
      if (!(await page.getByRole('region', { name: /Archived .*topology\.json source/ }).innerText()).includes('order.created.v1')) throw new Error('Messaging configuration is not the archived topology.');
      await page.getByRole('button', { name: '← BACK TO PATH' }).click();
    }
    await page.screenshot({ path: resolve(reports, 'messaging-evidence.png'), fullPage: true });
    await page.getByLabel('Search graph nodes').fill('User.authenticate');
    await page.getByRole('list', { name: 'Graph nodes' }).getByRole('button', { name: /reviewed-anchor · User\.authenticate/ }).first().press('Enter');
    await page.getByRole('heading', { name: 'Consumers · incoming facts' }).waitFor();
    await page.getByRole('button', { name: /→ exercises/ }).first().click();
    await page.getByText('reviewed-declaration · resolved').first().waitFor();
    await page.getByRole('button', { name: 'OPEN VERIFIED CONFIGURATION' }).first().click();
    const reviewed = await page.getByRole('region', { name: /Archived impact\/evidence\/architecture\.json source/ }).innerText();
    if (!reviewed.includes('User.authenticate')) throw new Error('Reviewed declaration did not open its JSON pointer.');
    if (!await page.locator('.evidence-lines mark').first().innerText()) throw new Error('Reviewed declaration range was not highlighted.');
    await page.getByRole('button', { name: '← BACK TO PATH' }).click();
    await page.screenshot({ path: resolve(reports, 'desktop-evidence.png'), fullPage: true });

    await page.getByRole('navigation').getByRole('button', { name: 'CODE', exact: true }).click();
    await page.getByRole('button', { name: 'CREATE GUIDED SCREEN' }).click();
    await page.getByRole('button', { name: /^GuidedScreen\.tsx(?: modified)?$/ }).waitFor();
    const response = page.waitForResponse(reply => reply.url().endsWith('/api/analyses') && reply.request().method() === 'POST');
    await page.getByRole('button', { name: 'CALCULATE REGRESSION', exact: true }).click();
    const connected = await (await response).json() as DemoAnalysis;
    if (!connected.delta.nodes.added.some(node => node.locations[0]?.path === 'apps/frontend/src/GuidedScreen.tsx')
      || !connected.delta.edges.added.some(edge => edge.type === 'renders')) throw new Error('Guided screen did not introduce demonstrated render/import facts.');
    await page.getByText('TOPOLOGY DELTA', { exact: true }).waitFor();
    await page.getByText('Added nodes and edges').click();
    await page.getByRole('button', { name: 'AFTER', exact: true }).waitFor();
    await page.getByLabel('Search graph nodes').fill('GuidedScreen.tsx');
    await page.getByRole('list', { name: 'Graph nodes' }).getByRole('button', { name: /file · apps\/frontend\/src\/GuidedScreen\.tsx/ }).first().press('Enter');
    await page.getByRole('button', { name: /GuidedScreen\.tsx:1:1.*OPEN ARCHIVED CODE/ }).click();
    const afterSource = await page.getByRole('region', { name: /Archived .*GuidedScreen\.tsx source/ }).innerText();
    if (!afterSource.includes('Guided screen')) throw new Error('Added source is not present in the after snapshot.');
    await page.getByRole('button', { name: '← BACK TO PATH' }).click();

    await page.getByRole('navigation').getByRole('button', { name: 'CODE', exact: true }).click();
    await page.getByRole('button', { name: /^LoginPage\.tsx(?: modified)?$/ }).click();
    await page.getByRole('button', { name: 'DELETE FILE' }).click();
    const deletedResponse = page.waitForResponse(reply => reply.url().endsWith('/api/analyses') && reply.request().method() === 'POST');
    await page.getByRole('button', { name: 'CALCULATE REGRESSION', exact: true }).click();
    const deleted = await (await deletedResponse).json() as DemoAnalysis;
    if (!deleted.delta.nodes.removed.some(node => node.locations[0]?.path === 'apps/frontend/src/LoginPage.tsx')) throw new Error('Deleted source absent from before delta.');
    await page.getByText('Removed nodes and edges (before snapshot)').click();
    await page.getByRole('button', { name: /apps\/frontend\/src\/LoginPage\.tsx/ }).last().click();
    await page.getByRole('button', { name: 'BEFORE', exact: true }).waitFor();
    await page.getByRole('button', { name: /LoginPage\.tsx:1:1.*OPEN ARCHIVED CODE/ }).click();
    const oldSource = await page.getByRole('region', { name: /Archived .*LoginPage\.tsx source/ }).innerText();
    if (!oldSource.includes('Sign in') || oldSource.includes('GuidedScreen')) throw new Error('Deleted source did not open the correct BEFORE revision.');
    await page.getByRole('button', { name: '← BACK TO PATH' }).click();
    await page.setViewportSize({ width: 390, height: 850 });
    await page.waitForFunction(() => {
      const area = document.querySelector('.discovery-canvas')?.getBoundingClientRect();
      const items = [...document.querySelectorAll('.discovery-canvas .react-flow__node')].map(node => node.getBoundingClientRect());
      return area && items.length > 0 && items.every(node => node.left >= area.left && node.right <= area.right && node.top >= area.top && node.bottom <= area.bottom);
    });
    await page.screenshot({ path: resolve(reports, 'narrow-evidence.png'), fullPage: true });
    const bounds = await page.locator('.discovery-layout').boundingBox();
    if (!bounds || bounds.width > 392) throw new Error('Narrow evidence explorer overflows horizontally.');
    await page.getByLabel('Search graph nodes').fill('LoginPage.tsx');
    await page.getByRole('list', { name: 'Graph nodes' }).getByRole('button', { name: /file · apps\/frontend\/src\/LoginPage\.tsx/ }).first().press('Enter');
    const now = await fetch(`http://127.0.0.1:${apiPort}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
    if (now.id !== baseline.id || errors.length) throw new Error(`Checkout changed or browser errors: ${errors.join('; ')}`);
    writeFileSync(resolve(reports, 'summary.json'), JSON.stringify({ status: 'passed', baseline: baseline.id, connected: connected.afterGraphId,
      removed: deleted.afterGraphId, browserErrors: errors }, null, 2));
    console.log('G3/G5 Chromium: keyboard navigation, static+reviewed+messaging evidence, historical BEFORE/AFTER, guided screen, delta, narrow viewport and checkout preservation passed.');
  } finally {
    await browser.close(); await vite.close();
    await new Promise<void>(resolve => { api.close(() => resolve()); api.closeAllConnections(); });
    rmSync(inventory.root, { recursive: true, force: true });
  }
}
