import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

export interface AnalyticsSummaryFilters {
  year?: string;
  month?: string;
  tripStatus?: string;
  paymentStatus?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
}

export interface PeriodAggregateStats {
  total_trips: number | null;
  total_passengers: number | null;
  unknown_profit_count: number | null;
  total_revenue: number | null;
  total_cost?: number | null;
  total_profit: number | null;
  total_collected: number | null;
  total_outstanding: number | null;
  profit_margin_pct: number | null;
  markup_pct: number | null;
  collection_rate: number | null;
  average_profit: number | null;
  average_sale_value?: number | null;
}

export interface TrendBucket {
  name: string;
  trips: number | null;
  trips_sold?: number;
  trips_departing?: number;
  travelers?: number;
  revenue: number | null;
  profit: number | null;
  collected?: number | null;
  month_index?: number;
}

export interface DestinationAggregate {
  name: string;
  trips: number | null;
  trips_sold?: number;
  trips_departing?: number;
  passengers: number | null;
  revenue: number | null;
  profit: number | null;
  profit_margin: number | null;
  markup_pct: number | null;
  outstanding_balance?: number | null;
  unknown_profit_count?: number | null;
}

export interface PaymentHealthData {
  counts?: { paid: number; partial: number; unpaid: number };
  amounts?: {
    paid: number | null;
    partial_remaining: number | null;
    unpaid_remaining: number | null;
    confirmed_cash?: number | null;
    confirmed_visa?: number | null;
    scheduled_visa_today?: number | null;
    overdue_unconfirmed_visa?: number | null;
    future_scheduled_visa?: number | null;
    currently_due_unconfirmed?: number | null;
    confirmed_total?: number | null;
    total_unpaid?: number | null;
  };
  confirmed_cash?: number | null;
  remaining_cash?: number | null;
  confirmed_visa?: number | null;
  scheduled_visa_today?: number | null;
  overdue_unconfirmed_visa?: number | null;
  future_scheduled_visa?: number | null;
  currently_due_unconfirmed?: number | null;
  confirmed_total?: number | null;
  total_unpaid?: number | null;
  unscheduled_outstanding?: number | null;
}

export interface AgingBucketsData {
  current: number | null;
  overdue_1_30: number | null;
  overdue_31_60: number | null;
  overdue_61_plus: number | null;
  future_scheduled: number | null;
  unscheduled_outstanding?: number | null;
}

export interface AttentionItem {
  trip: {
    id: string;
    client_name: string;
    destination: string;
    start_date: string;
    payment_status: 'paid' | 'partial' | 'unpaid';
    status: 'active' | 'completed' | 'cancelled' | 'archived';
    currency: string;
  };
  outstanding_balance: number | null;
  reasons: string[];
}

export interface CurrencyTotal {
  currency: string;
  trip_count: number;
  trips_sold?: number;
  sales: number | null;
  profit: number | null;
  paid?: number | null;
  outstanding?: number | null;
  confirmed_cash?: number | null;
  remaining_cash?: number | null;
  confirmed_visa?: number | null;
  scheduled_visa_today?: number | null;
  overdue_unconfirmed_visa?: number | null;
  future_scheduled_visa?: number | null;
  currently_due_unconfirmed?: number | null;
}

export interface TravelAnalyticsSummaryResponse {
  financials_visible: boolean;
  can_view_financials: boolean;
  period_type: string;
  current_period: { start_date: string; end_date: string };
  previous_period: { start_date: string; end_date: string };
  financial_currency_mode: 'single' | 'grouped_only';

  // Explicit Three Domain Objects
  financial: {
    current_stats: PeriodAggregateStats;
    previous_stats: PeriodAggregateStats;
    trend: TrendBucket[];
    destination_sales: DestinationAggregate[];
    currency_totals: CurrencyTotal[];
  };
  travel: {
    current_stats: {
      trips_departing: number | null;
      total_travelers: number | null;
      upcoming_trips: number | null;
      completed_trips: number | null;
    };
    previous_stats: {
      trips_departing: number | null;
      total_travelers: number | null;
    };
    trend: TrendBucket[];
    destination_volume: DestinationAggregate[];
    attention_items: AttentionItem[];
  };
  payments: {
    summary: PaymentHealthData;
    aging: AgingBucketsData;
  };

