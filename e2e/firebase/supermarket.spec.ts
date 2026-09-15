/**
 * Supermarket on the Firebase production root (src/firebase-main.tsx), in a real browser against the local
 * emulators: sign-in, the POS in Hebrew, Arabic and English, product create (with the default categories),
 * search by name and barcode, edit and delete, checkout with a saved receipt, and sales analytics.
 *
 * Every flow also asserts the runtime boundary from the browser's side: no request or socket to the
 * Supabase database, Auth, Edge Functions or realtime endpoints, and no uncaught page error.
 *
 * Tenants are synthetic and created by global-setup.mjs through the application's registration path.
 * Writes migration/reports/ui-smoke-supermarket.json.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const locales = { he: readJson('src/i18n/locales/he.json'), ar: readJson('src/i18n/locales/ar.json'), en: readJson('src/i18n/locales/en.json') };
type Tenant = { email: string; uid: string; businessId: string };
const fixture = () => readJson('migration/full-vertical.local/ui-smoke-fixture.json') as
  { run: string; password: string; tenants: { supermarket: Record<'he' | 'ar' | 'en', Tenant> } };

const STAMP = Date.now().toString().slice(-6);
const PRODUCT_HE = `חלב בדיקה ${STAMP}`;
const PRODUCT_EN = `Smoke Milk ${STAMP}`;
const BARCODE = `72911${STAMP}`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const productHeading = (page: Page) => page.getByRole('heading', { name: new RegExp(`${escape(PRODUCT_HE)}|${escape(PRODUCT_EN)}`) });
const SUPABASE_RUNTIME = /\.supabase\.co\/(rest|auth|functions|realtime|graphql)\/v1/;
const EXPECTED_FLOWS = 6;

const flows: Array<Record<string, unknown>> = [];
test.describe.configure({ mode: 'serial' });

test.afterAll(({ browserName }, testInfo) => {
  const decision = flows.length === EXPECTED_FLOWS && flows.every((flow) => flow.status === 'passed') ? 'PASS' : 'FAIL';
  writeFileSync(new URL('migration/reports/ui-smoke-supermarket.json', ROOT), `${JSON.stringify({
    generatedAt: new Date().toISOString(), vertical: 'supermarket', root: 'src/firebase-main.tsx', backendMode: 'firestore-emulator',
    browser: testInfo.project.use.channel ?? browserName, languages: ['he', 'ar', 'en'], expectedFlows: EXPECTED_FLOWS, flows, decision,
  }, null, 2)}\n`);
});

function flow(name: string, body: (page: Page) => Promise<void>) {
  test(name, async ({ page }) => {
    const observed = { supabaseRuntime: [] as string[], pageErrors: [] as string[], firestoreRequests: 0 };
    page.on('request', (request) => {
      const url = request.url();
      if (SUPABASE_RUNTIME.test(url)) observed.supabaseRuntime.push(url.split('?')[0]);
      if (url.startsWith('http://127.0.0.1:8080/')) observed.firestoreRequests += 1;
    });
    page.on('websocket', (socket) => { if (/supabase\.co/.test(socket.url())) observed.supabaseRuntime.push(socket.url().split('?')[0]); });
    page.on('pageerror', (error) => observed.pageErrors.push(error.message));
    const started = Date.now();
    let status = 'failed';
    try {
      await body(page);
      expect(observed.supabaseRuntime, 'no Supabase database, Auth, Edge Function or realtime traffic').toEqual([]);
      expect(observed.pageErrors, 'no uncaught page error').toEqual([]);
      expect(observed.firestoreRequests, 'the screen was served by the Firestore emulator').toBeGreaterThan(0);
      status = 'passed';
    } finally {
      flows.push({ name, status, durationMs: Date.now() - started, supabaseRuntimeRequests: observed.supabaseRuntime.length,
        pageErrors: observed.pageErrors.length, firestoreRequests: observed.firestoreRequests });
    }
  });
}

async function signIn(page: Page, language: 'he' | 'ar' | 'en') {
  const { password, tenants } = fixture();
  // The web build's root is the marketing site; the application signs in at #/login and opens #/dashboard.
  await page.goto('/#/login');
  await page.locator('#login-email').fill(tenants.supermarket[language].email);
  await page.locator('#login-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByPlaceholder(locales[language].market.searchPlaceholder)).toBeVisible({ timeout: 120_000 });
}

flow('the Hebrew owner signs in on the Firebase root and the POS renders right-to-left', async (page) => {
  await signIn(page, 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByText(locales.he.market.cartEmpty)).toBeVisible();
});

flow('a product is created with the default categories, found by name and barcode, and edited across a reload', async (page) => {
  const he = locales.he;
  await signIn(page, 'he');
  await page.getByTitle(he.market.addProduct).click();
  const form = page.locator('form').filter({ has: page.locator('#barcode-input') });
  await expect(form.locator('select option')).not.toHaveCount(0);
  const text = form.locator('input[type="text"]');
  await text.nth(0).fill(PRODUCT_HE);
  await text.nth(1).fill(PRODUCT_EN);
  await form.locator('input[type="number"]').fill('12.50');
  await form.locator('#barcode-input').fill(BARCODE);
  await form.getByRole('button', { name: he.market.modal.save }).click();
  await expect(productHeading(page)).toBeVisible();

  const search = page.getByPlaceholder(he.market.searchPlaceholder);
  await search.fill(PRODUCT_EN.toLowerCase());
  await expect(productHeading(page)).toBeVisible();
  await search.fill(BARCODE.slice(-6));
  await expect(productHeading(page)).toBeVisible();
  await search.fill('zz-no-such-product');
  await expect(productHeading(page)).toHaveCount(0);
  await search.fill('');

  await page.getByTitle(he.market.editMode).click();
  await productHeading(page).click();
  await expect(page.getByRole('heading', { name: he.market.modal.editTitle })).toBeVisible();
  await form.locator('input[type="number"]').fill('14.90');
  await form.getByRole('button', { name: he.market.modal.save }).click();
  await expect(page.getByRole('heading', { name: he.market.modal.editTitle })).toHaveCount(0);
  await page.getByTitle(he.market.editMode).click();

  await page.reload();
  await expect(page.getByPlaceholder(he.market.searchPlaceholder)).toBeVisible({ timeout: 120_000 });
  await expect(productHeading(page)).toBeVisible();
  await expect(page.getByText('₪14.90').first()).toBeVisible();
});

flow('checkout saves the sale, and sales analytics lists it and deletes it', async (page) => {
  const he = locales.he;
  await signIn(page, 'he');
  await productHeading(page).click();
  await page.getByRole('button', { name: he.market.payment }).click();
  await page.getByRole('button', { name: new RegExp(escape(he.market.cash)) }).first().click();
  await page.getByRole('button', { name: '₪50', exact: true }).click();
  await page.getByRole('button', { name: he.market.makePayment }).click();
  const invoice = page.getByText(new RegExp(`${escape(he.market.receiptModal.title)} #`));
  await expect(invoice).toBeVisible();
  const receiptNumber = ((await invoice.textContent()) ?? '').split('#').pop()?.trim() ?? '';
  expect(receiptNumber).not.toBe('');
  await page.getByRole('button', { name: he.market.receiptModal.saveAndClose }).click();
  await expect(invoice).toHaveCount(0);

  await page.getByRole('button', { name: he.dashboard.analytics }).filter({ visible: true }).first().click();
  const row = page.getByText(`#${receiptNumber.split('-').pop()}`);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.click();
  await page.getByRole('button', { name: he.market.sales.deleteTransaction }).click();
  await page.getByRole('button', { name: he.market.delete, exact: true }).click();
  await expect(row).toHaveCount(0);
});

flow('another tenant signs in left-to-right in English and sees none of the first tenant\'s products', async (page) => {
  await signIn(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText(locales.en.market.cartEmpty)).toBeVisible();
  await expect(productHeading(page)).toHaveCount(0);
});

flow('the Arabic owner signs in right-to-left', async (page) => {
  await signIn(page, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByText(locales.ar.market.cartEmpty)).toBeVisible();
});

flow('the product is deleted and stays deleted after a reload', async (page) => {
  const he = locales.he;
  await signIn(page, 'he');
  await page.getByTitle(he.market.editMode).click();
  const card = page.locator('div.group').filter({ has: productHeading(page) });
  await card.hover();
  await card.locator('button').first().click();
  await page.getByRole('button', { name: he.market.delete, exact: true }).click();
  await expect(productHeading(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByPlaceholder(he.market.searchPlaceholder)).toBeVisible({ timeout: 120_000 });
  await expect(productHeading(page)).toHaveCount(0);
});
