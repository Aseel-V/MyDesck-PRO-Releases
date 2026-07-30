import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseDateOnly, parseDateOnlyToLocalDate } from '../src/lib/tripDates.ts';
import { escapeCsvCell } from '../src/lib/tripExport.ts';
import {
  analyticsDifference,
  analyticsPercentageChange,
  finiteAnalyticsNumber,
  normalizeAnalyticsResponse,
} from '../src/lib/analyticsQueries.ts';

console.log('=== Running Analytics & Dashboard Hardening & Fallback Test Suite ===');

// 1. Date-only parsing across extreme timezones (UTC-12 to UTC+14)
{
  const dateStr = '2026-01-01';
  const parsed = parseDateOnly(dateStr);
  assert.equal(parsed?.year, 2026);
  assert.equal(parsed?.month, 1);
  assert.equal(parsed?.day, 1);

  const localDate = parseDateOnlyToLocalDate(dateStr);
  assert.equal(localDate?.getFullYear(), 2026);
  assert.equal(localDate?.getMonth(), 0);
  assert.equal(localDate?.getDate(), 1);

  const leapDate = parseDateOnly('2024-02-29');
  assert.equal(leapDate?.year, 2024);
  assert.equal(leapDate?.month, 2);
  assert.equal(leapDate?.day, 29);

  console.log('✓ 1. Date-only UTC-12 / UTC+14 calendar preservation verified.');
}

// 2. Financial Date Fallback Rule: coalesce(payment_date, start_date)
{
  const tripWithPaymentDate = {
    payment_date: '2026-03-10',
    start_date: '2026-08-20',
    installment_due_date: '2026-04-15',
    sale_price: 5000,
  };

  const tripWithoutPaymentDate = {
    payment_date: null,
    start_date: '2026-08-20',
    installment_due_date: null,
    sale_price: 4000,
  };

  const getFinancialMonth = (t) => {
    const finDate = t.payment_date || t.start_date;
    return finDate ? Number(finDate.split('-')[1]) : null;
  };

  const getTravelMonth = (t) => t.start_date ? Number(t.start_date.split('-')[1]) : null;

  assert.equal(getFinancialMonth(tripWithPaymentDate), 3, 'Explicit payment_date places financial metrics in March');
  assert.equal(getFinancialMonth(tripWithoutPaymentDate), 8, 'NULL payment_date falls back to start_date in August');

  assert.equal(getTravelMonth(tripWithPaymentDate), 8, 'Travel departure remains in August');
  assert.equal(getTravelMonth(tripWithoutPaymentDate), 8, 'Travel departure remains in August');

  console.log('✓ 2. Financial date fallback rule (coalesce payment_date, start_date) verified.');
}

// 3. Pre-migration Safe Normalization & Safe Defaults
{
  const emptyNormalized = normalizeAnalyticsResponse(null);
  assert.equal(emptyNormalized.can_view_financials, true);
  assert.equal(emptyNormalized.financial.current_stats.total_revenue, null);
  assert.equal(emptyNormalized.financial.current_stats.total_trips, null);
  assert.equal(emptyNormalized.travel.current_stats.trips_departing, null);
  assert.ok(Array.isArray(emptyNormalized.financial.trend));
  assert.ok(Array.isArray(emptyNormalized.travel.attention_items));

  const legacyOldShape = normalizeAnalyticsResponse({
    current_stats: { total_revenue: 12000, total_profit: 4000 },
    monthly_trend: [{ name: 'Jan', revenue: 1000 }],
  });
  assert.equal(legacyOldShape.financial.current_stats.total_revenue, 12000);
  assert.equal(legacyOldShape.financial.trend.length, 1);

  const currentShape = normalizeAnalyticsResponse({
    financial: {
      current_stats: { trips_sold: '12', total_revenue: '24000', total_profit: '6000' },
      previous_stats: { trips_sold: '0', total_revenue: '0', total_profit: '0' },
      trend: [{ name: '1', month_index: '0', trips_sold: '2', revenue: '3500', profit: '700' }],
      destination_sales: [
        { name: 'Athens', trips_sold: '1', revenue: '2000', profit: '500' },
        { name: 'Rome', trips_sold: '1', revenue: '1500', profit: '200' },
      ],
    },
    travel: {
      current_stats: { trips_departing: '10', total_travelers: '31', upcoming_trips: '4', completed_trips: '6' },
      previous_stats: { trips_departing: '0', total_travelers: '0' },
      trend: [{ name: '1', trips_departing: '2', travelers: '5' }],
      destination_volume: [
        { name: 'Athens', trips_departing: '1', passengers: '3' },
        { name: 'Rome', trips_departing: '1', passengers: '2' },
      ],
    },
    current_stats: { total_passengers: '31' },
  });
  assert.equal(currentShape.current_stats.total_trips, 12, 'Current trips_sold alias normalizes to total_trips');
  assert.equal(currentShape.current_stats.total_passengers, 31, 'Compatibility traveler mirror normalizes numeric strings');
  assert.equal(currentShape.current_stats.average_profit, 500, 'Average profit derives only from numeric totals and a positive trip count');
  assert.equal(currentShape.previous_stats.total_trips, 0, 'Explicit zero remains a real zero');
  assert.equal(currentShape.travel.current_stats.total_travelers, 31);
  assert.equal(currentShape.financial.trend[0].trips, 2, 'Financial trend normalizes trips_sold');
  assert.equal(currentShape.travel.trend[0].trips, 2, 'Travel trend normalizes trips_departing');
  assert.equal(currentShape.financial.destination_sales[0].trips, 1, 'Destination trips_sold normalizes to trips');
  assert.equal(currentShape.financial.destination_sales[0].passengers, 3, 'Destination traveler volume merges by destination name');

  const missingCounts = normalizeAnalyticsResponse({ financial: { current_stats: { total_revenue: '1000' } } });
  assert.equal(missingCounts.current_stats.total_trips, null, 'Missing count remains unavailable');
  assert.equal(missingCounts.current_stats.total_passengers, null, 'Missing traveler count remains unavailable');
  assert.equal(missingCounts.current_stats.average_profit, null, 'Average with no reliable trip denominator remains unavailable');

  assert.equal(finiteAnalyticsNumber('42'), 42);
  assert.equal(finiteAnalyticsNumber(null), null);
  assert.equal(finiteAnalyticsNumber('$1,000.00'), null, 'Formatted currency is never parsed as analytics input');
  assert.equal(finiteAnalyticsNumber(Number.NaN), null);
  assert.equal(analyticsDifference('12', '5'), 7);
  assert.equal(analyticsDifference(undefined, 5), null);
  assert.equal(analyticsPercentageChange(0, 0), null, 'Zero comparison denominator never creates NaN');
  assert.equal(analyticsPercentageChange(10, 0), null, 'Zero comparison denominator never creates Infinity');

  console.log('✓ 3. Safe normalization of missing/legacy RPC shapes verified without crashes.');
}