  // Backwards compatibility mirrors
  current_stats: PeriodAggregateStats;
  previous_stats: PeriodAggregateStats;
  available_years: string[];
  available_destinations: string[];
  monthly_trend: TrendBucket[];
  destination_stats: DestinationAggregate[];
  payment_health: PaymentHealthData;
  aging_buckets: AgingBucketsData;
  attention_items: AttentionItem[];
  currency_totals: CurrencyTotal[];
}

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
);

export function finiteAnalyticsNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function analyticsDifference(current: unknown, previous: unknown): number | null {
  const normalizedCurrent = finiteAnalyticsNumber(current);
  const normalizedPrevious = finiteAnalyticsNumber(previous);
  if (normalizedCurrent === null || normalizedPrevious === null) return null;
  const difference = normalizedCurrent - normalizedPrevious;
  return Number.isFinite(difference) ? difference : null;
}

export function analyticsPercentageChange(current: unknown, previous: unknown): number | null {
  const normalizedPrevious = finiteAnalyticsNumber(previous);
  const difference = analyticsDifference(current, previous);
  if (normalizedPrevious === null || normalizedPrevious === 0 || difference === null) return null;
  const percentage = (difference / Math.abs(normalizedPrevious)) * 100;
  return Number.isFinite(percentage) ? percentage : null;
}

const firstFinite = (...values: unknown[]): number | null => {
  for (const value of values) {
    const normalized = finiteAnalyticsNumber(value);
    if (normalized !== null) return normalized;
  }
  return null;
};

export function normalizePeriodAggregateStats(primary: unknown, fallback?: unknown): PeriodAggregateStats {
  const source = asRecord(primary);
  const compatibility = asRecord(fallback);
  const totalTrips = firstFinite(source.total_trips, source.trips_sold, compatibility.total_trips, compatibility.trips_sold);
  const totalProfit = firstFinite(source.total_profit, compatibility.total_profit);
  const averageProfit = firstFinite(source.average_profit, compatibility.average_profit)
    ?? (totalProfit !== null && totalTrips !== null && totalTrips > 0 ? totalProfit / totalTrips : null);

  return {
    total_trips: totalTrips,
    total_passengers: firstFinite(source.total_passengers, source.total_travelers, compatibility.total_passengers, compatibility.total_travelers),
    unknown_profit_count: firstFinite(source.unknown_profit_count, compatibility.unknown_profit_count),
    total_revenue: firstFinite(source.total_revenue, compatibility.total_revenue),
    total_cost: firstFinite(source.total_cost, compatibility.total_cost),
    total_profit: totalProfit,
    total_collected: firstFinite(source.total_collected, compatibility.total_collected),
    total_outstanding: firstFinite(source.total_outstanding, compatibility.total_outstanding),
    profit_margin_pct: firstFinite(source.profit_margin_pct, compatibility.profit_margin_pct),
    markup_pct: firstFinite(source.markup_pct, compatibility.markup_pct),
    collection_rate: firstFinite(source.collection_rate, compatibility.collection_rate),
    average_profit: averageProfit,
    average_sale_value: firstFinite(source.average_sale_value, compatibility.average_sale_value),
  };
}

function normalizeTrendBuckets(value: unknown): TrendBucket[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const source = asRecord(item);
    return {
      name: typeof source.name === 'string' ? source.name : '',
      trips: firstFinite(source.trips, source.trips_sold, source.trips_departing),
      trips_sold: firstFinite(source.trips_sold) ?? undefined,
      trips_departing: firstFinite(source.trips_departing) ?? undefined,
      travelers: firstFinite(source.travelers) ?? undefined,
      revenue: firstFinite(source.revenue),
      profit: firstFinite(source.profit),
      collected: firstFinite(source.collected),
      month_index: firstFinite(source.month_index) ?? undefined,
    };
  });
}

function normalizeDestinationAggregates(value: unknown, supplementalValue?: unknown): DestinationAggregate[] {
  if (!Array.isArray(value)) return [];
  const supplementalByName = new Map<string, Record<string, unknown>>();
  if (Array.isArray(supplementalValue)) {
    supplementalValue.forEach((item) => {
      const source = asRecord(item);
      if (typeof source.name === 'string') supplementalByName.set(source.name, source);
    });
  }

  return value.map((item) => {
    const source = asRecord(item);
    const name = typeof source.name === 'string' ? source.name : '';
    const supplemental = supplementalByName.get(name) ?? {};
    return {
      name,
      trips: firstFinite(
        source.trips,
        source.trips_sold,
        source.trips_departing,
        supplemental.trips,
        supplemental.trips_sold,
        supplemental.trips_departing,
      ),
      trips_sold: firstFinite(source.trips_sold, supplemental.trips_sold) ?? undefined,
      trips_departing: firstFinite(source.trips_departing, supplemental.trips_departing) ?? undefined,
      passengers: firstFinite(
        source.passengers,
        source.total_passengers,
        source.total_travelers,
        supplemental.passengers,
        supplemental.total_passengers,
        supplemental.total_travelers,
      ),
      revenue: firstFinite(source.revenue, source.sales),
      profit: firstFinite(source.profit),
      profit_margin: firstFinite(source.profit_margin, source.profit_margin_pct),
      markup_pct: firstFinite(source.markup_pct),
      outstanding_balance: firstFinite(source.outstanding_balance),
      unknown_profit_count: firstFinite(source.unknown_profit_count),
    };
  });
}

