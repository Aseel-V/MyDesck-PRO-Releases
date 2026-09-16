/**
 * Tourism on the Firebase production root (src/firebase-main.tsx), in a real browser against the local emulators:
 * the owner creates a trip through the multi-step form, finds it in the trips workspace, creates a trip paid by a Visa
 * schedule, deletes one to the trash and restores it, and opens the notification centre. A second tenant signs in
 * right-to-left in Hebrew and sees none of the first tenant's trips; a third works in Arabic.
 *
 * Every flow asserts the runtime boundary from the browser: no request or socket to the Supabase database, Auth,
 * Edge Functions or realtime endpoints, no uncaught page error, and traffic served by the Firestore emulator.
 * Writes migration/reports/ui-smoke-tourism.json.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const locales = { he: readJson('src/i18n/locales/he.json'), ar: readJson('src/i18n/locales/ar.json'), en: readJson('src/i18n/locales/en.json') };
type Tenant = { email: string; uid: string; businessId: string };
const fixture = () => readJson('migration/full-vertical.local/ui-smoke-fixture.json') as
  { run: string; password: string; tenants: { tourism: Record<'en' | 'he' | 'ar', Tenant> } };

const STAMP = Date.now().toString().slice(-6);
const CASH_TRIP = `Smoke Athens ${STAMP}`;
const CARD_TRIP = `Smoke Rhodes ${STAMP}`;
const TRASH_TRIP = `Smoke Crete ${STAMP}`;
const CLIENT = `Smoke client ${STAMP}`;
const en = locales.en;
const SUPABASE_RUNTIME = /\.supabase\.co\/(rest|auth|functions|realtime|graphql)\/v1/;
const EXPECTED_FLOWS = 6;
const flows: Array<Record<string, unknown>> = [];
test.describe.configure({ mode: 'serial' });

test.afterAll(({ browserName }, testInfo) => {
  const decision = flows.length === EXPECTED_FLOWS && flows.every((flow) => flow.status === 'passed') ? 'PASS' : 'FAIL';
  writeFileSync(new URL('migration/reports/ui-smoke-tourism.json', ROOT), `${JSON.stringify({
    generatedAt: new Date().toISOString(), vertical: 'tourism', root: 'src/firebase-main.tsx', backendMode: 'firestore-emulator',
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

/** The trips workspace is a Dashboard page, reached from the navigation bar. */
async function showTrips(page: Page, language: 'en' | 'he' | 'ar') {
  await page.getByRole('button', { name: locales[language].dashboard.trips }).filter({ visible: true }).first()
    .click({ timeout: 120_000 });
  await expect(page.getByPlaceholder(locales[language].trips.search)).toBeVisible({ timeout: 60_000 });
}

/**
 * A trip card is the article carrying that destination's heading. Matching divs as well would match every
 * ancestor of the heading, and taking the first of those is the workspace wrapper around all of the cards;
 * strict mode is left on so a second card for one destination fails rather than being silently taken.
 */
const tripCard = (page: Page, destination: string) =>
  page.locator('article').filter({ has: page.getByRole('heading', { name: destination, exact: true }) });

/** The calendar keys every day button on its own ISO date, which no locale or time zone can shift. */
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Each money field is a number input beside its own label, so it is located through the block that carries
 * that label rather than by its position among the form's inputs.
 */
const amountField = (page: Page, label: string) =>
  page.locator('div:has(> label)').filter({ has: page.locator('label', { hasText: label }) })
    .locator('input[type="number"]');

/**
 * The trip date range: the collapsed field opens a calendar in a portal, two day buttons draft the range, and
 * Confirm commits it. Confirm stays disabled until both ends are drafted, so waiting for it to become enabled
 * asserts that the two days registered.
 */
async function pickDates(page: Page, start: Date, end: Date) {
  await page.getByText(en.trips.dateRangePlaceholder, { exact: true }).first().click();
  const calendar = page.getByRole('dialog', { name: en.trips.dateRangeCalendar });
  await expect(calendar).toBeVisible({ timeout: 30_000 });

  /**
   * The calendar opens on the month of the trip's start date, or on today's when there is none, and it renders
   * only that month's grid. Both ends are reached through the month and year selects rather than a day cell that
   * may belong to a month the grid is not showing; choosing a day can move the grid, so it is set before each.
   */
  const showMonth = async (date: Date) => {
    await calendar.locator('#trip-calendar-year').selectOption(String(date.getFullYear()));
    await calendar.locator('#trip-calendar-month').selectOption(String(date.getMonth()));
  };
  for (const date of [start, end]) {
    await showMonth(date);
    await calendar.locator(`button[data-calendar-date="${isoDay(date)}"]`).click();
  }

  const confirm = calendar.getByRole('button', { name: en.trips.confirmDateRange });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(calendar).toBeHidden({ timeout: 30_000 });
}

/**
 * The multi-step form. "Ticket only" is chosen because it is the shape this flow saves: the wizard then runs
 * details, payment and review, and a hotel name is not part of the trip. Steps advance with Continue, the
 * control a user actually presses; the step chips are labelled with their completion state, not their name.
 * amount_paid is editable for a cash trip and read-only for a card one, where the schedule derives it.
 */
