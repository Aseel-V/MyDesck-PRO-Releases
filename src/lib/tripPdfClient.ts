import { supabase } from './supabase';
type Language = 'en' | 'he' | 'ar';

interface ServerPdfRequest { tripId: string; language: Language; includeSensitive?: boolean }

export async function generateTripPdfOnServer(request: ServerPdfRequest): Promise<Uint8Array> {
  const { data, error } = await supabase.functions.invoke('generate-trip-pdf', {
    body: { tripId: request.tripId, language: request.language, includeSensitive: request.includeSensitive === true },
  });
  if (error) throw error;
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error('INVALID_PDF_RESPONSE');
}