interface CanonicalPaymentAnalyticsPayload {
  currency_mode?: 'single' | 'grouped_only';
  summary?: PaymentHealthData;
  currency_totals?: CurrencyTotal[];
}

export function normalizeAnalyticsResponse(raw: unknown, canonicalPaymentRaw?: unknown): TravelAnalyticsSummaryResponse {
  const r = asRecord(raw);
  const fin = asRecord(r.financial);
  const trv = asRecord(r.travel);
  const pym = asRecord(r.payments);
  const canonicalPayments = (typeof canonicalPaymentRaw === 'object' && canonicalPaymentRaw !== null
    ? canonicalPaymentRaw
    : {}) as CanonicalPaymentAnalyticsPayload;

  const canView = Boolean(r.can_view_financials ?? r.financials_visible ?? true);
  const rawCurrencyTotals = Array.isArray(canonicalPayments.currency_totals)
    ? canonicalPayments.currency_totals
    : Array.isArray(fin.currency_totals)
      ? fin.currency_totals as CurrencyTotal[]
      : Array.isArray(r.currency_totals)
        ? r.currency_totals as CurrencyTotal[]
        : [];
  const currencyMode = canonicalPayments.currency_mode
    ?? (rawCurrencyTotals.filter((item) => item.trip_count > 0).length > 1 ? 'grouped_only' : 'single');
  const rawTravelCurrent = asRecord(trv.current_stats);
  const rawTravelPrevious = asRecord(trv.previous_stats);
  const rawCurrentCompatibility = asRecord(r.current_stats);
  const rawPreviousCompatibility = asRecord(r.previous_stats);
  const currentStats = normalizePeriodAggregateStats(fin.current_stats, {
    ...rawCurrentCompatibility,
    total_passengers: rawCurrentCompatibility.total_passengers ?? rawTravelCurrent.total_travelers,
  });
  const previousStats = normalizePeriodAggregateStats(fin.previous_stats, {
    ...rawPreviousCompatibility,
    total_passengers: rawPreviousCompatibility.total_passengers ?? rawTravelPrevious.total_travelers,
  });
  if (import.meta.env.DEV && (currentStats.total_trips === null || currentStats.total_passengers === null)) {
    console.warn('[Travel Analytics] Count fields unavailable after safe normalization.', {
      expectedTripAliases: ['total_trips', 'trips_sold'],
      expectedTravelerAliases: ['total_passengers', 'total_travelers'],
      financialKeys: Object.keys(asRecord(fin.current_stats)).sort(),
      compatibilityKeys: Object.keys(rawCurrentCompatibility).sort(),
      travelKeys: Object.keys(rawTravelCurrent).sort(),
    });
  }
  const clearMixedCurrencyStats = (stats: PeriodAggregateStats): PeriodAggregateStats => currencyMode === 'single' ? stats : {
    ...stats,
    total_revenue: null,
    total_cost: null,
    total_profit: null,
    total_collected: null,
    total_outstanding: null,
    profit_margin_pct: null,
    markup_pct: null,
    average_profit: null,
    average_sale_value: null,
  };
  const rawFinancialTrend = Array.isArray(fin.trend) ? fin.trend : r.monthly_trend;
  const rawTravelTrend = Array.isArray(trv.trend) ? trv.trend : [];
  const rawDestinationSales = Array.isArray(fin.destination_sales) ? fin.destination_sales : r.destination_stats;
  const rawDestinationVolume = Array.isArray(trv.destination_volume) ? trv.destination_volume : [];
  const financialTrend = normalizeTrendBuckets(rawFinancialTrend);
  const travelTrend = normalizeTrendBuckets(rawTravelTrend);
  const destinationSales = normalizeDestinationAggregates(rawDestinationSales, rawDestinationVolume);
  const destinationVolume = normalizeDestinationAggregates(rawDestinationVolume);
  const normalizedCurrentStats = clearMixedCurrencyStats(currentStats);
  const normalizedPreviousStats = clearMixedCurrencyStats(previousStats);
  const paymentSummary = canonicalPayments.summary ?? (pym.summary as PaymentHealthData) ?? (r.payment_health as PaymentHealthData) ?? {};

  return {
    financials_visible: canView,
    can_view_financials: canView,
    period_type: (r.period_type as string) || 'full_year',
    current_period: (r.current_period as { start_date: string; end_date: string }) || { start_date: '', end_date: '' },
    previous_period: (r.previous_period as { start_date: string; end_date: string }) || { start_date: '', end_date: '' },
    financial_currency_mode: currencyMode,
    financial: {
      current_stats: normalizedCurrentStats,
      previous_stats: normalizedPreviousStats,
      trend: currencyMode === 'single' ? financialTrend : financialTrend.map((item) => ({ ...item, revenue: null, profit: null, collected: null })),
      destination_sales: currencyMode === 'single' ? destinationSales : destinationSales.map((item) => ({ ...item, revenue: null, profit: null, profit_margin: null, markup_pct: null, outstanding_balance: null })),
      currency_totals: rawCurrencyTotals,
    },
    travel: {
      current_stats: {
        trips_departing: firstFinite(rawTravelCurrent.trips_departing),
        total_travelers: firstFinite(rawTravelCurrent.total_travelers),
        upcoming_trips: firstFinite(rawTravelCurrent.upcoming_trips),
        completed_trips: firstFinite(rawTravelCurrent.completed_trips),
      },
      previous_stats: {
        trips_departing: firstFinite(rawTravelPrevious.trips_departing),
        total_travelers: firstFinite(rawTravelPrevious.total_travelers),
      },
      trend: travelTrend,
      destination_volume: destinationVolume,
      attention_items: Array.isArray(trv.attention_items) ? trv.attention_items : Array.isArray(r.attention_items) ? r.attention_items : [],
    },
    payments: {
      summary: paymentSummary,
      aging: (pym.aging as AgingBucketsData) || (r.aging_buckets as AgingBucketsData) || { current: 0, overdue_1_30: 0, overdue_31_60: 0, overdue_61_plus: 0, future_scheduled: 0, unscheduled_outstanding: 0 },
    },
    current_stats: normalizedCurrentStats,
    previous_stats: normalizedPreviousStats,
    available_years: Array.isArray(r.available_years) ? r.available_years : [new Date().getFullYear().toString()],
    available_destinations: Array.isArray(r.available_destinations) ? r.available_destinations : [],
    monthly_trend: financialTrend,
    destination_stats: destinationSales,
    payment_health: paymentSummary,
    aging_buckets: (r.aging_buckets as AgingBucketsData) || { current: 0, overdue_1_30: 0, overdue_31_60: 0, overdue_61_plus: 0, future_scheduled: 0, unscheduled_outstanding: 0 },
    attention_items: Array.isArray(r.attention_items) ? r.attention_items : [],
    currency_totals: rawCurrencyTotals,
  };
}

