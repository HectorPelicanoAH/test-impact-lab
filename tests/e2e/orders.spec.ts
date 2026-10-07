import { expect, test } from '@playwright/test';

test('orders journey confirms external availability and consults stored status', async ({ page }) => {
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Place an order' })).toBeVisible();
  await page.getByLabel('Quantity').fill('2');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('heading', { name: 'Order accepted' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('2 × demo-widget · accepted');
});

test('orders journey rejects unavailable stock without an accepted order', async ({ page }) => {
  await page.goto('/orders');
  await page.getByLabel('Product').selectOption('demo-gadget');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('alert')).toContainText('Not enough inventory available');
  await expect(page.getByRole('heading', { name: 'Order accepted' })).toHaveCount(0);
});