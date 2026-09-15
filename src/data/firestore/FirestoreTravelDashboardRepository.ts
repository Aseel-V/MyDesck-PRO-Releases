import { collection, getDocs, limit, query, where, type DocumentData } from 'firebase/firestore';
import type { Trip } from '../../types/trip';
import type { TravelDashboardRepository } from '../domain/travelDashboard';
import { decodeRow } from './documentCodec';
import { readStoredDecimal, scaledToDecimalText } from './exactValues';
import type { FirebaseSession } from './FirebaseSession';
import {
  businessToday, tripPaymentPlanSummary, type SummaryInstallmentRow, type SummaryPlanRow,
} from './tripPaymentPlanSummary';

/** get_trip_years has no bound; reading every live trip is bounded here and fails loudly past it. */
export const TRIP_YEARS_SCAN_BOUND = 5000;
/** The dashboard fallback query's limit. */
export const DASHBOARD_TRIPS_BOUND = 2000;
const IN_QUERY_CHUNK = 30;

type Row = Record<string, unknown>;
const read = (snapshot: { data(options?: { serverTimestamps?: 'estimate' }): DocumentData | undefined }) =>
  snapshot.data({ serverTimestamps: 'estimate' }) ?? {};
const chunks = <T>(values: T[], size: number): T[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));
const effectiveYear = (data: DocumentData) => String(data.paymentDate ?? data.startDate ?? '').slice(0, 4);

/** greatest(sale_price - amount_paid, 0), exact, as the JSON number PostgREST yields. */
function amountDue(salePrice: unknown, amountPaid: unknown): number | null {
  if (salePrice === null || salePrice === undefined || amountPaid === null || amountPaid === undefined) return null;
  const sale = readStoredDecimal(salePrice);
  const paid = readStoredDecimal(amountPaid);
  const scale = Math.max(sale.scale, paid.scale);
  const units = sale.units * 10n ** BigInt(scale - sale.scale) - paid.units * 10n ** BigInt(scale - paid.scale);
  return Number(scaledToDecimalText(units > 0n ? units : 0n, scale));
}

/**
 * The travel dashboard on Firestore: trips/{id}, tripPaymentPlans/{id} and tripInstallments/{id}, read with the
 * owner and business constraints the Rules require of every list.
 *
 * get_trip_dashboard_items selects trips whose coalesce(payment_date, start_date) falls in the year. Firestore
 * cannot query that expression, so the year's trips are the union of a start_date range and a payment_date range,
 * and the exact predicate is applied to the union.
 */
export class FirestoreTravelDashboardRepository implements TravelDashboardRepository {
  constructor(private readonly session: FirebaseSession) {}

  private async owner() {
    const uid = await this.session.requireUid();
    const business = await this.session.ownedBusiness(uid);
    return business ? { uid, businessId: business.businessId } : null;
  }

  private liveTrips(uid: string, businessId: string) {
    return [where('ownerUid', '==', uid), where('businessId', '==', businessId), where('isDeleted', '==', false)];
  }

  async listTripYears(): Promise<string[]> {
    const owner = await this.owner();
    if (!owner) return [];
    const rows = await getDocs(query(collection(this.session.db, 'trips'), ...this.liveTrips(owner.uid, owner.businessId),
      limit(TRIP_YEARS_SCAN_BOUND + 1)));
    if (rows.size > TRIP_YEARS_SCAN_BOUND) throw new Error('TRIP_YEARS_SUMMARY_REQUIRED');
    const years = new Set(rows.docs.map((snapshot) => snapshot.data()).filter((data) => data.userId === owner.uid).map(effectiveYear));
    years.delete('');
    return [...years].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }

