import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const routes = [
  '/',
  '/recorder',
  '/editor',
  '/stream',
  '/webinar',
  '/export',
  '/settings',
];

for (const route of routes) {
  test(`no page errors on ${route}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    if (errors.length > 0) {
      console.log(`\n=== Page errors on ${route} ===`);
      errors.forEach(e => console.log('ERROR:', e));
    }

    expect(errors).toHaveLength(0);
  });
}
