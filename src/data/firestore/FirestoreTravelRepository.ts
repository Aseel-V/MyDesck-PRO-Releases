import { collection, doc, getDoc, getDocs, limit, query, where, type DocumentData, type Query } from 'firebase/firestore';
import type { ItineraryItem, Trip, TripFormData } from '../../types/trip';
import type { TripPageInput, TripPageResult, TripPageSummary } from '../../lib/tripQueries';
import type { DeletedTrip, DeletedTripsPage } from '../../lib/tripTrashQueries';
import type { TripActivityEntry, TripFinancialAuditEntry } from '../../lib/tripAuditQueries';
import type { TripInstallment, TripInstallmentEvent, TripPaymentPlan } from '../../lib/tripPayments';
import type { TripNotification, TripNotificationSettings } from '../../lib/tripNotifications';
import type { TripTemplate, TripTemplateType } from '../../lib/tripTemplates';
import type { TripWhatsappTemplate } from '../../lib/tripWhatsapp';
import type { TravelReportPayload } from '../../lib/travelReports';
import type {
  AuditPage, ExistingClientRow, NewPaymentPlanInput, TravelAnalyticsArgs, TravelReportsInput, TravelRepository,
  TripCleanupJob, TripSaveResult, TripTemplateInput, VisaArrivalRow, WhatsappTemplateInput,
} from '../domain/travel';
import { toTripInsert, toTripPaymentPlanInput, toTripUpdate } from '../../lib/tripPayload';
import { requireCanonicalPaymentWriteContract } from '../../lib/paymentContractCompatibility';
import { decodeRow } from './documentCodec';
import * as commands from './tripCommandModel';
import * as side from './tripSideModel';
import { NOW, TripTransaction, saveTripTransaction, type ModelContext, type TripWorld, type WriteOp } from './tripWriteModel';
import { TripWriteAdapter, sourceInsertRow, type OperationType } from './tripWriteAdapter';
import { readStoredDecimal, scaledToDecimalText, timestampToMicros } from './exactValues';
import type { FirebaseSession } from './FirebaseSession';
import { FirestoreTravelDashboardRepository } from './FirestoreTravelDashboardRepository';
import { businessToday, tripPaymentPlanSummary, type SummaryInstallmentRow, type SummaryPlanRow } from './tripPaymentPlanSummary';

/** Every owner-scoped tourism read is bounded; past the bound the call fails loudly instead of returning a partial answer. */
export const TRAVEL_SCAN_BOUND = 5000;

type Row = Record<string, unknown>;
type Dec = { units: bigint; scale: number };
interface Owner { uid: string; businessId: string }
/** What the side-table models need from the session: gen_random_uuid() and the business day in Asia/Jerusalem. */
type SideCtx = { uid: string; newId: () => string; businessToday: string };
interface TripDoc { id: string; data: DocumentData; row: Row }
interface Ledger { plansByTrip: Map<string, SummaryPlanRow[]>; installmentsByPlan: Map<string, SummaryInstallmentRow[]>; installments: Row[] }
type Summary = Row & {
  derived_payment_status: string; authoritative_paid_minor: number; authoritative_remaining_minor: number; total_unpaid_minor: number;
  cash_paid_minor: number; scheduled_minor_to_date: number; remaining_scheduled_minor: number; visa_overdue_unconfirmed_minor: number;
};

const read = (snapshot: { data(options?: { serverTimestamps?: 'estimate' }): DocumentData | undefined }) =>
  snapshot.data({ serverTimestamps: 'estimate' }) ?? {};
const pgError = (message: string, code: string) => Object.assign(new Error(message), { code });
const PGRST116 = () => pgError('JSON object requested, multiple (or no) rows returned', 'PGRST116');
/** ORDER BY on text follows the source database collation (en_US.UTF-8); equal-collating strings fall back to bytes. */
const collator = new Intl.Collator('en-US');
const textOrder = (a: unknown, b: unknown) => collator.compare(String(a), String(b)) || (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
/** current_date on the source database (UTC). */
const utcToday = () => new Date().toISOString().slice(0, 10);
const utcDateOf = (timestamp: unknown) => (timestamp == null ? null : new Date(Number(timestampToMicros(String(timestamp)) / 1000n)).toISOString().slice(0, 10));
const microsOf = (timestamp: unknown): bigint | null => (timestamp == null ? null : timestampToMicros(String(timestamp)));
const blank = (value: unknown) => value === null || value === undefined || value === '';
/** PostgreSQL trim(): spaces only. */
const pgTrim = (value: string) => value.replace(/^ +| +$/g, '');
const pageSizeOf = (size: number) => Math.min(Math.max(size, 1), 100);
const pageOf = <T>(rows: T[], page: number, size: number) => rows.slice((Math.max(page, 1) - 1) * size, (Math.max(page, 1) - 1) * size + size);
const omit = (row: Row, keys: string[]) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const LIST_OMITTED = ['travelers', 'itinerary', 'payments', 'notes', 'attachments', 'search_document'];

// ---------------------------------------------------------------- exact numeric (PostgreSQL NUMERIC semantics)

const pow10 = (n: number) => 10n ** BigInt(n);
const ZERO: Dec = { units: 0n, scale: 0 };
const dec = (stored: unknown): Dec | null => {
  if (stored === null || stored === undefined) return null;
  const value = readStoredDecimal(stored as never);
  return { units: value.units, scale: value.scale };
};
const align = (value: Dec, scale: number) => value.units * pow10(scale - value.scale);
const add = (a: Dec, b: Dec): Dec => { const scale = Math.max(a.scale, b.scale); return { units: align(a, scale) + align(b, scale), scale }; };
const sub = (a: Dec, b: Dec): Dec => { const scale = Math.max(a.scale, b.scale); return { units: align(a, scale) - align(b, scale), scale }; };
const cmp = (a: Dec, b: Dec) => { const scale = Math.max(a.scale, b.scale); const x = align(a, scale); const y = align(b, scale); return x < y ? -1 : x > y ? 1 : 0; };
const decNumber = (value: Dec | null) => (value === null ? null : Number(scaledToDecimalText(value.units, value.scale)));
/** minor / 100.0: the division terminates, so the JSON number is exactly the minor amount over one hundred. */
const money = (minor: bigint) => Number(scaledToDecimalText(minor, 2));
const greatest0 = (value: bigint) => (value > 0n ? value : 0n);

/** Integer division rounded half away from zero. */
function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  if (remainder !== 0n && absRemainder * 2n >= absDenominator) return quotient + ((numerator < 0n) !== (denominator < 0n) ? -1n : 1n);
  return quotient;
}

/** round(x * 100)::bigint. */
const minor = (value: Dec) => (value.scale <= 2 ? value.units * pow10(2 - value.scale) : roundDiv(value.units, pow10(value.scale - 2)));

/** The first base-10000 digit and its weight, as PostgreSQL's NUMERIC stores the value. */
function nbase(value: Dec): { weight: number; first: number } {
  const abs = value.units < 0n ? -value.units : value.units;
  if (abs === 0n) return { weight: 0, first: 0 };
  const weight = Math.floor((abs.toString().length - value.scale - 1) / 4);
  const shift = -value.scale - 4 * weight;
  const shifted = shift >= 0 ? abs * pow10(shift) : abs / pow10(-shift);
  return { weight, first: Number(shifted % 10000n) };
}

/** numeric / numeric: select_div_scale, then div_var rounding half away from zero. */
function pgDiv(a: Dec, b: Dec): Dec {
  if (b.units === 0n) throw pgError('division by zero', '22012');
  const n1 = nbase(a);
  const n2 = nbase(b);
  let qweight = n1.weight - n2.weight;
  if (n1.first < n2.first) qweight -= 1;
  const rscale = Math.min(Math.max(16 - qweight * 4, a.scale, b.scale, 0), 1000);
  return { units: roundDiv(a.units * pow10(rscale - a.scale + b.scale), b.units), scale: rscale };
}

/** round((numerator::numeric / denominator::numeric) * 1000) / 10.0 */
function percent(numerator: bigint, denominator: bigint): number {
  const quotient = pgDiv({ units: numerator, scale: 0 }, { units: denominator, scale: 0 });
  const rounded: Dec = { units: roundDiv(quotient.units * 1000n, pow10(quotient.scale)), scale: 0 };
  return decNumber(pgDiv(rounded, { units: 100n, scale: 1 })) as number;
}

/** avg(numeric) over the non-null values. */
function pgAvg(values: Array<Dec | null>): Dec | null {
  const present = values.filter((value): value is Dec => value !== null);
  if (!present.length) return null;
  return pgDiv(present.reduce(add, ZERO), { units: BigInt(present.length), scale: 0 });
}
const pgSum = (values: Array<Dec | null>): Dec | null => {
  const present = values.filter((value): value is Dec => value !== null);
  return present.length ? present.reduce(add, ZERO) : null;
};
const pgMin = (values: Array<Dec | null>) => values.filter((value): value is Dec => value !== null).reduce<Dec | null>((m, v) => (m === null || cmp(v, m) <= 0 ? v : m), null);
const pgMax = (values: Array<Dec | null>) => values.filter((value): value is Dec => value !== null).reduce<Dec | null>((m, v) => (m === null || cmp(v, m) >= 0 ? v : m), null);

/** `text LIKE '%' || pattern || '%'` with the default escape character. */
function likeContains(text: string, pattern: string): boolean {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '\\') {
      index += 1;
      if (index >= pattern.length) throw pgError('LIKE pattern must not end with escape character', '22025');
      source += pattern[index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (char === '%') source += '.*';
    else if (char === '_') source += '.';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(source, 's').test(text);
}

// ---------------------------------------------------------------- dates

const pad = (value: number, width = 2) => String(value).padStart(width, '0');
const ymd = (year: number, month: number, day: number) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000;
const addDays = (date: string, days: number) => new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);

export class FirestoreTravelRepository implements TravelRepository {
  constructor(readonly session: FirebaseSession) {}

  // ---------------------------------------------------------------- tenancy and loading

  private async owner(): Promise<Owner | null> {
    const uid = await this.session.requireUid();
    const business = await this.session.ownedBusiness(uid);
    return business ? { uid, businessId: business.businessId } : null;
  }

  private scoped(owner: Owner, name: string, ...constraints: ReturnType<typeof where>[]): Query {
    return query(collection(this.session.db, name), where('ownerUid', '==', owner.uid), where('businessId', '==', owner.businessId), ...constraints);
  }

