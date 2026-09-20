import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  TEMPLATE_FOR_MESSAGE, canonicalRecipient, corsHeaders, isLanguage, isTemplateKey, json,
  safeProviderFailure, sha256,
} from '../_shared/travel-whatsapp.ts';

type RequestBody = {
  action?: 'send' | 'schedule' | 'cancel' | 'retry' | 'process_reminder';
  trip_id?: string;
  message_type?: string;
  recipient_phone?: string;
  template_key?: string;
  language?: string;
  variables?: Record<string, unknown>;
  scheduled_for?: string;
  timezone?: string;
  trigger_type?: string;
  reminder_id?: string;
  retry_message_id?: string;
};

const TRIP_FIELDS = [
  'id', 'user_id', 'client_phone', 'client_name', 'destination', 'start_date', 'end_date', 'currency',
  'sale_price', 'payment_method', 'cash_paid_amount', 'hotel_name', 'airline_name', 'flight_number',
  'departure_airport', 'arrival_airport', 'departure_datetime', 'deleted_at',
].join(',');

const allowedTriggerTypes = new Set([
  'upcoming_trip', 'outstanding_cash_payment', 'upcoming_visa_installment', 'overdue_installment',
  'final_payment', 'trip_confirmation', 'hotel_details', 'flight_details', 'pre_departure',
]);

function requireEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`SERVER_CONFIG_${name}`);
  return value;
}

function money(minor: number, currency: string): string {
  return `${(Math.max(0, minor) / 100).toFixed(2)} ${currency}`;
}

