import { Trip } from '../../types/trip';
import { getEffectiveTripDate, getEffectivePaymentStatus } from '../../lib/tripStatus';

export interface AnalyticsFilters {
  year: string;
  month: string;
  tripStatus: string;
  paymentStatus: string;
  destination: string;
}

export interface PeriodStats {
  totalRevenue: number;
  totalProfit: number;
  profitMarginPct: number;
  totalCollected: number;
  totalOutstanding: number;
  totalTrips: number;
  totalPassengers: number;
  averageProfit: number;
  averagePassengers: number;
  collectionRate: number;
  totalOverpayment: number;
  unknownProfitCount: number;
  tripsWithOverpaymentCount: number;
}

export interface DestinationStat {
  name: string;
  trips: number;
  revenue: number;
  profit: number;
  passengers: number;
  averageTripValue: number;
  outstandingBalance: number;
  profitMargin: number;
  unknownProfitCount: number;
}

export interface DestinationHighlights {
  bestRevenueDest: string | null;
  bestRevenueValue: number;
  bestProfitDest: string | null;
  bestProfitValue: number;
  highestPaxDest: string | null;
  highestPaxValue: number;
  weakestDest: string | null;
  weakestValue: number; // lowest profit or negative profit
}

export interface TripAttentionItem {
  trip: Trip;
  outstandingBalance: number;
  reasons: string[];
}

export interface BusinessInsight {
  key: string;
  type: 'success' | 'warning' | 'danger' | 'info';
  params?: Record<string, string | number>;
}

// 1. Helper to safely convert any value to finite number
export function toFiniteNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

// 2. Safe financials
export function getTripRevenue(trip: Trip): number {
  return toFiniteNumber(trip.sale_price);
}

export function getTripCost(trip: Trip): number {
  return toFiniteNumber(trip.wholesale_cost);
}

// 3. Stored profit validity check
// Stored profit is valid if it is a non-null, finite number.
// Zero and negative values are considered VALID profit values.
export function isStoredProfitValid(trip: Trip): boolean {
  return (
    trip.profit !== null &&
    trip.profit !== undefined &&
    Number.isFinite(Number(trip.profit))
  );
}

export function isWholesaleCostValid(cost: unknown): boolean {
  if (cost === null || cost === undefined) return false;
  const num = Number(cost);
  return Number.isFinite(num) && num >= 0;
}

// 4. Calculate profit for a single trip
export function getTripProfit(trip: Trip): number | null {
  if (isStoredProfitValid(trip)) {
    return Number(trip.profit);
  }
  if (!isWholesaleCostValid(trip.wholesale_cost)) {
    return null; // Unknown profit due to invalid cost
  }
  return getTripRevenue(trip) - getTripCost(trip);
}

// 5. Clamped payments
export function getTripCollected(trip: Trip): number {
  const paid = toFiniteNumber(trip.amount_paid);
  const sale = toFiniteNumber(trip.sale_price);
  return Math.min(Math.max(paid, 0), Math.max(sale, 0));
}

export function getTripOverpayment(trip: Trip): number {
  const paid = toFiniteNumber(trip.amount_paid);
  const sale = toFiniteNumber(trip.sale_price);
  return Math.max(0, paid - sale);
}

export function getTripOutstanding(trip: Trip): number {
  const paid = toFiniteNumber(trip.amount_paid);
  const sale = toFiniteNumber(trip.sale_price);
  return Math.max(0, sale - paid);
}

