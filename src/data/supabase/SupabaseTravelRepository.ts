import { supabase } from '../../lib/supabase';
import type { Json } from '../../types/database';
import type { ItineraryItem, Trip, TripFormData } from '../../types/trip';
import { toTripInsert, toTripPaymentPlanInput, toTripUpdate } from '../../lib/tripPayload';
import { requireCanonicalPaymentWriteContract } from '../../lib/paymentContractCompatibility';
import { recordRpcFallback, recordRpcSuccess } from '../../lib/rpcAvailability';
import { calculateTripFinancials } from '../../lib/tripFinancials';
import { getSafeErrorCode } from '../../lib/safeError';
import { fromPaymentMinor, getCanonicalTripPayment } from '../../lib/tripPaymentSummary';
import { isMissingRpcError } from '../../lib/queryRetryPolicy';
import { generateTripPdfOnServer } from '../../lib/tripPdfClient';
import { asTripListItem, TRIPS_PAGE_SIZE, type TripPageInput, type TripPageResult, type TripPageSummary } from '../../lib/tripQueries';
import type { DeletedTrip, DeletedTripsPage } from '../../lib/tripTrashQueries';
import type { TripActivityEntry, TripFinancialAuditEntry } from '../../lib/tripAuditQueries';
import type { TripInstallmentEvent } from '../../lib/tripPayments';
import type { TripNotification, TripNotificationSettings } from '../../lib/tripNotifications';
import type { TripTemplate, TripTemplateType } from '../../lib/tripTemplates';
import type { TripWhatsappTemplate } from '../../lib/tripWhatsapp';
import type { TravelReportPayload } from '../../lib/travelReports';
import type {
  AuditPage, ExistingClientRow, NewPaymentPlanInput, ServerPdfRequest, TravelAnalyticsArgs, TravelReportsInput, TravelRepository,
  TripCleanupJob, TripSaveResult, TripTemplateInput, VisaArrivalRow, WhatsappTemplateInput,
} from '../domain/travel';

type RpcPayloadPage<T> = { items?: T[]; total_count?: number };

function parsePage<T>(value: Json | null): AuditPage<T> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return { items: [], total_count: 0 };
  const record = value as Record<string, Json | undefined>;
  return {
    items: Array.isArray(record.items) ? record.items as unknown as T[] : [],
    total_count: typeof record.total_count === 'number' ? record.total_count : 0,
  };
}

function getYearBounds(year: string) {
  const numericYear = /^\d{4}$/.test(year) ? Number(year) : new Date().getFullYear();
  return { start: `${numericYear}-01-01`, end: `${numericYear + 1}-01-01` };
}

