# Firestore Rules, indexes, and Functions release package

The production Functions source is assembled into the ignored private build directory with:

```text
node migration/firestore/tools/build-production-functions-package.mjs
```

The release command must use `migration/firestore/firebase.production.json`. This prevents the emulator entrypoint from being deployed. Both commands remain blocked until the GO evidence and current/rollback Rules hashes are approved.

## Rules

Candidate Firestore Rules SHA-256: `bfb3413ad1af01377b8e079dd4cfa9ea7813a2b18b61a70c43ac0f9c520cee90`. Candidate Storage Rules SHA-256: `5ccf1d426c4fbe75133e0bdc31562888523ac7d7bce8ba4d11e5be6e09af73bb`.

Candidate tests remain 25/25 Rules, 9/9 adversarial controls, 50/50 full tenant matrix, and private signature/attachment Storage checks. The current project Rules could not be read with the inventory principal (403). Consequently, expected-current hashes and rollback source are intentionally unresolved and the release manifest returns `NO_GO`. The later deployment procedure is: export current rulesets, hash and review the diff, sign the manifest, compare live hash immediately before deployment, deploy candidate, verify deployed hash, rerun synthetic real-project security tests, and deploy the captured rollback rules on any failure.

## Indexes

The real database contains zero composite indexes. All three candidate composites are `REQUIRED_BEFORE_CUTOVER`; their exact fields and affected queries are in `release/index-inventory.json`. Deploy them before Rules/Functions activation, poll Firestore operations until every index reports READY, and compare the exported deployed index specification with candidate SHA-256 `b145d250a7f5238a6092761217efff7122409253f2ce34846b2d9393e9ef1832`. Large build time is possible for preloaded collections, so the bulk copy must pause or use an approved build order if index backfill throttles writes.

## Functions

The production candidate entrypoint is `functions/production-index.mjs`, SHA-256 `1b3ddfa817edd08f880381846e20f31f9890c3705bcc23632d04e4dc668c0c80`, Node.js 22, `us-central1`, and the dedicated `mydesck-functions` runtime identity. The five travel callables require Firebase Auth and App Check and repeat tenant validation under Admin SDK. They use transaction/idempotency records and have no external side effect.

There are no Firestore-triggered Functions in the candidate, so bulk writes cannot send notifications, call payments/webhooks, delete Storage, or create duplicate events. WhatsApp remains quarantined. Staff/privilege, document-generation, and Storage-cleanup operations are evaluated as later legacy/server work and are not activated for the travel switch.

The real Cloud Functions API is disabled and billing is absent. No Function was deployed. Those conditions remain `NO_GO` until capability, identity, dormant deployment, App Check, and real synthetic smoke evidence pass.
