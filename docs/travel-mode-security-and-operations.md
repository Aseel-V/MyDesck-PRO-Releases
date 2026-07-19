# Travel Mode Security and Operations

## Deployment order

1. Back up the Supabase database, including the `private` schema.
2. Apply the forward-only migrations in order: `20260719090000`, `20260719130000`, `20260719140000`, `20260719150000`, then `20260719160000`.
3. Preserve the restricted `private` schema in backups. Legacy ciphertext and its historical key must remain together even though the active product no longer reads or manages passport numbers.
4. Deploy `cleanup-trip-attachments` and `generate-trip-pdf`. Set a strong, randomly generated `TRAVEL_CLEANUP_SECRET` and a public HTTPS `TRAVEL_PDF_FONT_URL` pointing to a licensed Unicode TTF with Arabic and Hebrew glyphs. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; never put the service role key in frontend configuration.
5. Schedule the retention purge and cleanup worker as described below.
6. Deploy the application only after all migrations and Edge Functions succeed. The read-only compatibility fallback is temporary and logs one development warning when an RPC is absent.

Typical CLI sequence from a linked staging project:

```bash
supabase db dump --linked --file backups/pre-travel-mode.sql
supabase db push --linked
supabase functions deploy cleanup-trip-attachments --no-verify-jwt
supabase functions deploy generate-trip-pdf
supabase secrets set TRAVEL_CLEANUP_SECRET="<random-secret>" TRAVEL_PDF_FONT_URL="https://<trusted-host>/NotoSans.ttf"
supabase gen types typescript --linked --schema public > src/types/database.generated.ts
```

The cleanup function uses its own scheduler secret because it is service-operated. Do not disable JWT verification for `generate-trip-pdf`; it verifies the caller again and performs detail reads through the caller's RLS context.

The RPC migrations emit `NOTIFY pgrst, 'reload schema'`. If PostgREST still serves stale metadata after a successful migration, run `NOTIFY pgrst, 'reload schema';` once in the SQL editor or restart the project API from the Supabase dashboard. A cache reload cannot replace a missing migration.

## Legacy passport data

Passport management has been removed from the active Travel Mode type, validation, payload, detail, template, duplicate, export, PDF, and UI paths. `get_trip_details(uuid)` removes the legacy key from each traveler object and never decrypts it. The temporary direct-read compatibility path applies the same response stripping.

Historical migrations remain unchanged. Existing encrypted values stay in the database. The write trigger carries an old encrypted key forward by traveler array position when an ordinary trip update omits it, preventing routine edits from erasing legacy ciphertext. New application writes cannot add passport fields.

`scripts/optional-remove-legacy-passports.sql` is a separate rollback-only administrative cleanup and is never applied by migration or deployment. It defaults to `ROLLBACK`; use it only after a verified backup and an explicit deletion decision.

## Client privacy

- Trip drafts exclude travelers, phone numbers, and attachment metadata.
- Active detail and search responses omit legacy passport keys entirely.
- Server search indexes client and traveler names but never phone numbers, notes, legacy traveler secrets, or attachment URLs.
- Invoice file names use destination and trip ID, not client or traveler names.
- Travel Mode logs use error names/codes only and do not serialize payloads.

## Deletion and attachments

Normal deletion sets `deleted_at` and `deleted_by`. Deleted trips are excluded by list, dashboard, detail, year, archive, payment, and export operations. The toast undo action restores the record during the retention period. Attachments remain untouched while restoration is possible.

Direct `DELETE` permission is revoked from anonymous and authenticated API roles, so normal clients cannot bypass retention even though an older RLS delete policy remains in migration history.

Permanent deletion is service-role-only through `purge_deleted_trips(retention_days)`. The default retention period is 30 days. The function atomically queues attachment metadata before deleting rows. It cannot be called by anonymous or authenticated clients.

Run the following from a trusted server or scheduled database job using service-role credentials:

```sql
select public.purge_deleted_trips(30);
```

Then invoke the Edge Function from a trusted scheduler:

```text
POST /functions/v1/cleanup-trip-attachments?limit=20
x-cleanup-secret: <TRAVEL_CLEANUP_SECRET>
```

The worker atomically claims jobs with `FOR UPDATE SKIP LOCKED`, removes only attachments that have both an explicit `bucket` and `storage_path`, and marks failures for retry. It attempts each job at most ten times. External URLs and legacy attachments without a verified storage locator are not deleted automatically; operators can inspect failed or completed queue rows and handle legacy objects separately.

Schedule jobs from Supabase Cron or another trusted scheduler. Example database jobs when `pg_cron` is enabled:

```sql
select cron.schedule('travel-notifications', '15 * * * *',
  $$select public.generate_trip_notifications(now());$$);
select cron.schedule('travel-retention-purge', '20 2 * * *',
  $$select public.purge_deleted_trips(30);$$);
```

