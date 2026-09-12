/**
 * Entity definitions for the milestone-1 Firestore model.
 *
 * Each entry says, for one source table: where its rows land, what the document
 * id is, which security and denormalised fields are added, and which references
 * must resolve. The migrator, the reconciler and the orphan checker all read
 * this one declaration, so a target path cannot drift between writing and
 * verifying.
 *
 * Document ids are DERIVED FROM THE SOURCE PRIMARY KEY, never generated. A
 * Firestore auto-id would break the source-to-target ledger and make a rerun
 * produce duplicates instead of converging.
 */

import { SCHEMA_VERSION, TRANSFORM_VERSION } from './table-map.mjs';
import { decimalStringToScaledInteger } from './exact-decimal.mjs';

export { SCHEMA_VERSION, TRANSFORM_VERSION };

/**
 * Denormalised copies carried on migrated documents.
 *
 * Every one of these is a DERIVED COPY of a value whose CANONICAL SOURCE is
 * named below. They exist because Firestore rules cannot join, so the tenant
 * that owns a document has to be readable on the document itself.
 *
 *   ownerUid    canonical source: the row's user_id column (= Firebase UID)
 *               update mechanism: immutable; ownership transfer is not a
 *               supported operation, and rules forbid changing it
 *               stale detection: reconciliation level 6 compares every
 *               document's ownerUid against the source row's user_id
 *
 *   businessId  canonical source: business_profiles.id for the owner
 *               update mechanism: server-side only, on business reassignment
 *               stale detection: relationship reconciliation resolves it
 *
 *   isDeleted   canonical source: deleted_at IS NOT NULL on the same document
 *               update mechanism: written in the same write as deletedAt
 *               stale detection: an invariant check asserts the two agree
 *
 *   sequence    canonical source: the source BIGINT identity primary key
 *               update mechanism: immutable, set once at migration
 *               stale detection: event-order reconciliation
 */
export const DENORMALIZED_FIELDS = ['ownerUid', 'businessId', 'isDeleted', 'sequence'];

const bigintDocId = (value) => {
  // BIGINT identity keys become zero-padded ids so lexical document order
  // matches numeric order. Firestore orders document ids as strings, and
  // "10" sorting before "9" is exactly how event history gets silently
  // reordered. `sequence` remains the field queries actually order by.
  const text = String(value);
  if (!/^\d+$/.test(text)) throw new Error(`NON_NUMERIC_IDENTITY_KEY: ${text}`);
  if (text.length > 19) throw new Error(`IDENTITY_KEY_TOO_LARGE: ${text}`);
  return text.padStart(19, '0');
};

const common = (row) => ({
  schemaVersion: SCHEMA_VERSION,
  transformVersion: TRANSFORM_VERSION,
  ownerUid: row.user_id,
  isDeleted: row.deleted_at !== null && row.deleted_at !== undefined,
});

const minor = (value, field) => {
  const units = decimalStringToScaledInteger(String(value ?? '0'), 2);
  if (units > BigInt(Number.MAX_SAFE_INTEGER) || units < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`SPARK_TRANSACTIONAL_MONEY_OUT_OF_RANGE: ${field}`);
  }
  return Number(units);
};

