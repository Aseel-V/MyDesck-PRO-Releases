#!/usr/bin/env node
/**
 * Inventory every client-used Supabase entry point and classify its Firestore
 * replacement.
 *
 * The inventory is derived from the repository by scanning for the calls that
 * actually exist, not from a hand-kept list — a hand-kept list is how an RPC
 * gets forgotten and its behaviour quietly disappears at cutover.
 *
 * Each RPC is classified as one of:
 *   PURE_QUERY          a Firestore read the client may perform directly
 *   SERVER_TRANSACTION  must be a callable function with a transaction
 *   DERIVED_ANALYTICS   aggregation; a summary document or server aggregation
 *   SECURITY_OPERATION  privilege or tenant-boundary change; server only
 *   OBSOLETE            proven unused, removed only with explicit approval
 *
 *   node migration/firestore/tools/rpc-and-query-inventory.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { writeReport } from '../../tools/lib/write-report.mjs';

const SRC = 'src';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(path);
  }
  return out;
}

const files = walk(SRC);

const collect = (pattern) => {
  const found = new Map();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      if (!found.has(name)) found.set(name, { name, callSites: [] });
      found.get(name).callSites.push(file.replace(/\\/g, '/'));
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const rpcs = collect(/\.rpc\(\s*['"`]([A-Za-z0-9_]+)/g);
const tables = collect(/\.from\(\s*['"`]([A-Za-z0-9_]+)/g);
const buckets = collect(/storage\s*\.from\(\s*['"`]([^'"`]+)/g);
const edgeFunctions = collect(/functions\.invoke\(\s*['"`]([^'"`]+)/g);
const authCalls = collect(/supabase\.auth\.([A-Za-z]+)/g);
const realtime = collect(/\.channel\(\s*[`'"]?([^`'")]*)/g);

/**
 * Replacement decisions. Anything the scan finds that is not decided here is
 * reported as UNCLASSIFIED, which fails the inventory — the point is that a new
 * RPC cannot slip through without a decision being made about it.
 */
const RPC_PLAN = {
  save_trip_transaction: ['SERVER_TRANSACTION', 'Callable function + Firestore transaction. Prototyped and tested in this milestone.'],
  record_trip_installment_payment: ['SERVER_TRANSACTION', 'Money moves; callable function, idempotent, transactional.'],
  record_trip_cash_payment: ['SERVER_TRANSACTION', 'Money moves; callable function, idempotent, transactional.'],
  create_trip_payment_plan: ['SERVER_TRANSACTION', 'Creates financial schedule; callable function.'],
  reschedule_trip_installment: ['SERVER_TRANSACTION', 'Alters a schedule with confirmed history; callable function.'],
  recalculate_future_trip_installments: ['SERVER_TRANSACTION', 'Redistributes future amounts; must preserve confirmed rows.'],
  materialize_due_visa_progress_events: ['SERVER_TRANSACTION', 'Writes financial events; scheduled function with per-event idempotency keys.'],
  restore_deleted_trips: ['SERVER_TRANSACTION', 'Un-deletes owned trips; callable function with ownership checks.'],
  permanently_delete_trips: ['SERVER_TRANSACTION', 'Hard delete with descendants; callable function, cascade is explicit, never implicit.'],
  use_trip_template: ['SERVER_TRANSACTION', 'Creates a trip from a template; same path as save_trip_transaction.'],
  retry_trip_attachment_cleanup: ['SERVER_TRANSACTION', 'Storage cleanup queue; server-owned, retry-safe.'],
  create_trip_event_notification: ['SERVER_TRANSACTION', 'Notification creation deduplicated on dedupe_key.'],
  mark_all_trip_notifications_read: ['SERVER_TRANSACTION', 'Bulk owned-write; batched writes in a callable function.'],
  log_trip_activity: ['SERVER_TRANSACTION', 'Append-only history; clients may not write it directly.'],
  log_business_activity_v2: ['SERVER_TRANSACTION', 'Append-only audit; server only.'],

  get_trips_page: ['PURE_QUERY', 'Firestore query on trips, ownerUid + isDeleted + createdAt cursor.'],
  get_trip_details: ['PURE_QUERY', 'Document read plus owner-constrained child queries.'],
  get_trip_dashboard_items: ['PURE_QUERY', 'Owner-constrained trips query with a composite index.'],
  get_deleted_trips_page: ['PURE_QUERY', 'trips where isDeleted == true, ordered by deletedAt.'],
  get_trip_activity_page: ['PURE_QUERY', 'tripActivityLog by tripId, ordered by sequence.'],
  get_trip_financial_audit_page: ['PURE_QUERY', 'tripFinancialAudit by tripId, ordered by sequence.'],
  get_trip_years: ['DERIVED_ANALYTICS', 'Distinct years; maintained on a per-owner summary document.'],
  get_travel_analytics_summary: ['DERIVED_ANALYTICS', 'Summary document rebuilt from canonical events; never a client-side full scan.'],
  get_travel_payment_analytics: ['DERIVED_ANALYTICS', 'Summary document, reconcilable against the event ledger.'],
  get_travel_reports: ['DERIVED_ANALYTICS', 'Server-side aggregation in a callable function.'],
  get_guide_analytics: ['DERIVED_ANALYTICS', 'Already an edge function; becomes an HTTPS function.'],
  get_travel_payment_contract_version: ['PURE_QUERY', 'Read of a featureRollouts configuration document.'],
  get_server_time: ['PURE_QUERY', 'Replaced by the server timestamp a function returns; no round trip needed.'],

  authenticate_staff: ['SECURITY_OPERATION', 'Credential check; server only, never a client-evaluable rule.'],
  authorize_staff_action: ['SECURITY_OPERATION', 'Privilege decision; server only.'],
  delete_staff_secure: ['SECURITY_OPERATION', 'Privilege change; callable function with explicit authorization.'],
  void_order_item_secure: ['SECURITY_OPERATION', 'Financial void with approval; server only.'],
  apply_discount_secure: ['SECURITY_OPERATION', 'Financial adjustment with approval; server only.'],
  delete_menu_item_secure: ['SECURITY_OPERATION', 'Privileged delete; server only.'],
  close_business_day_secure: ['SECURITY_OPERATION', 'Fiscal close; server only, append-only outcome.'],

  open_cash_shift: ['SERVER_TRANSACTION', 'Restaurant vertical; deferred with the vertical.'],
  close_shift_with_z_report: ['SERVER_TRANSACTION', 'Fiscal Z report with hash chaining; server only.'],
  create_kitchen_ticket: ['SERVER_TRANSACTION', 'Restaurant vertical; deferred with the vertical.'],
  add_repair_service_transaction: ['SERVER_TRANSACTION', 'Retail vertical; deferred with the vertical.'],
  cancel_fiscal_document: ['SECURITY_OPERATION', 'Regulated document; append-only cancellation, server only.'],
  get_next_document_number: ['SERVER_TRANSACTION', 'Gapless counter; a transaction on a counter document.'],
  get_previous_document_hash: ['PURE_QUERY', 'Reads the previous link in the fiscal hash chain.'],
  get_previous_z_hash: ['PURE_QUERY', 'Reads the previous link in the Z-report hash chain.'],
};