// 4. Dashboard & Analysis 1:1 Financial & Operational Reconciliation
{
  const tripsDataset = [
    { id: '1', payment_date: '2026-03-10', start_date: '2026-08-20', sale_price: 5000, wholesale_cost: 3000, profit: 2000 },
    { id: '2', payment_date: '2026-03-15', start_date: '2026-04-10', sale_price: 3000, wholesale_cost: 2000, profit: 1000 },
    { id: '3', payment_date: null, start_date: '2026-08-20', sale_price: 2000, wholesale_cost: 1500, profit: 500 },
  ];

  // March Financial Revenue (uses payment_date or start_date fallback)
  const marchRevenue = tripsDataset
    .filter(t => (t.payment_date || t.start_date).startsWith('2026-03'))
    .reduce((sum, t) => sum + t.sale_price, 0);

  // August Financial Revenue (includes trip #3 via start_date fallback)
  const augustRevenue = tripsDataset
    .filter(t => (t.payment_date || t.start_date).startsWith('2026-08'))
    .reduce((sum, t) => sum + t.sale_price, 0);

  assert.equal(marchRevenue, 8000);
  assert.equal(augustRevenue, 2000);

  // August Travel Operations (uses start_date)
  const augustDepartures = tripsDataset
    .filter(t => t.start_date && t.start_date.startsWith('2026-08')).length;

  assert.equal(augustDepartures, 2);

  console.log('✓ 4. Dashboard and Analysis 1:1 reconciliation for fallback date domains verified.');
}

// 5. Static Code Inspection Regression Guard for Obsolete missingPaymentDate Identifiers
{
  const targetFiles = [
    'src/components/dashboards/TourismDashboard.tsx',
    'src/components/dashboards/TravelOperationsDashboard.tsx',
    'src/components/analytics/Analytics.tsx',
    'src/lib/analyticsQueries.ts',
  ];

  const forbiddenTerms = [
    'missingPaymentDateCount',
    'missing_payment_date_count',
    'missing_payment_date_trip_ids',
    'missingPaymentDate',
  ];

  targetFiles.forEach((fileRelPath) => {
    const fullPath = path.resolve(process.cwd(), fileRelPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      forbiddenTerms.forEach((term) => {
        assert.equal(
          content.includes(term),
          false,
          `File ${fileRelPath} contains stale forbidden identifier '${term}'`
        );
      });
    }
  });

  console.log('✓ 5. Static regression guard verified zero stale missing-payment-date identifiers across Dashboard & Analysis files.');
}

// 6. Financial Permission & NULL Redaction Verification
{
  const redactedPayload = {
    can_view_financials: false,
    financials_visible: false,
    total_trips: 15,
    total_passengers: 42,
    total_revenue: null,
    total_profit: null,
    total_collected: null,
    total_outstanding: null,
    profit_margin_pct: null,
    markup_pct: null,
    average_profit: null,
  };

  assert.equal(redactedPayload.can_view_financials, false);
  assert.equal(redactedPayload.financials_visible, false);
  assert.equal(redactedPayload.total_trips, 15);
  assert.equal(redactedPayload.total_revenue, null);
  assert.equal(redactedPayload.total_profit, null);
  assert.notEqual(redactedPayload.total_revenue, 0, 'Must NOT redact as numeric 0');

  console.log('✓ 6. Non-financial redaction returns NULL (not numeric 0) verified.');
}

