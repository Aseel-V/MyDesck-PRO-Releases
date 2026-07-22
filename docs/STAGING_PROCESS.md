# Staging Infrastructure Setup & Verification Process

This document provides the exact setup checklist for establishing the staging infrastructure required to run live release gates before any release can be published.

## 1. Repository Owner Setup Checklist

### Step A: Supabase Staging Project Setup
1. Create a new Supabase project named `MyDesck-PRO-Staging` (separate from production).
2. Apply all migrations from `supabase/migrations/` using Supabase CLI:
   ```bash
   npx supabase db push --db-url <STAGING_DATABASE_URL>
   ```
3. Create two staging test users in Supabase Authentication (or via Admin API with auto-confirm enabled):
   - User A: `staging-user-a@mydesck-test.com` (Password: `<generate-a-unique-random-password-for-user-a>`)
   - User B: `staging-user-b@mydesck-test.com` (Password: `<generate-a-unique-random-password-for-user-b>`)
   - Note: User A and User B MUST use completely distinct random passwords entered directly into GitHub Secrets (`STAGING_USER_A_PASSWORD` and `STAGING_USER_B_PASSWORD`).

### Step B: Vercel Staging Environment Setup
1. In Vercel Dashboard, create a preview environment / project alias `mydesck-pro-staging.vercel.app`.
2. Generate a Vercel Personal Access Token under **Account Settings -> Tokens**.
3. Obtain `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from `.vercel/project.json` or Project Settings.

### Step C: Add GitHub Repository Secrets
Navigate to **GitHub Repository Settings -> Secrets and variables -> Actions**, and add the following repository secrets:

| Secret Name | Description / Source |
| :--- | :--- |
| `STAGING_SUPABASE_URL` | API URL from Supabase Staging Project Settings |
| `STAGING_SUPABASE_ANON_KEY` | Public Anon Key from Supabase Staging Project Settings |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Service Role Key from Supabase Staging Project Settings |
| `STAGING_DATABASE_URL` | Postgres Connection String from Supabase Staging |
| `STAGING_APP_URL` | URL of the Vercel Staging deployment (`https://mydesck-pro-staging.vercel.app`) |
| `STAGING_USER_A_EMAIL` | `staging-user-a@mydesck.internal` |
| `STAGING_USER_A_PASSWORD` | Password for User A |
| `STAGING_USER_B_EMAIL` | `staging-user-b@mydesck.internal` |
| `STAGING_USER_B_PASSWORD` | Password for User B |
| `VERCEL_TOKEN` | Personal Access Token generated in Vercel Account Settings |
| `VERCEL_ORG_ID` | Vercel Organization ID |
| `VERCEL_PROJECT_ID` | Vercel Project ID |

### Step D: Configure Protected GitHub Environment (`production`)
Navigate to **GitHub Repository Settings -> Environments**:
1. Create a new Environment named `production`.
2. Enable **Required reviewers** and select the repository owner / lead engineer.
3. Save protection rules.

---

## 2. Staging Gate Execution Order

1. **Deploy Staging Preview**: Build and deploy commit to Vercel Staging preview environment.
2. **Verify Staging Database**: Execute `npm run test:staging-db` to verify RPCs, PostgREST resolution, generated column write isolation, CHECK constraints, and transaction rollback.
3. **Playwright E2E Suite**: Execute `npm run test:staging-e2e` to run real browser tests against the staging app URL.
4. **Desktop Staging Updater Verification**: Execute `npm run test:desktop-updater-staging` to verify staging pre-release updater channel assets.
5. **Environment Approval**: GitHub Actions pauses job `production-approval` for required reviewer approval in the `production` environment UI.
