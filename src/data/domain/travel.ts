/**
 * Every tourism capability the product UI uses besides the travel dashboard reads.
 *
 * Results keep the shapes the source database functions and PostgREST queries return, so the screens and the
 * library normalisers (tripQueries, analyticsQueries, travelReports, visaPaymentArrivals) are unchanged. Money stays
 * in the source's representations: NUMERIC trip columns as JSON numbers, ledger amounts in integer minor units.
 */
import type { Json } from '../../types/database';
import type { ItineraryItem, Trip, TripFormData } from '../../types/trip';
import type { TripPageInput, TripPageResult } from '../../lib/tripQueries';
import type { DeletedTripsPage } from '../../lib/tripTrashQueries';
import type { TripActivityEntry, TripFinancialAuditEntry } from '../../lib/tripAuditQueries';
import type { TripInstallment, TripInstallmentEvent, TripPaymentPlan } from '../../lib/tripPayments';
import type { TripNotification, TripNotificationSettings } from '../../lib/tripNotifications';
import type { TripTemplate, TripTemplateData, TripTemplateType } from '../../lib/tripTemplates';
import type { TripWhatsappTemplate } from '../../lib/tripWhatsapp';
import type { TravelReportPayload } from '../../lib/travelReports';
import type { Language } from '../../types/language';

export interface TripSaveResult { id: string; client_name: string; destination: string; updated_at: string }
export interface AuditPage<T> { items: T[]; total_count: number }
export interface ExistingClientRow { client_name: string; client_phone: string | null }
export interface TripCleanupJob {
  id: number; trip_id: string; status: string; attempts: number; last_error: string | null; next_retry_at: string | null; created_at: string;
}
export interface VisaArrivalRow { id: string; trip_id: string | null; params: Json; created_at: string; scheduled_for: string }
export interface TravelAnalyticsArgs {
  p_year: string | null; p_month: number | null; p_trip_status: string | null; p_payment_status: string | null;
  p_destination: string | null; p_start_date: string | null; p_end_date: string | null;
}
export interface TravelReportsInput { startDate: string; endDate: string; currency?: string; destination?: string; includeArchived?: boolean }
export interface NewPaymentPlanInput {
  tripId: string; method: 'card' | 'cash' | 'mixed'; currency: string;
  cardTotalMinor: number; cashTotalMinor: number; installmentCount: number; firstDate: string; notes?: string;
}
export interface TripTemplateInput { id?: string; name: string; description?: string; data: TripTemplateData; templateType?: TripTemplateType }
export type WhatsappTemplateInput = Pick<TripWhatsappTemplate, 'name' | 'body' | 'language' | 'category'> & { id?: string };
export interface ServerPdfRequest { tripId: string; language: Language; includeSensitive?: boolean }

export interface TravelRepository {
  // ---- trips: commands (save_trip_transaction and the trip row updates of the screens)
  saveTrip(userId: string, formData: TripFormData, editTripId?: string, clientRequestId?: string): Promise<TripSaveResult>;
  restoreTrip(userId: string, id: string): Promise<string>;
  deleteTrip(userId: string, id: string): Promise<string>;
  archiveTrip(userId: string, id: string, archived: boolean): Promise<void>;
  toggleExport(userId: string, id: string, value: boolean): Promise<void>;
  /** TripSmartToolsDialog: itinerary replacement. */
  updateTripItinerary(tripId: string, itinerary: ItineraryItem[]): Promise<void>;
  /** TripWhatsappDialog: stores the normalised phone; PHONE_UPDATE_FAILED when no owned row changed. */
  updateTripClientPhone(userId: string, tripId: string, phone: string): Promise<void>;
  /** Settings import: one insert per backed-up trip. */
  importTrip(userId: string, tripData: Record<string, unknown>): Promise<void>;

  // ---- trips: reads
  getTripsPage(input: TripPageInput): Promise<TripPageResult>;
  /** get_trip_details as returned (travelers not yet stripped), or null when the owner has no such live trip. */
  getTripDetails(tripId: string): Promise<unknown | null>;
  findLatestTripIdForClient(clientName: string, clientPhone?: string): Promise<string | null>;
  /** CommandPalette: every owned trip, start_date descending. */
  searchTrips(userId: string): Promise<Trip[]>;
  /** NewTripForm: client_name, client_phone of live trips, created_at descending, 1000 rows. */
  listClientRows(userId: string): Promise<ExistingClientRow[]>;
  /** Settings export: every owned trip. */
  exportTrips(userId: string): Promise<unknown[]>;
  /** Development-only comparison of the three payment-summary reads of one trip. */
  logPaymentContractComparison(tripId: string, year: string): Promise<void>;