Invoke `cleanup-trip-attachments` every 10-30 minutes from a secret-capable HTTP scheduler. The queue applies exponential backoff, caps automated attempts at ten, and offers an owner-only manual retry for failed jobs below that cap.

The notification job uses each user's configured timezone and reminder-day arrays. Its dedupe keys make retries and refreshes idempotent. Paid/cancelled installments and deleted/archived trips are excluded.

## Financial history

The database trigger records inserts and changes to sale price, wholesale cost, paid amount, payment entries, payment status, currency, exchange rate, and cash/card splits. Audit rows contain financial values only, never traveler or attachment data. RLS permits users to read audit records only where `user_id = auth.uid()`; client writes and deletes are revoked.

The product metric is **markup**, calculated as `(sale price - wholesale cost) / wholesale cost * 100`, matching the existing generated database column. Zero wholesale cost produces zero markup. Amount due is clamped at zero.

Native payment plans store all values in integer minor units. `trip_payment_plans` owns card/cash allocations and `trip_installments` owns the monthly schedule. Schedule creation, payment correction/undo, cash updates, rescheduling, and future recalculation use audited RPCs; authenticated clients receive read-only table grants. Paid or partially paid installment expectations are not changed by recalculation.

Existing trips receive a `source = 'legacy'` summary only. Existing sale and paid totals are preserved, and no installment rows or fictional due dates are generated. Legacy summaries require manual review before conversion to a native plan.

## Reports and deterministic tools

`get_travel_reports` is an owned, RLS-compatible aggregation RPC for monthly profit, destination performance, repeat clients, unpaid trips, markup groups, and currency-separated totals. It excludes soft-deleted/cancelled trips and archived trips by default. CSV/XLSX exports use the active filters, localized headers, explicit currency columns, safe filenames, and formula-injection escaping.

Itinerary, activity organization, packing, summary, completeness, WhatsApp, and pricing assistance are deterministic. They do not call an AI or maps/weather provider, invent live business facts, or automatically change a sale price.

## Search and pagination

`get_trips_page` performs page-based server pagination with a stable `start_date`, `created_at`, and `id` order. Page size is capped at 100. Search uses a generated, trigram-indexed document containing destination, client name, traveler names, hotel, trip status, and payment status. Heavy JSON fields are fetched only through the owned-detail RPC.

## Migration history

Existing migration files were not deleted or rewritten because deployed migration history could depend on them. The production-hardening migration is additive and uses `IF NOT EXISTS`, `CREATE OR REPLACE`, and idempotent encryption checks where practical. Duplicate historical Travel Mode migrations should remain in place unless production migration records are reconciled explicitly.

## Verification

Run:

```bash
npm run test:travel
npm run typecheck
npm run i18n:check
npm run lint
npm run build
```

The focused test script verifies privacy boundaries, payload whitelisting, exact minor-unit splits, calendar-month/leap-year dates, paid/due states, duplication shifts, deterministic tools, report currency separation, export injection safety, required RLS SQL, lazy detail loading, dashboard query boundaries, chart measurement gates, and PDF cleanup. Full RLS and storage lifecycle behavior must also be exercised against a Supabase staging project after migration.

After staging deployment, verify exact PostgREST contracts with an authenticated test account:

```sql
select to_regprocedure('public.get_trip_details(uuid)');
select to_regprocedure('public.get_trip_dashboard_items(text)');
select to_regprocedure('public.get_trips_page(text,integer,integer,text,text,text,integer,text)');
select has_function_privilege('authenticated', 'public.get_trip_details(uuid)', 'EXECUTE');
select has_function_privilege('anon', 'public.get_trip_details(uuid)', 'EXECUTE');
select to_regprocedure('public.create_trip_payment_plan(uuid,text,text,bigint,bigint,integer,date,text)');
select to_regprocedure('public.get_travel_reports(date,date,text,text,boolean)');
```

Run `scripts/verify-travel-runtime.sql` and `scripts/verify-travel-smart-workflows.sql` with two staging users. Both scripts wrap mutations in a transaction and finish with `ROLLBACK`. Confirm cross-user IDs return no rows, detail omits legacy passport keys, dashboard/page payloads omit heavy fields, reports remain currency-separated, and Trash exposes only the caller's deleted trips.

## Locking and rollback notes

These migrations do not update `auth.users`, delete existing trips, or remove attachments. They add columns, indexes, functions, triggers, and RLS-protected tables. `ALTER TABLE ... ADD COLUMN` takes a brief metadata lock; apply during a low-traffic window and monitor long-running transactions. Index creation is not concurrent because Supabase migrations run transactionally; the potentially largest indexes are documented here for staging timing before production.

Rollback is operational rather than destructive: stop scheduled jobs and deploy the prior frontend first, then revoke/drop newly added functions and tables only after exporting any new audit/activity/template/notification records that must be retained. Keep passport encryption keys and encrypted values together. Do not drop cleanup queue data while attachment jobs remain pending.
