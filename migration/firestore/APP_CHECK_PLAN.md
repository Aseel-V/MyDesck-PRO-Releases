# App Check plan

Status: **EVALUATED — NOT ENFORCED OR DEPLOYED IN PHASE 2**

App Check is an abuse-control signal. Firebase Auth, Rules, and server-side tenant authorization remain mandatory even after enforcement.

## Web

Register the production web app with reCAPTCHA Enterprise, initialize App Check before Firebase data services, and first deploy in metrics-only mode. Validate all supported browsers and Auth flows, then enable enforcement separately for callable Functions, Firestore, and Storage. Emulator tests keep using emulator/debug support and must never ship a debug token.

## Electron

Treat Electron as a separate client posture. The renderer must contain only the Firebase web client SDK; it must not contain Firebase Admin or a service-account key. Browser reCAPTCHA depends on a supported web context and is not assumed to attest a packaged desktop binary. Before enforcement, run a packaged-app proof for Auth persistence, refresh, Functions, Firestore, and Storage. If built-in web attestation is unsuitable, use a custom provider: native/main-process evidence is verified by a trusted backend, which then mints a short-lived App Check token. The renderer never receives the signing credential.

## Functions

After web and desktop token acquisition pass, change callable declarations to `onCall({ enforceAppCheck: true }, handler)`. Monitor rejection metrics before enforcement. Idempotency remains the replay defense for financial commands; App Check replay protection can be evaluated separately because it adds another network round trip.

## Firestore and Storage

Enable enforcement only after both client types produce valid tokens. Rules continue to enforce UID, tenant, immutable ownership, and protected financial/audit fields. Storage remains private by path and Rules; App Check does not make a public URL private.

Sources: [web App Check with reCAPTCHA](https://firebase.google.com/docs/app-check/web/recaptcha-provider), [Cloud Functions enforcement](https://firebase.google.com/docs/app-check/cloud-functions), [service enforcement](https://firebase.google.com/docs/app-check/enable-enforcement), and [custom providers for desktop or unsupported platforms](https://firebase.google.com/docs/app-check/custom-provider).

