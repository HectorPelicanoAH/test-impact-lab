import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createIndex, normalizeSnapshot, queryGraph } from '../portable/src/core.mjs';
import { importV2 } from '../portable/src/import-v2.mjs';
import { listenViewer } from '../portable/src/server.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--snapshot')) {
  throw new Error('Usage: node scripts/verify-portable-browser.mjs [--snapshot VIEW_OR_V2_ARCHIVE.json]');
}
const input = JSON.parse(await readFile(args[1] ?? new URL('../portable/examples/system.json', import.meta.url), 'utf8'));
const snapshot = input.format ? normalizeSnapshot(input) : importV2(input, { includeSources: true });
const server = await listenViewer(snapshot);
const screenshots = resolve('.impact-runs/portable-browser');
await mkdir(screenshots, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('#nodes button').first().waitFor();
  assert.equal(await page.locator('#nodes button').count(), Math.min(snapshot.nodes.length, 40));
  const edge = snapshot.edges[0];
  assert.ok(edge, 'Browser fixture needs at least one evidenced relation.');
  const selected = snapshot.nodes.find(node => node.id === edge.from);
  await page.locator('#search').fill(selected.id);
  const expectedSearch = queryGraph(createIndex(snapshot), { q: selected.id }).matchedNodes;
  await page.waitForFunction(count => document.getElementById('visibility').textContent.includes(count + ' matching'), expectedSearch);
  await page.locator('#nodes button').filter({ hasText: selected.label }).first().click();
  await page.getByRole('button', { name: 'View evidence', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'View evidence', exact: true }).first().click();
  await page.locator('#selection details').waitFor();
  assert.equal(await page.locator('#selection-title').textContent(), selected.label);
  await page.locator('#reset').click();
  await page.waitForFunction(count => document.querySelectorAll('#nodes button').length === count, Math.min(snapshot.nodes.length, 40));
  await page.screenshot({ path: resolve(screenshots, 'desktop.png'), fullPage: true });
  const evidenceKind = snapshot.evidence.some(item => item.kind === 'declaration') ? 'declaration' : snapshot.evidence[0].kind;
  const expected = queryGraph(createIndex(snapshot), { evidence: evidenceKind, limit: 40 }).matchedNodes;
  await page.locator('#evidence').selectOption(evidenceKind);
  await page.waitForFunction(count => document.getElementById('visibility').textContent.includes(count + ' matching'), expected);
  if (snapshot.diagnostics.length > 10) {
    await page.locator('#diagnostics-next').click();
    await page.waitForFunction(() => document.getElementById('diagnostics-count').textContent.startsWith('11–'));
    await page.locator('#diagnostics-previous').click();
    await page.waitForFunction(() => document.getElementById('diagnostics-count').textContent.startsWith('1–'));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile viewport overflows.');
  await page.screenshot({ path: resolve(screenshots, 'mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ nodes: snapshot.nodes.length, edges: snapshot.edges.length, diagnostics: snapshot.diagnostics.length, browser: 'passed', screenshots }));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