export const ENTITIES = {
  user_profiles: {
    collection: 'users',
    // The Firebase UID is the document id, so the identity a document belongs
    // to is the identity you look it up by. The surrogate `id` is kept as
    // legacyProfileId so the source primary key is not lost.
    docId: (row) => row.user_id,
    sourcePrimaryKey: ['id'],
    extra: (row) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      uid: row.user_id,
      legacyProfileId: row.id,
      ownerUid: row.user_id,
      isDeleted: false,
    }),
    references: [{ field: 'business_id', collection: 'businesses', required: false }],
    ownerField: 'user_id',
  },

  business_profiles: {
    collection: 'businesses',
    docId: (row) => row.id,
    sourcePrimaryKey: ['id'],
    extra: (row) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      ownerUid: row.user_id,
      businessId: row.id,
      isDeleted: false,
    }),
    references: [],
    ownerField: 'user_id',
  },

  business_settings: {
    // Its business_id foreign key points at auth.users, so the column holds a
    // USER id. The settings document is filed under the business that user
    // owns, and the quirk is recorded on the document rather than corrected.
    collection: 'businessSettings',
    docId: (row) => row.id,
    sourcePrimaryKey: ['id'],
    extra: (row, ctx) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      ownerUid: row.business_id,
      businessId: ctx.businessByOwner.get(row.business_id) ?? null,
      isDeleted: false,
      sourceQuirk: 'business_id references auth.users, not business_profiles',
    }),
    references: [{ field: 'business_id', collection: 'users', required: true }],
    ownerField: 'business_id',
  },

  audit_logs: {
    collection: 'auditEvents',
    docId: (row) => bigintDocId(row.id),
    sourcePrimaryKey: ['id'],
    appendOnly: true,
    extra: (row, ctx) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      businessId: row.business_id,
      ownerUid: ctx.ownerByBusiness.get(row.business_id) ?? null,
      sequence: Number(row.id),
      isDeleted: false,
    }),
    references: [{ field: 'business_id', collection: 'businesses', required: true }],
    ownerField: null,
    ordering: { parentField: 'business_id', sequenceField: 'sequence' },
  },

  trips: {
    collection: 'trips',
    docId: (row) => row.id,
    sourcePrimaryKey: ['id'],
    extra: (row, ctx) => ({
      ...common(row),
      businessId: ctx.businessByOwner.get(row.user_id) ?? null,
      moneyScale: 2,
      salePriceMinor: minor(row.sale_price, 'trips.sale_price'),
      wholesaleCostMinor: minor(row.wholesale_cost, 'trips.wholesale_cost'),
      amountPaidMinor: minor(row.amount_paid, 'trips.amount_paid'),
      amountDueMinor: minor(row.amount_due, 'trips.amount_due'),
      profitMinor: minor(row.profit, 'trips.profit'),
      revision: 0,
    }),
    references: [{ field: 'deleted_by', collection: 'users', required: false }],
    ownerField: 'user_id',
  },

  trip_payment_plans: {
    collection: 'tripPaymentPlans',
    docId: (row) => row.id,
    sourcePrimaryKey: ['id'],
    extra: (row, ctx) => ({
      ...common(row),
      businessId: ctx.businessByOwner.get(row.user_id) ?? null,
    }),
    references: [{ field: 'trip_id', collection: 'trips', required: true }],
    ownerField: 'user_id',
  },

  trip_installments: {
    collection: 'tripInstallments',
    docId: (row) => row.id,
    sourcePrimaryKey: ['id'],
    extra: (row, ctx) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      ownerUid: row.user_id,
      businessId: ctx.businessByOwner.get(row.user_id) ?? null,
      isDeleted: false,
    }),
    references: [
      { field: 'trip_id', collection: 'trips', required: true },
      { field: 'payment_plan_id', collection: 'tripPaymentPlans', required: true },
    ],
    ownerField: 'user_id',
  },

  trip_payment_events: {
    collection: 'tripPaymentEvents',
    docId: (row) => bigintDocId(row.id),
    sourcePrimaryKey: ['id'],
    appendOnly: true,
    extra: (row, ctx) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      ownerUid: row.user_id,
      businessId: ctx.businessByOwner.get(row.user_id) ?? null,
      sequence: Number(row.id),
      isDeleted: false,
    }),
    references: [
      { field: 'trip_id', collection: 'trips', required: true },
      { field: 'payment_plan_id', collection: 'tripPaymentPlans', required: true },
    ],
    ownerField: 'user_id',
    ordering: { parentField: 'payment_plan_id', sequenceField: 'sequence' },
  },

  trip_installment_events: {
    collection: 'tripInstallmentEvents',
    docId: (row) => bigintDocId(row.id),
    sourcePrimaryKey: ['id'],
    appendOnly: true,
    extra: (row, ctx) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      ownerUid: row.user_id,
      businessId: ctx.businessByOwner.get(row.user_id) ?? null,
      sequence: Number(row.id),
      isDeleted: false,
    }),
    references: [
      { field: 'trip_id', collection: 'trips', required: true },
      { field: 'installment_id', collection: 'tripInstallments', required: true },
    ],
    ownerField: 'user_id',
    ordering: { parentField: 'installment_id', sequenceField: 'sequence' },
  },

  trip_financial_audit: {
    collection: 'tripFinancialAudit',
    docId: (row) => bigintDocId(row.id),
    sourcePrimaryKey: ['id'],
    appendOnly: true,
    extra: (row, ctx) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      ownerUid: row.user_id,
      businessId: ctx.businessByOwner.get(row.user_id) ?? null,
      sequence: Number(row.id),
      isDeleted: false,
    }),
    references: [{ field: 'trip_id', collection: 'trips', required: true }],
    ownerField: 'user_id',
    ordering: { parentField: 'trip_id', sequenceField: 'sequence' },
  },

  trip_activity_log: {
    collection: 'tripActivityLog',
    docId: (row) => bigintDocId(row.id),
    sourcePrimaryKey: ['id'],
    appendOnly: true,
    extra: (row, ctx) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      ownerUid: row.user_id,
      businessId: ctx.businessByOwner.get(row.user_id) ?? null,
      sequence: Number(row.id),
      isDeleted: false,
    }),
    // The source has NO foreign key from trip_activity_log.trip_id to trips,
    // so the reference is checked here rather than assumed to be sound. It is
    // declared required: any activity row pointing at a missing trip is a
    // finding, not something to quietly tolerate.
    references: [{ field: 'trip_id', collection: 'trips', required: true,
      note: 'no foreign key in source; validated by migration' }],
    ownerField: 'user_id',
    ordering: { parentField: 'trip_id', sequenceField: 'sequence' },
  },

  trip_write_requests: {
    collection: 'idempotency',
    // Composite source key (user_id, client_request_id) becomes a deterministic
    // composite id, so a replayed request looks up its own prior result.
    docId: (row) => `${row.user_id}__${row.client_request_id}`,
    sourcePrimaryKey: ['user_id', 'client_request_id'],
    serverOnly: true,
    extra: (row) => ({
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      ownerUid: row.user_id,
      isDeleted: false,
    }),
    references: [{ field: 'trip_id', collection: 'trips', required: false }],
    ownerField: 'user_id',
  },
};

export const ENTITY_ORDER = [
  // Parents before children, so a reference check during migration can be
  // meaningful rather than deferred to the end.
  'user_profiles', 'business_profiles', 'business_settings', 'trips',
  'trip_payment_plans', 'trip_installments', 'trip_payment_events',
  'trip_installment_events', 'trip_financial_audit', 'trip_activity_log',
  'trip_write_requests', 'audit_logs',
];

/** Money fields whose exact totals reconciliation must prove, per collection. */
export const FINANCIAL_FIELDS = {
  trips: ['wholesaleCost', 'salePrice', 'profit', 'profitPercentage', 'amountPaid',
    'amountDue', 'exchangeRate', 'wholesaleOriginalAmount', 'saleOriginalAmount',
    'ticketCostIls', 'cardPaidAmount', 'cashPaidAmount'],
  tripPaymentPlans: ['cardTotalMinor', 'cashTotalMinor', 'cardPaidMinor', 'cashPaidMinor'],
  tripInstallments: ['expectedAmountMinor', 'paidAmountMinor'],
};

/** Minor-unit columns are BIGINT at scale 2 by application convention. */
export const MINOR_UNIT_SCALE = 2;