async function createTrip(page: Page, options: { destination: string; client: string; sale: string; cost: string; card?: boolean }) {
  await page.getByRole('button', { name: en.dashboard.newTrip }).filter({ visible: true }).first().click({ timeout: 120_000 });
  await page.getByText(en.trips.serviceTypes.ticket, { exact: true }).first().click();
  await page.getByPlaceholder(en.trips.destinationPlaceholder).fill(options.destination);
  await page.getByPlaceholder(en.trips.clientNamePlaceholder).fill(options.client);
  await page.getByPlaceholder(en.trips.travelersCountPlaceholder).fill('2');
  await pickDates(page, new Date(Date.now() + 30 * 86_400_000), new Date(Date.now() + 35 * 86_400_000));

  const continueButton = page.getByRole('button', { name: en.trips.continue }).filter({ visible: true }).first();
  await continueButton.click();
  await amountField(page, en.trips.wholesaleCost).fill(options.cost);
  await amountField(page, en.trips.salePrice).fill(options.sale);
  const methods = page.getByRole('radiogroup', { name: en.trips.paymentMethod });
  await methods.getByText(options.card ? en.trips.paymentMethods.card : en.trips.paymentMethods.cash, { exact: true }).click();
  if (!options.card) await amountField(page, en.trips.amountPaid).fill(options.sale);

  await continueButton.click();
  await page.getByRole('button', { name: en.trips.save }).filter({ visible: true }).first().click();
  await expect(page.getByRole('button', { name: en.trips.save })).toHaveCount(0, { timeout: 60_000 });
}

flow('the English owner creates a trip through the form and finds it in the trips workspace', async (page) => {
  await signIn(page, fixture().tenants.tourism.en.email);
  await createTrip(page, { destination: CASH_TRIP, client: CLIENT, cost: '1000', sale: '1500' });
  await showTrips(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(tripCard(page, CASH_TRIP)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(CLIENT).first()).toBeVisible();
});

flow('the saved trip survives a reload and is found by search', async (page) => {
  await signIn(page, fixture().tenants.tourism.en.email);
  await showTrips(page, 'en');
  await expect(tripCard(page, CASH_TRIP)).toBeVisible({ timeout: 60_000 });
  const search = page.getByPlaceholder(en.trips.search);
  await search.fill(CASH_TRIP.slice(6));
  await expect(tripCard(page, CASH_TRIP)).toBeVisible({ timeout: 30_000 });
  await search.fill('zz-no-such-destination');
  await expect(tripCard(page, CASH_TRIP)).toHaveCount(0, { timeout: 30_000 });
  await search.fill('');
  await page.reload();
  await showTrips(page, 'en');
  await expect(tripCard(page, CASH_TRIP)).toBeVisible({ timeout: 60_000 });
});

flow('a trip paid by a Visa schedule is saved with its instalment plan', async (page) => {
  await signIn(page, fixture().tenants.tourism.en.email);
  await createTrip(page, { destination: CARD_TRIP, client: CLIENT, cost: '900', sale: '1200', card: true });
  await showTrips(page, 'en');
  await expect(tripCard(page, CARD_TRIP)).toBeVisible({ timeout: 60_000 });
});

flow('a trip is deleted to the trash and restored from it', async (page) => {
  await signIn(page, fixture().tenants.tourism.en.email);
  await createTrip(page, { destination: TRASH_TRIP, client: CLIENT, cost: '500', sale: '800' });
  await showTrips(page, 'en');
  const card = tripCard(page, TRASH_TRIP);
  await expect(card).toBeVisible({ timeout: 60_000 });

  // Deletion is a menu item on the card, behind the confirmation the product asks for.
  await card.getByRole('button', { name: en.trips.card.moreActions }).click();
  await page.getByRole('menuitem', { name: en.trips.delete }).click();
  await page.getByRole('button', { name: en.trips.moveToTrash }).click();
  await expect(card).toHaveCount(0, { timeout: 60_000 });

  // Every assertion below is scoped to the trash itself, so the workspace behind it cannot satisfy them.
  await page.getByRole('button', { name: en.trips.toolbar.trash }).filter({ visible: true }).first().click();
  const trash = page.getByRole('dialog', { name: en.trips.trash.title });
  await expect(trash).toBeVisible({ timeout: 30_000 });
  // The row is the one block holding BOTH that trip's select checkbox, which names its destination, and its own
  // Restore button. Filtering on either alone matches every ancestor that contains it, and choosing among those
  // by document order picks a wrapper or an inner text block rather than the row.
  const trashedRow = trash.locator('div')
    .filter({ has: page.getByLabel(en.trips.trash.selectTrip.replace('{{destination}}', TRASH_TRIP)) })
    .filter({ has: page.getByRole('button', { name: en.trips.trash.restore, exact: true }) })
    .last();
  await expect(trashedRow).toBeVisible({ timeout: 60_000 });

  await trashedRow.getByRole('button', { name: en.trips.trash.restore, exact: true }).click();
  await expect(trash.getByText(TRASH_TRIP)).toHaveCount(0, { timeout: 60_000 });
  await trash.getByRole('button', { name: en.trips.close }).click();
  await expect(tripCard(page, TRASH_TRIP)).toBeVisible({ timeout: 60_000 });
});

flow('another tenant signs in right-to-left in Hebrew and sees none of the first tenant\'s trips', async (page) => {
  await signIn(page, fixture().tenants.tourism.he.email);
  await showTrips(page, 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText(CASH_TRIP)).toHaveCount(0);
  await expect(page.getByText(CARD_TRIP)).toHaveCount(0);
});

flow('the Arabic owner opens the trips workspace and its notification centre right-to-left', async (page) => {
  await signIn(page, fixture().tenants.tourism.ar.email);
  await showTrips(page, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: locales.ar.trips.toolbar.notifications }).filter({ visible: true }).first().click();
  await expect(page.getByText(locales.ar.trips.toolbar.notifications).first()).toBeVisible({ timeout: 30_000 });
});
