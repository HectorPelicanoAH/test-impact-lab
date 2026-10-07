import { createServer as createViteServer } from 'vite';
import { chromium } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDemoApi } from '../apps/demo/server';
import type { DemoAnalysis, DemoSnapshot } from '../apps/demo/src/types';

// Separate ephemeral servers: never reuse/restart the developer's running services.
const api = createDemoApi();
await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
const apiPort = (api.address() as AddressInfo).port;
const vite = await createViteServer({ root: resolve('apps/demo'), configFile: resolve('apps/demo/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } });
await vite.listen();
const url = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
if (process.argv.includes('--serve')) {
  console.log(`G2 review: ${url}`);
  const close = async () => { await vite.close(); api.close(); api.closeAllConnections(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
} else {
  const browser = await chromium.launch();
  const errors: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  const reports = resolve('.impact-runs/g2-browser');
  mkdirSync(reports, { recursive: true });
  try {
    const before = await fetch(`http://127.0.0.1:${apiPort}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
    await page.goto(url);
    await page.getByRole('button', { name: 'ADD FILE', exact: true }).click();
    await page.getByRole('button', { name: /^NewPage\.tsx(?: modified)?$/ }).waitFor();
    let response = page.waitForResponse(response => response.url().endsWith('/api/analyses') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'CALCULATE REGRESSION', exact: true }).click();
    const addedResponse = await response;
    const added = await addedResponse.json() as DemoAnalysis;
    if (!addedResponse.ok() || !added.delta.nodes.added.some(node => node.locations[0]?.path === 'apps/frontend/src/NewPage.tsx')) throw new Error('UI source addition absent from graph.');
    await page.getByRole('heading', { name: 'TOPOLOGY DELTA' }).waitFor();
    await page.screenshot({ path: resolve(reports, 'added.png'), fullPage: true });
    await page.getByRole('navigation').getByRole('button', { name: 'CODE', exact: true }).click();
    await page.getByRole('button', { name: /^LoginPage\.tsx(?: modified)?$/ }).click();
    const original = before.files.find(file => file.path === 'apps/frontend/src/LoginPage.tsx')!.content;
    const connected = `import { NewPage } from './NewPage';\n${original.replace('<h1>Sign in</h1>', '<h1>Sign in</h1><NewPage />')}`;
    // Monaco uses native EditContext; its IME textarea is not the editable surface.
    const editor = page.getByRole('textbox', { name: 'Editor content', exact: true });
    await editor.focus();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(connected);
    await page.getByRole('button', { name: 'LoginPage.tsx modified', exact: true }).waitFor();
    response = page.waitForResponse(response => response.url().endsWith('/api/analyses') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'CALCULATE REGRESSION', exact: true }).click();
    const connectedAnalysis = await (await response).json() as DemoAnalysis;
    if (!connectedAnalysis.delta.edges.added.some(edge => edge.type === 'renders')) throw new Error('UI import/JSX connection was not discovered.');
    await page.getByRole('navigation').getByRole('button', { name: 'CODE', exact: true }).click();
    await page.getByRole('button', { name: /^LoginPage\.tsx(?: modified)?$/ }).click();
    await page.getByRole('button', { name: 'DELETE FILE', exact: true }).click();
    response = page.waitForResponse(response => response.url().endsWith('/api/analyses') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'CALCULATE REGRESSION', exact: true }).click();
    const deleted = await (await response).json() as DemoAnalysis;
    if (!deleted.diff.some(file => file.status === 'deleted' && file.path.endsWith('LoginPage.tsx'))) throw new Error('UI deletion did not reach analysis.');
    if (!deleted.delta.nodes.removed.some(node => node.locations[0]?.path.endsWith('LoginPage.tsx'))) throw new Error('UI deletion did not remove graph nodes.');
    const after = await fetch(`http://127.0.0.1:${apiPort}/api/snapshot`).then(response => response.json()) as DemoSnapshot;
    if (before.id !== after.id) throw new Error('UI operations changed the checkout snapshot.');
    if (errors.length) throw new Error(errors.join('\n'));
    writeFileSync(resolve(reports, 'summary.json'), JSON.stringify({ status: 'passed', before: before.id, after: after.id,
      added: added.afterGraphId, connected: connectedAnalysis.afterGraphId, deleted: deleted.afterGraphId, browserErrors: errors }, null, 2));
    console.log('G2 Chromium: add source → graph delta → edit import/JSX → new relations → delete source → removed nodes; checkout unchanged, no page errors.');
  } finally {
    await browser.close(); await vite.close();
    await new Promise<void>(resolve => { api.close(() => resolve()); api.closeAllConnections(); });
  }
}