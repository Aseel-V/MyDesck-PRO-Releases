import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeIsraeliPhoneNumber } from '../src/lib/phoneNumbers';

const dialog = readFileSync('src/components/trips/TripWhatsappDialog.tsx', 'utf8');
const form = readFileSync('src/components/trips/NewTripForm.tsx', 'utf8');

assert.equal(normalizeIsraeliPhoneNumber('050-123-4567'), '+972501234567');
assert.equal(normalizeIsraeliPhoneNumber('+972 50 123 4567'), '+972501234567');
assert.equal(normalizeIsraeliPhoneNumber('972501234567'), '+972501234567');
assert.equal(normalizeIsraeliPhoneNumber('123'), null);

assert.match(form, /normalizeIsraeliPhoneNumber\(data\.client_phone\)/);
assert.match(dialog, /createWhatsAppUrl\(phone, body\)/);
assert.match(dialog, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/);
assert.doesNotMatch(dialog, /sendOfficialWhatsappMessage|scheduleOfficialWhatsappReminder|sendAutomatically/);
assert.doesNotMatch(dialog, /whatsapp_contact_consents|whatsapp_message_log|whatsapp_reminders/);
assert.equal(
  existsSync('supabase/migrations/20260729100000_travel_whatsapp_official_messaging.sql'),
  false,
  'unfinished official WhatsApp migration must remain outside the release migration path',
);

console.log('Travel phone normalization and manual WhatsApp release gate passed.');