  async listDashboardTrips(year: string): Promise<Trip[]> {
    const owner = await this.owner();
    if (!owner || !/^\d{4}$/.test(year)) return [];
    const { uid, businessId } = owner;
    const trips = collection(this.session.db, 'trips');
    const start = `${year}-01-01`;
    const end = `${Number(year) + 1}-01-01`;
    const [byStart, byPayment] = await Promise.all([
      getDocs(query(trips, ...this.liveTrips(uid, businessId), where('startDate', '>=', start), where('startDate', '<', end), limit(DASHBOARD_TRIPS_BOUND))),
      getDocs(query(trips, ...this.liveTrips(uid, businessId), where('paymentDate', '>=', start), where('paymentDate', '<', end), limit(DASHBOARD_TRIPS_BOUND))),
    ]);
    if (byStart.size >= DASHBOARD_TRIPS_BOUND || byPayment.size >= DASHBOARD_TRIPS_BOUND) throw new Error('TRAVEL_DASHBOARD_BOUND_EXCEEDED');
    const selected = new Map<string, DocumentData>();
    for (const snapshot of [...byStart.docs, ...byPayment.docs]) {
      const data = read(snapshot);
      if (data.userId === uid && effectiveYear(data) === year) selected.set(snapshot.id, data);
    }

    const plans: SummaryPlanRow[] = [];
    const installments: SummaryInstallmentRow[] = [];
    for (const ids of chunks([...selected.keys()], IN_QUERY_CHUNK)) {
      const [planDocs, installmentDocs] = await Promise.all([
        getDocs(query(collection(this.session.db, 'tripPaymentPlans'), where('ownerUid', '==', uid), where('businessId', '==', businessId), where('tripId', 'in', ids))),
        getDocs(query(collection(this.session.db, 'tripInstallments'), where('ownerUid', '==', uid), where('businessId', '==', businessId), where('tripId', 'in', ids))),
      ]);
      plans.push(...planDocs.docs.map((snapshot) => decodeRow<SummaryPlanRow & { trip_id: string }>('trip_payment_plans', read(snapshot))));
      installments.push(...installmentDocs.docs.map((snapshot) => decodeRow<SummaryInstallmentRow>('trip_installments', read(snapshot))));
    }

    const today = businessToday();
    const items = [...selected.values()].map((data) => {
      const row = decodeRow<Row>('trips', data);
      const tripPlans = plans.filter((plan) => (plan as unknown as { trip_id: string }).trip_id === row.id);
      const planIds = new Set(tripPlans.map((plan) => plan.id));
      return {
        created: data.createdAtMicros ? BigInt(String(data.createdAtMicros)) : null,
        item: {
          id: row.id, user_id: row.user_id, destination: row.destination, client_name: row.client_name,
          travelers_count: row.travelers_count, start_date: row.start_date, end_date: row.end_date, currency: row.currency,
          exchange_rate: row.exchange_rate, wholesale_cost: row.wholesale_cost, sale_price: row.sale_price, profit: row.profit,
          profit_percentage: row.profit_percentage, payment_date: row.payment_date, payment_status: row.payment_status,
          amount_paid: row.amount_paid, amount_due: amountDue(data.salePrice, data.amountPaid), payment_method: row.payment_method,
          card_paid_amount: row.card_paid_amount, cash_paid_amount: row.cash_paid_amount,
          payment_plan_summary: tripPaymentPlanSummary(uid, {
            salePrice: data.salePrice, amountPaid: data.amountPaid, cardPaidAmount: data.cardPaidAmount, cashPaidAmount: data.cashPaidAmount,
            paymentMethod: (row.payment_method as string | null) ?? null, currency: (row.currency as string | null) ?? null,
          }, tripPlans, installments.filter((installment) => planIds.has(installment.payment_plan_id)), today),
          status: row.status, export_to_pdf: row.export_to_pdf, service_type: row.service_type,
          created_at: row.created_at, updated_at: row.updated_at,
        },
      };
    });
    // ORDER BY created_at DESC: NULLs first in PostgreSQL. Trips created at the same instant have no defined order
    // there; the id only makes this order deterministic.
    items.sort((a, b) => (a.created === b.created ? String(a.item.id).localeCompare(String(b.item.id))
      : a.created === null ? -1 : b.created === null ? 1 : a.created > b.created ? -1 : 1));
    return items.map(({ item }) => ({ ...item, travelers: [], itinerary: [], payments: [], attachments: [], notes: '' }) as unknown as Trip);
  }
}
