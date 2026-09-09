/**
 * Runtime schemas for Firestore documents and function inputs.
 *
 * Firestore is schemaless. The application must not be: an unvalidated field is
 * where the next piece of authorization state hides, and an unvalidated amount
 * is where a float gets in. These schemas are enforced on function INPUT, on
 * migration OUTPUT, and on defensive reads.
 *
 * Built on zod, which the application already uses (`src/lib/schemas.ts`), so
 * there is one validation stack rather than two.
 */

import { z } from 'zod';
import { INT64_MAX, INT64_MIN } from './exact-decimal.mjs';

export const SCHEMA_VERSION = 1;

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'must be a UUID');
/** A Firebase UID. Migrated identities keep the Supabase UUID, but Firebase
 *  UIDs are not UUIDs in general, so the shape is deliberately permissive. */
const UID = z.string().min(1).max(128);
const CURRENCY = z.string().regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code');
const DATE_ONLY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const INTEGER_TEXT = z.string().regex(/^-?\d+$/, 'must be an integer in text form');

/**
 * The stored shape of an exact amount.
 *
 * `unitsText` is authoritative; `units` is a convenience that must agree with
 * it when present. A plain number is rejected outright — accepting one is how a
 * float re-enters a system that spent this much effort keeping them out.
 */
export const ExactAmount = z.object({
  unitsText: INTEGER_TEXT,
  scale: z.number().int().min(0).max(32),
  units: z.number().int().nullable().optional(),
  decimal: z.string().optional(),
  currency: CURRENCY.optional(),
  exceedsInt64: z.literal(true).optional(),
  isoScale: z.number().int().optional(),
  isoScaleMismatch: z.literal(true).optional(),
}).refine((v) => v.units === null || v.units === undefined
  || (Number.isSafeInteger(v.units) && BigInt(v.units) === BigInt(v.unitsText)),
{ message: 'units must equal unitsText', path: ['units'] });

/** A BIGINT minor-unit amount, bounded by int64 as the source column is. */
export const MinorUnits = z.number().int()
  .refine((v) => BigInt(v) <= INT64_MAX && BigInt(v) >= INT64_MIN,
    'minor units must fit in a signed 64-bit integer');

const Timestampish = z.object({
  seconds: z.number().int().optional(),
  _seconds: z.number().int().optional(),
  nanoseconds: z.number().int().optional(),
  _nanoseconds: z.number().int().optional(),
}).passthrough();

const base = {
  schemaVersion: z.number().int().min(1),
  transformVersion: z.number().int().min(1).optional(),
  ownerUid: UID.nullable(),
  isDeleted: z.boolean(),
};

export const UserDocument = z.object({
  ...base,
  uid: UID,
  userId: UID,
  legacyProfileId: UUID.nullable().optional(),
  fullName: z.string(),
  phoneNumber: z.string().nullable().optional(),
  role: z.enum(['user', 'staff', 'owner', 'admin']),
  isSuspended: z.boolean(),
  canViewFinancials: z.boolean(),
  businessId: UUID.nullable(),
}).passthrough()
  // The document id is the identity. If uid and userId disagree, the document
  // has two answers to "whose is this", which is not a state to tolerate.
  .refine((v) => v.uid === v.userId, { message: 'uid and userId must match', path: ['uid'] });

export const BusinessDocument = z.object({
  ...base,
  id: UUID,
  businessId: UUID,
  userId: UID,
  businessName: z.string(),
  preferredCurrency: CURRENCY,
  preferredLanguage: z.string(),
  logoUrl: z.string().nullable().optional(),
  signatureUrl: z.string().nullable().optional(),
  isSuspended: z.boolean().nullable(),
}).passthrough();

export const TripDocument = z.object({
  ...base,
  id: UUID,
  userId: UID,
  businessId: UUID.nullable(),
  clientName: z.string(),
  destination: z.string(),
  travelersCount: z.number().int().min(0),
  startDate: DATE_ONLY,
  endDate: DATE_ONLY,
  currency: CURRENCY.nullable(),
  wholesaleCost: ExactAmount,
  salePrice: ExactAmount,
  amountPaid: ExactAmount,
  status: z.string(),
  paymentStatus: z.string(),
  createdAt: Timestampish,
  createdAtMicros: INTEGER_TEXT,
  deletedAt: Timestampish.nullable(),
}).passthrough()
  .refine((v) => v.isDeleted === (v.deletedAt !== null && v.deletedAt !== undefined),
    { message: 'isDeleted must agree with deletedAt', path: ['isDeleted'] });

