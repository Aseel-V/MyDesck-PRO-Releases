/**
 * Car parts on the Firebase production root (src/firebase-main.tsx), in a real browser against the local emulators:
 * the parts inventory of an auto_repair owner (list with a migrated-shape part, add, search, stock filters, edit,
 * delete), tenant isolation in Hebrew, and the car_parts business home in Arabic.
 *
 * Every flow asserts the runtime boundary from the browser: no request or socket to the Supabase database, Auth,
 * Edge Functions or realtime endpoints, no uncaught page error, and traffic served by the Firestore emulator.
 * Writes migration/reports/ui-smoke-car_parts.json.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const locales = { he: readJson('src/i18n/locales/he.json'), ar: readJson('src/i18n/locales/ar.json'), en: readJson('src/i18n/locales/en.json') };
type Tenant = { email: string; uid: string; businessId: string; partName?: string };
const fixture = () => readJson('migration/full-vertical.local/ui-smoke-fixture.json') as
  { run: string; password: string; tenants: { auto_repair: Record<'he' | 'en', Tenant>; car_parts: Record<'ar', Tenant> } };

const STAMP = Date.now().toString().slice(-6);
const PART = `Smoke oil filter ${STAMP}`;
const SERIAL = `SKU-${STAMP}`;
const CAR = `Mazda ${STAMP}`;
const en = locales.en;
const SUPABASE_RUNTIME = /\.supabase\.co\/(rest|auth|functions|realtime|graphql)\/v1/;
const EXPECTED_FLOWS = 6;
const flows: Array<Record<string, unknown>> = [];
test.describe.configure({ mode: 'serial' });

test.afterAll(({ browserName }, testInfo) => {
  const decision = flows.length === EXPECTED_FLOWS && flows.every((flow) => flow.status === 'passed') ? 'PASS' : 'FAIL';
  writeFileSync(new URL('migration/reports/ui-smoke-car_parts.json', ROOT), `${JSON.stringify({
    generatedAt: new Date().toISOString(), vertical: 'car_parts', root: 'src/firebase-main.tsx', backendMode: 'firestore-emulator',
    browser: testInfo.project.use.channel ?? browserName, languages: ['en', 'he', 'ar'], expectedFlows: EXPECTED_FLOWS, flows, decision,
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

async function signIn(page: Page, email: string) {
  await page.goto('/#/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(fixture().password);
  await page.locator('form button[type="submit"]').click();
}

/** The Parts page is a Dashboard page, not a route: after a reload the owner is on the home screen again. */
async function showParts(page: Page, language: 'he' | 'en') {
  await page.getByRole('button', { name: locales[language].navbar.parts }).filter({ visible: true }).first().click({ timeout: 120_000 });
  await expect(page.getByPlaceholder(locales[language].carParts.searchPlaceholder)).toBeVisible({ timeout: 60_000 });
}

const partForm = (page: Page) => page.locator('form').filter({ has: page.getByPlaceholder(en.carParts.partNamePlaceholder) });
const partCard = (page: Page, name: string) => page.locator('div.group').filter({ has: page.getByRole('heading', { name, exact: true }) });