function safeSearchTerm(value?: string): string {
  return (value || '').trim().replace(/[,()'"\\%_]/g, ' ').replace(/\s+/g, ' ').slice(0, 120);
}

function isMissingDeletedColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' && Boolean(error.message?.includes('deleted_at'));
}

function isPaymentStatus(value?: string): value is Trip['payment_status'] {
  return value === 'paid' || value === 'partial' || value === 'unpaid';
}

function isTripStatus(value?: string): value is Trip['status'] {
  return value === 'active' || value === 'completed' || value === 'cancelled' || value === 'archived';
}

const TRIP_LIST_FIELDS = 'id,user_id,destination,client_name,travelers_count,start_date,end_date,currency,exchange_rate,wholesale_cost,sale_price,profit,profit_percentage,payment_date,payment_status,amount_paid,amount_due,payment_method,card_paid_amount,cash_paid_amount,room_type,board_basis,hotel_name,service_type,trip_type,airline_name,flight_number,booking_reference,departure_airport,arrival_airport,departure_datetime,arrival_datetime,return_flight_number,return_departure_airport,return_arrival_airport,return_departure_datetime,return_arrival_datetime,ticket_class,ticket_cost_ils,wholesale_original_amount,wholesale_currency,sale_original_amount,sale_currency,checklist_flight,checklist_hotel,checklist_payment,status,export_to_pdf,created_at,updated_at';

type PaymentContractSnapshot = Record<string, string | number | null>;

function getPaymentContractSnapshot(value: Partial<Trip> | null | undefined): PaymentContractSnapshot | null {
  if (!value) return null;
  const summary = value.payment_plan_summary;
  return {
    payment_method: value.payment_method ?? null,
    payment_status: value.payment_status ?? null,
    amount_paid_minor: Math.round(Number(value.amount_paid ?? 0) * 100),
    amount_due_minor: Math.round(Number(value.amount_due ?? 0) * 100),
    summary_method: summary?.payment_method ?? null,
    summary_source: summary?.source ?? null,
    cash_paid_minor: summary?.cash_paid_minor ?? null,
    stored_cash_paid_minor: summary?.stored_cash_paid_minor ?? null,
    processed_installments: summary?.processed_installments ?? null,
    scheduled_minor_to_date: summary?.scheduled_minor_to_date ?? null,
    remaining_scheduled_minor: summary?.remaining_scheduled_minor ?? null,
    combined_remaining_minor: summary?.combined_remaining_minor ?? null,
    confirmed_total_minor: summary?.confirmed_total_minor ?? null,
    total_unpaid_minor: summary?.total_unpaid_minor ?? null,
    cash_confirmed_minor: summary?.cash_confirmed_minor ?? null,
    visa_confirmed_minor: summary?.visa_confirmed_minor ?? null,
    visa_overdue_unconfirmed_minor: summary?.visa_overdue_unconfirmed_minor ?? null,
    payment_source: summary?.payment_source ?? null,
    reconciliation_state: summary?.reconciliation_state ?? null,
    authoritative_payment_status: summary?.authoritative_payment_status ?? null,
  };
}

let warnedTrashFallback = false;
const WHATSAPP_TEMPLATE_FIELDS = 'id,name,body,language,category,is_favorite,is_archived,usage_count,last_used_at,created_at,updated_at';

/**
 * Tourism on the shipped Supabase product: every query, RPC and Edge Function call moved verbatim from the trip
 * libraries and screens, with their fallbacks. Imported only by createSupabaseBackend.
 */
export class SupabaseTravelRepository implements TravelRepository {
  // ---------------------------------------------------------------- trips: commands

  async saveTrip(userId: string, formData: TripFormData, editTripId?: string, clientRequestId?: string): Promise<TripSaveResult> {
    const paymentPlan = toTripPaymentPlanInput(formData);
    await requireCanonicalPaymentWriteContract();
    if (import.meta.env.DEV && paymentPlan) {
      console.info('[Travel payment write] Redacted plan payload.', {
        method: paymentPlan.method,
        currency: paymentPlan.currency,
        cardTotalMinor: paymentPlan.cardTotalMinor,
        cashTotalMinor: paymentPlan.cashTotalMinor,
        confirmedCashMinor: paymentPlan.confirmedCashMinor,
        installmentCount: paymentPlan.installmentCount,
        firstDatePresent: Boolean(paymentPlan.firstDate),
        existingPlan: Boolean(paymentPlan.existingPlanId),
      });
    }
    const rawPayload = editTripId ? { id: editTripId, ...toTripUpdate(formData) } : toTripInsert(formData, userId);
    const requestId = clientRequestId || crypto.randomUUID();
    const { data, error } = await supabase.rpc('save_trip_transaction', {
      p_trip_data: rawPayload as unknown as Json,
      p_payment_plan: (paymentPlan ?? undefined) as unknown as Json,
      p_client_request_id: requestId,
    });
    if (error) throw error;
    return data as unknown as TripSaveResult;
  }

  async restoreTrip(userId: string, id: string): Promise<string> {
    const { data, error } = await supabase
      .from('trips')
      .update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('TRIP_RESTORE_NOT_APPLIED');
    return data.id;
  }

  async deleteTrip(userId: string, id: string): Promise<string> {
    const deletedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('trips')
      .update({ deleted_at: deletedAt, deleted_by: userId, updated_at: deletedAt })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('TRIP_DELETE_NOT_APPLIED');
    return data.id;
  }

  async archiveTrip(userId: string, id: string, archived: boolean): Promise<void> {
    const { error } = await supabase
      .from('trips')
      .update({ status: archived ? 'archived' : 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw error;
  }

  async toggleExport(userId: string, id: string, value: boolean): Promise<void> {
    const { error } = await supabase
      .from('trips')
      .update({ export_to_pdf: value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw error;
  }

  async updateTripItinerary(tripId: string, itinerary: ItineraryItem[]): Promise<void> {
    const { error } = await supabase.from('trips').update({ itinerary: itinerary as unknown as Json, updated_at: new Date().toISOString() }).eq('id', tripId);
    if (error) throw error;
  }

  async updateTripClientPhone(userId: string, tripId: string, phone: string): Promise<void> {
    const { data, error } = await supabase.from('trips').update({ client_phone: phone })
      .eq('id', tripId).eq('user_id', userId).select('id').maybeSingle();
    if (error || !data) throw new Error('PHONE_UPDATE_FAILED');
  }

  async importTrip(userId: string, tripData: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('trips').insert([{ ...tripData, user_id: userId } as never]);
    if (error) throw error;
  }

  // ---------------------------------------------------------------- trips: reads

  async getTripsPage(input: TripPageInput): Promise<TripPageResult> {
    const { data, error } = await supabase.rpc('get_trips_page', {
      p_year: input.year,
      p_page: input.page,
      p_page_size: input.pageSize ?? TRIPS_PAGE_SIZE,
      p_search: input.search?.trim() || null,
      p_payment_status: input.paymentStatus || null,
      p_trip_status: input.tripStatus || null,
      p_month: input.month ? Number(input.month) : null,
      p_destination: input.destination || null,
      p_sort_key: input.sortKey || 'updated_desc',
    });
    if (error) {
      if (!recordRpcFallback('get_trips_page', error)) throw error;
      return this.tripPageFallback(input);
    }
    recordRpcSuccess('get_trips_page');
    const payload = (data ?? {}) as unknown as Partial<TripPageResult>;
    return {
      items: Array.isArray(payload.items) ? payload.items.map(asTripListItem) : [],
      total_count: Number(payload.total_count ?? 0),
      summary: Array.isArray(payload.summary) ? payload.summary : [],
      upcoming_count: Number(payload.upcoming_count ?? 0),
      destinations: Array.isArray(payload.destinations) ? payload.destinations : [],
    };
  }

  private async tripPageFallback(input: TripPageInput): Promise<TripPageResult> {
    const bounds = getYearBounds(input.year);
    const pageSize = Math.min(Math.max(input.pageSize ?? TRIPS_PAGE_SIZE, 1), 100);
    const from = (Math.max(input.page, 1) - 1) * pageSize;
    const search = safeSearchTerm(input.search);

    const buildListQuery = (withDeletedFilter: boolean) => {
      let query = supabase
        .from('trips')
        .select(TRIP_LIST_FIELDS, { count: 'exact' })
        .gte('start_date', bounds.start)
        .lt('start_date', bounds.end);
      if (withDeletedFilter) query = query.is('deleted_at', null);
      if (isPaymentStatus(input.paymentStatus)) query = query.eq('payment_status', input.paymentStatus);
      if (isTripStatus(input.tripStatus)) query = query.eq('status', input.tripStatus);
      else query = query.neq('status', 'archived');
      if (input.destination) query = query.eq('destination', input.destination);
      if (input.month) {
        const month = String(Number(input.month)).padStart(2, '0');
        const monthStart = `${input.year}-${month}-01`;
        const nextMonth = new Date(Date.UTC(Number(input.year), Number(month), 1)).toISOString().slice(0, 10);
        query = query.gte('start_date', monthStart).lt('start_date', nextMonth);
      }
      if (search) query = query.or(`destination.ilike.%${search}%,client_name.ilike.%${search}%,hotel_name.ilike.%${search}%`);

      const sortKey = input.sortKey || 'updated_desc';
      switch (sortKey) {
        case 'updated_asc': query = query.order('updated_at', { ascending: true }); break;
        case 'created_desc': query = query.order('created_at', { ascending: false }); break;
        case 'created_asc': query = query.order('created_at', { ascending: true }); break;
        case 'start_date_asc': query = query.order('start_date', { ascending: true, nullsFirst: false }); break;
        case 'start_date_desc': query = query.order('start_date', { ascending: false, nullsFirst: false }); break;
        case 'destination_asc': query = query.order('destination', { ascending: true }); break;
        case 'destination_desc': query = query.order('destination', { ascending: false }); break;
        case 'client_name_asc': query = query.order('client_name', { ascending: true }); break;
        case 'client_name_desc': query = query.order('client_name', { ascending: false }); break;
        case 'sale_price_desc': query = query.order('sale_price', { ascending: false }); break;
        case 'sale_price_asc': query = query.order('sale_price', { ascending: true }); break;
        case 'profit_desc': query = query.order('profit', { ascending: false }); break;
        case 'profit_asc': query = query.order('profit', { ascending: true }); break;
        case 'updated_desc':
        default: query = query.order('updated_at', { ascending: false }); break;
      }
      return query.order('id', { ascending: false }).range(from, from + pageSize - 1);
    };

    let response = await buildListQuery(true);
    if (isMissingDeletedColumn(response.error)) response = await buildListQuery(false);
    if (response.error) throw response.error;
    const items = (response.data ?? []).map((item) => asTripListItem(item as unknown as Partial<Trip>));

    const summaries = new Map<string, TripPageSummary>();
    for (const trip of items.filter((item) => item.status !== 'cancelled' && item.status !== 'archived')) {
      const currency = trip.currency || 'ILS';
      const financials = calculateTripFinancials(trip);
      const payment = getCanonicalTripPayment(trip);
      const current = summaries.get(currency) || { currency, trip_count: 0, revenue: 0, profit: 0, amount_due: 0 };
      current.trip_count += 1;
      current.revenue += financials.salePrice;
      current.profit += financials.profit;
      current.amount_due += fromPaymentMinor(payment.totalUnpaidMinor);
      summaries.set(currency, current);
    }

    const destinations = Array.from(new Set(items.map((item) => item.destination))).sort();
    return {
      items,
      total_count: response.count ?? items.length,
      summary: Array.from(summaries.values()),
      upcoming_count: items.filter((item) => item.status !== 'cancelled' && item.start_date >= new Date().toISOString().slice(0, 10)).length,
      destinations,
    };
  }

  async getTripDetails(tripId: string): Promise<unknown | null> {
    const { data, error } = await supabase.rpc('get_trip_details', { p_trip_id: tripId });
    if (!error) {
      recordRpcSuccess('get_trip_details');
      return data ?? null;
    }
    if (!recordRpcFallback('get_trip_details', error)) throw error;
    const runFallback = (withDeletedFilter: boolean) => {
      let query = supabase.from('trips').select('*').eq('id', tripId);
      if (withDeletedFilter) query = query.is('deleted_at', null);
      return query.maybeSingle();
    };
    let fallback = await runFallback(true);
    if (isMissingDeletedColumn(fallback.error)) fallback = await runFallback(false);
    if (fallback.error) throw fallback.error;
    return fallback.data ?? null;
  }

  async findLatestTripIdForClient(clientName: string, clientPhone?: string): Promise<string | null> {
    let query = supabase.from('trips').select('id').eq('client_name', clientName).is('deleted_at', null);
    if (clientPhone) query = query.eq('client_phone', clientPhone);
    const { data, error } = await query.order('start_date', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  async searchTrips(userId: string): Promise<Trip[]> {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return data as unknown as Trip[];
  }

  async listClientRows(userId: string): Promise<ExistingClientRow[]> {
    const { data, error } = await supabase
      .from('trips')
      .select('client_name, client_phone')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data ?? []) as ExistingClientRow[];
  }

  async exportTrips(userId: string): Promise<unknown[]> {
    const { data: trips, error } = await supabase.from('trips').select('*').eq('user_id', userId);
    if (error) throw error;
    return trips ?? [];
  }

  async logPaymentContractComparison(tripId: string, year: string): Promise<void> {
    const pageArgs = {
      p_year: year, p_page: 1, p_page_size: 100, p_search: null, p_payment_status: null, p_trip_status: null,
      p_month: null, p_destination: null, p_sort_key: 'updated_desc',
    };
    const [detailResult, pageResult, dashboardResult] = await Promise.all([
      supabase.rpc('get_trip_details', { p_trip_id: tripId }),
      supabase.rpc('get_trips_page', pageArgs),
      supabase.rpc('get_trip_dashboard_items', { p_year: year }),
    ]);
    const errors = [detailResult.error, pageResult.error, dashboardResult.error].filter(Boolean);
    if (errors.length > 0) {
      console.warn('[Travel payment contract] comparison unavailable', { tripId, errorCodes: errors.map(getSafeErrorCode) });
      return;
    }
    const pagePayload = pageResult.data as unknown as Partial<TripPageResult> | null;
    const detail = detailResult.data as unknown as Partial<Trip> | null;
    const listItem = pagePayload?.items?.find((item) => item.id === tripId);
    const dashboardItems = dashboardResult.data as unknown as Array<Partial<Trip>> | null;
    const dashboardItem = dashboardItems?.find((item) => item.id === tripId);
    const snapshots = {
      details: getPaymentContractSnapshot(detail),
      list: getPaymentContractSnapshot(listItem),
      dashboard: getPaymentContractSnapshot(dashboardItem),
    };
    const fields = new Set(Object.values(snapshots).flatMap((snapshot) => snapshot ? Object.keys(snapshot) : []));
    const differences = [...fields].filter((field) => {
      const values = Object.values(snapshots).map((snapshot) => snapshot?.[field] ?? null);
      return new Set(values).size > 1;
    });
    const output = { tripId, differences, snapshots };
    if (differences.length > 0) console.warn('[Travel payment contract] mismatch', output);
    else console.info('[Travel payment contract] aligned', output);
  }

  // ---------------------------------------------------------------- trash

  async getDeletedTripsPage(page: number, search: string, pageSize: number): Promise<DeletedTripsPage> {
    const { data, error } = await supabase.rpc('get_deleted_trips_page', {
      p_page: page,
      p_page_size: pageSize,
      p_search: search.trim() || null,
    });
    if (!error) {
      const payload = (data ?? {}) as RpcPayloadPage<Partial<DeletedTrip>>;
      return {
        items: (payload.items ?? []).map((item) => ({ ...asTripListItem(item), ...item } as DeletedTrip)),
        total_count: Number(payload.total_count ?? 0),
      };
    }
    if (!isMissingRpcError(error)) throw error;
    if (!warnedTrashFallback) {
      warnedTrashFallback = true;
      console.warn('[Travel Trash] RPC unavailable; using the RLS table fallback until migrations are deployed.');
    }
    const from = (Math.max(page, 1) - 1) * pageSize;
    let query = supabase
      .from('trips')
      .select('*', { count: 'exact' })
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .range(from, from + pageSize - 1);
    const safeSearch = search.trim().replace(/[,()'"\\%_]/g, ' ').slice(0, 120);
    if (safeSearch) query = query.or(`destination.ilike.%${safeSearch}%,client_name.ilike.%${safeSearch}%`);
    const fallback = await query;
    if (fallback.error) throw fallback.error;
    return {
      items: (fallback.data ?? []).map((row) => ({
        ...asTripListItem(row as unknown as Partial<Trip>),
        deleted_at: row.deleted_at || new Date().toISOString(),
        purge_at: new Date(new Date(row.deleted_at || Date.now()).getTime() + 30 * 86_400_000).toISOString(),
        cleanup_status: null,
      })),
      total_count: fallback.count ?? 0,
    };
  }

  async restoreDeletedTrips(ids: string[]): Promise<number> {
    const { data, error } = await supabase.rpc('restore_deleted_trips', { p_trip_ids: ids });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async permanentlyDeleteTrips(ids: string[]): Promise<number> {
    const { data, error } = await supabase.rpc('permanently_delete_trips', { p_trip_ids: ids });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async retryAttachmentCleanup(jobId: number): Promise<void> {
    const { data, error } = await supabase.rpc('retry_trip_attachment_cleanup', { p_job_id: jobId });
    if (error) throw error;
    if (!data) throw new Error('CLEANUP_RETRY_NOT_APPLIED');
  }

  async listFailedCleanupJobs(): Promise<TripCleanupJob[]> {
    const result = await supabase.from('trip_attachment_cleanup_queue')
      .select('id,trip_id,status,attempts,last_error,next_retry_at,created_at')
      .eq('status', 'failed').order('created_at', { ascending: false }).limit(20);
    if (result.error) throw result.error;
    return result.data as unknown as TripCleanupJob[];
  }

  // ---------------------------------------------------------------- activity and audit

  async getTripActivityPage(tripId: string, page: number): Promise<AuditPage<TripActivityEntry>> {
    const { data, error } = await supabase.rpc('get_trip_activity_page', {
      p_trip_id: tripId, p_page: page, p_page_size: 20, p_type: undefined,
    });
    if (error) throw error;
    return parsePage<TripActivityEntry>(data);
  }

  async getTripFinancialAuditPage(tripId: string, page: number): Promise<AuditPage<TripFinancialAuditEntry>> {
    const { data, error } = await supabase.rpc('get_trip_financial_audit_page', {
      p_trip_id: tripId, p_page: page, p_page_size: 20,
    });
    if (error) throw error;
    return parsePage<TripFinancialAuditEntry>(data);
  }

  async logTripActivity(tripId: string, activityType: string, metadata: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.rpc('log_trip_activity', { p_trip_id: tripId, p_activity_type: activityType, p_metadata: metadata as Json });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- payments

  async getTripPaymentPlan(tripId: string) {
    const { data: plan, error } = await supabase.from('trip_payment_plans').select('*').eq('trip_id', tripId).is('deleted_at', null).neq('status', 'cancelled').maybeSingle();
    if (error) throw error;
    if (!plan) return { plan: null, installments: [] };
    const { data: installments, error: installmentError } = await supabase.from('trip_installments').select('*').eq('payment_plan_id', plan.id).order('installment_number');
    if (installmentError) throw installmentError;
    return { plan, installments: installments || [] };
  }

  async createTripPaymentPlan(input: NewPaymentPlanInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_trip_payment_plan', {
      p_trip_id: input.tripId, p_payment_method: input.method, p_currency: input.currency,
      p_card_total_minor: input.cardTotalMinor, p_cash_total_minor: input.cashTotalMinor,
      p_installment_count: input.installmentCount, p_first_installment_date: input.firstDate,
      p_notes: input.notes || null,
    });
    if (error) throw error;
    return data;
  }

  async recordInstallmentPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('record_trip_installment_payment', {
      p_installment_id: id, p_paid_amount_minor: paidAmountMinor, p_paid_at: paidAt, p_notes: notes || null,
    });
    if (error) throw error;
  }

  async rescheduleInstallment(id: string, dueDate: string): Promise<void> {
    const { error } = await supabase.rpc('reschedule_trip_installment', { p_installment_id: id, p_due_date: dueDate });
    if (error) throw error;
  }

  async recordCashPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('record_trip_cash_payment', { p_payment_plan_id: id, p_paid_amount_minor: paidAmountMinor, p_paid_at: paidAt, p_notes: notes || null });
    if (error) throw error;
  }

  async recalculateFutureInstallments(id: string, cardTotalMinor: number): Promise<void> {
    const { error } = await supabase.rpc('recalculate_future_trip_installments', { p_payment_plan_id: id, p_new_card_total_minor: cardTotalMinor });
    if (error) throw error;
  }

  async listInstallmentEvents(id: string): Promise<TripInstallmentEvent[]> {
    const { data, error } = await supabase.from('trip_installment_events').select('*').eq('installment_id', id).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async probePaymentContractVersion(): Promise<{ data: number | null; error: unknown }> {
    const { data, error } = await supabase.rpc('get_travel_payment_contract_version');
    return { data, error };
  }

  // ---------------------------------------------------------------- notifications

  async listTripNotifications(): Promise<TripNotification[]> {
    const { data, error } = await supabase.from('trip_notifications').select('id,trip_id,notification_type,title_key,body_key,params,read_at,snoozed_until,dismissed_at,completed_at,scheduled_for,created_at').is('dismissed_at', null).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  }

  async markAllTripNotificationsRead(): Promise<void> {
    const { error } = await supabase.rpc('mark_all_trip_notifications_read');
    if (error) throw error;
  }

  async snoozeTripNotification(id: string, until: string): Promise<void> {
    const { error } = await supabase.from('trip_notifications').update({ snoozed_until: until }).eq('id', id);
    if (error) throw error;
  }

  async dismissTripNotification(id: string): Promise<void> {
    const { error } = await supabase.from('trip_notifications').update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async clearCompletedTripNotifications(): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase.from('trip_notifications').update({ dismissed_at: now }).not('completed_at', 'is', null);
    if (error) throw error;
  }

  async markTripNotificationRead(id: string): Promise<void> {
    const { error } = await supabase.from('trip_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async getTripNotificationSettings(userId: string): Promise<TripNotificationSettings | null> {
    const { data, error } = await supabase.from('trip_notification_settings').select('timezone,upcoming_enabled,upcoming_days,trip_reminder_days,payment_enabled,payment_reminder_days,cleanup_enabled,retention_enabled').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async saveTripNotificationSettings(userId: string, settings: TripNotificationSettings): Promise<void> {
    const { error } = await supabase.from('trip_notification_settings').upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async listUnseenVisaArrivalRows(): Promise<VisaArrivalRow[]> {
    const { error: materializeError } = await supabase.rpc('materialize_due_visa_progress_events');
    if (materializeError) throw materializeError;
    const { data, error } = await supabase
      .from('trip_notifications')
      .select('id,trip_id,params,created_at,scheduled_for')
      .eq('notification_type', 'visa_schedule_collected')
      .is('read_at', null)
      .is('dismissed_at', null)
      .order('scheduled_for', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  }

  // ---------------------------------------------------------------- templates

  async listTripTemplates(search: string, type: TripTemplateType | undefined, includeArchived: boolean): Promise<TripTemplate[]> {
    let query = supabase.from('trip_templates').select('*').is('deleted_at', null).order('updated_at', { ascending: false });
    if (!includeArchived) query = query.eq('status', 'active');
    if (type) query = query.eq('template_type', type);
    if (search.trim()) query = query.ilike('name', `%${search.trim().replace(/[%_]/g, '')}%`);
    const { data, error } = await query;
    if (error) throw error;
    return data as unknown as TripTemplate[];
  }

  async getTripTemplate(id: string): Promise<TripTemplate> {
    const { data, error } = await supabase.from('trip_templates').select('*').eq('id', id).is('deleted_at', null).single();
    if (error) throw error;
    return data as unknown as TripTemplate;
  }

  async saveTripTemplate(userId: string, value: TripTemplateInput): Promise<void> {
    const payload = { name: value.name.trim(), description: value.description?.trim() || null, template_data: value.data as unknown as Json, template_type: value.templateType || 'full_trip', updated_at: new Date().toISOString() };
    const { error } = value.id ? await supabase.from('trip_templates').update(payload).eq('id', value.id) : await supabase.from('trip_templates').insert({ ...payload, user_id: userId });
    if (error) throw error;
  }

  async toggleTripTemplateFavorite(id: string, isFavorite: boolean): Promise<void> {
    const { error } = await supabase.from('trip_templates').update({ is_favorite: isFavorite, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async recordTripTemplateUse(id: string): Promise<void> {
    const { error } = await supabase.rpc('use_trip_template', { p_template_id: id });
    if (error) throw error;
  }

  async updateTripTemplateStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    const { error } = await supabase.from('trip_templates').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async softDeleteTripTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('trip_templates').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  // ---------------------------------------------------------------- WhatsApp templates

  async listWhatsappTemplates(): Promise<TripWhatsappTemplate[]> {
    const { data, error } = await supabase.from('trip_whatsapp_templates').select(WHATSAPP_TEMPLATE_FIELDS).eq('is_archived', false).order('is_favorite', { ascending: false }).order('updated_at', { ascending: false });
    if (error) throw error;
    return data as unknown as TripWhatsappTemplate[];
  }

  async saveWhatsappTemplate(userId: string, template: WhatsappTemplateInput): Promise<void> {
    const values = { name: template.name.trim(), body: template.body.trim(), language: template.language, category: template.category, updated_at: new Date().toISOString() };
    const { error } = template.id
      ? await supabase.from('trip_whatsapp_templates').update(values).eq('id', template.id)
      : await supabase.from('trip_whatsapp_templates').insert({ ...values, user_id: userId });
    if (error) throw error;
  }

  async updateWhatsappTemplateState(id: string, values: { is_favorite?: boolean; is_archived?: boolean }): Promise<void> {
    const { error } = await supabase.from('trip_whatsapp_templates').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async markWhatsappTemplateUsed(id: string, usageCount: number): Promise<void> {
    const { error } = await supabase.from('trip_whatsapp_templates').update({ usage_count: usageCount + 1, last_used_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async deleteWhatsappTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('trip_whatsapp_templates').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------------------------------------------------------------- packing lists

  async createPackingList(userId: string, tripId: string, name: string, items: Array<{ category: string; label: string; checked: boolean }>): Promise<void> {
    const { error } = await supabase.from('trip_packing_lists').insert({ user_id: userId, trip_id: tripId, name, items: items as unknown as Json });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- analytics and reports

  async getTravelAnalytics(args: TravelAnalyticsArgs): Promise<{ summary: unknown; payment: unknown }> {
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
    return { summary: summaryResult.data, payment: paymentResult.data };
  }

  async getTravelReports(input: TravelReportsInput): Promise<Partial<TravelReportPayload>> {
    const { data, error } = await supabase.rpc('get_travel_reports', { p_start_date: input.startDate, p_end_date: input.endDate, p_currency: input.currency || null, p_destination: input.destination || null, p_include_archived: input.includeArchived || false });
    if (error) throw error;
    return (data || {}) as unknown as Partial<TravelReportPayload>;
  }

  // ---------------------------------------------------------------- PDF

  generateServerTripPdf(request: ServerPdfRequest): Promise<Uint8Array> {
    return generateTripPdfOnServer(request);
  }

  recordServerPdfGenerated(tripId: string): void {
    void supabase.rpc('log_trip_activity', { p_trip_id: tripId, p_activity_type: 'pdf_generated', p_metadata: { renderer: 'server' } });
    void supabase.rpc('create_trip_event_notification', { p_trip_id: tripId, p_event_type: 'pdf_export_completion' });
  }
}
