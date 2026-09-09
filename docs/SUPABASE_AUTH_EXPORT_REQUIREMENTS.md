# Supabase auth export — access requirements

Phase 15 deliverable. **Nothing here has been executed against production.** This
records what will be needed later, so it can be arranged deliberately rather than
improvised on cutover day.

Do not paste a production connection string or password into chat, a ticket, or a
commit. Nothing in this document contains one.

---

## Why direct database access is unavoidable

Firebase imports a bcrypt hash and rehashes it on the user's first successful
sign-in. That is what makes a password migration transparent — the customer types
the same password and it simply works.

The hash lives in `auth.users.encrypted_password`. **Supabase does not expose it
through any API**, by design. There is no REST endpoint, no admin SDK call and no
dashboard export that returns it. The only way to read it is a direct PostgreSQL
connection to the project.

If that access cannot be arranged, transparent password migration is impossible
and the plan changes shape: every customer would need a reset email, which is a
materially worse migration and should be a deliberate decision, not a discovery.

---

## Minimum permissions

Create a dedicated role for the export. Do not reuse `postgres` or the service
role, and do not grant more than the four objects below.

```sql
-- Run once, by a project owner, on the Supabase project.
CREATE ROLE mydesck_migration_export LOGIN PASSWORD '<generated, stored in Secret Manager>';

GRANT USAGE ON SCHEMA auth, public TO mydesck_migration_export;

-- Exactly what the classifier and importer read. Nothing else.
GRANT SELECT ON auth.users              TO mydesck_migration_export;
GRANT SELECT ON auth.identities         TO mydesck_migration_export;
GRANT SELECT ON auth.mfa_factors        TO mydesck_migration_export;
GRANT SELECT ON public.business_profiles TO mydesck_migration_export;
GRANT SELECT ON public.user_profiles     TO mydesck_migration_export;
GRANT SELECT ON public.trips             TO mydesck_migration_export;
```

Properties that matter:

- **SELECT only.** No INSERT, UPDATE, DELETE, DDL or role management anywhere.
- **Not a superuser**, no `BYPASSRLS`, no `CREATEROLE`, no `CREATEDB`.
- **Time-boxed.** Create it for the migration window and `DROP ROLE` afterwards.
- **Read replica if available.** The export is a full table scan of `auth.users`;
  run it where it cannot affect customer latency.

`migration/sql/queries/auth-population.sql` runs entirely within these grants and
returns hash *presence*, *prefix* and *cost* — never the hash itself. It is safe
to save and attach to a report.

---

## Secure export process

The hash is the one artefact in this migration that is genuinely dangerous. Treat
it as key material, not as data.

1. **Classify first, in the clear.** Run `auth-population.sql` and review the
   blocker query. Resolve every duplicate email, missing email and orphaned auth
   row *before* any hash is read. Reading hashes for accounts that then turn out
   to be blocked is avoidable exposure.

2. **Read hashes into memory, not onto disk.**
   `migration/tools/firebase-auth-import.mjs` streams from PostgreSQL, builds the
   import records and holds them only for the duration of the run. It never
   writes a hash to the report, the ledger SQL or a log line — the redaction is
   allow-list shaped and covered by tests.

3. **If an intermediate file is unavoidable** (for example, to split a long
   import across sessions), then:
   - write it to an encrypted volume or `age`/`gpg`-encrypt it at rest,
   - store it outside the repository and outside any synced folder such as
     OneDrive or Dropbox,
   - give it a filename that does not describe its contents,
   - never attach it to a ticket, chat message or CI artefact.

4. **Import over TLS only**, from a machine you control, to the Firebase staging
   project first.

5. **Delete on success.** Shred the intermediate file
   (`shred -u` on Linux, `Remove-Item` plus disk encryption on Windows), revoke
   and `DROP ROLE mydesck_migration_export`, rotate its password in Secret
   Manager, and record the deletion time in the migration log.

6. **Rotation is the backstop.** Firebase rehashes each password on first
   successful sign-in, so the imported hashes age out naturally. If an exposure
   is ever suspected, the correct response is a forced password reset for the
   affected accounts — not silence.

---

## What is NOT needed

Worth stating, because over-provisioning is the usual failure here:

- No write access to Supabase at any point. Supabase stays the source of truth
  and stays untouched.
- No access to Supabase Storage for the auth migration; object migration is a
  separate manifest with its own credentials.
- No production Firebase access during staging validation.
- No `service_role` key. The auth export does not go through PostgREST.

---

## Checklist before the export is run

- [ ] Firebase **staging** project exists and is confirmed not to be `mydesckpro`
- [ ] Firebase Admin SDK service account issued, stored in Secret Manager
- [ ] bcrypt round-trip proved on a throwaway project with synthetic accounts
- [ ] `mydesck_migration_export` role created with exactly the grants above
- [ ] Blocker query returns zero rows, or every row has a recorded human decision
- [ ] Destination for any intermediate file chosen, encrypted, and outside sync
- [ ] Deletion procedure agreed and an owner named