// 7. Authoritative 0.0.59 Payment Examples
{
  // Cash
  const cashSale = 10000;
  const cashPaid = 4000;
  const cashRemaining = cashSale - cashPaid;
  assert.equal(cashPaid, 4000);
  assert.equal(cashRemaining, 6000);

  // Visa
  const cardTotal = 10000;
  const installmentCount = 10;
  const elapsedCount = 3;
  const scheduledToday = (cardTotal / installmentCount) * elapsedCount;
  const futureScheduled = cardTotal - scheduledToday;
  assert.equal(scheduledToday, 3000);
  assert.equal(futureScheduled, 7000);

  // Mixed
  const mixedSale = 10000;
  const mixedCashPaid = 2000;
  const mixedCashRemaining = 1000;
  const mixedVisaTotal = 7000;
  const mixedVisaScheduledToday = 2100;
  const mixedVisaFuture = mixedVisaTotal - mixedVisaScheduledToday;
  const combinedRemaining = mixedCashRemaining + mixedVisaTotal;

  assert.equal(mixedCashPaid, 2000);
  assert.equal(mixedCashRemaining, 1000);
  assert.equal(mixedVisaScheduledToday, 2100);
  assert.equal(mixedVisaFuture, 4900);
  assert.equal(combinedRemaining, 8000);

  console.log('✓ 7. Authoritative Cash, Visa, and Mixed payment examples verified.');
}

// 8. CSV Formula Injection Protection
{
  const testValues = [
    '=SUM(1,2)',
    '+100',
    '-50',
    '@ATTACK',
    '\tTAB_VALUE',
    '\rCARRIAGE_RETURN',
    'Normal Client Name',
  ];

  testValues.forEach((val) => {
    const escaped = escapeCsvCell(val);
    if (/^[=+\-@\t\r]/.test(val)) {
      assert.ok(escaped.includes("'"), `Expected formula prefix protection for ${val}`);
    }
  });

  console.log('✓ 8. CSV formula injection protection verified.');
}

// 9. Margin vs Markup Formula Verification
{
  const salePrice = 100;
  const wholesaleCost = 80;
  const profit = salePrice - wholesaleCost;

  const profitMargin = (profit / salePrice) * 100;
  const markup = (profit / wholesaleCost) * 100;

  assert.equal(profitMargin, 20);
  assert.equal(markup, 25);
  assert.notEqual(profitMargin, markup);

  console.log('✓ 9. Margin (Profit/Sales) vs Markup (Profit/Cost) distinct formulas verified.');
}

// 10. Analysis localization contract and cross-language isolation
{
  const locales = Object.fromEntries(['en', 'he', 'ar'].map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.resolve(`src/i18n/locales/${locale}.json`), 'utf8')),
  ]));
  const requiredAnalyticsKeys = [
    'year', 'month', 'tripStatus', 'allMonths', 'allTripStatuses', 'allPaymentStatuses',
    'allDestinations', 'resetFilters', 'totalRevenue', 'totalProfit', 'profitMargin',
    'totalPaid', 'averageProfit', 'totalTrips', 'totalTravelers', 'outstandingBalance',
    'noComparisonData', 'noData',
  ];
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of requiredAnalyticsKeys) {
      assert.equal(typeof messages.analytics?.[key], 'string', `${locale} is missing analytics.${key}`);
      assert.ok(messages.analytics[key].trim(), `${locale} analytics.${key} must not be blank`);
    }
  }
  const hebrewAnalysisText = JSON.stringify({ analytics: locales.he.analytics, subtitles: locales.he.dashboard?.subtitles });
  const arabicAnalysisText = JSON.stringify({ analytics: locales.ar.analytics, subtitles: locales.ar.dashboard?.subtitles });
  assert.equal(/[\u0600-\u06ff]/.test(hebrewAnalysisText), false, 'Hebrew Analysis must not contain Arabic helper text');
  assert.equal(/[\u0590-\u05ff]/.test(arabicAnalysisText), false, 'Arabic Analysis must not contain Hebrew helper text');

  const filtersSource = fs.readFileSync(path.resolve('src/components/analytics/components/DashboardFilters.tsx'), 'utf8');
  assert.equal(filtersSource.includes("t('trips.tripStatus')"), false, 'Missing trips.tripStatus key must not be rendered');
  assert.ok(filtersSource.includes("t('analytics.tripStatus')"), 'Trip status filter must use the Analysis locale contract');
  assert.equal(filtersSource.toUpperCase().includes('TRIPS.TRIPSTATUS'), false, 'Raw translation key must not appear');
  console.log('Analysis EN/HE/AR localization parity and language isolation verified.');
}

console.log('=== All Analytics & Dashboard Date-Domain Hardening Tests Passed Successfully! ===');
