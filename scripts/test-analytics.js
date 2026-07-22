import assert from 'assert';
import {
  toFiniteNumber,
  getTripRevenue,
  getTripCost,
  isStoredProfitValid,
  isWholesaleCostValid,
  getTripProfit,
  getTripCollected,
  getTripOverpayment,
  getTripOutstanding,
  filterTrips,
  getPreviousPeriodFilters,
  calculateStats,
  calculateDestinationStats,
  getTripAttentionReasons,
  getAttentionRequiredTrips,
  generateBusinessInsights
} from '../src/components/analytics/AnalyticsEngine.js';

// Mock convert function
function mockConvert(amount, from, to) {
  if (from === to) return amount;
  const rates = { USD: 1, EUR: 0.9, ILS: 3.5 };
  // convert to USD, then to 'to' currency
  const amountInUSD = amount / rates[from];
  return amountInUSD * rates[to];
}

const mockRates = { USD: 1, EUR: 0.9, ILS: 3.5 };

console.log('Running Analytics Engine Unit Tests...');

try {
  // Test 1: toFiniteNumber
  assert.strictEqual(toFiniteNumber(5), 5);
  assert.strictEqual(toFiniteNumber(null), 0);
  assert.strictEqual(toFiniteNumber(undefined), 0);
  assert.strictEqual(toFiniteNumber(NaN), 0);
  assert.strictEqual(toFiniteNumber('123.45'), 123.45);
  assert.strictEqual(toFiniteNumber('abc'), 0);
  console.log('✔ Test 1: toFiniteNumber passed');

  // Test 2: profit validity rules
  const trip1 = { profit: 150 };
  const trip2 = { profit: 0 };
  const trip3 = { profit: -50 };
  const trip4 = { profit: null };
  const trip5 = { profit: undefined };
  const trip6 = { profit: 'NaN' };
  assert.strictEqual(isStoredProfitValid(trip1), true);
  assert.strictEqual(isStoredProfitValid(trip2), true); // Zero is valid
  assert.strictEqual(isStoredProfitValid(trip3), true); // Negative is valid
  assert.strictEqual(isStoredProfitValid(trip4), false);
  assert.strictEqual(isStoredProfitValid(trip5), false);
  assert.strictEqual(isStoredProfitValid(trip6), false);
  console.log('✔ Test 2: profit validity rules passed');

  // Test 3: wholesale cost validity rules
  assert.strictEqual(isWholesaleCostValid(100), true);
  assert.strictEqual(isWholesaleCostValid(0), true);
  assert.strictEqual(isWholesaleCostValid(-5), false); // Negative cost is invalid
  assert.strictEqual(isWholesaleCostValid(null), false);
  assert.strictEqual(isWholesaleCostValid(undefined), false);
  console.log('✔ Test 3: wholesale cost validity rules passed');

  // Test 4: profit calculation logic
  const tripOk = { sale_price: 1000, wholesale_cost: 800, profit: null };
  assert.strictEqual(getTripProfit(tripOk), 200);

  const tripStored = { sale_price: 1000, wholesale_cost: 800, profit: 150 };
  assert.strictEqual(getTripProfit(tripStored), 150);

  const tripStoredNeg = { sale_price: 1000, wholesale_cost: 800, profit: -50 };
  assert.strictEqual(getTripProfit(tripStoredNeg), -50);

  const tripMissingCost = { sale_price: 1000, wholesale_cost: null, profit: null };
  assert.strictEqual(getTripProfit(tripMissingCost), null);

  const tripMissingCostWithStored = { sale_price: 1000, wholesale_cost: null, profit: 300 };
  assert.strictEqual(getTripProfit(tripMissingCostWithStored), 300); // Stored profit overrides missing cost
  console.log('✔ Test 4: profit calculation logic passed');

  // Test 5: payment clamping
  const tripNormalPay = { sale_price: 1000, amount_paid: 600 };
  assert.strictEqual(getTripCollected(tripNormalPay), 600);
  assert.strictEqual(getTripOverpayment(tripNormalPay), 0);
  assert.strictEqual(getTripOutstanding(tripNormalPay), 400);

  const tripOverpay = { sale_price: 1000, amount_paid: 1200 };
  assert.strictEqual(getTripCollected(tripOverpay), 1000); // Clamped to sale price
  assert.strictEqual(getTripOverpayment(tripOverpay), 200); // Overpayment recorded
  assert.strictEqual(getTripOutstanding(tripOverpay), 0);

  const tripNegativePay = { sale_price: 1000, amount_paid: -100 };
  assert.strictEqual(getTripCollected(tripNegativePay), 0); // Clamped to 0
  assert.strictEqual(getTripOverpayment(tripNegativePay), 0);
  assert.strictEqual(getTripOutstanding(tripNegativePay), 1100);
  console.log('✔ Test 5: payment clamping passed');

  // Test 6: January vs previous December filter shifting
  const filtersJan = { year: '2026', month: '01', tripStatus: '', paymentStatus: '', destination: '' };
  const prevJan = getPreviousPeriodFilters(filtersJan);
  assert.strictEqual(prevJan.year, '2025');
  assert.strictEqual(prevJan.month, '12');

  const filtersJune = { year: '2026', month: '06', tripStatus: '', paymentStatus: '', destination: '' };
  const prevJune = getPreviousPeriodFilters(filtersJune);
  assert.strictEqual(prevJune.year, '2026');
  assert.strictEqual(prevJune.month, '05');

  const filtersYear = { year: '2026', month: '', tripStatus: '', paymentStatus: '', destination: '' };
  const prevYear = getPreviousPeriodFilters(filtersYear);
  assert.strictEqual(prevYear.year, '2025');
  assert.strictEqual(prevYear.month, '');
  console.log('✔ Test 6: Date period comparisons (January/December/Year) passed');

  // Test 7: Cancelled & Archived trips inclusion/exclusion rules
  const tripsDataset = [
    { start_date: '2026-06-15', status: 'active', destination: 'Antalya' },
    { start_date: '2026-06-16', status: 'completed', destination: 'Antalya' },
    { start_date: '2026-06-17', status: 'archived', destination: 'Antalya' },
    { start_date: '2026-06-18', status: 'cancelled', destination: 'Antalya' }
  ];

  const defaultFilters = { year: '2026', month: '06', tripStatus: '', paymentStatus: '', destination: '' };
  const filteredDefault = filterTrips(tripsDataset, defaultFilters);
  assert.strictEqual(filteredDefault.length, 3); // Excludes cancelled by default, includes archived
  assert.strictEqual(filteredDefault.some(t => t.status === 'cancelled'), false);
  assert.strictEqual(filteredDefault.some(t => t.status === 'archived'), true);

  const filterCancelled = { ...defaultFilters, tripStatus: 'cancelled' };
  const filteredCancelled = filterTrips(tripsDataset, filterCancelled);
  assert.strictEqual(filteredCancelled.length, 1);
  assert.strictEqual(filteredCancelled[0].status, 'cancelled');
  console.log('✔ Test 7: Cancelled and Archived trips filter rules passed');

  // Test 8: Empty datasets
  const emptyStats = calculateStats([], 'USD', mockRates, mockConvert);
  assert.strictEqual(emptyStats.totalRevenue, 0);
  assert.strictEqual(emptyStats.totalProfit, 0);
  assert.strictEqual(emptyStats.profitMarginPct, 0);
  assert.strictEqual(emptyStats.totalTrips, 0);
  assert.strictEqual(emptyStats.averageProfit, 0); // Safe zero when no trips
  console.log('✔ Test 8: Empty dataset stats passed');

  // Test 9: Mixed currencies and stats calculations
  const tripsCurrencies = [
    { sale_price: 100, wholesale_cost: 80, currency: 'USD', amount_paid: 100, status: 'active', travelers_count: 2 }, // revenue 100, profit 20
    { sale_price: 350, wholesale_cost: 210, currency: 'ILS', amount_paid: 350, status: 'active', travelers_count: 3 }, // in USD: revenue 100, profit 40 (3.5 ILS = 1 USD)
    { sale_price: 90, wholesale_cost: 90, currency: 'EUR', amount_paid: 45, status: 'active', travelers_count: 1 }   // in USD: revenue 100, profit 0, paid 50
  ];
  // Calculate USD stats
  const usdStats = calculateStats(tripsCurrencies, 'USD', mockRates, mockConvert);
  assert.strictEqual(usdStats.totalRevenue, 300); // 100 + 100 + 100
  assert.strictEqual(usdStats.totalProfit, 60);   // 20 + 40 + 0
  assert.strictEqual(usdStats.profitMarginPct, 20); // (60 / 300) * 100
  assert.strictEqual(usdStats.totalCollected, 250); // 100 + 100 + 50
  assert.strictEqual(usdStats.totalOutstanding, 50); // 0 + 0 + 50
  assert.strictEqual(usdStats.totalPassengers, 6);
  assert.strictEqual(usdStats.averageProfit, 20); // 60 total profit / 3 eligible trips = 20 average profit
  assert.strictEqual(usdStats.collectionRate.toFixed(1), '83.3');
  console.log('✔ Test 9: Mixed currencies and stats calculations passed');

  // Test 10: Missing wholesale costs (unknown profit - null handling)
  const tripsMissingWholesale = [
    { sale_price: 100, wholesale_cost: 80, currency: 'USD', amount_paid: 100, status: 'active' }, // revenue 100, profit 20
    { sale_price: 100, wholesale_cost: null, currency: 'USD', amount_paid: 100, status: 'active' } // revenue 100, profit unknown (exclude from profit denominator)
  ];
  const missingWholesaleStats = calculateStats(tripsMissingWholesale, 'USD', mockRates, mockConvert);
  assert.strictEqual(missingWholesaleStats.totalRevenue, 200);
  assert.strictEqual(missingWholesaleStats.totalProfit, 20);
  assert.strictEqual(missingWholesaleStats.profitMarginPct, 20); // only calculates margin for trips with known profit (20 / 100 * 100)
  assert.strictEqual(missingWholesaleStats.unknownProfitCount, 1);
  assert.strictEqual(missingWholesaleStats.averageProfit, 20); // 20 total profit / 1 eligible trip = 20 (excludes trip with null profit from denominator!)
  console.log('✔ Test 10: Missing wholesale cost handling passed');

  // Test 11: Combined filters & Attention required
  const tripsAttention = [
    { client_name: 'A', destination: 'Paris', start_date: '2026-07-20', status: 'active', sale_price: 100, amount_paid: 50, wholesale_cost: 80 }, // Near departure unpaid (today is July 10, departure in 10 days)
    { client_name: 'B', destination: 'Rome', start_date: '2026-06-01', status: 'active', sale_price: 200, amount_paid: 0, wholesale_cost: 150 },   // Past departure unpaid
    { client_name: 'C', destination: 'Tokyo', start_date: '2026-08-01', status: 'active', sale_price: 300, amount_paid: 300, wholesale_cost: 350 }, // Negative profit (-50)
    { client_name: 'D', destination: 'Dubai', start_date: '2026-08-01', status: 'active', sale_price: 100, amount_paid: 150, wholesale_cost: 80 }   // Overpayment
  ];

  const today = new Date('2026-07-10T12:00:00Z');
  const attentionItems = getAttentionRequiredTrips(tripsAttention, 'USD', mockRates, mockConvert, today);
  
  assert.strictEqual(attentionItems.length, 4);
  assert.strictEqual(attentionItems.some(i => i.trip.client_name === 'A' && i.reasons.includes('unpaidNearDeparture')), true);
  assert.strictEqual(attentionItems.some(i => i.trip.client_name === 'B' && i.reasons.includes('unpaidPastDeparture')), true);
  assert.strictEqual(attentionItems.some(i => i.trip.client_name === 'C' && i.reasons.includes('negativeProfit')), true);
  assert.strictEqual(attentionItems.some(i => i.trip.client_name === 'D' && i.reasons.includes('overpaid')), true);
  console.log('✔ Test 11: Attention required rules passed');

  console.log('\nAll unit tests passed successfully!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Test execution failed:');
  console.error(error);
  process.exit(1);
}
