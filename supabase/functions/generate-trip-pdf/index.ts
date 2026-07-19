import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';

type Trip = {
  id: string; destination: string; client_name: string; start_date: string; end_date: string;
  currency: string; sale_price: number; amount_paid: number; amount_due: number; payment_status: string;
};

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const allowedLanguages = new Set(['en', 'he', 'ar']);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const authorization = request.headers.get('authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization || !url || !anonKey) return json({ error: 'UNAUTHORIZED' }, 401);

  let body: { tripId?: string; language?: string; includeSensitive?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (!body.tripId || !/^[0-9a-f-]{36}$/i.test(body.tripId) || !allowedLanguages.has(body.language || '')) return json({ error: 'INVALID_INPUT' }, 400);
  if (body.includeSensitive) return json({ error: 'SENSITIVE_EXPORT_NOT_ENABLED' }, 403);

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return json({ error: 'UNAUTHORIZED' }, 401);
  const { data: allowed, error: rateError } = await client.rpc('claim_trip_pdf_generation');
  if (rateError) return json({ error: 'RATE_CHECK_FAILED' }, 503);
  if (!allowed) return json({ error: 'RATE_LIMITED' }, 429);
  const { data, error } = await client.rpc('get_trip_details', { p_trip_id: body.tripId });
  if (error || !data) return json({ error: error?.code === 'PGRST116' ? 'NOT_FOUND' : 'TRIP_ACCESS_DENIED' }, error ? 403 : 404);
  const trip = data as Trip;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const language = body.language || 'en';
  let font;
  if (language === 'en') font = await pdf.embedFont(StandardFonts.Helvetica);
  else {
    const fontUrl = Deno.env.get('TRAVEL_PDF_FONT_URL');
    if (!fontUrl) return json({ error: 'RTL_FONT_NOT_CONFIGURED' }, 503);
    const fontResponse = await fetch(fontUrl, { signal: AbortSignal.timeout(5000) });
    if (!fontResponse.ok) return json({ error: 'RTL_FONT_UNAVAILABLE' }, 503);
    const bytes = new Uint8Array(await fontResponse.arrayBuffer());
    if (bytes.byteLength > 5_000_000) return json({ error: 'RTL_FONT_TOO_LARGE' }, 503);
    font = await pdf.embedFont(bytes, { subset: true });
  }

  const page = pdf.addPage([595, 842]);
  const rtl = language !== 'en';
  const labels = language === 'he'
    ? ['סיכום הזמנה', 'יעד', 'לקוח', 'תאריכים', 'מחיר', 'שולם', 'יתרה', 'מטבע', 'סטטוס תשלום']
    : language === 'ar'
      ? ['ملخص الحجز', 'الوجهة', 'العميل', 'التواريخ', 'السعر', 'المدفوع', 'المتبقي', 'العملة', 'حالة الدفع']
      : ['Booking summary', 'Destination', 'Client', 'Dates', 'Sale price', 'Paid', 'Due', 'Currency', 'Payment status'];
  const entries = [[labels[1], trip.destination], [labels[2], trip.client_name], [labels[3], `${trip.start_date} - ${trip.end_date}`], [labels[4], String(trip.sale_price)], [labels[5], String(trip.amount_paid)], [labels[6], String(trip.amount_due)], [labels[7], trip.currency], [labels[8], trip.payment_status]];
  const draw = (text: string, y: number, size = 12) => {
    const safe = text.slice(0, 160);
    const width = font.widthOfTextAtSize(safe, size);
    page.drawText(safe, { x: rtl ? Math.max(40, 555 - width) : 40, y, size, font, color: rgb(0.08, 0.16, 0.27) });
  };
  draw(labels[0], 780, 22);
  entries.forEach(([label, value], index) => draw(`${label}: ${value}`, 730 - index * 42));
  draw(new Date().toISOString().slice(0, 10), 45, 9);
  const bytes = await pdf.save({ useObjectStreams: true });
  if (bytes.byteLength > 2_000_000) return json({ error: 'PDF_TOO_LARGE' }, 413);
  return new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="trip-${trip.id.slice(0, 8)}.pdf"`, 'cache-control': 'no-store' } });
});
