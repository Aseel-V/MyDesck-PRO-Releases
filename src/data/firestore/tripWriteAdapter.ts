/**
 * Persistence for the tourism write models.
 *
 * `tripWriteModel` and `tripCommandModel` decide what the source would have written; nothing in them talks to a
 * database. This module is the other half: it loads the model's world out of Firestore in the model's own
 * representation (exact decimals, minor units as bigint), and commits the model's `ops` in one Firestore transaction
 * with the operation document the Security Rules bind every row of that transaction to.
 *
 * Three things the source got from PostgreSQL have to be produced here instead:
 *
 *   ids       Event tables are bigint identities in the source. A client transaction allocates
 *             `base = Date.now() * 1000` and gives its rows `base + 0, 1, 2 ...` in the model's insertion order. The
 *             document id is that number zero-padded to 19 digits, exactly as the rehearsal writes migrated events, so
 *             app-written and migrated events sort together and no client can forge a lower id over an existing one.
 *   now()     Every NOW in the model becomes one `serverTimestamp()`; a single commit shares one `request.time`, which
 *             is what makes the Rules able to require it.
 *   isolation The model reasoned about a snapshot read outside the transaction (Firestore transactions cannot run
 *             queries). Each document the model read carries a guard token, re-checked inside the transaction; a
 *             concurrent change aborts the commit rather than overwriting it.
 */
import {
  collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, where,
  type DocumentData, type DocumentReference, type Firestore, type Query,
} from 'firebase/firestore';
import { decodeRow, encodeInsert, encodeUpdate, tableSpec, type CodecContext, type SourceRow, type Tenancy } from './documentCodec';
import { readStoredDecimal } from './exactValues';
import { decFromJson, decTypmod, pgError, plainJson, type Dec } from './pgNumeric';
import { businessToday } from './tripPaymentPlanSummary';
import { NOW, type Row, type TripWorld } from './tripWriteModel';
import type { FirebaseSession } from './FirebaseSession';

/** Bounded like every tourism read: past the bound the call fails loudly instead of acting on a partial world. */
export const TRAVEL_WRITE_BOUND = 5000;

/** BIGINT columns the model keeps as bigint. Every other integer column is a plain number on both sides. */
const BIGINT_COLUMNS = new Set(['card_total_minor', 'cash_total_minor', 'card_paid_minor', 'cash_paid_minor',
  'expected_amount_minor', 'paid_amount_minor']);
/** The event tables: bigint identity in the source, allocated here, create-only in the Rules. */
const EVENT_TABLES = new Set<string>(['trip_activity_log', 'trip_financial_audit', 'trip_payment_events',
  'trip_installment_events', 'trip_attachment_cleanup_queue']);
const COLLECTION: Record<string, string> = {
  trips: 'trips', trip_payment_plans: 'tripPaymentPlans', trip_installments: 'tripInstallments',
  trip_activity_log: 'tripActivityLog', trip_financial_audit: 'tripFinancialAudit', trip_payment_events: 'tripPaymentEvents',
  trip_installment_events: 'tripInstallmentEvents', trip_write_requests: 'idempotency',
  trip_attachment_cleanup_queue: 'storageCleanupQueue', trip_notifications: 'tripNotifications',
  trip_templates: 'tripTemplates', trip_whatsapp_templates: 'tripWhatsappTemplates',
};
/** trip_activity_log and trip_financial_audit order by trip; the payment events by their plan or installment. */
const SEQUENCE_PARENT: Record<string, string> = {
  trip_activity_log: 'trip_id', trip_financial_audit: 'trip_id', trip_payment_events: 'payment_plan_id',
  trip_installment_events: 'installment_id', trip_attachment_cleanup_queue: 'trip_id',
};

export interface Owner { uid: string; businessId: string }
export type OperationType = 'trip-create' | 'trip-edit' | 'trip-state' | 'payment' | 'installment-payment'
  | 'plan-create' | 'plan-recalculate' | 'installment-reschedule' | 'trip-purge' | 'trip-activity' | 'trip-side';

