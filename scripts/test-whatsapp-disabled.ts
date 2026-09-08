import assert from 'node:assert/strict';
import { handleWhatsAppRequest } from '../supabase/functions/send-whatsapp/handler';
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error('Network must not be used'); };
for (const authorization of ['', 'Bearer invalid', 'Bearer tenant-a', 'Bearer tenant-b', 'Bearer admin']) {
  for (const business_id of ['tenant-a','tenant-b']) {
    const response = handleWhatsAppRequest(new Request('https://local.invalid/send-whatsapp', {
      method: 'POST', headers: { authorization }, body: JSON.stringify({ business_id, phone_number: '+972501234567' }),
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'AUTOMATED_WHATSAPP_UNAVAILABLE');
  }
}
assert.equal(handleWhatsAppRequest(new Request('https://local.invalid', { method: 'POST', body: '{' })).status, 503);
assert.equal(outbound, 0);
console.log('Automated WhatsApp disabled for anonymous, malformed and all tenant/admin requests; no provider calls.');
