import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onboardingStepOrder } from '../src/domain/saas/onboarding.ts';
import { DEMO_FIXTURE_VERSION, demoScreens, industryScreens } from '../src/marketing/demo/demoFixtures.ts';
import { NoopAnalyticsAdapter } from '../src/marketing/analytics/analytics.tsx';
import { validateLeadSubmission } from '../src/marketing/leads/leadValidation.ts';

assert.equal(DEMO_FIXTURE_VERSION, '2026.09.20-v1');
assert.equal(demoScreens.length, 10);
assert.equal(industryScreens.travel.length, 5);
assert.deepEqual(onboardingStepOrder, ['account', 'workspace', 'business-type', 'language', 'currency', 'company-info', 'sample-data', 'dashboard']);
assert.doesNotThrow(() => new NoopAnalyticsAdapter().track({ name: 'page_view', path: '/', locale: 'en' }));

const errors = validateLeadSubmission({ name: '', businessName: '', email: 'not-an-email', country: '', businessType: 'travel-agency', teamSize: '2-5', intent: 'trial', locale: 'en' }, 'required', 'invalid');
assert.equal(errors.name, 'required');
assert.equal(errors.email, 'invalid');

for (const path of [
  '../src/marketing/demo/demoFixtures.ts',
  '../src/marketing/visuals/ProductVisual.tsx',
  '../src/marketing/demo/ProductShowcase.tsx',
]) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /firebase|firestore|supabase|getBackend|useAuth|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/i, `${path} must remain production-isolated`);
}

const leadAdapter = await readFile(new URL('../src/marketing/leads/MailtoLeadSubmissionAdapter.ts', import.meta.url), 'utf8');
assert.match(leadAdapter, /mailto:/);
assert.doesNotMatch(leadAdapter, /firebase|firestore|supabase|fetch\s*\(/i);

const commercial = await readFile(new URL('../src/domain/saas/commercial.ts', import.meta.url), 'utf8');
assert.match(commercial, /SaaS commercial-domain contracts/);
assert.doesNotMatch(commercial, /TripPayment|installment_id|receipt_number|business_finance/i);
console.log('SaaS foundation, demo isolation, lead adapter, and commercial boundary tests passed');