  private async bounded(q: Query, name: string): Promise<Array<{ id: string; data: DocumentData }>> {
    const snapshot = await getDocs(query(q, limit(TRAVEL_SCAN_BOUND + 1)));
    if (snapshot.size > TRAVEL_SCAN_BOUND) throw new Error(`TRAVEL_SCAN_BOUND_EXCEEDED:${name}`);
    return snapshot.docs.map((snapshot) => ({ id: snapshot.id, data: read(snapshot) }));
  }

  private async rows(owner: Owner, name: string, table: string, ...constraints: ReturnType<typeof where>[]): Promise<Row[]> {
    const docs = await this.bounded(this.scoped(owner, name, ...constraints), name);
    return docs.filter((entry) => entry.data.userId === owner.uid).map((entry) => decodeRow<Row>(table, entry.data));
  }

  /** The owner's trips: live (false), deleted (true) or all (null), as the source's `user_id = auth.uid()` rows. */
  private async trips(owner: Owner, deleted: boolean | null): Promise<TripDoc[]> {
    const docs = await this.bounded(this.scoped(owner, 'trips', ...(deleted === null ? [] : [where('isDeleted', '==', deleted)])), 'trips');
    return docs.filter((entry) => entry.data.userId === owner.uid)
      .map((entry) => ({ id: entry.id, data: entry.data, row: decodeRow<Row>('trips', entry.data) }));
  }

  private async ledger(owner: Owner): Promise<Ledger> {
    const [plans, installments] = await Promise.all([
      this.rows(owner, 'tripPaymentPlans', 'trip_payment_plans'),
      this.rows(owner, 'tripInstallments', 'trip_installments'),
    ]);
    const plansByTrip = new Map<string, SummaryPlanRow[]>();
    for (const plan of plans) plansByTrip.set(String(plan.trip_id), [...(plansByTrip.get(String(plan.trip_id)) ?? []), plan as unknown as SummaryPlanRow]);
    const installmentsByPlan = new Map<string, SummaryInstallmentRow[]>();
    for (const row of installments) {
      const key = String(row.payment_plan_id);
      installmentsByPlan.set(key, [...(installmentsByPlan.get(key) ?? []), row as unknown as SummaryInstallmentRow]);
    }
    return { plansByTrip, installmentsByPlan, installments };
  }

  /** get_owned_trip_payment_summary(trip.id). */
  private summary(owner: Owner, trip: TripDoc, ledger: Ledger, today: string): Summary {
    const plans = ledger.plansByTrip.get(trip.id) ?? [];
    const installments = plans.flatMap((plan) => ledger.installmentsByPlan.get(plan.id) ?? []);
    return tripPaymentPlanSummary(owner.uid, {
      salePrice: trip.data.salePrice, amountPaid: trip.data.amountPaid, cardPaidAmount: trip.data.cardPaidAmount,
      cashPaidAmount: trip.data.cashPaidAmount, paymentMethod: (trip.row.payment_method as string | null) ?? null,
      currency: (trip.row.currency as string | null) ?? null,
    }, plans, installments, today) as Summary;
  }

  // ---------------------------------------------------------------- trips: commands

  private async requireOwner(): Promise<Owner> {
    const owner = await this.owner();
    if (!owner) throw new Error('BUSINESS_NOT_FOUND');
    return owner;
  }

  /** The model's context: gen_random_uuid(), the session's current_date (UTC) and the business day in Asia/Jerusalem. */
  private modelContext(owner: Owner): ModelContext {
    return { uid: owner.uid, dbToday: utcToday(), businessToday: businessToday(), newId: () => crypto.randomUUID() };
  }

