/**
 * Auto repair on the Firebase production root (src/firebase-main.tsx), in a real browser against the local emulators:
 * sign-in to the travel home, the Cars page, registering a car (vehicle, plate index and working job in one
 * transaction), searching, adding a part and labor to the job (stock consumed, exact totals), tenant isolation and
 * deleting the job.
 *
 * Every flow asserts the runtime boundary from the browser: no request or socket to the Supabase database, Auth,
 * Edge Functions or realtime endpoints, no uncaught page error, and traffic served by the Firestore emulator.
 * Writes migration/reports/ui-smoke-auto_repair.json.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const locales = { he: readJson('src/i18n/locales/he.json'), en: readJson('src/i18n/locales/en.json') };
type Tenant = { email: string; uid: string; businessId: string; partName: string };
const fixture = () => readJson('migration/full-vertical.local/ui-smoke-fixture.json') as
  { run: string; password: string; tenants: { auto_repair: Record<'he' | 'en', Tenant> } };

const STAMP = Date.now().toString().slice(-6);
const PLATE = `77-${STAMP.slice(0, 3)}-${STAMP.slice(3)}`;
const OWNER = `Smoke Owner ${STAMP}`;
const SEARCH = 'Search by plate, model, or customer...';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SUPABASE_RUNTIME = /\.supabase\.co\/(rest|auth|functions|realtime|graphql)\/v1/;
const EXPECTED_FLOWS = 5;
const flows: Array<Record<string, unknown>> = [];
test.describe.configure({ mode: 'serial' });

test.afterAll(({ browserName }, testInfo) => {
  const decision = flows.length === EXPECTED_FLOWS && flows.every((flow) => flow.status === 'passed') ? 'PASS' : 'FAIL';
  writeFileSync(new URL('migration/reports/ui-smoke-auto_repair.json', ROOT), `${JSON.stringify({
    generatedAt: new Date().toISOString(), vertical: 'auto_repair', root: 'src/firebase-main.tsx', backendMode: 'firestore-emulator',
    browser: testInfo.project.use.channel ?? browserName, languages: ['en', 'he'], expectedFlows: EXPECTED_FLOWS, flows, decision,
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

/** The Cars page is a Dashboard page, not a route: after a reload the owner is on the home screen again. */
async function showCars(page: Page, language: 'he' | 'en') {
  await page.getByRole('button', { name: locales[language].navbar.cars }).filter({ visible: true }).first().click({ timeout: 120_000 });
  await expect(page.getByPlaceholder(SEARCH)).toBeVisible({ timeout: 60_000 });
}

async function signInToCars(page: Page, language: 'he' | 'en') {
  const { password, tenants } = fixture();
  await page.goto('/#/login');
  await page.locator('#login-email').fill(tenants.auto_repair[language].email);
  await page.locator('#login-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await showCars(page, language);
}

const addServiceModal = (page: Page) => page.locator('div.max-w-lg').filter({ has: page.getByRole('heading', { name: 'Add Service / Part' }) });

flow('the English owner signs in to the travel home and opens an empty Cars page left-to-right', async (page) => {
  await signInToCars(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('No cars found.')).toBeVisible();
});

flow('a car is registered with its working job, found by plate and owner, and kept across a reload', async (page) => {
  await signInToCars(page, 'en');
  await page.getByRole('button', { name: 'Add New Car' }).click();
  await page.getByPlaceholder('12-345-67').fill(PLATE);
  await page.getByPlaceholder('Toyota Corolla').fill('Toyota Corolla');
  await page.getByPlaceholder('John Doe').fill(OWNER);
  await page.getByPlaceholder('050-0000000').fill('050-1234567');
  await page.getByPlaceholder('2024').fill('2020');
  await page.getByPlaceholder('Describe the issue...').fill('Brakes squeak');
  await page.getByRole('button', { name: 'Save Car' }).click();
  await expect(page.getByText(PLATE).first()).toBeVisible({ timeout: 30_000 });

  const search = page.getByPlaceholder(SEARCH);
  await search.fill(OWNER.toLowerCase());
  await expect(page.getByText(PLATE).first()).toBeVisible();
  await search.fill('no-such-car');
  await expect(page.getByText(PLATE)).toHaveCount(0);
  await search.fill('');

  await page.reload();
  await showCars(page, 'en');
  await expect(page.getByText(PLATE).first()).toBeVisible({ timeout: 60_000 });
});

flow('a part and labor are added to the job: exact totals, and the stock is consumed', async (page) => {
  const { partName } = fixture().tenants.auto_repair.en;
  await signInToCars(page, 'en');
  await page.getByText(PLATE).first().click();
  await page.getByRole('button', { name: 'Add Service', exact: true }).click();
  const modal = addServiceModal(page);
  await modal.getByPlaceholder('Search parts inventory...').fill(partName.toLowerCase());
  await modal.getByRole('button', { name: new RegExp(escape(partName)) }).click();
  await modal.locator('input[type="number"][min="1"]').fill('2');
  await modal.getByPlaceholder('0.00').fill('150.5');
  await modal.getByRole('button', { name: 'Add Service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add Service / Part' })).toHaveCount(0, { timeout: 30_000 });

  // 2 x 59.99 + 150.50, computed by the transaction from the stored part price, not taken from the screen.
  await page.getByText(PLATE).first().click();
  await expect(page.getByText('Service Labor (Hand Cost)')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('cell', { name: partName })).toBeVisible();
  await expect(page.getByText(/119\.98/).first()).toBeVisible();
  await expect(page.getByText(/270\.48/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Add Service', exact: true }).click();
  await expect(addServiceModal(page).getByText(/Stock: 3\b/)).toBeVisible({ timeout: 30_000 });
  await addServiceModal(page).getByRole('button', { name: 'Cancel' }).click();
});

flow('another tenant signs in right-to-left in Hebrew and sees none of the first tenant\'s cars', async (page) => {
  await signInToCars(page, 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByText('No cars found.')).toBeVisible();
  await expect(page.getByText(PLATE)).toHaveCount(0);
});

flow('the job is deleted and stays deleted after a reload', async (page) => {
  await signInToCars(page, 'en');
  await page.getByText(PLATE).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(page.getByText(PLATE)).toHaveCount(0, { timeout: 30_000 });
  await page.reload();
  await showCars(page, 'en');
  await expect(page.getByText('No cars found.')).toBeVisible();
  await expect(page.getByText(PLATE)).toHaveCount(0);
});
