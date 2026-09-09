/**
 * Source table -> Firestore target decision for every public table.
 *
 * Every source table gets a decision. "Unknown" is not an allowed outcome, and
 * `validateTableMap` fails if the live inventory contains a table this file has
 * not decided on — so a schema change upstream breaks the build rather than
 * quietly leaving rows with nowhere to go.
 *
 * `disposition` uses the agreed vocabulary:
 *   TOP_LEVEL_COLLECTION  its own root collection
 *   SUBCOLLECTION         nested under its parent document
 *   EMBED                 a field inside its parent document
 *   MERGE                 folded into another entity's document
 *   DERIVED               recomputed, never a system of record
 *   ARCHIVE               migrated for history, not written by the app
 *   KEEP                  structure retained as-is under a later milestone
 *   REMOVE_LATER          slated for removal, but only after proof it is dead
 *
 * `milestone` says WHEN, and is independent of `disposition`:
 *   1  migrated and reconciled in this milestone
 *   2  travel-adjacent, next milestone
 *   3  legacy vertical, deferred with a designed target
 *
 * Deferring is a decision, not an omission: each deferred table still names the
 * collection it will land in, so no row is ever "miscellaneous".
 */

export const SCHEMA_VERSION = 1;
export const TRANSFORM_VERSION = 1;

/** Prefix that makes migration-proof data structurally unable to collide. */
export const PROOF_PREFIX = 'migration_test_v1_';

const t = (name, domain, disposition, target, milestone, note, extra = {}) =>
  ({ name, domain, disposition, target, milestone, note, ...extra });