/** A write the commit can carry: the trip models produce `WriteOp`, the side-table models their own equivalent. */
export interface AnyOp { table: string; kind: 'insert' | 'update' | 'delete'; key: string; row: Row; before?: Row }

export interface CommitPlan {
  type: OperationType;
  /** The trip the operation is about, or null for the side tables that have no trip. */
  tripId: string | null;
  ops: AnyOp[];
  /** (uid, clientRequestId) is the operation id: a replayed request finds its own operation instead of writing twice. */
  clientRequestId: string;
  /** Present on the money operations, so the Rules can verify the ledger moved by exactly this much. */
  amountMinor?: number;
  currency?: string;
  installmentId?: string | null;
  /** What a replay of this request must return, recorded where only its actor can read it back. */
  responsePayload?: Row;
}

/** The documents the model read, with what they looked like: a concurrent change to any of them aborts the commit. */
export type Guards = Map<string, string | null>;

const guardKey = (table: string, id: string) => `${table}/${id}`;
/** Revision for trips (the Rules count it), decoded updated_at elsewhere, and existence for the idempotency ledger. */
function guardToken(table: string, data: DocumentData | null): string | null {
  if (!data) return null;
  if (table === 'trips') return `r${data.revision ?? 0}`;
  if (table === 'trip_write_requests') return 'exists';
  const row = decodeRow<SourceRow>(table, data);
  // trip_notifications has no updated_at: its mutable flags are the guard.
  if (table === 'trip_notifications') return `n${row.read_at}|${row.dismissed_at}|${row.snoozed_until}`;
  return `u${String(row.updated_at ?? '')}`;
}

const padId = (value: number) => String(value).padStart(19, '0');

/**
 * The document a write addresses. Most tables are keyed by their `id` column; trip_write_requests is keyed by
 * (user_id, client_request_id) and trip_notification_settings by user_id, and for those the model's own key is the
 * document id.
 */
const documentKey = (op: AnyOp): string => (op.row.id === undefined || op.row.id === null ? op.key : String(op.row.id));

/** A source row in the model's representation: exact decimals and bigint minor units, everything else as decoded. */
export function modelRow(table: string, data: DocumentData): Row {
  const row = decodeRow<Row>(table, data);
  for (const column of tableSpec(table).columns) {
    const raw = data[column.field];
    if (column.kind === 'decimal') {
      row[column.name] = raw === null || raw === undefined ? null : (readStoredDecimal(raw) as Dec);
    } else if (column.kind === 'int' && BIGINT_COLUMNS.has(column.name)) {
      row[column.name] = raw === null || raw === undefined ? null : BigInt(String(raw));
    }
  }
  return row;
}

/** The model's value as the codec wants it: decimals as exact text, minor units as numbers, jsonb as plain JSON. */
function codecValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('UNSAFE_MONEY_INTEGER');
    return Number(value);
  }
  if (value && typeof value === 'object' && typeof (value as Dec).units === 'bigint' && typeof (value as Dec).scale === 'number') {
    const decimal = value as Dec;
    const text = decimal.units.toString();
    const negative = text.startsWith('-');
    const digits = (negative ? text.slice(1) : text).padStart(decimal.scale + 1, '0');
    const point = decimal.scale === 0 ? digits : `${digits.slice(0, digits.length - decimal.scale)}.${digits.slice(digits.length - decimal.scale)}`;
    return `${negative ? '-' : ''}${point}`;
  }
  if (value && typeof value === 'object') return plainJson(value);
  return value;
}

/** Splits a model row into the values the codec encodes and the timestamp columns that take this commit's server time. */
function splitRow(row: Row): { values: SourceRow; serverTimes: string[] } {
  const values: SourceRow = {};
  const serverTimes: string[] = [];
  for (const [column, value] of Object.entries(row)) {
    if (value === undefined) continue;
    if (value === NOW) { serverTimes.push(column); continue; }
    values[column] = codecValue(value);
  }
  return { values, serverTimes };
}