  /** The source returns the row's own updated_at; the commit's server time is what the client can honestly show. */
  private committed<T>(value: T): T {
    const stamp = new Date().toISOString();
    const walk = (item: unknown): unknown => {
      if (item === NOW) return stamp;
      if (Array.isArray(item)) return item.map(walk);
      if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item as Row).map(([key, entry]) => [key, walk(entry)]));
      return item;
    };
    return walk(value) as T;
  }

  /**
   * One model command: load the world the source statement would have seen, let the model decide, then commit what it
   * decided. The commit re-checks every document the model read, so a concurrent writer aborts it instead of losing.
   */
  private async command<T>(
    type: OperationType,
    run: (world: TripWorld, ctx: ModelContext) => { ops: WriteOp[]; world: TripWorld; result: T },
    options: {
      cleanupQueue?: boolean; packingLists?: boolean; clientRequestId?: string;
      tripId?: (result: T) => string | null; amountMinor?: number; currency?: string; installmentId?: string | null;
    } = {},
  ): Promise<T> {
    const owner = await this.requireOwner();
    const adapter = new TripWriteAdapter(this.session, owner);
    const { world, guards } = await adapter.loadWorld(options);
    const outcome = run(world, this.modelContext(owner));
    const touched = outcome.ops.find((op) => op.table === 'trips');
    await adapter.commit({
      type,
      tripId: options.tripId ? options.tripId(outcome.result) : (touched ? String(touched.row.id) : null),
      ops: outcome.ops,
      clientRequestId: options.clientRequestId ?? crypto.randomUUID(),
      ...(options.amountMinor === undefined ? {} : { amountMinor: options.amountMinor }),
      ...(options.currency === undefined ? {} : { currency: options.currency }),
      ...(options.installmentId === undefined ? {} : { installmentId: options.installmentId }),
    }, outcome.world, guards);
    return outcome.result;
  }

  /** save_trip_transaction(p_trip_data, p_payment_plan, p_client_request_id), with its idempotency ledger. */
  async saveTrip(userId: string, formData: TripFormData, editTripId?: string, clientRequestId?: string): Promise<TripSaveResult> {
    const owner = await this.requireOwner();
    const paymentPlan = toTripPaymentPlanInput(formData);
    await requireCanonicalPaymentWriteContract();
    const tripData = editTripId ? { id: editTripId, ...toTripUpdate(formData) } : toTripInsert(formData, userId);
    const requestId = clientRequestId || crypto.randomUUID();
    const adapter = new TripWriteAdapter(this.session, owner);
    // A replay returns what the first commit recorded and writes nothing, as the source's write-request ledger does.
    const prior = await adapter.priorResponse(requestId);
    if (prior) return this.committed(prior) as unknown as TripSaveResult;
    const { world, guards } = await adapter.loadWorld();
    const outcome = saveTripTransaction(world,
      { tripData: tripData as Row, paymentPlan: paymentPlan as Row | null, clientRequestId: requestId }, this.modelContext(owner));
    await adapter.commit({ type: editTripId ? 'trip-edit' : 'trip-create', tripId: String(outcome.response.id),
      ops: outcome.ops, clientRequestId: requestId, responsePayload: outcome.response as Row }, outcome.world, guards);
    return this.committed(outcome.response) as unknown as TripSaveResult;
  }

  async restoreTrip(_userId: string, id: string): Promise<string> {
    return this.command('trip-state', (world, ctx) => commands.restoreTrip(world, ctx, id, new Date().toISOString()), { tripId: () => id });
  }

  async deleteTrip(_userId: string, id: string): Promise<string> {
    return this.command('trip-state', (world, ctx) => commands.deleteTrip(world, ctx, id, new Date().toISOString()), { tripId: () => id });
  }

  async archiveTrip(_userId: string, id: string, archived: boolean): Promise<void> {
    await this.command('trip-state', (world, ctx) => commands.archiveTrip(world, ctx, id, archived, new Date().toISOString()), { tripId: () => id });
  }

  async toggleExport(_userId: string, id: string, value: boolean): Promise<void> {
    await this.command('trip-edit', (world, ctx) => commands.toggleExport(world, ctx, id, value, new Date().toISOString()), { tripId: () => id });
  }

  async updateTripItinerary(tripId: string, itinerary: ItineraryItem[]): Promise<void> {
    await this.command('trip-edit', (world, ctx) => commands.updateTripItinerary(world, ctx, tripId, itinerary, new Date().toISOString()),
      { tripId: () => tripId });
  }

  async updateTripClientPhone(_userId: string, tripId: string, phone: string): Promise<void> {
    try {
      await this.command('trip-edit', (world, ctx) => commands.updateTripClientPhone(world, ctx, tripId, phone), { tripId: () => tripId });
    } catch {
      throw new Error('PHONE_UPDATE_FAILED');
    }
  }

  /** Settings import: INSERT INTO trips (<backup keys>, user_id), with the triggers that insert fires. */
  async importTrip(userId: string, tripData: Record<string, unknown>): Promise<void> {
    const refusal = commands.importTripRefusal(tripData as Row);
    if (refusal) throw refusal;
    await this.command('trip-create', (world, ctx) => {
      const transaction = new TripTransaction(world, ctx);
      transaction.writeTrip('insert', sourceInsertRow('trips', { ...tripData, user_id: userId } as Row, ctx), null);
      return { ops: transaction.ops, world: transaction.world, result: undefined as void };
    });
  }

  // ---------------------------------------------------------------- trips: reads

  /** get_trips_page(p_year, p_page, p_page_size, p_search, p_payment_status, p_trip_status, p_month, p_destination, p_sort_key). */
  async getTripsPage(input: TripPageInput): Promise<TripPageResult> {
    const owner = await this.owner();
    if (!owner) return { items: [], total_count: 0, summary: [], upcoming_count: 0, destinations: [] };
    const [trips, ledger] = await Promise.all([this.trips(owner, false), this.ledger(owner)]);
    const today = businessToday();
    const effective = (trip: TripDoc) => (trip.row.payment_date ?? trip.row.start_date) as string | null;
    const inYear = (trip: TripDoc) => { const date = effective(trip); return date !== null && String(Number(date.slice(0, 4))) === input.year; };
    const search = input.search?.trim() || null;
    const tokens = search === null ? [] : pgTrim(search).toLowerCase().split(/\s+/).filter((token) => token !== '');
    const month = input.month ? Number(input.month) : null;

    const filtered = trips.filter(inYear).map((trip) => ({ trip, summary: this.summary(owner, trip, ledger, today) })).filter(({ trip, summary }) => {
      const document = trip.row.search_document as string | null;
      if (document !== null && tokens.some((token) => !likeContains(document, token))) return false;
      if (!blank(input.paymentStatus) && summary.derived_payment_status !== input.paymentStatus) return false;
      if (blank(input.tripStatus) ? trip.row.status === 'archived' : trip.row.status !== input.tripStatus) return false;
      if (month !== null && Number(String(effective(trip)).slice(5, 7)) !== month) return false;
      if (!blank(input.destination) && trip.row.destination !== input.destination) return false;
      return true;
    });

    const sortKey = input.sortKey || 'updated_desc';
    type Entry = (typeof filtered)[number];
    const nullsLast = <T>(a: T | null, b: T | null, compare: (x: T, y: T) => number) =>
      (a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : compare(a, b));
    const bigintOrder = (x: bigint, y: bigint) => (x < y ? -1 : x > y ? 1 : 0);
    const orders: Record<string, (a: Entry, b: Entry) => number> = {
      updated_asc: (a, b) => nullsLast(microsOf(a.trip.row.updated_at), microsOf(b.trip.row.updated_at), bigintOrder),
      created_desc: (a, b) => nullsLast(microsOf(a.trip.row.created_at), microsOf(b.trip.row.created_at), (x, y) => -bigintOrder(x, y)),
      created_asc: (a, b) => nullsLast(microsOf(a.trip.row.created_at), microsOf(b.trip.row.created_at), bigintOrder),
      start_date_asc: (a, b) => nullsLast(a.trip.row.start_date as string | null, b.trip.row.start_date as string | null, textOrder),
      start_date_desc: (a, b) => nullsLast(a.trip.row.start_date as string | null, b.trip.row.start_date as string | null, (x, y) => -textOrder(x, y)),
      destination_asc: (a, b) => nullsLast(a.trip.row.destination as string | null, b.trip.row.destination as string | null, (x, y) => textOrder(x.toLowerCase(), y.toLowerCase())),
      destination_desc: (a, b) => nullsLast(a.trip.row.destination as string | null, b.trip.row.destination as string | null, (x, y) => -textOrder(x.toLowerCase(), y.toLowerCase())),
      client_name_asc: (a, b) => nullsLast(a.trip.row.client_name as string | null, b.trip.row.client_name as string | null, (x, y) => textOrder(x.toLowerCase(), y.toLowerCase())),
      client_name_desc: (a, b) => nullsLast(a.trip.row.client_name as string | null, b.trip.row.client_name as string | null, (x, y) => -textOrder(x.toLowerCase(), y.toLowerCase())),
      sale_price_desc: (a, b) => nullsLast(dec(a.trip.data.salePrice), dec(b.trip.data.salePrice), (x, y) => -cmp(x, y)),
      sale_price_asc: (a, b) => nullsLast(dec(a.trip.data.salePrice), dec(b.trip.data.salePrice), cmp),
      profit_desc: (a, b) => nullsLast(dec(a.trip.data.profit), dec(b.trip.data.profit), (x, y) => -cmp(x, y)),
      profit_asc: (a, b) => nullsLast(dec(a.trip.data.profit), dec(b.trip.data.profit), cmp),
      remaining_desc: (a, b) => b.summary.total_unpaid_minor - a.summary.total_unpaid_minor,
      remaining_asc: (a, b) => a.summary.total_unpaid_minor - b.summary.total_unpaid_minor,
      overdue_first: (a, b) => b.summary.visa_overdue_unconfirmed_minor - a.summary.visa_overdue_unconfirmed_minor,
      updated_desc: (a, b) => nullsLast(microsOf(a.trip.row.updated_at), microsOf(b.trip.row.updated_at), (x, y) => -bigintOrder(x, y)),
    };
    const primary = orders[sortKey] ?? (() => 0);
    const ordered = [...filtered].sort((a, b) => primary(a, b) || (a.trip.id < b.trip.id ? 1 : a.trip.id > b.trip.id ? -1 : 0));
    const size = pageSizeOf(input.pageSize ?? 24);

    const summaries = new Map<string, { currency: string; trips: number; revenue: Dec; profit: Dec; due: bigint }>();
    for (const { trip, summary } of filtered.filter(({ trip }) => !['archived', 'cancelled'].includes(String(trip.row.status)))) {
      const currency = (trip.row.currency as string | null) ?? 'ILS';
      const current = summaries.get(currency) ?? { currency, trips: 0, revenue: ZERO, profit: ZERO, due: 0n };
      current.trips += 1;
      current.revenue = add(current.revenue, dec(trip.data.salePrice) ?? ZERO);
      current.profit = add(current.profit, dec(trip.data.profit) ?? ZERO);
      current.due += BigInt(summary.total_unpaid_minor);
      summaries.set(currency, current);
    }
    const hasItinerary = (value: unknown) => {
      if (value === null || value === undefined) return false;
      if (!Array.isArray(value)) throw pgError('cannot get array length of a non-array', '22023');
      return value.length > 0;
    };
    const utc = utcToday();
    return {
      items: pageOf(ordered, input.page, size).map(({ trip, summary }) => ({
        ...omit(trip.row, LIST_OMITTED),
        has_itinerary: hasItinerary(trip.row.itinerary),
        payment_plan_summary: summary,
        travelers: [], itinerary: [], payments: [], attachments: [], notes: '',
      }) as unknown as Trip),
      total_count: filtered.length,
      summary: [...summaries.values()].sort((a, b) => textOrder(a.currency, b.currency)).map((entry): TripPageSummary => ({
        currency: entry.currency, trip_count: entry.trips, revenue: decNumber(entry.revenue) as number,
        profit: decNumber(entry.profit) as number, amount_due: money(entry.due),
      })),
      upcoming_count: filtered.filter(({ trip }) => !['archived', 'cancelled'].includes(String(trip.row.status)) && String(trip.row.start_date) >= utc).length,
      destinations: [...new Set(trips.filter(inYear).map((trip) => String(trip.row.destination)))].sort(textOrder),
    };
  }

  /** get_trip_details(p_trip_id): the owner's live trip without search_document, with its payment summary; null otherwise. */
  async getTripDetails(tripId: string): Promise<unknown | null> {
    const owner = await this.owner();
    if (!owner) return null;
    const snapshot = await getDoc(doc(this.session.db, 'trips', tripId)).catch((error: { code?: string }) => {
      if (error?.code === 'permission-denied') return null;
      throw error;
    });
    if (!snapshot?.exists()) return null;
    const data = read(snapshot);
    if (data.userId !== owner.uid || data.ownerUid !== owner.uid || data.isDeleted === true) return null;
    const trip: TripDoc = { id: snapshot.id, data, row: decodeRow<Row>('trips', data) };
    const ledger = await this.ledger(owner);
    return { ...omit(trip.row, ['search_document']), payment_plan_summary: this.summary(owner, trip, ledger, businessToday()) };
  }

  async findLatestTripIdForClient(clientName: string, clientPhone?: string): Promise<string | null> {
    const owner = await this.owner();
    if (!owner) return null;
    const matches = (await this.trips(owner, false))
      .filter((trip) => trip.row.client_name === clientName && (!clientPhone || trip.row.client_phone === clientPhone))
      .sort((a, b) => textOrder(b.row.start_date, a.row.start_date) || (a.id < b.id ? 1 : -1));
    return matches[0]?.id ?? null;
  }

  async searchTrips(userId: string): Promise<Trip[]> {
    const owner = await this.owner();
    if (!owner || owner.uid !== userId) return [];
    return (await this.trips(owner, null))
      .sort((a, b) => textOrder(b.row.start_date, a.row.start_date) || (a.id < b.id ? 1 : -1))
      .map((trip) => trip.row as unknown as Trip);
  }

  async listClientRows(userId: string): Promise<ExistingClientRow[]> {
    const owner = await this.owner();
    if (!owner || owner.uid !== userId) return [];
    const createdDesc = (a: TripDoc, b: TripDoc) => {
      const x = microsOf(a.row.created_at); const y = microsOf(b.row.created_at);
      return x === y ? 0 : x === null ? -1 : y === null ? 1 : x > y ? -1 : 1;
    };
    return (await this.trips(owner, false)).sort((a, b) => createdDesc(a, b) || (a.id < b.id ? 1 : -1)).slice(0, 1000)
      .map((trip) => ({ client_name: trip.row.client_name as string, client_phone: (trip.row.client_phone as string | null) ?? null }));
  }

  async exportTrips(userId: string): Promise<unknown[]> {
    const owner = await this.owner();
    if (!owner || owner.uid !== userId) return [];
    return (await this.trips(owner, null)).sort((a, b) => (a.id < b.id ? -1 : 1)).map((trip) => trip.row);
  }

  async logPaymentContractComparison(tripId: string, year: string): Promise<void> {
    const snapshot = (value: Partial<Trip> | null | undefined) => (value ? {
      payment_method: value.payment_method ?? null, payment_status: value.payment_status ?? null,
      amount_paid_minor: Math.round(Number(value.amount_paid ?? 0) * 100), amount_due_minor: Math.round(Number(value.amount_due ?? 0) * 100),
      summary: value.payment_plan_summary ?? null,
    } : null);
    const [detail, page, dashboard] = await Promise.all([
      this.getTripDetails(tripId),
      this.getTripsPage({ year, page: 1, pageSize: 100, sortKey: 'updated_desc' }),
      new FirestoreTravelDashboardRepository(this.session).listDashboardTrips(year),
    ]);
    const snapshots = {
      details: snapshot(detail as Partial<Trip> | null),
      list: snapshot(page.items.find((item) => item.id === tripId)),
      dashboard: snapshot(dashboard.find((item) => item.id === tripId)),
    };
    const texts = Object.values(snapshots).map((value) => JSON.stringify(value));
    if (new Set(texts).size > 1) console.warn('[Travel payment contract] mismatch', { tripId, snapshots });
    else console.info('[Travel payment contract] aligned', { tripId, snapshots });
  }

  // ---------------------------------------------------------------- trash

  /** get_deleted_trips_page(p_page, p_page_size, p_search). */
  async getDeletedTripsPage(page: number, search: string, pageSize: number): Promise<DeletedTripsPage> {
    const owner = await this.owner();
    if (!owner) return { items: [], total_count: 0 };
    const [trips, jobs] = await Promise.all([this.trips(owner, true), this.rows(owner, 'storageCleanupQueue', 'trip_attachment_cleanup_queue')]);
    const term = search.trim() ? pgTrim(search.trim()).toLowerCase() : null;
    const filtered = trips.filter((trip) => {
      if (trip.row.deleted_at === null) return false;
      if (term === null || term === '') return true;
      const document = trip.row.search_document as string | null;
      return document !== null && likeContains(document, term);
    });
    const deletedDesc = (a: TripDoc, b: TripDoc) => {
      const x = microsOf(a.row.deleted_at) as bigint; const y = microsOf(b.row.deleted_at) as bigint;
      return x === y ? 0 : x > y ? -1 : 1;
    };
    const ordered = filtered.sort((a, b) => deletedDesc(a, b) || (a.id < b.id ? 1 : -1));
    const latestJob = (tripId: string) => jobs.filter((job) => job.trip_id === tripId)
      .sort((a, b) => { const x = microsOf(a.created_at) as bigint; const y = microsOf(b.created_at) as bigint; return x === y ? 0 : x > y ? -1 : 1; })[0];
    const size = pageSizeOf(pageSize);
    return {
      items: pageOf(ordered, page, size).map((trip) => ({
        ...omit(trip.row, LIST_OMITTED),
        purge_at: plusDays(String(trip.row.deleted_at), 30),
        cleanup_status: (latestJob(trip.id)?.status as string | undefined) ?? null,
        travelers: [], itinerary: [], payments: [], attachments: [], notes: '',
      }) as unknown as DeletedTrip),
      total_count: filtered.length,
    };
  }

  /**
   * restore_deleted_trips(p_trip_ids) and permanently_delete_trips(p_trip_ids). The source runs one statement over the
   * array; here each trip is its own transaction, because the Rules bind one operation document to one trip. The rows
   * written per trip, and the count returned, are the same either way.
   */
  async restoreDeletedTrips(ids: string[]): Promise<number> {
    let restored = 0;
    for (const id of ids) {
      restored += await this.command('trip-state', (world, ctx) => commands.restoreDeletedTrips(world, ctx, [id]), { tripId: () => id });
    }
    return restored;
  }

  async permanentlyDeleteTrips(ids: string[]): Promise<number> {
    let removed = 0;
    for (const id of ids) {
      // The purge operation's id is derived from the trip, because a delete carries no document the Rules could read a
      // request id from: they compute `{uid}__purge__{tripId}` and require that operation to exist after the commit.
      removed += await this.command('trip-purge', (world, ctx) => commands.permanentlyDeleteTrips(world, ctx, [id]),
        { tripId: () => id, cleanupQueue: true, packingLists: true, clientRequestId: `purge__${id}` });
    }
    return removed;
  }

  /** retry_trip_attachment_cleanup(p_job_id): the owner's failed job, under ten attempts, back to pending. */
  async retryAttachmentCleanup(jobId: number): Promise<void> {
    const owner = await this.requireOwner();
    const adapter = new TripWriteAdapter(this.session, owner);
    const { world, guards } = await adapter.loadWorld({ cleanupQueue: true });
    const job = (world.cleanupQueue ?? []).find((row) => Number(row.id) === jobId && row.status === 'failed' && Number(row.attempts) < 10);
    if (!job) throw new Error('CLEANUP_RETRY_NOT_APPLIED');
    await adapter.commit({
      type: 'trip-side', tripId: String(job.trip_id), clientRequestId: crypto.randomUUID(),
      ops: [{ table: 'trip_attachment_cleanup_queue', kind: 'update', key: String(job.id), before: job,
        row: { ...job, status: 'pending', next_retry_at: NOW, last_error: null } }],
    }, world, guards);
  }

  async listFailedCleanupJobs(): Promise<TripCleanupJob[]> {
    const owner = await this.owner();
    if (!owner) return [];
    const jobs = await this.rows(owner, 'storageCleanupQueue', 'trip_attachment_cleanup_queue', where('status', '==', 'failed'));
    return jobs.sort((a, b) => {
      const x = microsOf(a.created_at) as bigint; const y = microsOf(b.created_at) as bigint;
      return x === y ? Number(b.id) - Number(a.id) : x > y ? -1 : 1;
    }).slice(0, 20).map((job) => ({
      id: job.id as number, trip_id: job.trip_id as string, status: job.status as string, attempts: job.attempts as number,
      last_error: (job.last_error as string | null) ?? null, next_retry_at: (job.next_retry_at as string | null) ?? null, created_at: job.created_at as string,
    }));
  }

  // ---------------------------------------------------------------- activity and audit

  private async historyPage<T>(name: string, table: string, tripId: string, page: number, timeColumn: string): Promise<AuditPage<T>> {
    const owner = await this.owner();
    if (!owner) return { items: [], total_count: 0 };
    const rows = await this.rows(owner, name, table, where('tripId', '==', tripId));
    const ordered = rows.sort((a, b) => {
      const x = microsOf(a[timeColumn]) as bigint; const y = microsOf(b[timeColumn]) as bigint;
      return x === y ? Number(b.id) - Number(a.id) : x > y ? -1 : 1;
    });
    return { items: pageOf(ordered, page, 20) as unknown as T[], total_count: rows.length };
  }

  async getTripActivityPage(tripId: string, page: number): Promise<AuditPage<TripActivityEntry>> {
    return this.historyPage<TripActivityEntry>('tripActivityLog', 'trip_activity_log', tripId, page, 'created_at');
  }

  async getTripFinancialAuditPage(tripId: string, page: number): Promise<AuditPage<TripFinancialAuditEntry>> {
    const result = await this.historyPage<Row>('tripFinancialAudit', 'trip_financial_audit', tripId, page, 'changed_at');
    return { total_count: result.total_count, items: result.items.map((row) => omit(row, [])) as unknown as TripFinancialAuditEntry[] };
  }

  /** log_trip_activity(p_trip_id, p_activity_type, p_metadata): nothing is written for a trip the caller does not own. */
  async logTripActivity(tripId: string, activityType: string, metadata: Record<string, unknown>): Promise<void> {
    await this.command('trip-activity', (world, ctx) => commands.logTripActivity(world, ctx, tripId, activityType, metadata),
      { tripId: () => tripId });
  }

  // ---------------------------------------------------------------- payments

  async getTripPaymentPlan(tripId: string): Promise<{ plan: TripPaymentPlan | null; installments: TripInstallment[] }> {
    const owner = await this.owner();
    if (!owner) return { plan: null, installments: [] };
    const plans = (await this.rows(owner, 'tripPaymentPlans', 'trip_payment_plans', where('tripId', '==', tripId)))
      .filter((plan) => plan.deleted_at === null && plan.status !== 'cancelled');
    if (plans.length > 1) throw PGRST116();
    if (!plans.length) return { plan: null, installments: [] };
    const installments = (await this.rows(owner, 'tripInstallments', 'trip_installments', where('paymentPlanId', '==', plans[0].id)))
      .sort((a, b) => Number(a.installment_number) - Number(b.installment_number));
    return { plan: plans[0] as unknown as TripPaymentPlan, installments: installments as unknown as TripInstallment[] };
  }

  /**
   * create_trip_payment_plan(...). A card or mixed plan fails in the source with 42702 (the events statement aliases
   * trip_installments as `i`, colliding with the loop variable) and fails here the same way; a cash plan succeeds.
   */
  async createTripPaymentPlan(input: NewPaymentPlanInput): Promise<string> {
    return this.command('plan-create', (world, ctx) => commands.createTripPaymentPlan(world, ctx, {
      tripId: input.tripId, method: input.method, currency: input.currency,
      cardTotalMinor: BigInt(input.cardTotalMinor), cashTotalMinor: BigInt(input.cashTotalMinor),
      installmentCount: input.installmentCount, firstDate: input.firstDate || null, notes: input.notes ?? null,
    }), { tripId: () => input.tripId, currency: input.currency, amountMinor: input.cardTotalMinor + input.cashTotalMinor });
  }

  /** record_trip_installment_payment(p_installment_id, p_paid_amount_minor, p_paid_at, p_notes): a manual Visa receipt. */
  async recordInstallmentPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void> {
    await this.command('installment-payment',
      (world, ctx) => commands.recordInstallmentPayment(world, ctx, id, BigInt(paidAmountMinor), paidAt, notes ?? null),
      { tripId: (result) => String((result as Row).trip_id), installmentId: id, amountMinor: paidAmountMinor });
  }

  async rescheduleInstallment(id: string, dueDate: string): Promise<void> {
    await this.command('installment-reschedule', (world, ctx) => commands.rescheduleInstallment(world, ctx, id, dueDate),
      { tripId: (result) => String((result as Row).trip_id), installmentId: id });
  }

  async recordCashPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void> {
    await this.command('payment', (world, ctx) => commands.recordCashPayment(world, ctx, id, BigInt(paidAmountMinor), paidAt, notes ?? null),
      { tripId: (result) => String((result as Row).trip_id), amountMinor: paidAmountMinor });
  }

  async recalculateFutureInstallments(id: string, cardTotalMinor: number): Promise<void> {
    await this.command('plan-recalculate', (world, ctx) => commands.recalculateFutureInstallments(world, ctx, id, BigInt(cardTotalMinor)),
      { amountMinor: cardTotalMinor });
  }

  async listInstallmentEvents(id: string): Promise<TripInstallmentEvent[]> {
    const owner = await this.owner();
    if (!owner) return [];
    const rows = await this.rows(owner, 'tripInstallmentEvents', 'trip_installment_events', where('installmentId', '==', id));
    return rows.sort((a, b) => {
      const x = microsOf(a.created_at) as bigint; const y = microsOf(b.created_at) as bigint;
      return x === y ? Number(b.id) - Number(a.id) : x > y ? -1 : 1;
    }) as unknown as TripInstallmentEvent[];
  }

  /** The Firestore save implements the canonical payment contract (version 4) itself. */
  async probePaymentContractVersion(): Promise<{ data: number | null; error: unknown }> {
    return { data: 4, error: null };
  }

  // ---------------------------------------------------------------- notifications

  async listTripNotifications(): Promise<TripNotification[]> {
    const owner = await this.owner();
    if (!owner) return [];
    const rows = (await this.rows(owner, 'tripNotifications', 'trip_notifications')).filter((row) => row.dismissed_at === null);
    const columns = ['id', 'trip_id', 'notification_type', 'title_key', 'body_key', 'params', 'read_at', 'snoozed_until', 'dismissed_at', 'completed_at', 'scheduled_for', 'created_at'];
    return rows.sort((a, b) => {
      const x = microsOf(a.created_at) as bigint; const y = microsOf(b.created_at) as bigint;
      return x === y ? textOrder(b.id, a.id) : x > y ? -1 : 1;
    }).slice(0, 100).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))) as unknown as TripNotification[];
  }

  /** gen_random_uuid() and the business day, for the side-table models. */
  private sideContext(owner: Owner) {
    return { uid: owner.uid, newId: () => crypto.randomUUID(), businessToday: businessToday() };
  }

  /** The bell menu's updates: PostgREST statements the owner's RLS policy scopes to their own notifications. */
  private async notificationCommand(run: (rows: Row[], ctx: SideCtx) => { ops: side.SideOp[] }): Promise<void> {
    const owner = await this.requireOwner();
    const adapter = new TripWriteAdapter(this.session, owner);
    const { rows, guards } = await adapter.loadSide('tripNotifications', 'trip_notifications');
    const outcome = run(rows, this.sideContext(owner));
    await adapter.commit({ type: 'trip-side', tripId: null, ops: outcome.ops, clientRequestId: crypto.randomUUID() }, undefined, guards);
  }

  async markAllTripNotificationsRead(): Promise<void> {
    await this.notificationCommand((rows, ctx) => side.markAllTripNotificationsRead(rows, ctx));
  }

  async snoozeTripNotification(id: string, until: string): Promise<void> {
    await this.notificationCommand((rows, ctx) => side.snoozeTripNotification(rows, ctx, id, until));
  }

  async dismissTripNotification(id: string): Promise<void> {
    await this.notificationCommand((rows, ctx) => side.dismissTripNotification(rows, ctx, id, new Date().toISOString()));
  }

  async clearCompletedTripNotifications(): Promise<void> {
    await this.notificationCommand((rows, ctx) => side.clearCompletedTripNotifications(rows, ctx, new Date().toISOString()));
  }

  async markTripNotificationRead(id: string): Promise<void> {
    await this.notificationCommand((rows, ctx) => side.markTripNotificationRead(rows, ctx, id, new Date().toISOString()));
  }

  /** users/{uid}/settings/{uid}: the owner's trip_notification_settings row, or null when they have none. */
  async getTripNotificationSettings(userId: string): Promise<TripNotificationSettings | null> {
    const owner = await this.owner();
    if (!owner || owner.uid !== userId) return null;
    const { row } = await new TripWriteAdapter(this.session, owner).loadSettingsDoc();
    if (!row) return null;
    return Object.fromEntries(side.NOTIFICATION_SETTING_COLUMNS.map((column) => [column, row[column]])) as unknown as TripNotificationSettings;
  }

  async saveTripNotificationSettings(userId: string, settings: TripNotificationSettings): Promise<void> {
    const owner = await this.requireOwner();
    if (owner.uid !== userId) throw pgError('new row violates row-level security policy for table "trip_notification_settings"', '42501');
    const adapter = new TripWriteAdapter(this.session, owner);
    const { row, guards } = await adapter.loadSettingsDoc();
    const outcome = side.saveTripNotificationSettings(row ? [row] : [], this.sideContext(owner),
      settings as unknown as Row, new Date().toISOString());
    await adapter.commit({ type: 'trip-side', tripId: null, ops: outcome.ops, clientRequestId: crypto.randomUUID() }, undefined, guards);
  }

  /** materialize_due_visa_progress_events(), then the unseen visa_schedule_collected notifications, newest first. */
  async listUnseenVisaArrivalRows(): Promise<VisaArrivalRow[]> {
    const owner = await this.owner();
    if (!owner) return [];
    const adapter = new TripWriteAdapter(this.session, owner);
    const [notifications, loaded, rollouts] = await Promise.all([
      adapter.loadSide('tripNotifications', 'trip_notifications'),
      adapter.loadWorld(),
      adapter.loadFeatureRollouts(),
    ]);
    const outcome = side.materializeDueVisaProgressEvents({
      notifications: notifications.rows, trips: loaded.world.trips, plans: loaded.world.plans,
      installments: loaded.world.installments, rollouts,
    }, this.sideContext(owner));
    if (outcome.ops.length) {
      await adapter.commit({ type: 'trip-side', tripId: null, ops: outcome.ops, clientRequestId: crypto.randomUUID() },
        undefined, notifications.guards);
    }
    const stamped = this.committed(outcome.rows);
    return stamped
      .filter((row) => row.notification_type === 'visa_schedule_collected' && row.read_at === null && row.dismissed_at === null)
      .sort((a, b) => Date.parse(String(b.scheduled_for)) - Date.parse(String(a.scheduled_for))
        || Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)))
      .slice(0, 100)
      .map((row) => ({ id: row.id, trip_id: row.trip_id, params: row.params, created_at: row.created_at, scheduled_for: row.scheduled_for })) as unknown as VisaArrivalRow[];
  }

  // ---------------------------------------------------------------- templates

  async listTripTemplates(search: string, type: TripTemplateType | undefined, includeArchived: boolean): Promise<TripTemplate[]> {
    const owner = await this.owner();
    if (!owner) return [];
    const term = search.trim() ? search.trim().replace(/[%_]/g, '').toLowerCase() : null;
    const rows = (await this.rows(owner, 'tripTemplates', 'trip_templates')).filter((row) => row.deleted_at === null
      && (includeArchived || row.status === 'active')
      && (!type || row.template_type === type)
      && (term === null || likeContains(String(row.name).toLowerCase(), term)));
    return rows.sort((a, b) => {
      const x = microsOf(a.updated_at) as bigint; const y = microsOf(b.updated_at) as bigint;
      return x === y ? textOrder(b.id, a.id) : x > y ? -1 : 1;
    }) as unknown as TripTemplate[];
  }

  async getTripTemplate(id: string): Promise<TripTemplate> {
    const owner = await this.owner();
    if (!owner) throw PGRST116();
    const snapshot = await getDoc(doc(this.session.db, 'tripTemplates', id)).catch((error: { code?: string }) => {
      if (error?.code === 'permission-denied') return null;
      throw error;
    });
    if (!snapshot?.exists()) throw PGRST116();
    const data = read(snapshot);
    const row = decodeRow<Row>('trip_templates', data);
    if (data.userId !== owner.uid || row.deleted_at !== null) throw PGRST116();
    return row as unknown as TripTemplate;
  }

  private async templateCommand(run: (rows: Row[], ctx: SideCtx) => { ops: side.SideOp[] }): Promise<void> {
    const owner = await this.requireOwner();
    const adapter = new TripWriteAdapter(this.session, owner);
    const { rows, guards } = await adapter.loadSide('tripTemplates', 'trip_templates');
    const outcome = run(rows, this.sideContext(owner));
    await adapter.commit({ type: 'trip-side', tripId: null, ops: outcome.ops, clientRequestId: crypto.randomUUID() }, undefined, guards);
  }

  async saveTripTemplate(_userId: string, value: TripTemplateInput): Promise<void> {
    await this.templateCommand((rows, ctx) => side.saveTripTemplate(rows, ctx, {
      id: value.id, name: value.name, description: value.description, data: value.data, templateType: value.templateType,
    }, new Date().toISOString()));
  }

  async toggleTripTemplateFavorite(id: string, isFavorite: boolean): Promise<void> {
    await this.templateCommand((rows, ctx) => side.updateTripTemplate(rows, ctx, id,
      { is_favorite: isFavorite, updated_at: new Date().toISOString() }));
  }

  /** use_trip_template(p_template_id): counts the use and returns the payload the caller then fills a form with. */
  async recordTripTemplateUse(id: string): Promise<void> {
    await this.templateCommand((rows, ctx) => side.useTripTemplate(rows, ctx, id));
  }

  async updateTripTemplateStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    await this.templateCommand((rows, ctx) => side.updateTripTemplate(rows, ctx, id, { status, updated_at: new Date().toISOString() }));
  }

  async softDeleteTripTemplate(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.templateCommand((rows, ctx) => side.updateTripTemplate(rows, ctx, id, { deleted_at: now, updated_at: now }));
  }

  // ---------------------------------------------------------------- WhatsApp templates

  /**
   * The production table has only id, user_id, name, body, language, created_at and updated_at (migration
   * 20260719180000 was never applied), so the product's select fails there; it fails here the same way.
   */
  async listWhatsappTemplates(): Promise<TripWhatsappTemplate[]> {
    throw pgError('column trip_whatsapp_templates.category does not exist', '42703');
  }

  private async whatsappCommand(payload: Row, apply: (rows: Row[]) => side.SideOp[]): Promise<void> {
    // PostgREST refuses a payload naming a column the table does not have; production's table has none of the
    // composer columns, so the composer's saves fail there and fail here in the same way.
    const refusal = side.whatsappPayloadRefusal(payload);
    if (refusal) throw refusal;
    const owner = await this.requireOwner();
    const adapter = new TripWriteAdapter(this.session, owner);
    const { rows, guards } = await adapter.loadSide('tripWhatsappTemplates', 'trip_whatsapp_templates');
    const ops = apply(rows);
    if (!ops.length) return;
    await adapter.commit({ type: 'trip-side', tripId: null, ops, clientRequestId: crypto.randomUUID() }, undefined, guards);
  }

  async saveWhatsappTemplate(userId: string, template: WhatsappTemplateInput): Promise<void> {
    const values: Row = { name: template.name.trim(), body: template.body.trim(), language: template.language,
      category: template.category, updated_at: new Date().toISOString() };
    await this.whatsappCommand(values, (rows) => {
      if (!template.id) {
        const row: Row = { id: crypto.randomUUID(), user_id: userId, ...values, created_at: NOW };
        return [{ table: 'trip_whatsapp_templates', kind: 'insert', key: String(row.id), row }];
      }
      const current = rows.find((candidate) => candidate.id === template.id);
      return current ? [{ table: 'trip_whatsapp_templates', kind: 'update', key: String(current.id), before: current,
        row: { ...current, ...values } }] : [];
    });
  }

  async updateWhatsappTemplateState(id: string, values: { is_favorite?: boolean; is_archived?: boolean }): Promise<void> {
    const payload: Row = { ...values, updated_at: new Date().toISOString() };
    await this.whatsappCommand(payload, (rows) => {
      const current = rows.find((candidate) => candidate.id === id);
      return current ? [{ table: 'trip_whatsapp_templates', kind: 'update', key: id, before: current, row: { ...current, ...payload } }] : [];
    });
  }

  async markWhatsappTemplateUsed(_id: string, usageCount: number): Promise<void> {
    await this.whatsappCommand({ usage_count: usageCount + 1, last_used_at: new Date().toISOString() }, () => []);
  }

  async deleteWhatsappTemplate(id: string): Promise<void> {
    await this.whatsappCommand({}, (rows) => {
      const current = rows.find((candidate) => candidate.id === id);
      return current ? [{ table: 'trip_whatsapp_templates', kind: 'delete', key: id, row: current }] : [];
    });
  }

  /** The packing list lives under its trip; the source's foreign key sees every trip, not only the caller's. */
  async createPackingList(_userId: string, tripId: string, name: string,
    items: Array<{ category: string; label: string; checked: boolean }>): Promise<void> {
    const owner = await this.requireOwner();
    const adapter = new TripWriteAdapter(this.session, owner);
    const { world, guards } = await adapter.loadWorld({ packingLists: true });
    const outcome = side.createPackingList(world.packingLists ?? [], world.trips, this.sideContext(owner), tripId, name, items);
    await adapter.commit({ type: 'trip-side', tripId, ops: outcome.ops, clientRequestId: crypto.randomUUID() }, world, guards);
  }

  // ---------------------------------------------------------------- analytics and reports

  /** get_travel_analytics_summary and get_travel_payment_analytics with the same arguments. */
  async getTravelAnalytics(args: TravelAnalyticsArgs): Promise<{ summary: unknown; payment: unknown }> {
    const owner = await this.owner();
    const trips = owner ? await this.trips(owner, false) : [];
    const ledger: Ledger = owner ? await this.ledger(owner) : { plansByTrip: new Map(), installmentsByPlan: new Map(), installments: [] };
    const today = businessToday();
    const summaries = new Map(trips.map((trip) => [trip.id, owner ? this.summary(owner, trip, ledger, today) : ({} as Summary)]));
    return {
      summary: analyticsSummary(args, trips, summaries, ledger, Boolean(owner), owner?.uid ?? ''),
      payment: paymentAnalytics(args, trips, summaries),
    };
  }

  /** get_travel_reports(p_start_date, p_end_date, p_currency, p_destination, p_include_archived). */
  async getTravelReports(input: TravelReportsInput): Promise<Partial<TravelReportPayload>> {
    const owner = await this.owner();
    if (!owner) return travelReports([], new Map());
    const [trips, ledger] = await Promise.all([this.trips(owner, false), this.ledger(owner)]);
    const today = businessToday();
    const owned = trips.filter((trip) => String(trip.row.start_date) >= input.startDate && String(trip.row.start_date) <= input.endDate
      && trip.row.status !== 'cancelled' && (input.includeArchived || trip.row.status !== 'archived')
      && (blank(input.currency) || trip.row.currency === input.currency)
      && (blank(input.destination) || trip.row.destination === input.destination));
    return travelReports(owned, new Map(owned.map((trip) => [trip.id, this.summary(owner, trip, ledger, today)])));
  }

  // ---------------------------------------------------------------- PDF

  /** The server renderer authenticates with Supabase Auth and reads through Supabase RPCs; it does not exist here. */
  async generateServerTripPdf(): Promise<Uint8Array> {
    throw pgError('SERVER_PDF_UNAVAILABLE', 'SERVER_PDF_UNAVAILABLE');
  }

  /** Never reached: only a server render records it. */
  recordServerPdfGenerated(): void {}
}