const EDGE_PLAN = {
  'create-user': ['SECURITY_OPERATION', 'Creates identities; Admin SDK in a callable function with explicit authorization.'],
  'generate-trip-pdf': ['SERVER_TRANSACTION', 'HTTPS function; writes the artefact to Storage, no client credentials.'],
  'get-guide-analytics': ['DERIVED_ANALYTICS', 'HTTPS function reading owner-scoped summaries.'],
  'send-whatsapp': ['SECURITY_OPERATION', 'QUARANTINED. Must remain disabled; no provider credential is migrated.'],
};

const classify = (plan) => (entry) => {
  const decision = plan[entry.name];
  return {
    name: entry.name,
    callSites: [...new Set(entry.callSites)],
    classification: decision?.[0] ?? 'UNCLASSIFIED',
    replacement: decision?.[1] ?? 'NO DECISION RECORDED',
  };
};

const classifiedRpcs = rpcs.map(classify(RPC_PLAN));
const classifiedEdge = edgeFunctions.map(classify(EDGE_PLAN));
const unclassified = [...classifiedRpcs, ...classifiedEdge]
  .filter((r) => r.classification === 'UNCLASSIFIED');

const byClassification = {};
for (const r of [...classifiedRpcs, ...classifiedEdge]) {
  byClassification[r.classification] = (byClassification[r.classification] ?? 0) + 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  status: unclassified.length === 0 ? 'ALL_CLASSIFIED' : 'UNCLASSIFIED_ENTRY_POINTS',
  scannedFiles: files.length,
  totals: {
    rpcs: rpcs.length,
    directTableAccess: tables.length,
    storageBuckets: buckets.length,
    edgeFunctions: edgeFunctions.length,
    authCalls: authCalls.length,
    realtimeChannels: realtime.length,
    unclassified: unclassified.length,
  },
  byClassification,
  rpcs: classifiedRpcs,
  edgeFunctions: classifiedEdge,
  directTableAccess: tables.map((t) => ({ table: t.name, callSites: [...new Set(t.callSites)].length })),
  storageBuckets: buckets.map((b) => ({ bucket: b.name, callSites: [...new Set(b.callSites)] })),
  auth: {
    calls: authCalls.map((a) => ({ call: a.name, callSites: [...new Set(a.callSites)].length })),
    replacement: 'Firebase Authentication. Already proven end to end with UID preservation; '
      + 'signInWithPassword, signUp, signOut, getSession, onAuthStateChange, updateUser and '
      + 'resetPasswordForEmail all have direct Firebase equivalents.',
  },
  realtime: {
    channels: realtime.map((r) => ({ channel: r.name, callSites: [...new Set(r.callSites)] })),
    finding: 'Realtime is used only by the restaurant vertical (kitchen display and a generic '
      + 'table-change invalidator). The travel product uses none, so the travel cutover does '
      + 'not depend on realtime at all.',
    replacement: 'Firestore listeners, each constrained to a tenant-scoped query. The generic '
      + 'whole-table subscription in useRestaurant must NOT be ported as-is: an unconstrained '
      + 'listener over a collection is both a cost problem and a rules failure.',
  },
  notes: [
    'Direct .from() access is not automatically portable. Every table read becomes a '
      + 'Firestore query that must carry its ownerUid constraint, because rules are not filters.',
    'Writes that touch money are removed from the client entirely and become callable '
      + 'functions, which is stricter than the source RLS allowed.',
  ],
};

writeReport('migration/reports/firestore-rpc-query-inventory.json',
  JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  status: report.status, totals: report.totals, byClassification,
  unclassified: unclassified.map((u) => u.name),
}, null, 2));
process.exitCode = unclassified.length === 0 ? 0 : 1;