/** Applies the server time to the columns whose value was now(), clearing the microsecond shadow the codec writes. */
function stampServerTimes(table: string, data: DocumentData, columns: string[], mode: 'insert' | 'update', codec: CodecContext) {
  const spec = tableSpec(table);
  for (const column of columns) {
    const field = spec.columns.find((candidate) => candidate.name === column)?.field;
    if (!field) throw new Error(`UNKNOWN_COLUMN:${table}.${column}`);
    data[field] = codec.serverTimestamp();
    if (mode === 'update') data[`${field}Micros`] = codec.deleteField();
    else delete data[`${field}Micros`];
  }
}

/**
 * The denormalized money the Rules verify on a trip document, and the revision that makes an edit provably sequential.
 * The rehearsal writes the same fields for migrated trips, so an app-written trip and a migrated one are one shape.
 */
function tripExtras(row: Row, revision: number, operationId: string): DocumentData {
  const minor = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    const decimal = value as Dec;
    const units = decimal.scale <= 2 ? decimal.units * 10n ** BigInt(2 - decimal.scale)
      : decimal.units / 10n ** BigInt(decimal.scale - 2);
    if (units > BigInt(Number.MAX_SAFE_INTEGER) || units < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('UNSAFE_MONEY_INTEGER');
    return Number(units);
  };
  return {
    moneyScale: 2,
    salePriceMinor: minor(row.sale_price), wholesaleCostMinor: minor(row.wholesale_cost),
    amountPaidMinor: minor(row.amount_paid), amountDueMinor: minor(row.amount_due), profitMinor: minor(row.profit),
    revision, lastOperationId: operationId,
  };
}

/**
 * The trip's one active native plan, as the source's partial unique index defines it: not deleted, not cancelled, and
 * native. `sync_trip_payment_compatibility_from_native` picks the most recently updated one when history leaves several.
 */
/**
 * The two derived figures the canonical payment summary computes for a native plan, written onto the plan so the Rules
 * can bound the trip's collected total without reading the whole schedule:
 *   cashConfirmed = least(cashTotal, cashPaid)
 *   visaConfirmed = least(cardTotal, the non-cancelled instalments whose due date has passed)
 *   visaReceipted = least(cardTotal, the receipts recorded against those instalments)
 * The source writes the trip's amount_paid by whichever of the two the path uses: the payment sync uses receipts, and
 * save_trip_transaction's final step uses the date-derived summary. Both are carried so the Rules accept exactly those
 * two values and nothing else.
 * Visa collection is date-driven in the source contract (receipt columns are audit-only), which is why an elapsed
 * instalment raises the trip's amount_paid while card_paid_minor stays where it was.
 */
function planAggregates(world: TripWorld | undefined, plan: Row, today: string): DocumentData {
  const atLeastZero = (value: bigint) => (value > 0n ? value : 0n);
  const least = (a: bigint, b: bigint) => (a < b ? a : b);
  const cardTotal = atLeastZero((plan.card_total_minor as bigint | null) ?? 0n);
  const cashTotal = atLeastZero((plan.cash_total_minor as bigint | null) ?? 0n);
  const elapsed = (world?.installments ?? [])
    .filter((row) => row.payment_plan_id === plan.id && row.status !== 'cancelled' && String(row.due_date) <= today)
    .reduce((total, row) => total + (row.expected_amount_minor as bigint), 0n);
  const receipted = (world?.installments ?? [])
    .filter((row) => row.payment_plan_id === plan.id && row.status !== 'cancelled')
    .reduce((total, row) => total + (row.paid_amount_minor as bigint), 0n);
  return {
    visaConfirmedMinor: Number(least(cardTotal, atLeastZero(elapsed))),
    visaReceiptedMinor: Number(least(cardTotal, atLeastZero(receipted))),
    cashConfirmedMinor: Number(least(cashTotal, atLeastZero((plan.cash_paid_minor as bigint | null) ?? 0n))),
  };
}

