import type { z } from 'zod';
import type { tripSchema, businessSchema, installmentSchema, eventSchema, auditEventSchema, metadataSchema, planSchema } from './schemas';
export type Trip = z.infer<typeof tripSchema>;
export type Business = z.infer<typeof businessSchema>;
export type Installment = z.infer<typeof installmentSchema>;
export type FinancialEvent = z.infer<typeof eventSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type PaymentPlan = z.infer<typeof planSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export type Cursor = { startDate: string; id: string; scope: string };
export type TripFilter = { status?: string; from?: string; to?: string; deleted?: boolean; pageSize?: number; cursor?: Cursor };
export type TripPage = { items: Trip[]; next?: Cursor };
export type Identity = { uid: string; email: string };
export type SaveTrip = { clientRequestId: string; trip: { id?: string; clientName: string; destination: string; startDate: string; endDate: string; currency: string; travelersCount: number; travelers?: Record<string, unknown>[]; salePriceMinor: number; wholesaleCostMinor: number; status?: string; notes?: string | null }; paymentPlan?: { method: 'cash'|'card'|'mixed'; currency?: string; cardTotalMinor: number; cashTotalMinor: number; confirmedCashMinor: number; installmentCount: number; firstDate?: string } | null };
export type PaymentCommand = { clientRequestId: string; tripId: string; currency: string; amount: string; installmentId?: string; expectedRevision?: number };
export interface AuthRepository { login(email: string, password: string): Promise<Identity>; logout(): Promise<void>; currentIdentity(): Promise<Identity | null>; refreshToken(): Promise<void> }
export interface BusinessRepository { getCurrentBusiness(): Promise<Business> }
export interface TripRepository { listTripsForBusiness(filter?: TripFilter): Promise<TripPage>; getTripDetails(id: string): Promise<Trip>; saveTrip(input: SaveTrip): Promise<{ id: string }>; setTripState(id: string, state: 'archive'|'restore'|'delete'|'unarchive', requestId: string): Promise<void> }
export interface TravelerRepository { listTravelers(tripId: string): Promise<Record<string, unknown>[]> }
export interface PaymentRepository { recordPayment(input: PaymentCommand): Promise<unknown> }
export interface PaymentPlanRepository { getPaymentPlans(tripId: string): Promise<PaymentPlan[]> }
export interface InstallmentRepository { listInstallments(tripId: string): Promise<Installment[]>; listDueInstallments(through: string): Promise<Installment[]>; recordInstallmentPayment(input: PaymentCommand & { installmentId: string }): Promise<unknown> }
export interface FinancialEventRepository { listFinancialEvents(tripId: string): Promise<FinancialEvent[]> }
export interface DocumentRepository { listDocuments(tripId: string): Promise<Metadata[]> }
export interface AttachmentRepository { listAttachments(tripId: string): Promise<Metadata[]> }
export interface AuditRepository { listAuditHistory(tripId: string): Promise<AuditEvent[]> }
export interface AnalyticsRepository { getTravelAnalytics(): Promise<unknown> }
export interface StorageRepository { readPrivateFile(path: string): Promise<Blob>; uploadPrivateFile(path: string, file: Blob): Promise<string> }
export type TravelRepositories = BusinessRepository & TripRepository & TravelerRepository & PaymentRepository & PaymentPlanRepository & InstallmentRepository & FinancialEventRepository & DocumentRepository & AttachmentRepository & AuditRepository & AnalyticsRepository;
