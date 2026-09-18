# Cutover build environment

Step 12 of `FIRESTORE_CUTOVER_PLAN.md` is a **build-time** switch, not a runtime flag. `src/main.tsx`
calls `selectBackend(import.meta.env, location.hostname)`, and Vite inlines those values when the
bundle is built — so nothing in a running installation can be flipped to Firestore after the fact.
Cutting over means producing a new production build and shipping it.

None of the variables below are currently set. `.env` holds only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, and `scripts/check-auth-build-config.mjs` still validates only those two,
so it will pass a build that has no Firebase configuration at all. Treat that script as covering the
Supabase half only until it is extended.

## Required for `VITE_DATA_BACKEND=firestore`

`selectBackend` throws unless every one of these holds, so a misconfigured build fails loudly at
startup rather than silently falling back to Supabase:

| Variable | Required value | Thrown error if wrong |
|---|---|---|
| `VITE_DATA_BACKEND` | `firestore` | `INVALID_BACKEND_MODE` |
| *(build mode)* | production build: `PROD=true`, `DEV=false` | `REAL_FIRESTORE_REQUIRES_PRODUCTION_BUILD` |
| `VITE_FIREBASE_PROJECT_ID` | `mydesckpro` | `REAL_FIRESTORE_TARGET_MISMATCH` |
| `VITE_FIRESTORE_DATABASE_ID` | `default` | `REAL_FIRESTORE_TARGET_MISMATCH` |
| `VITE_FIRESTORE_PRODUCTION_RELEASE` | `mydesck-firestore-v1` | `REAL_FIRESTORE_RELEASE_NOT_APPROVED` |
| `VITE_SUPABASE_FALLBACK_DISABLED` | `true` | `SUPABASE_FALLBACK_MUST_BE_DISABLED` |
| `VITE_FIREBASE_EXPECTED_PLAN` | `SPARK` | `FIREBASE_SPARK_PLAN_REQUIRED` |
| `VITE_FIREBASE_BILLING_ENABLED` | `false` | `FIREBASE_BILLING_MUST_REMAIN_DISABLED` |

## Also required by the client

`src/data/firebaseClient.ts` reads two more. These are not validated by `selectBackend`, so a build
missing them passes the selector and then fails when Firebase Auth initialises:

- `VITE_FIREBASE_API_KEY` — the Web API key for `mydesckpro`
- `VITE_FIREBASE_AUTH_DOMAIN` — normally `mydesckpro.firebaseapp.com`

A Firebase Web API key is a public client identifier, not a credential; access is controlled by
Security Rules and by the API key's own referrer/API restrictions. It still belongs in the build
configuration rather than in source.

## Supabase variables stay

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` remain required after cutover. Storage is
intentionally retained and reached through `StorageRepository` using a Firebase ID token via
Supabase third-party auth. Removing them would break signatures and logos.

## Maintenance flag

`VITE_MIGRATION_MAINTENANCE=true` makes `FirestoreTravelRepository` reject the operations in
`FROZEN_OPERATIONS`. Note what it does not do: it is wired into the Firestore repository only, so it
cannot freeze a Supabase-backed build. There is no implemented write freeze for the currently
shipped product.

## What shipping involves

This is a distributed desktop application. `npm run release` runs `electron-builder --win --publish
always`, which publishes a GitHub release that existing installations pick up through the desktop
updater. The cutover therefore reaches real customers' machines; it is not a server-side switch that
can be reverted by redeploying. `vercel.json` covers the web surface separately.

Rolling back means publishing a further release built with `VITE_DATA_BACKEND=supabase`, and that
rollback is only sound while the Supabase source database and `auth.users` remain intact — which is
why the cutover plan keeps them read-only through the approved rollback window rather than deleting
them.