function activeNativePlan(world: TripWorld | undefined, tripId: string): Row | null {
  return (world?.plans ?? [])
    .filter((row) => String(row.trip_id) === tripId && row.source === 'native' && row.deleted_at === null && row.status !== 'cancelled')
    .sort((a, b) => (String(a.updated_at) < String(b.updated_at) ? 1 : -1))[0] ?? null;
}

export class TripWriteAdapter {
  /** The business day the canonical summary uses, Asia/Jerusalem, fixed for the life of one commit. */
  private readonly businessToday = businessToday();

  constructor(private readonly session: FirebaseSession, private readonly owner: Owner) {}

  private get db(): Firestore { return this.session.db; }

  private scoped(name: string, ...constraints: ReturnType<typeof where>[]): Query {
    return query(collection(this.db, name), where('ownerUid', '==', this.owner.uid),
      where('businessId', '==', this.owner.businessId), ...constraints);
  }

  private async bounded(q: Query, name: string): Promise<Array<{ id: string; data: DocumentData }>> {
    const snapshot = await getDocs(query(q, limit(TRAVEL_WRITE_BOUND + 1)));
    if (snapshot.size > TRAVEL_WRITE_BOUND) throw new Error(`TRAVEL_SCAN_BOUND_EXCEEDED:${name}`);
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data({ serverTimestamps: 'estimate' }) }));
  }

  /** The reference for a row of `table`. Subcollection tables take their parent from the row. */
  private ref(table: string, id: string, row?: Row): DocumentReference {
    if (table === 'trip_packing_lists') return doc(this.db, 'trips', String(row?.trip_id), 'packingLists', id);
    if (table === 'trip_notification_settings') return doc(this.db, 'users', this.owner.uid, 'settings', id);
    const name = COLLECTION[table];
    if (!name) throw new Error(`UNMAPPED_TABLE:${table}`);
    return doc(this.db, name, id);
  }

  /**
   * The world the trip models reason about: the owner's trips, plans, installments and write requests. The source
   * statements are RLS-scoped to `user_id = auth.uid()`, and so is this.
   */
  async loadWorld(options: { cleanupQueue?: boolean; packingLists?: boolean } = {}): Promise<{ world: TripWorld; guards: Guards }> {
    const guards: Guards = new Map();
    const load = async (name: string, table: string, keyOf: (row: Row) => string) => {
      const docs = await this.bounded(this.scoped(name), name);
      return docs.filter((entry) => entry.data.userId === this.owner.uid).map((entry) => {
        const row = modelRow(table, entry.data);
        guards.set(guardKey(table, keyOf(row)), guardToken(table, entry.data));
        return row;
      });
    };
    const byId = (row: Row) => String(row.id);
    const [trips, plans, installments] = await Promise.all([
      load('trips', 'trips', byId),
      load('tripPaymentPlans', 'trip_payment_plans', byId),
      load('tripInstallments', 'trip_installments', byId),
    ]);
    // trip_write_requests stays invisible to clients: a client that could read the ledger would learn whether a payment
    // had already happened, and one that could write it could replay or suppress one. The source reads it inside a
    // SECURITY DEFINER function, which does not exist here, so a replay is answered from the operation document — keyed
    // by the same (uid, clientRequestId) pair and readable only by the actor who wrote it (see `priorResponse`).
    const world: TripWorld = { trips, plans, installments, writeRequests: [] };
    if (options.cleanupQueue) world.cleanupQueue = await load('storageCleanupQueue', 'trip_attachment_cleanup_queue', byId);
    if (options.packingLists) {
      // Packing lists live under their trip; the owner's lists are collected across the trips the world holds.
      const lists: Row[] = [];
      for (const trip of trips) {
        const docs = await this.bounded(query(collection(this.db, 'trips', String(trip.id), 'packingLists'),
          where('ownerUid', '==', this.owner.uid), where('businessId', '==', this.owner.businessId)), 'packingLists');
        for (const entry of docs) lists.push(modelRow('trip_packing_lists', entry.data));
      }
      world.packingLists = lists;
    }
    return { world, guards };
  }

  /**
   * What a previous commit recorded for this request id, or null when the request is new. The operation document is
   * the client-visible half of the idempotency ledger: only its actor may read it, and it carries the response the
   * source's write-request row would have returned.
   */
  async priorResponse(clientRequestId: string): Promise<Row | null> {
    const snapshot = await getDoc(doc(this.db, 'sparkOperations', `${this.owner.uid}__${clientRequestId}`));
    const payload = snapshot.exists() ? snapshot.data().responsePayload : null;
    return payload ? (payload as Row) : null;
  }

  /** One owner-scoped side collection in the model's representation, with a guard per document. */
  async loadSide(name: string, table: string): Promise<{ rows: Row[]; guards: Guards }> {
    const guards: Guards = new Map();
    const docs = await this.bounded(this.scoped(name), name);
    const rows = docs.filter((entry) => entry.data.userId === this.owner.uid).map((entry) => {
      const row = modelRow(table, entry.data);
      guards.set(guardKey(table, String(row.id)), guardToken(table, entry.data));
      return row;
    });
    return { rows, guards };
  }

  /** users/{uid}/settings/{uid}: the owner's trip_notification_settings row, if they have one. */
  async loadSettingsDoc(): Promise<{ row: Row | null; guards: Guards }> {
    const snapshot = await getDoc(doc(this.db, 'users', this.owner.uid, 'settings', this.owner.uid));
    const data = snapshot.exists() ? snapshot.data({ serverTimestamps: 'estimate' }) : null;
    const guards: Guards = new Map([[guardKey('trip_notification_settings', this.owner.uid), guardToken('trip_notification_settings', data)]]);
    return { row: data ? modelRow('trip_notification_settings', data) : null, guards };
  }

  /** featureRollouts: global configuration every signed-in client may read and none may write. */
  async loadFeatureRollouts(): Promise<Row[]> {
    const snapshot = await getDocs(query(collection(this.db, 'featureRollouts'), limit(TRAVEL_WRITE_BOUND)));
    return snapshot.docs.map((entry) => modelRow('travel_payment_feature_rollouts', entry.data({ serverTimestamps: 'estimate' })));
  }

  /** The documents a cascade removes, resolved before the transaction so the commit only writes. */
  private async cascadeTargets(ops: AnyOp[]): Promise<Map<string, DocumentReference[]>> {
    const targets = new Map<string, DocumentReference[]>();
    for (const op of ops) {
      if (op.kind !== 'delete' || !op.key.startsWith('cascade:')) continue;
      // The request ledger cannot be enumerated by a client (it is unreadable by design), so a purge leaves its rows
      // where they are. Nothing reads them, and the reference to the purged trip is optional in the source schema.
      if (op.table === 'trip_write_requests') continue;
      // Packing lists live under their trip, so they are resolved by the subcollection pass below.
      if (op.table === 'trip_packing_lists') continue;
      const tripId = String(op.row.trip_id);
      const name = COLLECTION[op.table];
      if (!name) throw new Error(`UNMAPPED_TABLE:${op.table}`);
      const q = op.table === 'trip_write_requests'
        ? query(collection(this.db, name), where('ownerUid', '==', this.owner.uid), where('tripId', '==', tripId))
        : this.scoped(name, where('tripId', '==', tripId));
      const docs = await this.bounded(q, name);
      targets.set(op.key, docs.map((entry) => this.ref(op.table, entry.id)));
    }
    // Packing lists are a subcollection: their documents are addressed under the trip, not by a top-level query.
    for (const op of ops) {
      if (op.kind !== 'delete' || !op.key.startsWith('cascade:trip_packing_lists')) continue;
      const tripId = String(op.row.trip_id);
      const docs = await this.bounded(query(collection(this.db, 'trips', tripId, 'packingLists'),
        where('ownerUid', '==', this.owner.uid), where('businessId', '==', this.owner.businessId)), 'packingLists');
      targets.set(op.key, docs.map((entry) => doc(this.db, 'trips', tripId, 'packingLists', entry.id)));
    }
    return targets;
  }

  /**
   * Commits the model's ops. Every document the model read is re-checked against its guard inside the transaction, so a
   * concurrent writer aborts this commit instead of losing its own write.
   */
  async commit(plan: CommitPlan, world: TripWorld | undefined, guards: Guards): Promise<void> {
    this.session.assertOnline();
    if (!plan.ops.length) return;
    const codec = this.session.codec();
    const operationId = `${this.owner.uid}__${plan.clientRequestId}`;
    const cascades = await this.cascadeTargets(plan.ops);
    const base = Date.now() * 1000;
    let allocated = 0;

    // One document, one write. A statement's triggers touch the same trip row several times (the payment sync alone
    // rewrites it per plan and per instalment), and Firestore evaluates the Security Rules once per write in the
    // commit, against a request-wide evaluation budget. Collapsing the repeats to the row the transaction ends with
    // changes nothing about what is stored and keeps the commit inside that budget.
    const ops: AnyOp[] = [];
    const seen = new Map<string, number>();
    const dropped = new Set<number>();
    for (const op of plan.ops) {
      if (op.key.startsWith('cascade:') || (EVENT_TABLES.has(op.table) && op.kind === 'insert')) { ops.push(op); continue; }
      const key = `${op.table}/${op.key}`;
      const at = seen.get(key);
      if (at === undefined) { seen.set(key, ops.length); ops.push({ ...op }); continue; }
      const first = ops[at];
      // Written and removed in the same commit: nothing reaches Firestore.
      if (op.kind === 'delete' && first.kind === 'insert') { dropped.add(at); seen.delete(key); continue; }
      ops[at] = { table: op.table, key: op.key, kind: first.kind === 'insert' ? 'insert' : op.kind, row: op.row,
        ...(first.before ?? op.before ? { before: first.before ?? op.before } : {}) };
    }
    const writes = ops.filter((_, index) => !dropped.has(index));

    await runTransaction(this.db, async (transaction) => {
      const operationRef = doc(this.db, 'sparkOperations', operationId);
      const prior = await transaction.get(operationRef);
      // A replayed request finds its own operation: the rows were already written by the commit that created it.
      if (prior.exists()) return;

      // Reads first: Firestore requires every read of a transaction before its first write.
      const touched = writes.filter((op) => !op.key.startsWith('cascade:'));
      const snapshots = new Map<string, DocumentData | null>();
      for (const op of touched) {
        // The request ledger is create-only and unreadable, so it is never guarded by a read: a duplicate create is
        // refused by the Rules rather than detected here.
        if (op.table === 'trip_write_requests') continue;
        const id = EVENT_TABLES.has(op.table) && op.kind === 'insert' ? null : documentKey(op);
        if (id === null) continue;
        const snapshot = await transaction.get(this.ref(op.table, id, op.row));
        snapshots.set(guardKey(op.table, id), snapshot.exists() ? snapshot.data() : null);
      }
      for (const [key, seen] of snapshots) {
        const guard = guards.has(key) ? guards.get(key) ?? null : null;
        const table = key.slice(0, key.lastIndexOf('/'));
        if (guardToken(table, seen) !== guard) throw new Error('CONCURRENT_TRIP_MODIFICATION');
      }

      const tripRevision = new Map<string, number>();
      for (const [key, seen] of snapshots) {
        if (key.startsWith('trips/') && seen) tripRevision.set(key.slice('trips/'.length), Number(seen.revision ?? 0));
      }

      // trip_payment_plans has UNIQUE (trip_id) WHERE deleted_at IS NULL AND status <> 'cancelled'. Firestore has no
      // unique index, so that constraint lives in a document the Rules can address without a query: tripPlans/{tripId}
      // names the trip's one active native plan, which is how a rule checks a trip's collected total against the ledger
      // instead of trusting it. It is read here so the commit knows whether one is already there.
      const touchedTrips = new Set(writes
        .filter((op) => ['trips', 'trip_payment_plans', 'trip_installments'].includes(op.table))
        .map((op) => String(op.table === 'trips' ? op.row.id : op.row.trip_id))
        .filter((id) => id && id !== 'undefined'));
      const indexBefore = new Map<string, string | null>();
      for (const tripId of touchedTrips) {
        const snapshot = await transaction.get(doc(this.db, 'tripPlans', tripId));
        indexBefore.set(tripId, snapshot.exists() ? String(snapshot.data().planId) : null);
      }

      transaction.set(operationRef, {
        schemaVersion: 1, operationId, type: plan.type, actorUid: this.owner.uid, ownerUid: this.owner.uid,
        businessId: this.owner.businessId, tripId: plan.tripId,
        beforeRevision: plan.tripId ? tripRevision.get(plan.tripId) ?? 0 : 0,
        afterRevision: (plan.tripId ? tripRevision.get(plan.tripId) ?? 0 : 0) + 1,
        fingerprint: plan.clientRequestId, createdAt: serverTimestamp(),
        ...(plan.amountMinor === undefined ? {} : { amountMinor: plan.amountMinor }),
        ...(plan.currency === undefined ? {} : { currency: plan.currency }),
        ...(plan.installmentId === undefined ? {} : { installmentId: plan.installmentId }),
        ...(plan.responsePayload === undefined
          ? {} : { responsePayload: JSON.parse(JSON.stringify(plan.responsePayload)) as Row }),
      });

      for (const op of writes) {
        if (op.key.startsWith('cascade:')) {
          for (const ref of cascades.get(op.key) ?? []) transaction.delete(ref);
          continue;
        }
        const tenancy: Tenancy = op.table === 'trip_write_requests'
          ? { ownerUid: this.owner.uid, businessId: null }
          : { ownerUid: this.owner.uid, businessId: this.owner.businessId };

        if (EVENT_TABLES.has(op.table) && op.kind === 'insert') {
          const id = base + allocated;
          allocated += 1;
          const { values, serverTimes } = splitRow({ ...op.row, id });
          const created = encodeInsert(op.table, values, codec, tenancy);
          stampServerTimes(op.table, created.data, serverTimes, 'insert', codec);
          const parent = SEQUENCE_PARENT[op.table];
          transaction.set(this.ref(op.table, padId(id)), {
            ...created.data, sequence: id, lastOperationId: operationId,
            ...(parent ? { sequenceParent: String(op.row[parent] ?? '') } : {}),
          });
          continue;
        }

        const id = documentKey(op);
        const ref = this.ref(op.table, id, op.row);
        if (op.kind === 'delete') { transaction.delete(ref); continue; }

        const { values, serverTimes } = splitRow(op.row);
        if (op.kind === 'insert') {
          const created = encodeInsert(op.table, values, codec, tenancy);
          stampServerTimes(op.table, created.data, serverTimes, 'insert', codec);
          transaction.set(ref, {
            ...created.data,
            ...(op.table === 'trips' ? tripExtras(op.row, 1, operationId) : {}),
            ...(op.table === 'trip_payment_plans'
              ? { lastOperationId: operationId, ...planAggregates(world, op.row, this.businessToday) } : {}),
            ...(op.table === 'trip_installments' ? { lastOperationId: operationId } : {}),
          });
          continue;
        }
        // An update names only the columns the statement set, so unnamed columns keep what the document holds.
        const changed: SourceRow = {};
        for (const [column, value] of Object.entries(values)) {
          if (op.before && JSON.stringify(codecValue(op.before[column]) ?? null) === JSON.stringify(value ?? null)) continue;
          changed[column] = value;
        }
        const patch = encodeUpdate(op.table, changed, codec);
        stampServerTimes(op.table, patch, serverTimes, 'update', codec);
        const revision = (tripRevision.get(id) ?? 0) + 1;
        transaction.update(ref, {
          ...patch,
          ...(op.table === 'trips' ? tripExtras(op.row, revision, operationId) : {}),
          ...(op.table === 'trip_payment_plans'
            ? { lastOperationId: operationId, ...planAggregates(world, op.row, this.businessToday) } : {}),
          ...(op.table === 'trip_installments' ? { lastOperationId: operationId } : {}),
        });
        if (op.table === 'trips') tripRevision.set(id, revision);
      }

      // The index only changes when the trip's live native plan changes. Rewriting it on every commit that touches a
      // trip would make a receipt or an archive claim to change the plan, which the Rules refuse — rightly.
      const purged = new Set(writes.filter((op) => op.table === 'trips' && op.kind === 'delete').map((op) => String(op.row.id)));
      for (const tripId of touchedTrips) {
        const ref = doc(this.db, 'tripPlans', tripId);
        const active = purged.has(tripId) ? null : activeNativePlan(world, tripId);
        const before = indexBefore.get(tripId) ?? null;
        const planId = active ? String(active.id) : null;
        if (planId === before) continue;
        if (planId) {
          transaction.set(ref, {
            tripId, planId, ownerUid: this.owner.uid, businessId: this.owner.businessId,
            lastOperationId: operationId, schemaVersion: 1,
          });
        } else {
          transaction.delete(ref);
        }
      }
    });
  }
}

