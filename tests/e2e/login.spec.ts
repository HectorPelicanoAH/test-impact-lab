import { expect, test } from '@playwright/test';

test('[E1] Login journey rejects wrong credentials then reaches home', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
  await expect(page).toHaveURL('/');
  await page.getByLabel('Password').fill('impact-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/home');
  await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
});