flow('the English auto_repair owner opens the parts inventory left-to-right with its migrated-shape part', async (page) => {
  const { tenants } = fixture();
  await signIn(page, tenants.auto_repair.en.email);
  await showParts(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  const seeded = partCard(page, tenants.auto_repair.en.partName ?? '');
  await expect(seeded).toBeVisible();
  await expect(seeded.getByText('5 units')).toBeVisible();
});

flow('a part is added through the form and found by serial number, compatible car and stock filter', async (page) => {
  await signIn(page, fixture().tenants.auto_repair.en.email);
  await showParts(page, 'en');
  await page.getByRole('button', { name: en.carParts.addPart }).first().click();
  const form = partForm(page);
  await form.getByPlaceholder(en.carParts.partNamePlaceholder).fill(PART);
  await form.getByPlaceholder(en.carParts.serialNumberPlaceholder).fill(SERIAL);
  const numbers = form.locator('input[type="number"]');
  await numbers.nth(0).fill('3');
  await numbers.nth(1).fill('12.5');
  await numbers.nth(3).fill('19.99');
  await form.getByPlaceholder(en.carParts.descriptionPlaceholder).fill('OEM filter');
  await form.getByPlaceholder(en.carParts.compatibleCarsPlaceholder).fill(`${CAR}, Kia Rio`);
  await form.getByRole('button', { name: en.carParts.addPart }).click();
  await expect(partCard(page, PART)).toBeVisible({ timeout: 30_000 });
  await expect(partCard(page, PART).getByText('3 units')).toBeVisible();

  const search = page.getByPlaceholder(en.carParts.searchPlaceholder);
  await search.fill(SERIAL.toLowerCase());
  await expect(partCard(page, PART)).toBeVisible();
  await search.fill(CAR.toLowerCase());
  await expect(partCard(page, PART)).toBeVisible();
  await search.fill('zz-no-such-part');
  // The empty state is a heading plus the source's own "Failed no parts found" line; the heading identifies it.
  await expect(page.getByRole('heading', { name: en.carParts.noParts })).toBeVisible();
  await search.fill('');
  await page.getByRole('button', { name: new RegExp(`^${en.carParts.filters.lowStock}`) }).click();
  await expect(partCard(page, PART)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${en.carParts.filters.outOfStock}`) }).click();
  await expect(partCard(page, PART)).toHaveCount(0);
});

flow('the part is edited and the new price is kept across a reload', async (page) => {
  await signIn(page, fixture().tenants.auto_repair.en.email);
  await showParts(page, 'en');
  const card = partCard(page, PART);
  await card.hover();
  await card.locator('button').nth(0).click();
  await expect(page.getByRole('heading', { name: en.carParts.editPart })).toBeVisible();
  const numbers = partForm(page).locator('input[type="number"]');
  await numbers.nth(3).fill('24.5');
  await partForm(page).getByRole('button', { name: en.carParts.savePart }).click();
  await expect(page.getByRole('heading', { name: en.carParts.editPart })).toHaveCount(0);
  await expect(card.getByText(/24\.50/)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await showParts(page, 'en');
  await expect(partCard(page, PART).getByText(/24\.50/)).toBeVisible({ timeout: 60_000 });
});

flow('another tenant signs in right-to-left in Hebrew and sees only its own parts', async (page) => {
  const { tenants } = fixture();
  await signIn(page, tenants.auto_repair.he.email);
  await showParts(page, 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(partCard(page, tenants.auto_repair.he.partName ?? '')).toBeVisible();
  await expect(partCard(page, PART)).toHaveCount(0);
  await expect(partCard(page, tenants.auto_repair.en.partName ?? '')).toHaveCount(0);
});

flow('the car_parts owner opens the car parts home right-to-left in Arabic, without the auto repair inventory page', async (page) => {
  await signIn(page, fixture().tenants.car_parts.ar.email);
  await expect(page.getByRole('heading', { name: 'Car Parts Dashboard' })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('button', { name: locales.ar.navbar.parts })).toHaveCount(0);
});

flow('the part is deleted and stays deleted after a reload', async (page) => {
  await signIn(page, fixture().tenants.auto_repair.en.email);
  await showParts(page, 'en');
  const card = partCard(page, PART);
  await card.hover();
  await card.locator('button').nth(1).click();
  await page.getByRole('button', { name: en.trips.delete, exact: true }).click();
  await expect(partCard(page, PART)).toHaveCount(0, { timeout: 30_000 });
  await page.reload();
  await showParts(page, 'en');
  await expect(partCard(page, PART)).toHaveCount(0);
  await expect(partCard(page, fixture().tenants.auto_repair.en.partName ?? '')).toBeVisible();
});
