import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json } from '../_shared/travel-whatsapp.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !serviceRoleKey || request.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return json({ error: 'UNAUTHENTICATED' }, 401);
  }
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  const { data: due, error } = await admin.from('whatsapp_reminders').select('id')
    .in('status', ['scheduled', 'failed']).lte('scheduled_for', now)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).order('scheduled_for').limit(25);
  if (error) return json({ error: 'REMINDER_QUERY_FAILED' }, 500);

  let processed = 0;
  for (const item of due || []) {
    const { data: claimed } = await admin.from('whatsapp_reminders').update({ status: 'processing', updated_at: now })
      .eq('id', item.id).in('status', ['scheduled', 'failed']).select('id').maybeSingle();
    if (!claimed) continue;
    const response = await fetch(`${url}/functions/v1/send-whatsapp-message`, {
      method: 'POST', headers: { Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'process_reminder', reminder_id: item.id }),
    });
    if (!response.ok && response.status >= 500) console.error('[Travel WhatsApp] reminder processing failed', { code: 'WORKER_SEND_FAILED' });
    processed += 1;
  }
  return json({ processed });
});
