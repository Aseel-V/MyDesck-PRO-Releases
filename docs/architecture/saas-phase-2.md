# MyDesck PRO SaaS phase 2 architecture

## Safe product visuals

The public product tour renders pure presentational components from versioned fixtures in `src/marketing/demo/demoFixtures.ts`. The fixture graph imports no authentication, database, storage, repository, or application provider. Identifiers, names, dates, amounts, and workflow states are deterministic and fictional.

The production travel, POS, restaurant, and repair components were inspected before this boundary was selected. Several are coupled to authenticated hooks, repositories, scanner listeners, or live data services. Importing them into a public route would make an accidental production connection possible and would pull authenticated application code into the marketing bundle. The visual renderers therefore reuse the repository's information architecture, terminology, status patterns, and product styling without executing those connected components.

`npm run demo:capture` captures every view in English, Arabic, and Hebrew at desktop and mobile sizes. It refuses non-local hostnames and writes ignored artifacts under `output/playwright/product-demo`.

## Lead delivery and spam safety

The request-access UI depends on `LeadSubmissionAdapter`. The only active adapter prepares a `mailto:` message and returns `stored: false`; the UI never claims a lead was submitted or stored. A future server adapter must add origin validation, schema validation, rate limiting, bot mitigation, idempotency, abuse monitoring, and explicit retention rules before it is enabled. No public Firestore write is present.

## Onboarding boundary

`src/domain/saas/onboarding.ts` defines the future account-to-dashboard workflow without provisioning an account or tenant. A trusted server implementation of `OnboardingProvisioningPort`, authorization rules, and tenant-creation idempotency are required before public signup can exist.

## Commercial boundary

`src/domain/saas/commercial.ts` models MyDesck PRO plans, trials, subscriptions, billing customers, events, and limits. This is a separate bounded context from customer operational sales, payments, installments, receipts, and business financial records. No payment processor is integrated.

## Analytics boundary

Marketing UI emits typed funnel events through `AnalyticsAdapter`. `NoopAnalyticsAdapter` is the default and performs no network requests, cookie writes, or persistent storage. Adding a vendor requires an explicit privacy and product decision.