/** timestamptz + interval 'N days', keeping the text form decodeRow produces. */
function plusDays(timestamp: string, days: number): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(.*)$/.exec(timestamp);
  if (!match) throw new Error(`UNEXPECTED_TIMESTAMP_TEXT:${timestamp}`);
  return `${addDays(match[1], days)}T${match[2]}:${match[3]}:${match[4]}${match[5]}`;
}

// ---------------------------------------------------------------- get_travel_analytics_summary

interface Period { start: string; end: string }

function analyticsPeriods(args: TravelAnalyticsArgs) {
  const today = utcToday();
  const year = args.p_year !== null && /^\d{4}$/.test(args.p_year) ? Number(args.p_year) : Number(today.slice(0, 4));
  const month = args.p_month !== null && args.p_month >= 1 && args.p_month <= 12 ? args.p_month : null;
  if (args.p_start_date !== null && args.p_end_date !== null) {
    const length = dayNumber(args.p_end_date) - dayNumber(args.p_start_date) + 1;
    return { year, month, type: 'custom_range', current: { start: args.p_start_date, end: args.p_end_date },
      previous: { start: addDays(args.p_start_date, -length), end: addDays(args.p_start_date, -1) } };
  }
  if (month !== null) {
    return { year, month, type: 'same_month_previous_year', current: { start: ymd(year, month, 1), end: ymd(year, month, lastDay(year, month)) },
      previous: { start: ymd(year - 1, month, 1), end: ymd(year - 1, month, lastDay(year - 1, month)) } };
  }
  return { year, month, type: 'full_year', current: { start: ymd(year, 1, 1), end: ymd(year, 12, 31) },
    previous: { start: ymd(year - 1, 1, 1), end: ymd(year - 1, 12, 31) } };
}

