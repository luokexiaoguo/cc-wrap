// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('cc-wrap App', () => {
  test('should launch successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/cc-wrap/);
  });

  test('should display welcome screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.welcome-screen')).toBeVisible();
  });

  test('should have model selector', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#modelSelect')).toBeVisible();
  });

  test('should have message input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#messageInput')).toBeVisible();
  });

  test('should have send button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#sendBtn')).toBeVisible();
  });
});