export const TABLE_MAP = [
  // -- Identity and tenancy -------------------------------------------------
  t('user_profiles', 'identity', 'TOP_LEVEL_COLLECTION', 'users/{firebaseUid}', 1,
    'Document id is the Firebase UID (= auth.users.id = user_profiles.user_id). The surrogate `id` is retained as legacyProfileId so the source PK is never lost.',
    { documentIdSource: 'user_id', securityField: 'uid' }),
  t('business_profiles', 'identity', 'TOP_LEVEL_COLLECTION', 'businesses/{businessId}', 1,
    'Existing business UUID becomes the document id. ownerUid is immutable after creation.',
    { documentIdSource: 'id', securityField: 'ownerUid' }),
  t('business_settings', 'identity', 'SUBCOLLECTION', 'businesses/{businessId}/settings/{settingsId}', 1,
    'Its business_id foreign key points at auth.users, so the column holds a USER id despite the name. Migrated under the business owned by that user, with the discrepancy recorded rather than corrected.',
    { documentIdSource: 'id', securityField: 'ownerUid', sourceQuirk: 'business_id references auth.users' }),
  t('audit_logs', 'identity', 'TOP_LEVEL_COLLECTION', 'auditEvents/{eventId}', 1,
    'Append-only. Clients may never update or delete; writes come from trusted functions.',
    { documentIdSource: 'id', securityField: 'businessId', appendOnly: true }),

  // -- Travel: core ---------------------------------------------------------
  t('trips', 'travel', 'TOP_LEVEL_COLLECTION', 'trips/{tripId}', 1,
    'Top level, not nested under the owner, because cross-trip queries by owner, status, currency and date are the primary access pattern and rules can enforce ownerUid on every one of them.',
    { documentIdSource: 'id', securityField: 'ownerUid',
      embedded: ['travelers', 'itinerary', 'payments', 'attachments', 'roomType'],
      derived: ['profit', 'profitPercentage', 'amountDue', 'searchDocument'] }),
  t('trip_payment_plans', 'travel', 'TOP_LEVEL_COLLECTION', 'tripPaymentPlans/{planId}', 1,
    'One active plan per trip (source unique constraint on trip_id). Kept top level so due-installment and receivable queries can join by tripId without a collection-group scan.',
    { documentIdSource: 'id', securityField: 'ownerUid' }),
  t('trip_installments', 'travel', 'TOP_LEVEL_COLLECTION', 'tripInstallments/{installmentId}', 1,
    'Top level: "installments due across all trips in a date range" is a real query and a subcollection would force a collection-group index with weaker tenant scoping.',
    { documentIdSource: 'id', securityField: 'ownerUid' }),
  t('trip_payment_events', 'travel', 'TOP_LEVEL_COLLECTION', 'tripPaymentEvents/{eventId}', 1,
    'Append-only financial event. Source BIGINT identity id is preserved as the document id text and as a numeric sequence field for ordering.',
    { documentIdSource: 'id', securityField: 'ownerUid', appendOnly: true, orderingField: 'sequence' }),
  t('trip_installment_events', 'travel', 'TOP_LEVEL_COLLECTION', 'tripInstallmentEvents/{eventId}', 1,
    'Append-only financial event, same ordering contract as tripPaymentEvents.',
    { documentIdSource: 'id', securityField: 'ownerUid', appendOnly: true, orderingField: 'sequence' }),
  t('trip_financial_audit', 'travel', 'TOP_LEVEL_COLLECTION', 'tripFinancialAudit/{auditId}', 1,
    'Append-only audit trail. Client update and delete are denied by rules.',
    { documentIdSource: 'id', securityField: 'ownerUid', appendOnly: true, orderingField: 'sequence' }),
  t('trip_activity_log', 'travel', 'TOP_LEVEL_COLLECTION', 'tripActivityLog/{activityId}', 1,
    'Append-only. Note the source has NO foreign key from trip_id to trips, so its trip reference is validated by the migration rather than assumed.',
    { documentIdSource: 'id', securityField: 'ownerUid', appendOnly: true,
      orderingField: 'sequence', sourceQuirk: 'trip_id has no foreign key' }),
  t('trip_write_requests', 'travel', 'TOP_LEVEL_COLLECTION', 'idempotency/{ownerUid}__{clientRequestId}', 1,
    'The existing idempotency ledger for save_trip_transaction. Composite PK (user_id, client_request_id) becomes a deterministic composite document id so a replayed request finds its own record.',
    { documentIdSource: 'user_id+client_request_id', securityField: 'ownerUid', serverOnly: true }),

  // -- Travel: adjacent -----------------------------------------------------
  t('trip_templates', 'travel', 'TOP_LEVEL_COLLECTION', 'tripTemplates/{templateId}', 2,
    'Owner-scoped templates; empty in the synthetic slice so parity is proven at zero rows only.',
    { documentIdSource: 'id', securityField: 'ownerUid' }),
  t('trip_notifications', 'travel', 'TOP_LEVEL_COLLECTION', 'tripNotifications/{notificationId}', 2,
    'Owner-scoped; dedupe_key carries forward as the idempotency key for notification creation.',
    { documentIdSource: 'id', securityField: 'ownerUid' }),
  t('trip_notification_settings', 'travel', 'SUBCOLLECTION', 'users/{firebaseUid}/settings/{settingsId}', 2,
    'Per-user preferences belong with the user document.',
    { documentIdSource: 'id', securityField: 'uid' }),
  t('trip_packing_lists', 'travel', 'SUBCOLLECTION', 'trips/{tripId}/packingLists/{listId}', 2,
    'Lifecycle is entirely inside a trip and it is never queried across trips.',
    { documentIdSource: 'id', securityField: 'ownerUid' }),
  t('trip_pricing_preferences', 'travel', 'SUBCOLLECTION', 'users/{firebaseUid}/settings/{settingsId}', 2,
    'Per-user pricing preferences, stored alongside the other user settings.',
    { documentIdSource: 'id', securityField: 'uid' }),
  t('trip_whatsapp_templates', 'travel', 'TOP_LEVEL_COLLECTION', 'tripWhatsappTemplates/{templateId}', 2,
    'Message templates are data, not automation. Migrating them does not reactivate the quarantined WhatsApp sending path.',
    { documentIdSource: 'id', securityField: 'ownerUid' }),
  t('trip_attachment_cleanup_queue', 'travel', 'TOP_LEVEL_COLLECTION', 'storageCleanupQueue/{queueId}', 2,
    'Server-owned work queue. Clients get no access; a scheduled function drains it.',
    { documentIdSource: 'id', securityField: 'ownerUid', serverOnly: true }),
  t('trip_pdf_rate_limits', 'travel', 'DERIVED', 'rateLimits/{ownerUid}__pdf', 2,
    'Rate-limiter state is operational, not business truth. Rebuilt server-side; never client-writable.',
    { documentIdSource: 'derived', securityField: 'ownerUid', serverOnly: true }),
  t('travel_payment_feature_rollouts', 'travel', 'TOP_LEVEL_COLLECTION', 'featureRollouts/{rolloutId}', 2,
    'Global configuration. Read-only to clients, written only by administrative tooling.',
    { documentIdSource: 'id', securityField: 'global', serverOnly: true }),

  // -- Restaurant vertical (legacy, deferred with a designed target) --------
  ...[
    ['restaurant_settings', 'businesses/{businessId}/restaurant/settings'],
    ['restaurant_staff', 'businesses/{businessId}/restaurantStaff/{staffId}'],
    ['restaurant_menu_categories', 'businesses/{businessId}/menuCategories/{categoryId}'],
    ['restaurant_menu_items', 'businesses/{businessId}/menuItems/{itemId}'],
    ['restaurant_modifier_groups', 'businesses/{businessId}/modifierGroups/{groupId}'],
    ['restaurant_modifiers', 'businesses/{businessId}/modifiers/{modifierId}'],
    ['restaurant_item_modifier_groups', 'businesses/{businessId}/itemModifierGroups/{linkId}'],
    ['restaurant_tables', 'businesses/{businessId}/tables/{tableId}'],
    ['restaurant_floor_plans', 'businesses/{businessId}/floorPlans/{planId}'],
    ['restaurant_table_sessions', 'businesses/{businessId}/tableSessions/{sessionId}'],
    ['restaurant_orders', 'businesses/{businessId}/orders/{orderId}'],
    ['restaurant_order_items', 'businesses/{businessId}/orderItems/{itemId}'],
    ['restaurant_order_item_modifiers', 'businesses/{businessId}/orderItemModifiers/{linkId}'],
    ['restaurant_payments', 'businesses/{businessId}/restaurantPayments/{paymentId}'],
    ['restaurant_kitchen_tickets', 'businesses/{businessId}/kitchenTickets/{ticketId}'],
    ['restaurant_ticket_items', 'businesses/{businessId}/ticketItems/{itemId}'],
    ['restaurant_reservations', 'businesses/{businessId}/reservations/{reservationId}'],
    ['restaurant_waitlist', 'businesses/{businessId}/waitlist/{entryId}'],
    ['restaurant_guest_profiles', 'businesses/{businessId}/guestProfiles/{guestId}'],
    ['restaurant_recipes', 'businesses/{businessId}/recipes/{recipeId}'],
    ['restaurant_ingredients', 'businesses/{businessId}/ingredients/{ingredientId}'],
    ['restaurant_cash_drawers', 'businesses/{businessId}/cashDrawers/{drawerId}'],
    ['restaurant_cash_transactions', 'businesses/{businessId}/cashTransactions/{transactionId}'],
    ['restaurant_daily_reports', 'businesses/{businessId}/dailyReports/{reportId}'],
    ['restaurant_demand_forecasts', 'businesses/{businessId}/demandForecasts/{forecastId}'],
    ['restaurant_historical_data', 'businesses/{businessId}/restaurantHistory/{recordId}'],
    ['restaurant_notifications', 'businesses/{businessId}/restaurantNotifications/{notificationId}'],
    ['restaurant_void_logs', 'businesses/{businessId}/voidLogs/{logId}'],
    ['restaurant_audit_logs', 'businesses/{businessId}/restaurantAuditLogs/{logId}'],
  ].map(([name, target]) => t(name, 'restaurant', 'SUBCOLLECTION', target, 3,
    'Legacy vertical. Business-scoped subcollection keeps tenant isolation obvious; deferred to a later milestone so the travel cutover is not coupled to it.',
    { documentIdSource: 'id', securityField: 'businessId' })),
  t('restaurant_whatsapp_messages', 'restaurant', 'ARCHIVE',
    'businesses/{businessId}/restaurantWhatsappMessages/{messageId}', 3,
    'History is migrated for the record. The sending path stays quarantined; migrating messages must not re-enable delivery.',
    { documentIdSource: 'id', securityField: 'businessId', quarantined: true }),
  t('restaurant_whatsapp_settings', 'restaurant', 'ARCHIVE',
    'businesses/{businessId}/restaurantWhatsappSettings/{settingsId}', 3,
    'Provider configuration. Migrated without credentials; any secret material is re-provisioned, never copied.',
    { documentIdSource: 'id', securityField: 'businessId', quarantined: true }),

  // -- Retail / automotive vertical (legacy, deferred) ---------------------
  ...[
    ['car_parts', 'businesses/{businessId}/parts/{partId}'],
    ['customer_vehicles', 'businesses/{businessId}/vehicles/{vehicleId}'],
    ['customers_ledger', 'businesses/{businessId}/customerLedger/{entryId}'],
    ['repair_orders', 'businesses/{businessId}/repairOrders/{orderId}'],
    ['repair_order_items', 'businesses/{businessId}/repairOrderItems/{itemId}'],
    ['inventory_batches', 'businesses/{businessId}/inventoryBatches/{batchId}'],
    ['market_transactions', 'businesses/{businessId}/marketTransactions/{transactionId}'],
    ['stock_takes', 'businesses/{businessId}/stockTakes/{stockTakeId}'],
    ['stock_take_items', 'businesses/{businessId}/stockTakeItems/{itemId}'],
    ['shrinkage_records', 'businesses/{businessId}/shrinkageRecords/{recordId}'],
    ['staff_shifts', 'businesses/{businessId}/staffShifts/{shiftId}'],
    ['shift_transactions', 'businesses/{businessId}/shiftTransactions/{transactionId}'],
    ['cash_shifts', 'businesses/{businessId}/cashShifts/{shiftId}'],
    ['allocation_numbers_log', 'businesses/{businessId}/allocationNumbers/{entryId}'],
  ].map(([name, target]) => t(name, 'retail_auto', 'SUBCOLLECTION', target, 3,
    'Legacy vertical, business-scoped. Deferred with a designed target so no row is unaccounted for.',
    { documentIdSource: 'id', securityField: 'businessId' })),

  // -- Fiscal / regulatory (legacy, deferred; append-only by law) ----------
  ...[
    ['fiscal_documents', 'businesses/{businessId}/fiscalDocuments/{documentId}'],
    ['fiscal_document_items', 'businesses/{businessId}/fiscalDocumentItems/{itemId}'],
    ['fiscal_counters', 'businesses/{businessId}/fiscalCounters/{counterId}'],
    ['x_reports', 'businesses/{businessId}/xReports/{reportId}'],
    ['z_reports', 'businesses/{businessId}/zReports/{reportId}'],
    ['z_report_counters', 'businesses/{businessId}/zReportCounters/{counterId}'],
  ].map(([name, target]) => t(name, 'fiscal', 'ARCHIVE', target, 3,
    'Regulated fiscal records with hash chaining. Append-only, never client-writable, and the hash chain must be re-verified after migration before this vertical goes live.',
    { documentIdSource: 'id', securityField: 'businessId', appendOnly: true, hashChained: true })),

  // -- WhatsApp automation (quarantined) -----------------------------------
  ...[
    ['whatsapp_contact_consents', 'businesses/{businessId}/whatsappConsents/{consentId}'],
    ['whatsapp_message_log', 'businesses/{businessId}/whatsappMessageLog/{messageId}'],
    ['whatsapp_reminders', 'businesses/{businessId}/whatsappReminders/{reminderId}'],
    ['whatsapp_server_templates', 'whatsappServerTemplates/{templateId}'],
    ['whatsapp_webhook_events', 'whatsappWebhookEvents/{eventId}'],
  ].map(([name, target]) => t(name, 'whatsapp', 'ARCHIVE', target, 3,
    'Automation remains quarantined by prior authorized work. History migrates as a record; no provider credential is carried and no sending path is re-enabled.',
    { documentIdSource: 'id', securityField: target.startsWith('businesses') ? 'businessId' : 'global',
      quarantined: true, serverOnly: true })),
];