function analyticsSummary(args: TravelAnalyticsArgs, trips: TripDoc[], summaries: Map<string, Summary>, ledger: Ledger, canView: boolean, uid: string) {
  const periods = analyticsPeriods(args);
  const today = utcToday();
  const financialDate = (trip: TripDoc) => (trip.row.payment_date ?? trip.row.start_date) as string | null;
  const operationsDate = (trip: TripDoc) => ((trip.row.start_date as string | null) ?? utcDateOf(trip.row.created_at));
  const statusOk = (trip: TripDoc) => (blank(args.p_trip_status) ? trip.row.status !== 'archived' && trip.row.status !== 'cancelled' : trip.row.status === args.p_trip_status);
  const filtersOk = (trip: TripDoc) => statusOk(trip) && (blank(args.p_payment_status) || trip.row.payment_status === args.p_payment_status)
    && (blank(args.p_destination) || trip.row.destination === args.p_destination);
  const within = (date: string | null, period: Period) => date !== null && date >= period.start && date <= period.end;
  const visible = <T>(value: T) => (canView ? value : null);
  const saleOf = (trip: TripDoc) => dec(trip.data.salePrice) ?? ZERO;
  const costOf = (trip: TripDoc) => dec(trip.data.wholesaleCost);
  const trendProfit = (trip: TripDoc) => {
    const profit = dec(trip.data.profit);
    return profit !== null ? minor(profit) : minor(sub(saleOf(trip), costOf(trip) ?? ZERO));
  };
  const pax = (trip: TripDoc) => {
    if (trip.row.travelers_count !== null && trip.row.travelers_count !== undefined) return Number(trip.row.travelers_count);
    return Array.isArray(trip.row.travelers) ? trip.row.travelers.length : 0;
  };

  const financialStats = (period: Period) => {
    let trips_sold = 0; let unknown = 0; let revenue = 0n; let cost = 0n; let profit = 0n; let eligible = 0n; let paid = 0n; let remaining = 0n;
    for (const trip of trips.filter((t) => within(financialDate(t), period) && filtersOk(t))) {
      const sale = greatest0(minor(saleOf(trip)));
      const tripCost = costOf(trip);
      const storedProfit = dec(trip.data.profit);
      const calcProfit = storedProfit !== null ? minor(storedProfit) : tripCost !== null ? minor(sub(saleOf(trip), tripCost)) : null;
      const summary = summaries.get(trip.id) as Summary;
      trips_sold += 1;
      revenue += sale;
      cost += greatest0(minor(tripCost ?? ZERO));
      if (calcProfit === null) unknown += 1; else { profit += calcProfit; eligible += sale; }
      paid += BigInt(summary.authoritative_paid_minor);
      remaining += BigInt(summary.authoritative_remaining_minor);
    }
    return {
      trips_sold, unknown_profit_count: unknown,
      total_revenue: visible(money(revenue)), total_cost: visible(money(cost)), total_profit: visible(money(profit)),
      total_collected: visible(money(paid)), total_outstanding: visible(money(remaining)),
      profit_margin_pct: canView && eligible > 0n ? percent(profit, eligible) : null,
      markup_pct: canView && revenue - profit > 0n ? percent(profit, revenue - profit) : null,
      average_sale_value: canView && trips_sold > 0 ? money(revenue / BigInt(trips_sold)) : null,
      average_profit: canView && trips_sold - unknown > 0 ? money(profit / BigInt(trips_sold - unknown)) : null,
    };
  };
  const financialCurrentRows = trips.filter((t) => within(financialDate(t), periods.current) && filtersOk(t));
  const operationsCurrentRows = trips.filter((t) => within(operationsDate(t), periods.current) && filtersOk(t));

  const buckets = (rows: TripDoc[], dateOf: (trip: TripDoc) => string | null, part: 'day' | 'month') => {
    const groups = new Map<number, TripDoc[]>();
    for (const trip of rows) {
      const date = dateOf(trip) as string;
      const key = Number(part === 'day' ? date.slice(8, 10) : date.slice(5, 7));
      groups.set(key, [...(groups.get(key) ?? []), trip]);
    }
    const count = periods.month !== null ? lastDay(periods.year, periods.month) : 12;
    return Array.from({ length: count }, (_, index) => ({ key: index + 1, rows: groups.get(index + 1) ?? [] }));
  };
  const trendPart = periods.month !== null ? 'day' : 'month';
  const financialTrend = buckets(financialCurrentRows, financialDate, trendPart).map(({ key, rows }) => ({
    name: String(key), ...(trendPart === 'month' ? { month_index: key - 1 } : {}), trips_sold: rows.length,
    revenue: visible(money(rows.reduce((sum, trip) => sum + minor(saleOf(trip)), 0n))),
    profit: visible(money(rows.reduce((sum, trip) => sum + trendProfit(trip), 0n))),
  }));

  const groupBy = <K>(rows: TripDoc[], keyOf: (trip: TripDoc) => K) => {
    const groups = new Map<K, TripDoc[]>();
    for (const trip of rows) groups.set(keyOf(trip), [...(groups.get(keyOf(trip)) ?? []), trip]);
    return [...groups.entries()];
  };
  const destinationSales = groupBy(financialCurrentRows, (trip) => String(trip.row.destination)).map(([destination, rows]) => {
    const revenue = rows.reduce((sum, trip) => sum + minor(saleOf(trip)), 0n);
    const profit = rows.reduce((sum, trip) => sum + trendProfit(trip), 0n);
    return { destination, revenue, entry: {
      name: destination, trips_sold: rows.length, revenue: visible(money(revenue)), profit: visible(money(profit)),
      profit_margin: canView && revenue > 0n ? percent(profit, revenue) : null,
      markup_pct: canView && revenue - profit > 0n ? percent(profit, revenue - profit) : null,
    } };
  }).sort((a, b) => (a.revenue === b.revenue ? textOrder(a.destination, b.destination) : a.revenue > b.revenue ? -1 : 1)).map(({ entry }) => entry);
  const currencyTotals = groupBy(financialCurrentRows, (trip) => (trip.row.currency as string | null) ?? 'ILS').sort((a, b) => textOrder(a[0], b[0]))
    .map(([currency, rows]) => ({
      currency, trips_sold: rows.length,
      sales: visible(money(rows.reduce((sum, trip) => sum + minor(saleOf(trip)), 0n))),
      profit: visible(money(rows.reduce((sum, trip) => sum + trendProfit(trip), 0n))),
    }));

  const operationsStats = (period: Period) => {
    const rows = trips.filter((t) => within(operationsDate(t), period) && filtersOk(t));
    return { trips_departing: rows.length, total_travelers: rows.reduce((sum, trip) => sum + pax(trip), 0),
      upcoming_trips: rows.filter((trip) => trip.row.status === 'active').length, completed_trips: rows.filter((trip) => trip.row.status === 'completed').length };
  };
  const operationsCurrent = operationsStats(periods.current);
  const operationsPreviousFull = operationsStats(periods.previous);
  const operationsTrend = buckets(operationsCurrentRows, operationsDate, trendPart).map(({ key, rows }) => ({
    name: String(key), ...(trendPart === 'month' ? { month_index: key - 1 } : {}),
    trips_departing: rows.length, travelers: rows.reduce((sum, trip) => sum + pax(trip), 0),
  }));
  const destinationVolume = groupBy(operationsCurrentRows, (trip) => String(trip.row.destination))
    .map(([destination, rows]) => ({ name: destination, trips_departing: rows.length, passengers: rows.reduce((sum, trip) => sum + pax(trip), 0) }))
    .sort((a, b) => b.passengers - a.passengers || textOrder(a.name, b.name));

  const attention = trips.filter((trip) => trip.row.status !== 'archived' && trip.row.status !== 'cancelled' && within(operationsDate(trip), periods.current))
    .map((trip) => {
      const start = trip.row.start_date as string | null;
      const unpaid = ['unpaid', 'partial'].includes(String(trip.row.payment_status));
      const amountPaid = dec(trip.data.amountPaid);
      const reasons = [
        dec(trip.data.profit) === null && costOf(trip) === null ? 'missing_cost' : null,
        unpaid && start !== null && start <= today ? 'unpaid_past_departure' : null,
        unpaid && start !== null && start > today && start <= addDays(today, 14) ? 'unpaid_near_departure' : null,
        amountPaid !== null && cmp(amountPaid, saleOf(trip)) > 0 ? 'overpaid' : null,
      ].filter((reason): reason is string => reason !== null);
      const outstanding = amountPaid === null ? null : sub(saleOf(trip), amountPaid);
      return { trip, reasons, outstanding };
    }).filter(({ reasons }) => reasons.length > 0)
    .sort((a, b) => textOrder(a.trip.row.start_date, b.trip.row.start_date) || (a.trip.id < b.trip.id ? -1 : 1))
    .map(({ trip, reasons, outstanding }) => ({
      trip: { id: trip.row.id, client_name: trip.row.client_name, destination: trip.row.destination, start_date: trip.row.start_date,
        payment_status: trip.row.payment_status, status: trip.row.status, currency: trip.row.currency },
      outstanding_balance: canView ? (outstanding === null ? null : decNumber(outstanding.units > 0n ? outstanding : ZERO)) : null,
      reasons,
    }));

  const activeTrips = trips.filter((trip) => statusOk(trip) && within(operationsDate(trip), periods.current)
    && (blank(args.p_payment_status) || trip.row.payment_status === args.p_payment_status)
    && (blank(args.p_destination) || trip.row.destination === args.p_destination));
  const sumSummary = (rows: TripDoc[], pick: (summary: Summary) => number) => rows.reduce((sum, trip) => sum + BigInt(pick(summaries.get(trip.id) as Summary)), 0n);
  const paymentsSummary = {
    confirmed_cash: visible(money(sumSummary(activeTrips, (s) => s.cash_paid_minor))),
    remaining_cash: visible(money(sumSummary(activeTrips.filter((trip) => trip.row.payment_method === 'cash'), (s) => s.authoritative_remaining_minor))),
    scheduled_visa_today: visible(money(sumSummary(activeTrips, (s) => s.scheduled_minor_to_date))),
    future_scheduled_visa: visible(money(sumSummary(activeTrips, (s) => s.remaining_scheduled_minor))),
    // The source's NOT EXISTS compares trip_installments.trip_id with the installment's own id, so it always holds.
    unscheduled_outstanding: visible(money(sumSummary(activeTrips, (s) => s.authoritative_remaining_minor))),
  };

  const liveTrips = new Map(trips.map((trip) => [trip.id, trip]));
  const aging = ledger.installments.filter((row) => row.user_id === uid && ['scheduled', 'partially_paid'].includes(String(row.status))
    && Number(row.paid_amount_minor) < Number(row.expected_amount_minor))
    .flatMap((row) => { const trip = liveTrips.get(String(row.trip_id)); return trip && statusOk(trip) ? [{ row, days: dayNumber(today) - dayNumber(String(row.due_date)) }] : []; });
  const agingSum = (predicate: (days: number) => boolean) => aging.filter(({ days }) => predicate(days))
    .reduce((sum, { row }) => sum + BigInt(Number(row.expected_amount_minor) - Number(row.paid_amount_minor)), 0n);
  const installmentTrips = new Set(ledger.installments.map((row) => String(row.trip_id)));
  const unscheduledCash = trips.filter((trip) => statusOk(trip) && (dec(trip.data.amountDue) ?? ZERO).units > 0n && !installmentTrips.has(trip.id))
    .reduce((sum, trip) => sum + greatest0(minor(sub(saleOf(trip), dec(trip.data.amountPaid) ?? ZERO))), 0n);
  const agingBuckets = {
    current: visible(money(agingSum((days) => days <= 0))),
    overdue_1_30: visible(money(agingSum((days) => days >= 1 && days <= 30))),
    overdue_31_60: visible(money(agingSum((days) => days >= 31 && days <= 60))),
    overdue_61_plus: visible(money(agingSum((days) => days > 60))),
    future_scheduled: visible(money(agingSum((days) => days < 0))),
    unscheduled_outstanding: visible(money(unscheduledCash)),
  };

  const financialCurrent = financialStats(periods.current);
  const financialPrevious = financialStats(periods.previous);
  const mirror = (financial: ReturnType<typeof financialStats>, operations: { total_travelers: number }) => ({
    total_trips: financial.trips_sold, total_passengers: operations.total_travelers, unknown_profit_count: financial.unknown_profit_count,
    total_revenue: financial.total_revenue, total_profit: financial.total_profit, total_collected: financial.total_collected,
    total_outstanding: financial.total_outstanding, profit_margin_pct: financial.profit_margin_pct, markup_pct: financial.markup_pct,
    collection_rate: 100, average_profit: financial.average_profit,
  });
  const years = [...new Set(trips.map((trip) => operationsDate(trip)).filter((date): date is string => date !== null)
    .map((date) => String(Number(date.slice(0, 4)))))].sort((a, b) => -textOrder(a, b));
  const destinations = [...new Set(trips.map((trip) => trip.row.destination as string | null)
    .filter((destination): destination is string => destination !== null && pgTrim(destination) !== ''))].sort(textOrder);
  const operationsPrevious = { trips_departing: operationsPreviousFull.trips_departing, total_travelers: operationsPreviousFull.total_travelers };

  return {
    financials_visible: canView, can_view_financials: canView, period_type: periods.type,
    current_period: { start_date: periods.current.start, end_date: periods.current.end },
    previous_period: { start_date: periods.previous.start, end_date: periods.previous.end },
    financial: { current_stats: financialCurrent, previous_stats: financialPrevious, trend: financialTrend, destination_sales: destinationSales, currency_totals: currencyTotals },
    travel: { current_stats: operationsCurrent, previous_stats: operationsPrevious, trend: operationsTrend, destination_volume: destinationVolume, attention_items: attention },
    payments: { summary: paymentsSummary, aging: agingBuckets },
    current_stats: mirror(financialCurrent, operationsCurrent),
    previous_stats: mirror(financialPrevious, operationsPrevious),
    available_years: years, available_destinations: destinations,
    monthly_trend: financialTrend, destination_stats: destinationSales, payment_health: paymentsSummary,
    aging_buckets: agingBuckets, attention_items: attention, currency_totals: currencyTotals,
  };
}

