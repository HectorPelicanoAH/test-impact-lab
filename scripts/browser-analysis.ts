import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import type { DemoAnalysis } from '../apps/demo/src/types';

/** Wait for the operation result rather than treating the queued POST as an analysis. */
export async function calculateInBrowser(page: Page): Promise<DemoAnalysis> {
  const submitted = page.waitForResponse(reply => reply.url().endsWith('/api/analysis-operations') && reply.request().method() === 'POST');
  const result = page.waitForResponse(reply => /\/api\/analyses\/[a-f0-9]{64}$/.test(reply.url()) && reply.request().method() === 'GET');
  await page.getByRole('button', { name: 'CALCULATE REGRESSION', exact: true }).click();
  const queued = await submitted;
  assert.equal(queued.status(), 202);
  assert.deepEqual(Object.keys(queued.request().postDataJSON()).sort(), ['edits', 'snapshotId']);
  const response = await result;
  assert.equal(response.status(), 200);
  const analysis = await response.json() as DemoAnalysis;
  await page.getByRole('button', { name: 'Revisar y ejecutar tests', exact: true }).waitFor();
  return analysis;
}
