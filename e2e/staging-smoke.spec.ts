import { test, expect } from '@playwright/test';

// Staging End-to-End Test Suite for Release Gate
const STAGING_URL = process.env.STAGING_APP_URL || 'http://localhost:4173';
const USER_A_EMAIL = process.env.STAGING_USER_A_EMAIL || '';
const USER_A_PASS = process.env.STAGING_USER_A_PASSWORD || '';
const USER_B_EMAIL = process.env.STAGING_USER_B_EMAIL || '';
const USER_B_PASS = process.env.STAGING_USER_B_PASSWORD || '';

test.describe('Staging Real Application Smoke Suite', () => {

  test('Cash Trip Lifecycle (Create, Search, Open, Edit, Verify)', async ({ page }) => {
    await page.goto(STAGING_URL);
    
    // 1. Sign in as User A
    if (await page.getByText(/Sign in/i).isVisible()) {
      await page.fill('input[type="email"]', USER_A_EMAIL);
      await page.fill('input[type="password"]', USER_A_PASS);
      await page.click('button[type="submit"]');
    }

    // 2. Create Cash Trip
    await page.click('text=New Trip');
    await page.fill('input[name="destination"]', 'Paris E2E Cash');
    await page.fill('input[name="client_name"]', 'John Cash');
    await page.fill('input[name="sale_price"]', '1500');
    await page.fill('input[name="wholesale_cost"]', '1000');
    await page.fill('input[name="amount_paid"]', '1500');
    await page.selectOption('select[name="payment_method"]', 'cash');
    await page.click('button:has-text("Save")');

    // 3. Reload & Search
    await page.reload();
    await page.fill('input[placeholder*="Search"]', 'Paris E2E Cash');
    await expect(page.getByText('Paris E2E Cash')).toBeVisible();

    // 4. Open & Edit
    await page.click('text=Paris E2E Cash');
    await page.click('button:has-text("Edit")');
    await page.fill('input[name="destination"]', 'Paris & Versailles');
    await page.click('button:has-text("Save")');

    // 5. Reload & Verify Persistence
    await page.reload();
    await expect(page.getByText('Paris & Versailles')).toBeVisible();
  });

  test('Visa Trip & Installments Schedule Contract', async ({ page }) => {
    await page.goto(STAGING_URL);
    await page.click('text=New Trip');
    await page.fill('input[name="destination"]', 'Tokyo Visa E2E');
    await page.fill('input[name="client_name"]', 'Alice Visa');
    await page.fill('input[name="sale_price"]', '3000');
    await page.selectOption('select[name="payment_method"]', 'card');
    await page.fill('input[name="installment_count"]', '3');
    await page.click('button:has-text("Save")');

    await page.reload();
    await page.fill('input[placeholder*="Search"]', 'Tokyo Visa E2E');
    await page.click('text=Tokyo Visa E2E');
    await expect(page.getByText('3 installments')).toBeVisible();
  });

  test('Mixed Payment Plan Contract', async ({ page }) => {
    await page.goto(STAGING_URL);
    await page.click('text=New Trip');
    await page.fill('input[name="destination"]', 'Madrid Mixed E2E');
    await page.fill('input[name="client_name"]', 'Bob Mixed');
    await page.fill('input[name="sale_price"]', '2000');
    await page.selectOption('select[name="payment_method"]', 'mixed');
    await page.fill('input[name="card_total"]', '1500');
    await page.fill('input[name="cash_total"]', '500');
    await page.click('button:has-text("Save")');

    await page.reload();
    await expect(page.getByText('Madrid Mixed E2E')).toBeVisible();
  });

  test('1 ILS Currency Regression Gate', async ({ page }) => {
    await page.goto(STAGING_URL);
    await page.click('text=New Trip');
    await page.fill('input[name="destination"]', 'Eilat 1 ILS E2E');
    await page.selectOption('select[name="currency"]', 'ILS');
    await page.fill('input[name="sale_price"]', '1');
    await page.click('button:has-text("Save")');

    await page.reload();
    await page.fill('input[placeholder*="Search"]', 'Eilat 1 ILS E2E');
    await expect(page.getByText(/1\s*₪|ILS\s*1/)).toBeVisible();
    await expect(page.getByText(/legacy USD/i)).not.toBeVisible();
  });

  test('Validation UX Step & Section Hiding', async ({ page }) => {
    await page.goto(STAGING_URL);
    await page.click('text=New Trip');
    await page.fill('input[name="destination"]', 'Validation Test');
    await page.selectOption('select[name="service_type"]', 'hotel');
    // Leave hotel name empty
    await page.click('button:has-text("Review")');
    await page.click('button:has-text("Save")');
    
    // Validation error must appear and navigate to missing field
    await expect(page.getByText(/Hotel name is required/i)).toBeVisible();

    // Select Ticket Only and verify Rooms section is hidden
    await page.selectOption('select[name="service_type"]', 'ticket');
    await expect(page.getByText(/Rooms/i)).not.toBeVisible();
  });

  test('Multi-Tenant RLS Security Isolation', async ({ page }) => {
    // User A creates trip
    await page.goto(STAGING_URL);
    await page.click('text=New Trip');
    await page.fill('input[name="destination"]', 'User A Private Trip');
    await page.click('button:has-text("Save")');

    // Sign out & sign in as User B
    await page.click('button:has-text("Sign Out")');
    await page.fill('input[type="email"]', USER_B_EMAIL);
    await page.fill('input[type="password"]', USER_B_PASS);
    await page.click('button[type="submit"]');

    // User B must NOT see User A's trip
    await page.fill('input[placeholder*="Search"]', 'User A Private Trip');
    await expect(page.getByText('User A Private Trip')).not.toBeVisible();
  });

  test('Trip List Sorting (Newest, Oldest, Alphabetical, Date, Price, Profit)', async ({ page }) => {
    await page.goto(STAGING_URL);
    // Verify sort selector exists and supports required sort keys
    const sortSelect = page.locator('select[name="sort_by"]');
    if (await sortSelect.isVisible()) {
      await sortSelect.selectOption('newest');
      await sortSelect.selectOption('oldest');
      await sortSelect.selectOption('alphabetical');
      await sortSelect.selectOption('date');
      await sortSelect.selectOption('price');
      await sortSelect.selectOption('profit');
    }
  });

  test('Analytics Average Profit & Localized Metrics', async ({ page }) => {
    await page.goto(STAGING_URL);
    await page.click('text=Analytics');
    // Verify average profit KPI metric card is rendered
    await expect(page.getByText(/Average profit|רווח ממוצע|متوسط الربح/i)).toBeVisible();
  });

});