export const TABLE_MAP_BY_NAME = new Map(TABLE_MAP.map((row) => [row.name, row]));

export const MILESTONE_1_TABLES = TABLE_MAP
  .filter((row) => row.milestone === 1)
  .map((row) => row.name);

/**
 * The proof namespace. Every milestone-1 target is rewritten under a prefix
 * that no application path uses, so a proof write cannot land on customer data
 * even if a path were mistyped.
 */
export function proofCollection(name) {
  if (name.startsWith(PROOF_PREFIX)) return name;
  return `${PROOF_PREFIX}${name}`;
}

/**
 * Fail if the live source contains a table with no decision, or if this file
 * decides on a table the source no longer has. Both directions matter: the
 * first would leave rows homeless, the second means the map has drifted.
 */
export function validateTableMap(liveTableNames) {
  const live = new Set(liveTableNames);
  const mapped = new Set(TABLE_MAP.map((row) => row.name));
  const unmapped = [...live].filter((name) => !mapped.has(name)).sort();
  const stale = [...mapped].filter((name) => !live.has(name)).sort();
  const duplicates = TABLE_MAP.map((r) => r.name)
    .filter((name, i, all) => all.indexOf(name) !== i);
  return {
    liveTables: live.size,
    mappedTables: mapped.size,
    unmapped,
    stale,
    duplicates,
    unknown: unmapped.length,
    ok: unmapped.length === 0 && stale.length === 0 && duplicates.length === 0,
  };
}