/**
 * A source row built from a JSON payload the way an INSERT does: named columns are cast to the column's type, and every
 * column the payload does not name takes its DEFAULT (or NULL). A column the table does not have is refused the way
 * PostgREST refuses it, so an import with a stray key fails here exactly as it fails there.
 */
export function sourceInsertRow(table: string, json: Row, ctx: { newId: () => string; dbToday: string }): Row {
  const spec = tableSpec(table);
  for (const key of Object.keys(json)) {
    if (!spec.columns.some((column) => column.name === key)) {
      throw pgError(`Could not find the '${key}' column of '${table}' in the schema cache`, 'PGRST204');
    }
  }
  const cast = (column: { kind: string; name: string; precision?: number; scale?: number }, value: unknown): unknown => {
    if (value === null || value === undefined) return null;
    if (column.kind === 'decimal') return decTypmod(decFromJson(value), column.precision, column.scale);
    if (column.kind === 'int') return BIGINT_COLUMNS.has(column.name) ? BigInt(String(value)) : Number(value);
    return value;
  };
  const row: Row = {};
  for (const column of spec.columns) {
    if (Object.prototype.hasOwnProperty.call(json, column.name)) { row[column.name] = cast(column, json[column.name]); continue; }
    const fallback = column.default;
    if (!fallback) { row[column.name] = null; continue; }
    if (fallback.kind === 'uuid') row[column.name] = ctx.newId();
    else if (fallback.kind === 'now') row[column.name] = NOW;
    else if (fallback.kind === 'currentDate') row[column.name] = ctx.dbToday;
    else if (fallback.kind === 'literal') row[column.name] = cast(column, fallback.value);
    else throw pgError(`SEQUENCE_DEFAULT_REQUIRES_COUNTER: ${table}.${column.name}`, '0A000');
  }
  return row;
}

export const tripWriteInternals = { activeNativePlan, codecValue, guardToken, modelRow, padId, splitRow, tripExtras };