  // ---- trash
  getDeletedTripsPage(page: number, search: string, pageSize: number): Promise<DeletedTripsPage>;
  restoreDeletedTrips(ids: string[]): Promise<number>;
  permanentlyDeleteTrips(ids: string[]): Promise<number>;
  retryAttachmentCleanup(jobId: number): Promise<void>;
  listFailedCleanupJobs(): Promise<TripCleanupJob[]>;

  // ---- activity and audit
  getTripActivityPage(tripId: string, page: number): Promise<AuditPage<TripActivityEntry>>;
  getTripFinancialAuditPage(tripId: string, page: number): Promise<AuditPage<TripFinancialAuditEntry>>;
  /** log_trip_activity; throws when the source function refuses. */
  logTripActivity(tripId: string, activityType: string, metadata: Record<string, unknown>): Promise<void>;

  // ---- payments
  getTripPaymentPlan(tripId: string): Promise<{ plan: TripPaymentPlan | null; installments: TripInstallment[] }>;
  createTripPaymentPlan(input: NewPaymentPlanInput): Promise<string>;
  recordInstallmentPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void>;
  rescheduleInstallment(id: string, dueDate: string): Promise<void>;
  recordCashPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void>;
  recalculateFutureInstallments(id: string, cardTotalMinor: number): Promise<void>;
  listInstallmentEvents(id: string): Promise<TripInstallmentEvent[]>;
  /** get_travel_payment_contract_version, as the probe consumes it. */
  probePaymentContractVersion(): Promise<{ data: number | null; error: unknown }>;

  // ---- notifications
  listTripNotifications(): Promise<TripNotification[]>;
  markAllTripNotificationsRead(): Promise<void>;
  snoozeTripNotification(id: string, until: string): Promise<void>;
  dismissTripNotification(id: string): Promise<void>;
  clearCompletedTripNotifications(): Promise<void>;
  markTripNotificationRead(id: string): Promise<void>;
  getTripNotificationSettings(userId: string): Promise<TripNotificationSettings | null>;
  saveTripNotificationSettings(userId: string, settings: TripNotificationSettings): Promise<void>;
  /** materialize_due_visa_progress_events, then the unseen visa_schedule_collected notifications (100, newest first). */
  listUnseenVisaArrivalRows(): Promise<VisaArrivalRow[]>;

  // ---- templates
  listTripTemplates(search: string, type: TripTemplateType | undefined, includeArchived: boolean): Promise<TripTemplate[]>;
  getTripTemplate(id: string): Promise<TripTemplate>;
  saveTripTemplate(userId: string, value: TripTemplateInput): Promise<void>;
  toggleTripTemplateFavorite(id: string, isFavorite: boolean): Promise<void>;
  recordTripTemplateUse(id: string): Promise<void>;
  updateTripTemplateStatus(id: string, status: 'active' | 'archived'): Promise<void>;
  softDeleteTripTemplate(id: string): Promise<void>;

  // ---- WhatsApp templates
  listWhatsappTemplates(): Promise<TripWhatsappTemplate[]>;
  saveWhatsappTemplate(userId: string, template: WhatsappTemplateInput): Promise<void>;
  updateWhatsappTemplateState(id: string, values: { is_favorite?: boolean; is_archived?: boolean }): Promise<void>;
  markWhatsappTemplateUsed(id: string, usageCount: number): Promise<void>;
  deleteWhatsappTemplate(id: string): Promise<void>;

  // ---- packing lists
  createPackingList(userId: string, tripId: string, name: string, items: Array<{ category: string; label: string; checked: boolean }>): Promise<void>;

  // ---- analytics and reports
  getTravelAnalytics(args: TravelAnalyticsArgs): Promise<{ summary: unknown; payment: unknown }>;
  getTravelReports(input: TravelReportsInput): Promise<Partial<TravelReportPayload>>;

  // ---- PDF
  /** The server renderer; throws when unavailable so the caller uses the browser renderer. */
  generateServerTripPdf(request: ServerPdfRequest): Promise<Uint8Array>;
  /** After a server-rendered PDF: activity pdf_generated and the pdf_export_completion notification (errors ignored). */
  recordServerPdfGenerated(tripId: string): void;
}