export async function fetchTravelAnalyticsSummary(filters: AnalyticsSummaryFilters): Promise<TravelAnalyticsSummaryResponse> {
  const monthNum = filters.month ? Number(filters.month) : null;
  const args = {
    p_year: filters.year || null,
    p_month: Number.isFinite(monthNum) && monthNum! >= 1 && monthNum! <= 12 ? monthNum : null,
    p_trip_status: filters.tripStatus || null,
    p_payment_status: filters.paymentStatus || null,
    p_destination: filters.destination || null,
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
  };
  const [summaryResult, paymentResult] = await Promise.all([
    supabase.rpc('get_travel_analytics_summary', args),
    supabase.rpc('get_travel_payment_analytics', args),
  ]);

  if (summaryResult.error) {
    console.error('Analytics RPC fetch error:', summaryResult.error.message);
    throw summaryResult.error;
  }
  if (paymentResult.error) {
    console.error('Canonical payment analytics RPC fetch error:', paymentResult.error.message);
    throw paymentResult.error;
  }
  return normalizeAnalyticsResponse(summaryResult.data, paymentResult.data);
}

export function useTravelAnalyticsSummary(filters: AnalyticsSummaryFilters) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['travel-analytics-summary', user?.id, filters],
    queryFn: () => fetchTravelAnalyticsSummary(filters),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    gcTime: 300_000,
  });
}
