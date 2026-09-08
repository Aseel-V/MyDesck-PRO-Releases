// Automated sending is intentionally unavailable until authentication,
// ownership, recipient consent and rate limits have an audited implementation.
export function handleWhatsAppRequest(request: Request): Response {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ error: 'AUTOMATED_WHATSAPP_UNAVAILABLE', message: 'Automated sending is unavailable. Use the manual WhatsApp link.' }), { status: 503, headers });
}