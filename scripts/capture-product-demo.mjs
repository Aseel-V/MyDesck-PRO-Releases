import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.DEMO_CAPTURE_BASE_URL || 'http://127.0.0.1:4173';
const parsedBase = new URL(baseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsedBase.hostname)) {
  throw new Error('Demo capture is local-only. DEMO_CAPTURE_BASE_URL must use localhost or 127.0.0.1.');
}

const outputDirectory = resolve('output', 'playwright', 'product-demo');
const locales = [{ code: 'en', prefix: '' }, { code: 'ar', prefix: '/ar' }, { code: 'he', prefix: '/he' }];
const screens = [
  ['travel', 'travel-dashboard'], ['travel', 'travel-trips'], ['travel', 'travel-payments'], ['travel', 'travel-installments'], ['travel', 'travel-analytics'],
  ['supermarket', 'supermarket-pos'], ['supermarket', 'supermarket-sales'], ['restaurant', 'restaurant-floor'], ['restaurant', 'restaurant-kds'], ['auto-repair', 'auto-repair-order'],
];
const viewports = [{ name: 'desktop', width: 1440, height: 1100 }, { name: 'mobile', width: 375, height: 1000 }];

await mkdir(outputDirectory, { recursive: true });
let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  // Keep the fixture workflow usable on machines that have Chrome but have
  // not downloaded Playwright's optional browser bundle.
  try { browser = await chromium.launch({ channel: 'chrome' }); }
  catch { throw error; }
}
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const locale of locales) {
      for (const [industry, screen] of screens) {
        const url = `${baseUrl}${locale.prefix}/demo?industry=${industry}&view=${screen}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.locator('[data-demo-fixture]').scrollIntoViewIfNeeded();
        await page.locator('[data-demo-fixture]').screenshot({ path: resolve(outputDirectory, `${locale.code}-${viewport.name}-${screen}.png`), animations: 'disabled' });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`Captured ${locales.length * screens.length * viewports.length} deterministic product visuals in ${outputDirectory}`);