// 6. Date Parsing
export function getTripDateObj(trip: Trip): Date | null {
  const dateStr = getEffectiveTripDate(trip);
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 7. Filtering dataset consistently
// Cancelled trips are excluded by default (when tripStatus filter is empty).
// Archived trips are included by default.
export function filterTrips(
  trips: Trip[],
  filters: AnalyticsFilters,
  defaultYear: string = new Date().getFullYear().toString()
): Trip[] {
  return trips.filter((trip) => {
    const date = getTripDateObj(trip);
    if (!date) return false;

    // Year Filter
    const targetYear = filters.year || defaultYear;
    if (date.getFullYear().toString() !== targetYear) return false;

    // Month Filter
    if (filters.month) {
      const monthStr = String(date.getMonth() + 1).padStart(2, '0');
      if (monthStr !== filters.month) return false;
    }

    // Destination Filter
    if (filters.destination) {
      if (trip.destination?.trim().toLowerCase() !== filters.destination.trim().toLowerCase()) {
        return false;
      }
    }

    // Payment Status Filter
    if (filters.paymentStatus) {
      if (getEffectivePaymentStatus(trip) !== filters.paymentStatus) {
        return false;
      }
    }

    // Trip Status Filter
    if (filters.tripStatus) {
      if (trip.status !== filters.tripStatus) return false;
    } else {
      // Default: Exclude cancelled, include active, completed, and archived
      if (trip.status === 'cancelled') return false;
    }

    return true;
  });
}

// 8. Previous Period Filter Builder
export function getPreviousPeriodFilters(filters: AnalyticsFilters): AnalyticsFilters {
  const currentYearNum = Number(filters.year);
  if (filters.month) {
    const currentMonthNum = Number(filters.month);
    let prevMonthStr = '';
    let prevYearStr = filters.year;

    if (currentMonthNum === 1) {
      prevMonthStr = '12';
      prevYearStr = String(currentYearNum - 1);
    } else {
      prevMonthStr = String(currentMonthNum - 1).padStart(2, '0');
    }

    return {
      ...filters,
      year: prevYearStr,
      month: prevMonthStr,
    };
  } else {
    return {
      ...filters,
      year: String(currentYearNum - 1),
      month: '',
    };
  }
}

// 9. Normalize money helper
export function normalizeMoney(
  amount: number,
  tripCurrency: string | undefined,
  displayCurrency: string,
  rates: Record<string, number> | null,
  convert: (amt: number, from: string, to: string) => number
): number {
  const from = tripCurrency || displayCurrency;
  if (from === displayCurrency) return toFiniteNumber(amount);
  if (!rates) return 0;
  return convert(toFiniteNumber(amount), from, displayCurrency);
}

// 10. Core statistics calculator
export function calculateStats(
  trips: Trip[],
  displayCurrency: string,
  rates: Record<string, number> | null,
  convert: (amt: number, from: string, to: string) => number
): PeriodStats {
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let totalPassengers = 0;
  let totalOverpayment = 0;
  let revenueForProfitMargin = 0;
  let unknownProfitCount = 0;
  let tripsWithOverpaymentCount = 0;

  trips.forEach((trip) => {
    const revRaw = getTripRevenue(trip);
    const revNorm = normalizeMoney(revRaw, trip.currency, displayCurrency, rates, convert);
    totalRevenue += revNorm;

    const colRaw = getTripCollected(trip);
    const colNorm = normalizeMoney(colRaw, trip.currency, displayCurrency, rates, convert);
    totalCollected += colNorm;

    const outRaw = getTripOutstanding(trip);
    const outNorm = normalizeMoney(outRaw, trip.currency, displayCurrency, rates, convert);
    totalOutstanding += outNorm;

    const overRaw = getTripOverpayment(trip);
    if (overRaw > 0) {
      tripsWithOverpaymentCount++;
      const overNorm = normalizeMoney(overRaw, trip.currency, displayCurrency, rates, convert);
      totalOverpayment += overNorm;
    }

    totalPassengers += toFiniteNumber(trip.travelers_count || trip.travelers?.length || 0);

    const profitRaw = getTripProfit(trip);
    if (profitRaw !== null) {
      const profitNorm = normalizeMoney(profitRaw, trip.currency, displayCurrency, rates, convert);
      totalProfit += profitNorm;
      revenueForProfitMargin += revNorm;
    } else {
      unknownProfitCount++;
    }
  });

  const totalTrips = trips.length;
  const profitMarginPct = revenueForProfitMargin > 0 ? (totalProfit / revenueForProfitMargin) * 100 : 0;
  const eligibleProfitTripsCount = totalTrips - unknownProfitCount;
  const averageProfit = eligibleProfitTripsCount > 0 ? totalProfit / eligibleProfitTripsCount : 0;
  const averagePassengers = totalTrips > 0 ? totalPassengers / totalTrips : 0;
  const collectionRate = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;

  return {
    totalRevenue,
    totalProfit,
    profitMarginPct,
    totalCollected,
    totalOutstanding,
    totalTrips,
    totalPassengers,
    averageProfit,
    averagePassengers,
    collectionRate: Math.min(100, Math.max(0, collectionRate)),
    totalOverpayment,
    unknownProfitCount,
    tripsWithOverpaymentCount,
  };
}

// 11. Destination Performance calculations
export function calculateDestinationStats(
  trips: Trip[],
  displayCurrency: string,
  rates: Record<string, number> | null,
  convert: (amt: number, from: string, to: string) => number
): DestinationStat[] {
  const destMap = new Map<string, {
    trips: number;
    revenue: number;
    profit: number;
    passengers: number;
    outstandingBalance: number;
    revenueForMargin: number;
    unknownProfitCount: number;
  }>();

  trips.forEach((trip) => {
    const name = trip.destination?.trim();
    if (!name) return;

    const current = destMap.get(name) || {
      trips: 0,
      revenue: 0,
      profit: 0,
      passengers: 0,
      outstandingBalance: 0,
      revenueForMargin: 0,
      unknownProfitCount: 0,
    };

    const rev = normalizeMoney(getTripRevenue(trip), trip.currency, displayCurrency, rates, convert);
    const outstanding = normalizeMoney(getTripOutstanding(trip), trip.currency, displayCurrency, rates, convert);
    const pax = toFiniteNumber(trip.travelers_count || trip.travelers?.length || 0);

    let profitVal = 0;
    let unknownProfitInc = 0;
    let revForMarginVal = 0;

    const profitRaw = getTripProfit(trip);
    if (profitRaw !== null) {
      profitVal = normalizeMoney(profitRaw, trip.currency, displayCurrency, rates, convert);
      revForMarginVal = rev;
    } else {
      unknownProfitInc = 1;
    }

    destMap.set(name, {
      trips: current.trips + 1,
      revenue: current.revenue + rev,
      profit: current.profit + profitVal,
      passengers: current.passengers + pax,
      outstandingBalance: current.outstandingBalance + outstanding,
      revenueForMargin: current.revenueForMargin + revForMarginVal,
      unknownProfitCount: current.unknownProfitCount + unknownProfitInc,
    });
  });

  return Array.from(destMap.entries()).map(([name, val]) => {
    const profitMargin = val.revenueForMargin > 0 ? (val.profit / val.revenueForMargin) * 100 : 0;
    return {
      name,
      trips: val.trips,
      revenue: val.revenue,
      profit: val.profit,
      passengers: val.passengers,
      averageTripValue: val.trips > 0 ? val.revenue / val.trips : 0,
      outstandingBalance: val.outstandingBalance,
      profitMargin,
      unknownProfitCount: val.unknownProfitCount,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

// 12. Retrieve destination highlights
export function getDestinationHighlights(stats: DestinationStat[]): DestinationHighlights {
  if (stats.length === 0) {
    return {
      bestRevenueDest: null,
      bestRevenueValue: 0,
      bestProfitDest: null,
      bestProfitValue: 0,
      highestPaxDest: null,
      highestPaxValue: 0,
      weakestDest: null,
      weakestValue: 0,
    };
  }

  let bestRev = stats[0];
  let bestProf = stats[0];
  let maxPax = stats[0];
  let weakest = stats[0]; // defined as lowest profit

  stats.forEach((stat) => {
    if (stat.revenue > bestRev.revenue) bestRev = stat;
    if (stat.profit > bestProf.profit) bestProf = stat;
    if (stat.passengers > maxPax.passengers) maxPax = stat;
    if (stat.profit < weakest.profit) weakest = stat;
  });

  return {
    bestRevenueDest: bestRev.revenue > 0 ? bestRev.name : null,
    bestRevenueValue: bestRev.revenue,
    bestProfitDest: bestProf.profit > 0 ? bestProf.name : null,
    bestProfitValue: bestProf.profit,
    highestPaxDest: maxPax.passengers > 0 ? maxPax.name : null,
    highestPaxValue: maxPax.passengers,
    weakestDest: weakest.profit < 0 || stats.length > 1 ? weakest.name : null,
    weakestValue: weakest.profit,
  };
}

// 13. Determine if trip requires attention
// Attention required items logic:
// - payment status is unpaid or partial and departure date is near (within 14 days)
// - payment status is unpaid or partial and departure date is in the past (overdue unpaid)
// - missing customer phone
// - missing supplier wholesale cost (and no valid stored profit exists)
// - profit is negative or zero (profit <= 0)
// - invalid financials (wholesale_cost > sale_price, when both are valid and no stored profit exists)
// - overpayment exists (paid > price)
export function getTripAttentionReasons(
  trip: Trip,
  today: Date = new Date()
): string[] {
  const reasons: string[] = [];

  const sale = getTripRevenue(trip);
  const paid = toFiniteNumber(trip.amount_paid);
  const cost = getTripCost(trip);
  const profit = getTripProfit(trip);
  const status = getEffectivePaymentStatus(trip);

  const start = getTripDateObj(trip);

  if (start) {
    const normalizedToday = new Date(today);
    normalizedToday.setHours(0, 0, 0, 0);
    const startNormalized = new Date(start);
    startNormalized.setHours(0, 0, 0, 0);

    const diffTime = startNormalized.getTime() - normalizedToday.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (status !== 'paid') {
      if (diffDays >= 0 && diffDays <= 14) {
        reasons.push('unpaidNearDeparture');
      } else if (diffDays < 0) {
        reasons.push('unpaidPastDeparture');
      }
    }
  }

  if (!trip.client_phone || trip.client_phone.trim() === '') {
    reasons.push('missingPhone');
  }

  if (!isWholesaleCostValid(trip.wholesale_cost) && !isStoredProfitValid(trip)) {
    reasons.push('missingCost');
  }

  if (profit !== null && profit <= 0) {
    reasons.push('negativeProfit');
  }

  if (!isStoredProfitValid(trip) && isWholesaleCostValid(trip.wholesale_cost) && cost > sale) {
    reasons.push('invalidFinancials');
  }

  if (paid > sale) {
    reasons.push('overpaid');
  }

  return reasons;
}

export function getAttentionRequiredTrips(
  trips: Trip[],
  displayCurrency: string,
  rates: Record<string, number> | null,
  convert: (amt: number, from: string, to: string) => number,
  today: Date = new Date()
): TripAttentionItem[] {
  const attentionItems: TripAttentionItem[] = [];

  trips.forEach((trip) => {
    const reasons = getTripAttentionReasons(trip, today);
    if (reasons.length > 0) {
      const outstanding = normalizeMoney(getTripOutstanding(trip), trip.currency, displayCurrency, rates, convert);
      attentionItems.push({
        trip,
        outstandingBalance: outstanding,
        reasons,
      });
    }
  });

  // Rank by outstanding balance desc, then by date asc
  return attentionItems.sort((a, b) => {
    if (b.outstandingBalance !== a.outstandingBalance) {
      return b.outstandingBalance - a.outstandingBalance;
    }
    const aDate = getTripDateObj(a.trip)?.getTime() || 0;
    const bDate = getTripDateObj(b.trip)?.getTime() || 0;
    return aDate - bDate;
  });
}

// 14. Rule-based Business Insights
export function generateBusinessInsights(
  currentStats: PeriodStats,
  prevStats: PeriodStats | null,
  destinationStats: DestinationStat[],
  attentionItems: TripAttentionItem[],
  _upcomingTripsCount: number
): BusinessInsight[] {
  void _upcomingTripsCount;
  const insights: BusinessInsight[] = [];

  // Insight 1: Outstanding balance change
  if (prevStats && prevStats.totalOutstanding > 0) {
    const pct = ((currentStats.totalOutstanding - prevStats.totalOutstanding) / prevStats.totalOutstanding) * 100;
    if (pct >= 5) {
      insights.push({
        key: 'outstandingBalanceIncrease',
        type: 'danger',
        params: { percent: pct.toFixed(1) },
      });
    } else if (pct <= -5) {
      insights.push({
        key: 'outstandingBalanceDecrease',
        type: 'success',
        params: { percent: Math.abs(pct).toFixed(1) },
      });
    }
  }

  // Insight 2: Top Profit Destination
  const destHighlights = getDestinationHighlights(destinationStats);
  if (destHighlights.bestProfitDest && destHighlights.bestProfitValue > 0) {
    insights.push({
      key: 'topProfitDestination',
      type: 'success',
      params: { destination: destHighlights.bestProfitDest },
    });
  }

  // Insight 3: Upcoming trips with unpaid balances
  const upcomingUnpaid = attentionItems.filter(
    (item) =>
      item.trip.status !== 'cancelled' &&
      getTripDateObj(item.trip) &&
      (getTripDateObj(item.trip) as Date) >= new Date() &&
      (item.reasons.includes('unpaidNearDeparture') || getEffectivePaymentStatus(item.trip) !== 'paid')
  ).length;

  if (upcomingUnpaid > 0) {
    insights.push({
      key: 'upcomingUnpaidTrips',
      type: 'warning',
      params: { count: upcomingUnpaid },
    });
  }

  // Insight 4: Average Profit change
  if (prevStats && prevStats.averageProfit > 0) {
    const pct = ((currentStats.averageProfit - prevStats.averageProfit) / prevStats.averageProfit) * 100;
    if (pct <= -5) {
      insights.push({
        key: 'averageProfitDecrease',
        type: 'warning',
        params: { percent: Math.abs(pct).toFixed(1) },
      });
    } else if (pct >= 5) {
      insights.push({
        key: 'averageProfitIncrease',
        type: 'success',
        params: { percent: pct.toFixed(1) },
      });
    }
  }

  // Insight 5: Payment Collection Rate health
  if (currentStats.totalRevenue > 0) {
    if (currentStats.collectionRate < 70) {
      insights.push({
        key: 'lowCollectionRate',
        type: 'danger',
        params: { rate: currentStats.collectionRate.toFixed(1) },
      });
    } else if (currentStats.collectionRate >= 90) {
      insights.push({
        key: 'healthyCollectionRate',
        type: 'success',
        params: { rate: currentStats.collectionRate.toFixed(1) },
      });
    }
  }

  // Insight 6: Zero/Negative Profit trips
  const negProfitCount = attentionItems.filter((item) => item.reasons.includes('negativeProfit')).length;
  if (negProfitCount > 0) {
    insights.push({
      key: 'negativeProfitTrips',
      type: 'danger',
      params: { count: negProfitCount },
    });
  }

  // Insight 7: Highest Margin Destination (with at least 1 trip)
  if (destinationStats.length > 0) {
    const sortedByMargin = [...destinationStats].sort((a, b) => b.profitMargin - a.profitMargin);
    const topMargin = sortedByMargin[0];
    if (topMargin && topMargin.profitMargin > 0) {
      insights.push({
        key: 'highestMarginDestination',
        type: 'info',
        params: {
          destination: topMargin.name,
          margin: topMargin.profitMargin.toFixed(1),
        },
      });
    }
  }

  // Insight 8: Overpayments alert (data-quality alert)
  if (currentStats.tripsWithOverpaymentCount > 0) {
    insights.push({
      key: 'overpaymentsAlert',
      type: 'warning',
      params: { count: currentStats.tripsWithOverpaymentCount },
    });
  }

  // Insight 9: Missing wholesale cost alert (data-quality alert)
  if (currentStats.unknownProfitCount > 0) {
    insights.push({
      key: 'missingCostWarning',
      type: 'warning',
      params: { count: currentStats.unknownProfitCount },
    });
  }

  return insights;
}
