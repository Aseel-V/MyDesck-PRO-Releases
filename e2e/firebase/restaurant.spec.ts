/**
 * Restaurant on the Firebase production root (src/firebase-main.tsx), in a real browser against the local emulators:
 * the owner's restaurant home with a migrated-shape menu and table, an order sent to the kitchen, the kitchen display,
 * a manager void and discount approved with a Firebase account (no PIN exists), payment and close, the analytics list
 * with edit and delete, tenant isolation right-to-left in Hebrew, and the restaurant settings in Arabic.
 *
 * Every flow asserts the runtime boundary from the browser: no request or socket to the Supabase database, Auth,
 * Edge Functions or realtime endpoints, no uncaught page error, and traffic served by the Firestore emulator.
 * Writes migration/reports/ui-smoke-restaurant.json.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const locales = { he: readJson('src/i18n/locales/he.json'), ar: readJson('src/i18n/locales/ar.json'), en: readJson('src/i18n/locales/en.json') };
type Tenant = { email: string; uid: string; businessId: string; tableName: string; dishName: string; drinkName: string };
const fixture = () => readJson('migration/full-vertical.local/ui-smoke-fixture.json') as
  { run: string; password: string; tenants: { restaurant: Record<'en' | 'he' | 'ar', Tenant> } };

const STAMP = Date.now().toString().slice(-6);
const NEW_TABLE = `Smoke patio ${STAMP}`;
const NEW_STAFF = `Smoke waiter ${STAMP}`;
const en = locales.en;
const ar = locales.ar;
const SUPABASE_RUNTIME = /\.supabase\.co\/(rest|auth|functions|realtime|graphql)\/v1/;
const EXPECTED_FLOWS = 7;
const flows: Array<Record<string, unknown>> = [];
test.describe.configure({ mode: 'serial' });

test.afterAll(({ browserName }, testInfo) => {
  const decision = flows.length === EXPECTED_FLOWS && flows.every((flow) => flow.status === 'passed') ? 'PASS' : 'FAIL';
  writeFileSync(new URL('migration/reports/ui-smoke-restaurant.json', ROOT), `${JSON.stringify({
    generatedAt: new Date().toISOString(), vertical: 'restaurant', root: 'src/firebase-main.tsx', backendMode: 'firestore-emulator',
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

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function signIn(page: Page, email: string) {
  await page.goto('/#/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(fixture().password);
  await page.locator('form button[type="submit"]').click();
}

async function openTable(page: Page, tenant: Tenant) {
  await page.getByText(tenant.tableName, { exact: true }).first().click({ timeout: 120_000 });
  await expect(page.getByRole('heading', { name: `${en.orderModal.table}: ${tenant.tableName}` })).toBeVisible();
}

const cartLine = (page: Page, name: string) => page.locator('div.rounded-lg.border').filter({ hasText: name });

async function approveAsOwner(page: Page) {
  await page.getByLabel(en.auth.email).fill(fixture().tenants.restaurant.en.email);
  await page.getByLabel(en.auth.password).fill(fixture().password);
  await page.getByRole('button', { name: en.orderModal.pinPadModal.authorize }).click();
}

flow('the English owner opens the restaurant home, orders from the migrated menu and sends the order to the kitchen', async (page) => {
  const tenant = fixture().tenants.restaurant.en;
  await signIn(page, tenant.email);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await openTable(page, tenant);
  const dish = page.getByRole('button', { name: new RegExp(escape(tenant.dishName)) });
  await dish.click();
  await dish.click();
  await page.getByRole('button', { name: new RegExp(escape(tenant.drinkName)) }).click();
  await page.getByRole('button', { name: en.orderModal.fireOrder }).click();
  await expect(page.getByText(en.orderModal.orderFired)).toBeVisible({ timeout: 30_000 });
  await openTable(page, tenant);
  await expect(cartLine(page, tenant.dishName).getByText(en.orderModal.saved)).toBeVisible({ timeout: 30_000 });
  // formatCurrency drops trailing zeros: 103 renders as ₪103, 45.5 as ₪45.5.
  await expect(page.getByText('₪103', { exact: true }).first()).toBeVisible();
});

flow('the kitchen display shows the ticket and moves it to served', async (page) => {
  const tenant = fixture().tenants.restaurant.en;
  await signIn(page, tenant.email);
  await page.getByRole('button', { name: en.settings.restaurant.nav.kdsFull }).click({ timeout: 120_000 });
  await expect(page.getByText(tenant.dishName).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(tenant.drinkName).first()).toBeVisible();
  await page.getByRole('button', { name: en.kds.actions.start }).first().click();
  await page.getByRole('button', { name: en.kds.actions.bump }).first().click();
  await page.getByRole('button', { name: en.kds.actions.serve }).first().click();
  await expect(page.getByText(en.kds.noOrders)).toBeVisible({ timeout: 30_000 });
});

flow('a manager voids a saved line and applies a discount, approved with a Firebase account instead of a PIN', async (page) => {
  const tenant = fixture().tenants.restaurant.en;
  await signIn(page, tenant.email);
  await openTable(page, tenant);
  const drink = cartLine(page, tenant.drinkName);
  await expect(drink.getByText(en.orderModal.saved)).toBeVisible({ timeout: 30_000 });
  await drink.locator('div.flex.items-center.gap-3 > button').first().click();
  await expect(page.getByText(locales.en.managerApproval.accountDescription)).toBeVisible();
  await expect(page.getByText(en.orderModal.pinPadModal.pinLengthError)).toHaveCount(0);
  await approveAsOwner(page);
  await expect(page.getByText(en.orderModal.itemVoided)).toBeVisible({ timeout: 30_000 });
  await expect(cartLine(page, tenant.drinkName)).toHaveCount(0);

  await page.getByRole('button', { name: en.orderModal.discount, exact: true }).click();
  await page.getByRole('button', { name: new RegExp(escape(en.orderModal.discountModal.fixedAmount)) }).click();
  await page.locator('input[type="number"]').last().fill('5');
  await page.getByRole('button', { name: en.orderModal.discountModal.apply }).click();
  await approveAsOwner(page);
  await expect(page.getByText(en.orderModal.discountApplied)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('₪86', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
});

flow('the order is paid by card and closed, and the table has no open order afterwards', async (page) => {
  const tenant = fixture().tenants.restaurant.en;
  await signIn(page, tenant.email);
  await openTable(page, tenant);
  await expect(page.getByText('₪86', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: en.orderModal.payAndClose }).click();
  await page.getByRole('button', { name: new RegExp(escape(en.market.creditCard)) }).click();
  await page.getByRole('button', { name: en.market.confirm }).click();
  await expect(page.getByText(en.orderModal.orderClosed)).toBeVisible({ timeout: 30_000 });
  // The receipt shows only while the order is current; the live order list drops the closed order, which can close the
  // receipt before anyone clicks (the source listens to the same table changes).
  const closeReceipt = page.getByRole('button', { name: en.market.close, exact: true });
  if (await closeReceipt.isVisible()) await closeReceipt.click();
  await expect(page.getByText(en.orderModal.noItems)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await openTable(page, tenant);
  await expect(page.getByText(en.orderModal.noItems)).toBeVisible({ timeout: 30_000 });
});

flow('analytics lists the closed order, edits it from its ledger and deletes it', async (page) => {
  const tenant = fixture().tenants.restaurant.en;
  await signIn(page, tenant.email);
  await page.getByRole('button', { name: en.dashboard.analytics }).filter({ visible: true }).first().click({ timeout: 120_000 });
  // One card per closed order; the panel around the list also shows the day's sales total.
  const row = page.locator('div.group.rounded-xl.p-3').filter({ has: page.getByText('₪86', { exact: true }) }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByText('₪86', { exact: true }).click();
  await row.getByRole('button', { name: en.restaurantAnalytics.editOrder }).click();
  // The edit dialog lists every line, the voided lemonade included, as the source does; its row buttons are minus, plus, delete.
  const dishLine = page.locator('div.rounded-lg.border').filter({ hasText: tenant.dishName }).filter({ has: page.locator('input[type="number"]') });
  await expect(dishLine).toHaveCount(1);
  await dishLine.locator('button').nth(1).click();
  await page.getByRole('button', { name: en.restaurantAnalytics.saveChanges }).click();
  // The saved total is the ledger's line sum: two hummus become three (136.50). The voided lemonade is not a line of
  // the sum, although the edit screen still lists it, and the source recomputed the edit without the discount.
  const edited = page.locator('div.group.rounded-xl.p-3').filter({ has: page.getByText('₪136.5', { exact: true }) }).first();
  await expect(edited).toBeVisible({ timeout: 60_000 });
  // The card stays expanded after the edit, and its three-hummus line also reads ₪136.5: open it only if it closed.
  const deleteOrder = edited.getByRole('button', { name: en.restaurantAnalytics.deleteOrder });
  if (!(await deleteOrder.isVisible())) await edited.locator('p.text-sm.font-bold').first().click();
  await deleteOrder.click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('div.group.rounded-xl.p-3').filter({ has: page.getByText('₪136.5', { exact: true }) })).toHaveCount(0, { timeout: 30_000 });
});

flow('another restaurant signs in right-to-left in Hebrew and sees only its own table', async (page) => {
  const { tenants } = fixture();
  await signIn(page, tenants.restaurant.he.email);
  await expect(page.getByText(tenants.restaurant.he.tableName, { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText(tenants.restaurant.en.tableName, { exact: true })).toHaveCount(0);
});

flow('the Arabic owner adds a table and a staff member in the restaurant settings, without PIN or password fields', async (page) => {
  const tenant = fixture().tenants.restaurant.ar;
  await signIn(page, tenant.email);
  await expect(page.getByText(tenant.tableName, { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.getByRole('button', { name: ar.dashboard.settings }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: new RegExp(escape(ar.settings.tabs.restaurant)) }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: ar.settings.restaurantSetup.addTable }).first().click();
  await page.getByPlaceholder(ar.settings.restaurantSetup.tableNamePlaceholder).fill(NEW_TABLE);
  await page.getByRole('button', { name: ar.settings.restaurantSetup.save }).first().click();
  await expect(page.getByText(NEW_TABLE).first()).toBeVisible({ timeout: 30_000 });

  // Exact: the settings menu entry's description ("...والموظفين") also contains the tab label.
  await page.getByRole('button', { name: ar.settings.restaurantSetup.staff, exact: true }).click();
  await page.getByRole('button', { name: ar.settings.restaurantSetup.addStaff }).first().click();
  const form = page.locator('div.p-4').filter({ has: page.getByRole('heading', { name: ar.settings.restaurantSetup.addStaff }) });
  await expect(form.getByText(ar.settings.restaurantSetup.pinCode)).toHaveCount(0);
  await expect(form.getByText(ar.auth.password)).toHaveCount(0);
  await form.locator('input[type="text"]').first().fill(NEW_STAFF);
  await form.getByRole('button', { name: ar.settings.restaurantSetup.save }).click();
  await expect(page.getByText(NEW_STAFF).first()).toBeVisible({ timeout: 30_000 });
});
