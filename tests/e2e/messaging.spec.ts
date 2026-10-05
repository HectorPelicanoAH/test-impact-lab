import { expect, test } from '@playwright/test';

test('events journey queries independently persisted preparation and local mailbox over HTTP', async ({ page }) => {
  test.skip(!process.env.BROKER_URL, 'Run pnpm test:messaging for real RabbitMQ/consumers.');
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order accepted' })).toBeVisible();
  await expect.poll(async () => {
    await page.getByRole('button', { name: 'Refresh processing status' }).click();
    return await page.getByRole('region', { name: 'Event processing' }).innerText();
  }, { timeout: 20_000 }).toMatch(/Preparation: ready[\s\S]*Local mailbox: stored/);
});