function dateOnly(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function flightSummary(trip: Record<string, unknown>): string {
  return [trip.airline_name, trip.flight_number,
    trip.departure_airport && trip.arrival_airport ? `${trip.departure_airport}-${trip.arrival_airport}` : '',
    typeof trip.departure_datetime === 'string' ? trip.departure_datetime.slice(0, 16).replace('T', ' ') : '',
  ].filter(Boolean).join(' | ');
}

async function deriveVariables(admin: ReturnType<typeof createClient>, trip: Record<string, unknown>) {
  const [{ data: plan }, { data: installments }] = await Promise.all([
    admin.from('trip_payment_plans').select('currency,cash_total_minor,cash_paid_minor,card_total_minor,card_paid_minor').eq('trip_id', trip.id).maybeSingle(),
    admin.from('trip_installments').select('installment_number,due_date,expected_amount_minor,paid_amount_minor,status').eq('trip_id', trip.id).neq('status', 'cancelled').order('installment_number'),
  ]);
  const currency = String(plan?.currency || trip.currency || 'ILS');
  const cashRemaining = Math.max(0, Number(plan?.cash_total_minor || 0) - Number(plan?.cash_paid_minor || 0));
  const cardRemaining = Math.max(0, Number(plan?.card_total_minor || 0) - Number(plan?.card_paid_minor || 0));
  const next = (installments || []).find((item) => Number(item.paid_amount_minor) < Number(item.expected_amount_minor));
  const nextAmount = next ? Math.max(0, Number(next.expected_amount_minor) - Number(next.paid_amount_minor)) : 0;
  return {
    client_name: String(trip.client_name || ''), destination: String(trip.destination || ''),
    start_date: dateOnly(trip.start_date), end_date: dateOnly(trip.end_date), currency,
    cash_confirmed: money(Number(plan?.cash_paid_minor || 0), currency),
    cash_remaining: money(cashRemaining, currency),
    scheduled_through_today: money(Number(plan?.card_paid_minor || 0), currency),
    remaining_scheduled_amount: money(cardRemaining, currency),
    combined_remaining: money(cashRemaining + cardRemaining, currency),
    next_installment_amount: money(nextAmount, currency), next_installment_date: dateOnly(next?.due_date),
    hotel_name: String(trip.hotel_name || ''),
    hotel_dates: trip.hotel_name ? `${dateOnly(trip.start_date)} - ${dateOnly(trip.end_date)}` : '',
    flight_information: flightSummary(trip),
  };
}

async function sendProviderTemplate(
  recipient: string,
  template: { provider_template_name: string; provider_language_code: string; required_variables: string[] },
  variables: Record<string, string>,
) {
  const accessToken = requireEnvironment('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = requireEnvironment('WHATSAPP_PHONE_NUMBER_ID');
  requireEnvironment('WHATSAPP_BUSINESS_ACCOUNT_ID');
  const graphVersion = Deno.env.get('WHATSAPP_GRAPH_API_VERSION')?.trim() || 'v23.0';
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw new Error('SERVER_CONFIG_WHATSAPP_GRAPH_API_VERSION');
  const parameters = template.required_variables.map((name) => ({ type: 'text', text: variables[name] }));
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: recipient.replace(/^\+/, ''), type: 'template',
      template: {
        name: template.provider_template_name,
        language: { code: template.provider_language_code },
        components: parameters.length ? [{ type: 'body', parameters }] : undefined,
      },
    }),
  });
  const result = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }> };
  return { response, providerMessageId: result.messages?.[0]?.id || null };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const url = requireEnvironment('SUPABASE_URL');
    const anonKey = requireEnvironment('SUPABASE_ANON_KEY');
    const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization') || '';
    const body = await request.json() as RequestBody;
    const action = body.action || 'send';
    const serviceInvocation = action === 'process_reminder' && authorization === `Bearer ${serviceRoleKey}`;
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    let ownerId = '';
    let reminder: Record<string, unknown> | null = null;

    if (serviceInvocation) {
      const { data } = await admin.from('whatsapp_reminders').select('*').eq('id', body.reminder_id).eq('status', 'processing').maybeSingle();
      if (!data) return json({ error: 'REMINDER_NOT_CLAIMED' }, 409);
      reminder = data;
      ownerId = String(data.user_id);
      body.trip_id = String(data.trip_id); body.recipient_phone = String(data.recipient_phone);
      body.template_key = String(data.template_key); body.language = String(data.language);
      body.message_type = 'transactional';
    } else {
      if (!authorization.startsWith('Bearer ')) return json({ error: 'UNAUTHENTICATED' }, 401);
      const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user) return json({ error: 'UNAUTHENTICATED' }, 401);
      ownerId = user.id;
    }

    if (action === 'cancel' && !serviceInvocation) {
      const { data, error } = await admin.from('whatsapp_reminders').update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', body.reminder_id).eq('user_id', ownerId).eq('status', 'scheduled').select('id').maybeSingle();
      if (error || !data) return json({ error: 'REMINDER_NOT_CANCELLABLE' }, 409);
      return json({ status: 'cancelled', reminder_id: data.id });
    }

    const recipient = canonicalRecipient(body.recipient_phone);
    if (!body.trip_id || !recipient || !isLanguage(body.language) || !isTemplateKey(body.template_key)) {
      return json({ error: 'INVALID_REQUEST' }, 400);
    }
    const mappedTemplate = serviceInvocation ? body.template_key : TEMPLATE_FOR_MESSAGE[body.message_type || ''];
    if (!serviceInvocation && (!mappedTemplate || mappedTemplate !== body.template_key)) return json({ error: 'TEMPLATE_NOT_ALLOWED' }, 400);

    const { data: trip } = await admin.from('trips').select(TRIP_FIELDS).eq('id', body.trip_id).eq('user_id', ownerId).is('deleted_at', null).maybeSingle();
    if (!trip) return json({ error: 'TRIP_NOT_FOUND' }, 404);
    const persistedRecipient = canonicalRecipient(trip.client_phone);
    if (!persistedRecipient || persistedRecipient !== recipient) return json({ error: 'RECIPIENT_MISMATCH' }, 400);

    const { data: consent } = await admin.from('whatsapp_contact_consents').select('whatsapp_opt_in,whatsapp_opt_out_at')
      .eq('user_id', ownerId).eq('recipient_phone', recipient).maybeSingle();
    if (!consent?.whatsapp_opt_in || consent.whatsapp_opt_out_at) {
      if (reminder) {
        await admin.from('whatsapp_reminders').update({
          status: 'skipped', last_failure_code: 'CONSENT_REQUIRED', next_attempt_at: null,
          updated_at: new Date().toISOString(),
        }).eq('id', reminder.id);
      }
      return json({ error: 'CONSENT_REQUIRED' }, 403);
    }

    const { data: template } = await admin.from('whatsapp_server_templates')
      .select('template_key,message_type,provider_template_name,provider_language_code,required_variables,active')
      .eq('template_key', body.template_key).eq('language', body.language).eq('active', true).maybeSingle();
    if (!template || template.message_type !== 'transactional') return json({ error: 'TEMPLATE_NOT_ALLOWED' }, 400);

    const variables = await deriveVariables(admin, trip);
    const missing = (template.required_variables as string[]).filter((name) => !variables[name as keyof typeof variables]);
    if (missing.length) return json({ error: 'MISSING_TEMPLATE_VARIABLES', missing }, 400);

    if (action === 'schedule') {
      const scheduled = body.scheduled_for ? new Date(body.scheduled_for) : null;
      if (!scheduled || Number.isNaN(scheduled.valueOf()) || scheduled <= new Date()) return json({ error: 'INVALID_SCHEDULE' }, 400);
      if (!body.trigger_type || !allowedTriggerTypes.has(body.trigger_type)) return json({ error: 'INVALID_TRIGGER' }, 400);
      const occurrence = scheduled.toISOString();
      const idempotency = await sha256(`${ownerId}|${trip.id}|${recipient}|${template.template_key}|${occurrence}`);
      const { data, error } = await admin.from('whatsapp_reminders').insert({
        user_id: ownerId, trip_id: trip.id, recipient_phone: recipient, trigger_type: body.trigger_type,
        scheduled_for: occurrence, timezone: body.timezone || 'Asia/Jerusalem', template_key: template.template_key,
        language: body.language, status: 'scheduled', idempotency_key: idempotency,
      }).select('id,status,scheduled_for').single();
      if (error?.code === '23505') return json({ status: 'scheduled', duplicate: true });
      if (error) throw new Error('REMINDER_SAVE_FAILED');
      return json({ reminder_id: data.id, status: data.status, scheduled_for: data.scheduled_for }, 201);
    }

    let logId = '';
    let attemptCount = 1;
    if (action === 'retry' && !serviceInvocation) {
      const { data: failed } = await admin.from('whatsapp_message_log')
        .select('id,trip_id,recipient_phone,template_key,language,attempt_count,failure_code')
        .eq('id', body.retry_message_id).eq('user_id', ownerId).eq('status', 'failed').maybeSingle();
      if (!failed || Number(failed.attempt_count) >= 5 || String(failed.failure_code || '').startsWith('PERMANENT_')) {
        return json({ error: 'MESSAGE_NOT_RETRYABLE' }, 409);
      }
      if (failed.trip_id !== trip.id || failed.recipient_phone !== recipient ||
          failed.template_key !== template.template_key || failed.language !== body.language) {
        return json({ error: 'RETRY_CONTEXT_MISMATCH' }, 409);
      }
      logId = failed.id; attemptCount = Number(failed.attempt_count) + 1;
      await admin.from('whatsapp_message_log').update({ status: 'queued', attempt_count: attemptCount, failure_code: null, failure_message_safe: null, updated_at: new Date().toISOString() }).eq('id', logId);
    } else {
      const occurrence = reminder ? String(reminder.scheduled_for) : new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
      const idempotency = await sha256(`${ownerId}|${trip.id}|${recipient}|${template.template_key}|${occurrence}`);
      const { data: inserted, error } = await admin.from('whatsapp_message_log').insert({
        user_id: ownerId, trip_id: trip.id, reminder_id: reminder?.id || null, recipient_phone: recipient,
        message_type: template.message_type, template_key: template.template_key, language: body.language,
        status: 'queued', idempotency_key: idempotency, scheduled_for: reminder?.scheduled_for || null,
        attempt_count: 1, variable_snapshot: { variable_keys: template.required_variables },
      }).select('id').single();
      if (error?.code === '23505') return json({ status: 'duplicate', duplicate: true });
      if (error) throw new Error('MESSAGE_LOG_FAILED');
      logId = inserted.id;
    }

    const { response, providerMessageId } = await sendProviderTemplate(recipient, template, variables);
    if (!response.ok || !providerMessageId) {
      const failure = safeProviderFailure(response.status);
      await admin.from('whatsapp_message_log').update({ status: 'failed', failed_at: new Date().toISOString(), failure_code: failure.retryable ? failure.code : `PERMANENT_${failure.code}`, failure_message_safe: failure.message, updated_at: new Date().toISOString() }).eq('id', logId);
      if (reminder) {
        const delayMinutes = Math.min(60, 2 ** attemptCount);
        await admin.from('whatsapp_reminders').update({
          status: failure.retryable && attemptCount < 5 ? 'failed' : 'skipped', attempt_count: attemptCount,
          next_attempt_at: failure.retryable && attemptCount < 5 ? new Date(Date.now() + delayMinutes * 60000).toISOString() : null,
          last_failure_code: failure.code, updated_at: new Date().toISOString(),
        }).eq('id', reminder.id);
      }
      return json({ error: failure.code, retryable: failure.retryable }, failure.retryable ? 503 : 422);
    }

    await admin.from('whatsapp_message_log').update({ status: 'accepted', provider_message_id: providerMessageId, updated_at: new Date().toISOString() }).eq('id', logId);
    if (reminder) await admin.from('whatsapp_reminders').update({ status: 'sent', attempt_count: attemptCount, updated_at: new Date().toISOString() }).eq('id', reminder.id);
    return json({ message_id: logId, status: 'accepted' });
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith('SERVER_CONFIG_') ? 'SERVER_NOT_CONFIGURED' : 'SEND_FAILED';
    console.error('[Travel WhatsApp] request failed', { code });
    return json({ error: code }, 500);
  }
});