// ---------------------------------------------------------------- get_travel_payment_analytics

function paymentAnalytics(args: TravelAnalyticsArgs, trips: TripDoc[], summaries: Map<string, Summary>) {
  const today = utcToday();
  const year = args.p_year !== null && /^\d{4}$/.test(args.p_year) ? Number(args.p_year) : Number(today.slice(0, 4));
  let period: Period;
  if (args.p_start_date !== null && args.p_end_date !== null) period = { start: args.p_start_date, end: args.p_end_date };
  else if (args.p_month !== null && args.p_month >= 1 && args.p_month <= 12) period = { start: ymd(year, args.p_month, 1), end: ymd(year, args.p_month, lastDay(year, args.p_month)) };
  else period = { start: ymd(year, 1, 1), end: ymd(year, 12, 31) };
  const rows = trips.filter((trip) => {
    const date = (trip.row.payment_date ?? trip.row.start_date) as string | null;
    const summary = summaries.get(trip.id) as Summary;
    return date !== null && date >= period.start && date <= period.end
      && (blank(args.p_trip_status) || trip.row.status === args.p_trip_status)
      && (blank(args.p_payment_status) || summary.derived_payment_status === args.p_payment_status)
      && (blank(args.p_destination) || trip.row.destination === args.p_destination);
  });
  const fields = ['sale_total_minor', 'cash_confirmed_minor', 'cash_remaining_minor', 'visa_confirmed_minor', 'visa_scheduled_through_today_minor',
    'visa_overdue_unconfirmed_minor', 'visa_future_scheduled_minor', 'currently_due_unconfirmed_minor', 'confirmed_total_minor', 'total_unpaid_minor'] as const;
  const groups = new Map<string, { count: number; sums: Record<string, bigint>; partial: bigint; unpaid: bigint; paidCount: number; partialCount: number; unpaidCount: number }>();
  for (const trip of rows) {
    const currency = (trip.row.currency as string | null) ?? 'ILS';
    const summary = summaries.get(trip.id) as Summary;
    const group = groups.get(currency) ?? { count: 0, sums: Object.fromEntries(fields.map((field) => [field, 0n])), partial: 0n, unpaid: 0n, paidCount: 0, partialCount: 0, unpaidCount: 0 };
    group.count += 1;
    for (const field of fields) group.sums[field] += BigInt(Number(summary[field] ?? 0));
    const status = summary.derived_payment_status;
    if (status === 'partial') { group.partial += BigInt(summary.total_unpaid_minor); group.partialCount += 1; }
    if (status === 'unpaid') { group.unpaid += BigInt(summary.total_unpaid_minor); group.unpaidCount += 1; }
    if (status === 'paid') group.paidCount += 1;
    groups.set(currency, group);
  }
  const total = (pick: (group: NonNullable<ReturnType<typeof groups.get>>) => bigint) => [...groups.values()].reduce((sum, group) => sum + pick(group), 0n);
  const count = (pick: (group: NonNullable<ReturnType<typeof groups.get>>) => number) => [...groups.values()].reduce((sum, group) => sum + pick(group), 0);
  return {
    currency_mode: groups.size > 1 ? 'grouped_only' : 'single',
    summary: {
      counts: { paid: count((g) => g.paidCount), partial: count((g) => g.partialCount), unpaid: count((g) => g.unpaidCount) },
      amounts: { paid: money(total((g) => g.sums.confirmed_total_minor)), partial_remaining: money(total((g) => g.partial)), unpaid_remaining: money(total((g) => g.unpaid)) },
      confirmed_cash: money(total((g) => g.sums.cash_confirmed_minor)),
      remaining_cash: money(total((g) => g.sums.cash_remaining_minor)),
      confirmed_visa: money(total((g) => g.sums.visa_confirmed_minor)),
      scheduled_visa_today: money(total((g) => g.sums.visa_scheduled_through_today_minor)),
      overdue_unconfirmed_visa: money(total((g) => g.sums.visa_overdue_unconfirmed_minor)),
      future_scheduled_visa: money(total((g) => g.sums.visa_future_scheduled_minor)),
      currently_due_unconfirmed: money(total((g) => g.sums.currently_due_unconfirmed_minor)),
      confirmed_total: money(total((g) => g.sums.confirmed_total_minor)),
      total_unpaid: money(total((g) => g.sums.total_unpaid_minor)),
    },
    currency_totals: [...groups.entries()].sort((a, b) => textOrder(a[0], b[0])).map(([currency, group]) => ({
      currency, trip_count: group.count, sales: money(group.sums.sale_total_minor),
      confirmed_cash: money(group.sums.cash_confirmed_minor), remaining_cash: money(group.sums.cash_remaining_minor),
      confirmed_visa: money(group.sums.visa_confirmed_minor), scheduled_visa_today: money(group.sums.visa_scheduled_through_today_minor),
      overdue_unconfirmed_visa: money(group.sums.visa_overdue_unconfirmed_minor), future_scheduled_visa: money(group.sums.visa_future_scheduled_minor),
      currently_due_unconfirmed: money(group.sums.currently_due_unconfirmed_minor), paid: money(group.sums.confirmed_total_minor),
      outstanding: money(group.sums.total_unpaid_minor),
    })),
  };
}

