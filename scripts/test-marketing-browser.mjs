import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.MARKETING_TEST_BASE_URL || 'http://127.0.0.1:4173';
const parsedBase = new URL(baseUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(parsedBase.hostname), 'Marketing browser tests are local-only');

async function launchBrowser() {
  try { return await chromium.launch(); }
  catch (error) {
    try { return await chromium.launch({ channel: 'chrome' }); }
    catch { throw error; }
  }
}

const browser = await launchBrowser();
const consoleErrors = [];
const menuNames = { en: 'Open menu', ar: 'افتح القائمة', he: 'פתיחת תפריט' };
const closeMenuNames = { en: 'Close menu', ar: 'أغلق القائمة', he: 'סגירת תפריט' };
try {
  const cases = [
    { locale: 'en', prefix: '', width: 375 }, { locale: 'ar', prefix: '/ar', width: 375 }, { locale: 'he', prefix: '/he', width: 375 },
    { locale: 'en', prefix: '', width: 768 }, { locale: 'ar', prefix: '/ar', width: 768 }, { locale: 'he', prefix: '/he', width: 768 },
    { locale: 'en', prefix: '', width: 1024 }, { locale: 'ar', prefix: '/ar', width: 1024 }, { locale: 'he', prefix: '/he', width: 1024 },
    { locale: 'en', prefix: '', width: 1440 }, { locale: 'ar', prefix: '/ar', width: 1440 }, { locale: 'he', prefix: '/he', width: 1440 },
    { locale: 'en', prefix: '', width: 1920 }, { locale: 'ar', prefix: '/ar', width: 1920 }, { locale: 'he', prefix: '/he', width: 1920 },
  ];
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport: { width: testCase.width, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' });
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${testCase.locale}/${testCase.width}: ${message.text()}`); });
    await page.goto(`${baseUrl}${testCase.prefix}/demo?industry=travel&view=travel-dashboard`, { waitUntil: 'networkidle' });
    const audit = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      h1: document.querySelectorAll('h1').length,
      main: Boolean(document.querySelector('main')),
      footer: Boolean(document.querySelector('footer')),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      unnamedButtons: [...document.querySelectorAll('button')].filter((button) => !(button.textContent?.trim() || button.getAttribute('aria-label'))).length,
      imagesWithoutAlt: [...document.querySelectorAll('img')].filter((image) => !image.hasAttribute('alt')).length,
    }));
    assert.equal(audit.lang, testCase.locale);
    assert.equal(audit.dir, testCase.locale === 'en' ? 'ltr' : 'rtl');
    assert.equal(audit.h1, 1);
    assert.ok(audit.main && audit.footer);
    assert.ok(audit.overflow <= 1, `page overflow at ${testCase.locale}/${testCase.width}: ${audit.overflow}px`);
    assert.equal(audit.unnamedButtons, 0);
    assert.equal(audit.imagesWithoutAlt, 0);

    const firstTab = page.getByRole('tab').first();
    await firstTab.focus();
    await firstTab.press(testCase.locale === 'en' ? 'ArrowRight' : 'ArrowLeft');
    assert.equal(await page.getByRole('tab', { selected: true }).textContent(), testCase.locale === 'en' ? 'Trips' : testCase.locale === 'ar' ? 'الرحلات' : 'נסיעות');

    if (testCase.width < 1280) {
      const menu = page.getByRole('button', { name: menuNames[testCase.locale] });
      await menu.click();
      const closeMenu = page.getByRole('button', { name: closeMenuNames[testCase.locale] });
      assert.equal(await closeMenu.getAttribute('aria-expanded'), 'true');
      await closeMenu.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    }
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/contact?intent=trial`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Review request' }).click();
  assert.ok(await page.getByRole('alert').isVisible());
  assert.equal(await page.getByLabel('Work email').getAttribute('aria-invalid'), 'true');
  await page.getByLabel('Your name').fill('Demo Owner');
  await page.getByLabel('Business name').fill('Synthetic Business');
  await page.getByLabel('Work email').fill('demo@example.com');
  await page.getByLabel('Country').fill('Demo Country');
  await page.getByRole('button', { name: 'Review request' }).click();
  const preparedEmail = page.getByRole('button', { name: 'Open prepared email' });
  if (!await preparedEmail.isVisible()) {
    const invalidFields = await page.locator('[aria-invalid="true"]').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-describedby')));
    const buttons = await page.getByRole('button').allTextContents();
    const headings = await page.locator('h2').allTextContents();
    throw new Error(`Contact flow did not reach confirmation; invalid fields: ${invalidFields.join(', ')}; buttons: ${buttons.join(' | ')}; headings: ${headings.join(' | ')}`);
  }
  await page.goto(`${baseUrl}/demo`, { waitUntil: 'networkidle' });
  const productMenu = page.getByRole('button', { name: 'Product' });
  await productMenu.focus();
  await productMenu.press('Enter');
  assert.ok(await page.getByRole('menuitem', { name: 'Guided demo' }).isVisible());
  await productMenu.press('Escape');
  assert.equal(await productMenu.getAttribute('aria-expanded'), 'false');
  await context.close();

  assert.deepEqual(consoleErrors, []);
  console.log('marketing browser, responsive, RTL, keyboard, and form-state checks passed');
} finally {
  await browser.close();
}
