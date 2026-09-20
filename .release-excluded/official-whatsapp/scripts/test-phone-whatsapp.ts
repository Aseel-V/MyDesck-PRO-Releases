import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatIsraeliPhoneForDisplay, getWhatsAppPhoneNumber, isValidIsraeliPhoneNumber,
  normalizeIsraeliPhoneNumber,
} from '../src/lib/phoneNumbers';
import { createWhatsAppUrl } from '../src/lib/tripWhatsapp';
import { hmacSha256, safeProviderFailure, sha256 } from '../supabase/functions/_shared/travel-whatsapp';

console.log('[phone-whatsapp] Running phone and official WhatsApp contract tests...');

const IsraeliCases: Array<[string, string]> = [
  ['0543333559', '+972543333559'], ['054-333-3559', '+972543333559'],
  ['05 4333 3559', '+972543333559'], ['972543333559', '+972543333559'],
  ['+972543333559', '+972543333559'], ['00972543333559', '+972543333559'],
  ['٠٥٤٣٣٣٣٥٥٩', '+972543333559'],
];
for (const [input, expected] of IsraeliCases) {
  assert.equal(normalizeIsraeliPhoneNumber(input), expected, input);
  assert.equal(isValidIsraeliPhoneNumber(input), true, input);
}
assert.equal(normalizeIsraeliPhoneNumber('+12025550123'), '+12025550123');
assert.equal(normalizeIsraeliPhoneNumber('00442079460958'), '+442079460958');
for (const invalid of ['', '05433', '05433335591234', 'phone0543333559', '0112345678', '+9720543333559', '972123']) {
  assert.equal(normalizeIsraeliPhoneNumber(invalid), null, invalid);
}
assert.equal(getWhatsAppPhoneNumber('054-333-3559'), '+972543333559');
assert.equal(formatIsraeliPhoneForDisplay('0543333559'), '+972 54-333-3559');
assert.equal(createWhatsAppUrl('0543333559', 'Hello'), 'https://wa.me/972543333559?text=Hello');

const read = (path: string) => readFileSync(path, 'utf8');
const form = read('src/components/trips/NewTripForm.tsx');
const dialog = read('src/components/trips/TripWhatsappDialog.tsx');
const payload = read('src/lib/tripPayload.ts');
const migration = read('supabase/migrations/20260729100000_travel_whatsapp_official_messaging.sql');
const sender = read('supabase/functions/send-whatsapp-message/index.ts');
const worker = read('supabase/functions/process-whatsapp-reminders/index.ts');
const webhook = read('supabase/functions/whatsapp-status-webhook/index.ts');
const clientSources = [read('src/lib/tripWhatsappDelivery.ts'), dialog, form].join('\n');
const en = JSON.parse(read('src/i18n/locales/en.json'));

assert.match(form, /onBlur:[\s\S]*normalizeIsraeliPhoneNumber/);
assert.match(form, /dir="ltr"/);
assert.match(dialog, /onBlur=.*setPhone\(normalizedPhone\)/);
assert.match(dialog, /font-mono" dir="ltr"/);
assert.match(payload, /throw new Error\('INVALID_CLIENT_PHONE'\)/);
assert.match(migration, /BEFORE INSERT OR UPDATE OF client_phone/);
assert.match(migration, /Existing trip rows are deliberately not rewritten/);
assert.doesNotMatch(migration, /^\s*(?:DELETE\s+FROM|UPDATE\s+public\.trips|TRUNCATE|DROP\s+TABLE|ALTER\s+TABLE[^;]+DROP\s+CONSTRAINT)\b/im);

assert.match(sender, /UNAUTHENTICATED/);
assert.match(sender, /\.eq\('user_id', ownerId\)/, 'cross-tenant trip access must be denied');
assert.match(sender, /canonicalRecipient\(body\.recipient_phone\)/);
assert.match(sender, /CONSENT_REQUIRED/);
assert.match(sender, /whatsapp_opt_out_at/);
assert.match(sender, /TEMPLATE_NOT_ALLOWED/);
assert.match(sender, /MISSING_TEMPLATE_VARIABLES/);
assert.match(sender, /error\?\.code === '23505'/, 'duplicate idempotency key must not resend');
assert.match(sender, /RETRY_CONTEXT_MISMATCH/, 'retry must remain bound to its original delivery context');
assert.match(sender, /attempt_count/);
assert.match(sender, /Math\.min\(60, 2 \*\* attemptCount\)/, 'retry backoff must be bounded');
assert.match(sender, /status: 'skipped', last_failure_code: 'CONSENT_REQUIRED'/);
assert.match(worker, /\.limit\(25\)/);
assert.match(worker, /status: 'processing'/);
assert.match(webhook, /x-hub-signature-256/i);
assert.match(webhook, /constantTimeEqual/);
assert.match(webhook, /eventError\?\.code === '23505'/);

assert.match(migration, /USING \(user_id = auth\.uid\(\)\)/);
assert.match(migration, /status IN \('scheduled', 'processing', 'sent', 'failed', 'cancelled', 'skipped'\)/);
assert.doesNotMatch(clientSources, /WHATSAPP_(?:ACCESS_TOKEN|APP_SECRET|VERIFY_TOKEN|PHONE_NUMBER_ID|BUSINESS_ACCOUNT_ID)/);
assert.doesNotMatch(sender + webhook + worker, /console\.(?:log|error)\([^\n]*(?:recipient|client_name|phone)/i);

assert.match(en.trips.whatsapp.messages.cash_balance, /Confirmed cash payments/);
assert.match(en.trips.whatsapp.messages.visa_installment, /not a bank charge confirmation/);
assert.match(en.trips.whatsapp.messages.payment_summary, /Visa\/Card schedule/);
assert.match(en.trips.whatsapp.messages.payment_summary, /Confirmed cash payments/);

assert.equal(safeProviderFailure(503).retryable, true);
assert.equal(safeProviderFailure(400).retryable, false);
assert.equal(await sha256('same-key'), await sha256('same-key'));
assert.notEqual(await sha256('same-key'), await sha256('different-key'));
assert.equal((await hmacSha256('secret', 'payload')).length, 64);

console.log(`[phone-whatsapp] ${IsraeliCases.length} Israeli normalization forms passed.`);
console.log('[phone-whatsapp] Tenant, consent, template, idempotency, retry, webhook, wording, RTL, and secret-boundary contracts passed.');