// ---------------------------------------------------------------- get_travel_reports

function travelReports(owned: TripDoc[], summaries: Map<string, Summary>): Partial<TravelReportPayload> {
  const money100 = (value: number) => ({ units: BigInt(value), scale: 2 } as Dec);
  const markup = (trip: TripDoc): Dec | null => {
    const cost = dec(trip.data.wholesaleCost);
    if (cost === null || cmp(cost, ZERO) <= 0) return ZERO;
    const profit = dec(trip.data.profit);
    if (profit === null) return null;
    const quotient = pgDiv(profit, cost);
    return { units: quotient.units * 100n, scale: quotient.scale };
  };
  const group = <K extends string>(rows: TripDoc[], keyOf: (trip: TripDoc) => Record<K, string | null>) => {
    const groups = new Map<string, { key: Record<K, string | null>; rows: TripDoc[] }>();
    for (const trip of rows) {
      const key = keyOf(trip);
      const text = JSON.stringify(key);
      groups.set(text, { key, rows: [...(groups.get(text)?.rows ?? []), trip] });
    }
    return [...groups.values()];
  };
  const nullsLastText = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : textOrder(a, b));
  const sumOf = (rows: TripDoc[], field: string) => decNumber(pgSum(rows.map((trip) => dec(trip.data[field]))));
  const sumMinor = (rows: TripDoc[], field: keyof Summary) => decNumber(rows.length ? money100(rows.reduce((sum, trip) => sum + Number((summaries.get(trip.id) as Summary)[field]), 0)) : null);
  const clientKey = (trip: TripDoc) => pgTrim(String(trip.row.client_name)).toLowerCase();
  const clientCounts = new Map<string, number>();
  for (const trip of owned) clientCounts.set(clientKey(trip), (clientCounts.get(clientKey(trip)) ?? 0) + 1);
  const currencyOf = (trip: TripDoc) => (trip.row.currency as string | null) ?? null;

  const monthly = group(owned, (trip) => ({ month: `${String(trip.row.start_date).slice(0, 7)}-01`, currency: currencyOf(trip) }))
    .sort((a, b) => textOrder(a.key.month, b.key.month) || nullsLastText(a.key.currency, b.key.currency))
    .map(({ key, rows }) => ({
      month: key.month, currency: key.currency, trip_count: rows.length, sales: sumOf(rows, 'salePrice'), cost: sumOf(rows, 'wholesaleCost'),
      profit: sumOf(rows, 'profit'), paid: sumMinor(rows, 'confirmed_total_minor'), outstanding: sumMinor(rows, 'total_unpaid_minor'),
      average_markup: decNumber(pgAvg(rows.map(markup))),
    }));

  const destinations = group(owned, (trip) => ({ destination: String(trip.row.destination), currency: currencyOf(trip) }))
    .map(({ key, rows }) => ({
      profitDec: pgSum(rows.map((trip) => dec(trip.data.profit))),
      entry: {
        destination: key.destination, currency: key.currency, trip_count: rows.length, sales: sumOf(rows, 'salePrice'), profit: sumOf(rows, 'profit'),
        outstanding: sumMinor(rows, 'total_unpaid_minor'), average_markup: decNumber(pgAvg(rows.map(markup))),
        repeat_clients: new Set(rows.map(clientKey).filter((name) => (clientCounts.get(name) ?? 0) > 1)).size,
      },
    }))
    .sort((a, b) => (a.profitDec === null && b.profitDec === null ? 0 : a.profitDec === null ? -1 : b.profitDec === null ? 1 : -cmp(a.profitDec, b.profitDec))
      || textOrder(a.entry.destination, b.entry.destination) || nullsLastText(a.entry.currency, b.entry.currency))
    .map(({ entry }) => entry);

  const repeatClients = group(owned, (trip) => ({ client: clientKey(trip), currency: currencyOf(trip) }))
    .filter(({ rows }) => rows.length > 1)
    .map(({ key, rows }) => {
      const names = rows.map((trip) => String(trip.row.client_name)).sort(textOrder);
      const phones = rows.map((trip) => trip.row.client_phone as string | null).filter((phone): phone is string => phone !== null).sort(textOrder);
      const destinationsSorted = rows.map((trip) => String(trip.row.destination)).sort(textOrder);
      let mode: string | null = null; let modeCount = 0;
      for (let index = 0; index < destinationsSorted.length;) {
        let end = index;
        while (end < destinationsSorted.length && destinationsSorted[end] === destinationsSorted[index]) end += 1;
        if (end - index > modeCount) { mode = destinationsSorted[index]; modeCount = end - index; }
        index = end;
      }
      const startDates = rows.map((trip) => String(trip.row.start_date)).sort();
      return {
        client_key: key.client, client_name: names[names.length - 1], client_phone: phones.length ? phones[phones.length - 1] : null,
        currency: key.currency, trip_count: rows.length, last_trip_date: startDates[startDates.length - 1],
        sales: sumOf(rows, 'salePrice'), outstanding: sumMinor(rows, 'total_unpaid_minor'),
        average_trip_value: decNumber(pgAvg(rows.map((trip) => dec(trip.data.salePrice)))), common_destination: mode,
      };
    })
    .sort((a, b) => b.trip_count - a.trip_count || textOrder(a.client_key, b.client_key));

  const unpaid = owned.filter((trip) => (summaries.get(trip.id) as Summary).total_unpaid_minor > 0)
    .sort((a, b) => textOrder(a.row.start_date, b.row.start_date) || (a.id < b.id ? -1 : 1))
    .map((trip) => {
      const summary = summaries.get(trip.id) as Summary;
      const amount = (field: string) => money(BigInt(Number(summary[field] ?? 0)));
      return {
        id: trip.row.id, client_name: trip.row.client_name, destination: trip.row.destination, start_date: trip.row.start_date, currency: trip.row.currency,
        sale_price: decNumber(dec(trip.data.salePrice)), confirmed_cash: amount('cash_confirmed_minor'), confirmed_visa: amount('visa_confirmed_minor'),
        confirmed_received: amount('confirmed_total_minor'), total_unpaid: amount('total_unpaid_minor'),
        overdue_unconfirmed_visa: amount('visa_overdue_unconfirmed_minor'), future_scheduled_visa: amount('visa_future_scheduled_minor'),
        payment_method: trip.row.payment_method, payment_status: summary.derived_payment_status,
      };
    });

  const currencies = group(owned, (trip) => ({ currency: currencyOf(trip) }))
    .sort((a, b) => nullsLastText(a.key.currency, b.key.currency))
    .map(({ key, rows }) => ({
      currency: key.currency, trip_count: rows.length, sales: sumOf(rows, 'salePrice'), cost: sumOf(rows, 'wholesaleCost'), profit: sumOf(rows, 'profit'),
      paid: sumMinor(rows, 'confirmed_total_minor'), outstanding: sumMinor(rows, 'total_unpaid_minor'),
    }));

  const markupRow = (dimension: string, label: string, currency: string | null, rows: TripDoc[]) => {
    const values = rows.map(markup);
    return { dimension, label, currency, average_markup: decNumber(pgAvg(values)), minimum_markup: decNumber(pgMin(values)),
      maximum_markup: decNumber(pgMax(values)), trip_count: rows.length };
  };
  const markups = [
    ...group(owned, (trip) => ({ currency: currencyOf(trip) })).map(({ key, rows }) => markupRow('overall', 'all', key.currency, rows)),
    ...group(owned, (trip) => ({ destination: String(trip.row.destination), currency: currencyOf(trip) }))
      .map(({ key, rows }) => markupRow('destination', key.destination as string, key.currency, rows)),
    ...group(owned, (trip) => ({ type: (trip.row.trip_type as string | null) ?? 'unspecified', currency: currencyOf(trip) }))
      .map(({ key, rows }) => markupRow('trip_type', key.type as string, key.currency, rows)),
  ].sort((a, b) => textOrder(a.dimension, b.dimension) || textOrder(a.label, b.label) || nullsLastText(a.currency, b.currency));

  return {
    monthly, destinations, repeat_clients: repeatClients, unpaid, currencies, markups,
  } as unknown as Partial<TravelReportPayload>;
}
