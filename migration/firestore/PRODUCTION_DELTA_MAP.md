# Production delta map

Machine evidence: `migration/firestore/config/production-delta-map.json`. All 77 source tables are classified; UNKNOWN = 0. A timestamp is trusted only when the schema records an update trigger or the table is explicitly immutable history. Every final pass ends with complete PK and canonical-hash reconciliation, so a missed timestamp update cannot disappear silently.

## APPEND_ONLY_EVENT (16)

- `allocation_numbers_log`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `audit_logs`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `fiscal_counters`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `fiscal_document_items`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `fiscal_documents`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `restaurant_audit_logs`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `restaurant_void_logs`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `trip_activity_log`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `trip_financial_audit`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `trip_installment_events`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `trip_payment_events`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `whatsapp_message_log`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `whatsapp_webhook_events`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `x_reports`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `z_report_counters`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.
- `z_reports`: Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.

## FREEZE_REQUIRED (1)

- `trip_pdf_rate_limits`: Freeze the owning workflow before the final read and perform a complete PK/hash reconciliation.

## FULL_RECOPY_REQUIRED (50)

- `business_profiles`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `customer_vehicles`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `customers_ledger`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `market_transactions`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `repair_order_items`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `repair_orders`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_cash_drawers`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_cash_transactions`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_daily_reports`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_demand_forecasts`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_floor_plans`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_guest_profiles`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_historical_data`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_ingredients`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_item_modifier_groups`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_kitchen_tickets`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_menu_categories`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_menu_items`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_modifier_groups`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_modifiers`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_notifications`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_order_item_modifiers`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_order_items`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_orders`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_payments`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_recipes`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_reservations`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_settings`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_staff`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_table_sessions`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_tables`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_ticket_items`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `restaurant_waitlist`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `shift_transactions`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `shrinkage_records`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `staff_shifts`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `stock_take_items`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `travel_payment_feature_rollouts`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_attachment_cleanup_queue`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_installments`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_notification_settings`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_notifications`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_packing_lists`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_payment_plans`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_pricing_preferences`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_templates`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_whatsapp_templates`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trip_write_requests`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `trips`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.
- `user_profiles`: Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.

## RELIABLE_CREATED_AT (5)

- `restaurant_whatsapp_messages`: Copy new immutable history by created_at plus PK; validate immutability and full PK/hash set under freeze.
- `restaurant_whatsapp_settings`: Copy new immutable history by created_at plus PK; validate immutability and full PK/hash set under freeze.
- `whatsapp_contact_consents`: Copy new immutable history by created_at plus PK; validate immutability and full PK/hash set under freeze.
- `whatsapp_reminders`: Copy new immutable history by created_at plus PK; validate immutability and full PK/hash set under freeze.
- `whatsapp_server_templates`: Copy new immutable history by created_at plus PK; validate immutability and full PK/hash set under freeze.

## RELIABLE_UPDATED_AT (5)

- `business_settings`: Read updated_at above the T0 watermark inside the final read-only snapshot, then perform full PK/hash reconciliation.
- `car_parts`: Read updated_at above the T0 watermark inside the final read-only snapshot, then perform full PK/hash reconciliation.
- `cash_shifts`: Read updated_at above the T0 watermark inside the final read-only snapshot, then perform full PK/hash reconciliation.
- `inventory_batches`: Read updated_at above the T0 watermark inside the final read-only snapshot, then perform full PK/hash reconciliation.
- `stock_takes`: Read updated_at above the T0 watermark inside the final read-only snapshot, then perform full PK/hash reconciliation.

## Final delta algorithm

1. Enable maintenance and prove all source business writes are rejected.
2. Begin one PostgreSQL `REPEATABLE READ READ ONLY` transaction and record the final marker.
3. Apply updated/created/event deltas, full re-copies, and frozen-domain reads according to this map.
4. Apply the Storage path/size/SHA-256 delta from a fresh object listing.
5. Reconcile complete source and target PK sets, canonical hashes, money, relationships, events, timestamps, and Storage hashes.
6. Return `NO_GO` on any mismatch. Backend switching is a later, separately approved action.