export const PaymentPlanDocument = z.object({
  ...base,
  id: UUID,
  tripId: UUID,
  userId: UID,
  paymentMethod: z.enum(['card', 'cash', 'mixed']),
  currency: CURRENCY,
  cardTotalMinor: MinorUnits,
  cashTotalMinor: MinorUnits,
  cardPaidMinor: MinorUnits,
  cashPaidMinor: MinorUnits,
  installmentCount: z.number().int().min(0).max(120),
  status: z.string(),
  source: z.string(),
}).passthrough();

export const InstallmentDocument = z.object({
  ...base,
  id: UUID,
  paymentPlanId: UUID,
  tripId: UUID,
  userId: UID,
  installmentNumber: z.number().int().min(1),
  dueDate: DATE_ONLY,
  expectedAmountMinor: MinorUnits,
  paidAmountMinor: MinorUnits,
  status: z.string(),
}).passthrough();

const eventDocument = z.object({
  ...base,
  id: z.number().int(),
  tripId: UUID,
  userId: UID,
  sequence: z.number().int(),
  createdAt: Timestampish,
  createdAtMicros: INTEGER_TEXT,
}).passthrough();

export const PaymentEventDocument = eventDocument;
export const InstallmentEventDocument = eventDocument;

export const FinancialAuditDocument = z.object({
  ...base,
  id: z.number().int(),
  tripId: UUID,
  userId: UID,
  sequence: z.number().int(),
  changedField: z.string(),
  operationType: z.string(),
}).passthrough();

export const ActivityLogDocument = z.object({
  ...base,
  id: z.number().int(),
  userId: UID,
  sequence: z.number().int(),
  activityType: z.string(),
}).passthrough();

export const IdempotencyDocument = z.object({
  ...base,
  userId: UID,
  clientRequestId: UUID,
  responsePayload: z.unknown(),
}).passthrough();

export const DOCUMENT_SCHEMAS = {
  users: UserDocument,
  businesses: BusinessDocument,
  trips: TripDocument,
  tripPaymentPlans: PaymentPlanDocument,
  tripInstallments: InstallmentDocument,
  tripPaymentEvents: PaymentEventDocument,
  tripInstallmentEvents: InstallmentEventDocument,
  tripFinancialAudit: FinancialAuditDocument,
  tripActivityLog: ActivityLogDocument,
  idempotency: IdempotencyDocument,
};

// ---------------------------------------------------------------------------
// Function input
// ---------------------------------------------------------------------------

/**
 * Input to saveTripTransaction.
 *
 * Note what is NOT here: no userId, no ownerUid, no amountPaid, no profit, no
 * balance. The caller states what it wants done; the server decides who is
 * asking and what the totals become. A `userId` field in this schema would be
 * an invitation to trust the caller's claim about its own identity.
 */
export const SaveTripInput = z.object({
  clientRequestId: UUID,
  trip: z.object({
    id: UUID.optional(),
    clientName: z.string().min(1).max(300),
    destination: z.string().min(1).max(300),
    startDate: DATE_ONLY,
    endDate: DATE_ONLY,
    currency: CURRENCY,
    travelersCount: z.number().int().min(0).max(1000),
    salePriceMinor: MinorUnits.refine((v) => v >= 0, 'sale price must not be negative'),
    wholesaleCostMinor: MinorUnits.refine((v) => v >= 0, 'wholesale cost must not be negative'),
    status: z.string().max(50).optional(),
    notes: z.string().max(5000).nullable().optional(),
    serviceType: z.string().max(50).optional(),
    travelers: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
  }).strict(),
  paymentPlan: z.object({
    method: z.enum(['card', 'cash', 'mixed']),
    currency: CURRENCY.optional(),
    cardTotalMinor: MinorUnits.refine((v) => v >= 0, 'must not be negative'),
    cashTotalMinor: MinorUnits.refine((v) => v >= 0, 'must not be negative'),
    confirmedCashMinor: MinorUnits.refine((v) => v >= 0, 'must not be negative'),
    installmentCount: z.number().int().min(0).max(120),
    firstDate: DATE_ONLY.optional(),
  }).strict().nullable().optional(),
}).strict();

/** Validate, returning a machine-readable failure rather than throwing raw zod. */
export function validate(schema, value, code) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const error = new Error(code);
  error.code = code;
  // Field paths and messages only. Values are not echoed: an input that failed
  // validation is exactly the kind of thing that might contain a passport
  // number or a token, and errors travel further than payloads do.
  error.issues = result.error.issues.map((i) => ({
    path: i.path.join('.'), message: i.message, kind: i.code }));
  throw error;
}
