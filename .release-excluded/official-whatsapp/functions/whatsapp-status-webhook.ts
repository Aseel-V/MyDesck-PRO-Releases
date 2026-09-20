import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { constantTimeEqual, hmacSha256, json } from '../_shared/travel-whatsapp.ts';

const providerStatuses: Record<string, string> = { accepted: 'accepted', sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };

Deno.serve(async (request: Request) => {
  const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || '';
  if (request.method === 'GET') {
    const url = new URL(request.url);
    if (url.searchParams.get('hub.mode') === 'subscribe' && verifyToken && constantTimeEqual(url.searchParams.get('hub.verify_token') || '', verifyToken)) {
      return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
    }
    return json({ error: 'VERIFICATION_FAILED' }, 403);
  }
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') || '';
  const signature = request.headers.get('x-hub-signature-256') || '';
  const rawBody = await request.text();
  const expected = appSecret ? `sha256=${await hmacSha256(appSecret, rawBody)}` : '';
  if (!appSecret || !signature || !constantTimeEqual(signature, expected)) return json({ error: 'INVALID_SIGNATURE' }, 401);

  try {
    const payload = JSON.parse(rawBody) as { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<Record<string, unknown>> } }> }> };
    const statuses = payload.entry?.flatMap((entry) => entry.changes || []).flatMap((change) => change.value?.statuses || []) || [];
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    let updated = 0;
    for (const event of statuses) {
      const providerMessageId = typeof event.id === 'string' ? event.id : '';
      const status = typeof event.status === 'string' ? providerStatuses[event.status] : null;
      if (!providerMessageId || !status) continue;
      const eventId = await hmacSha256(appSecret, `${providerMessageId}|${status}|${String(event.timestamp || '')}`);
      const { error: eventError } = await admin.from('whatsapp_webhook_events').insert({ event_id: eventId, provider_message_id: providerMessageId, status });
      if (eventError?.code === '23505') continue;
      if (eventError) throw new Error('WEBHOOK_EVENT_SAVE_FAILED');
      const values: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === 'sent' || status === 'delivered' || status === 'read') {
        values.sent_at = new Date().toISOString();
      }
      if (status === 'failed') {
        values.failed_at = new Date().toISOString(); values.failure_code = 'PERMANENT_PROVIDER_DELIVERY_FAILED';
        values.failure_message_safe = 'The provider reported a delivery failure.';
      }
      await admin.from('whatsapp_message_log').update(values).eq('provider_message_id', providerMessageId);
      updated += 1;
    }
    return json({ received: true, updated });
  } catch {
    console.error('[Travel WhatsApp] webhook processing failed', { code: 'WEBHOOK_PROCESSING_FAILED' });
    return json({ error: 'WEBHOOK_PROCESSING_FAILED' }, 400);
  }
});
