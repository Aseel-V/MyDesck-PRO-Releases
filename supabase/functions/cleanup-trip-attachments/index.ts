import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Attachment = {
  bucket?: string;
  storage_path?: string;
};

type CleanupJob = {
  id: number;
  attachments: Attachment[] | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cleanupSecret = Deno.env.get('TRAVEL_CLEANUP_SECRET');
  if (!url || !serviceRoleKey || !cleanupSecret) return json({ error: 'SERVER_CONFIGURATION_ERROR' }, 500);
  if (request.headers.get('x-cleanup-secret') !== cleanupSecret) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requestedLimit = Number(new URL(request.url).searchParams.get('limit') || 20);
  const limit = Math.min(Math.max(Math.trunc(requestedLimit) || 20, 1), 100);
  const { data, error } = await admin.rpc('claim_trip_attachment_cleanup', { p_limit: limit });
  if (error) return json({ error: 'CLAIM_FAILED' }, 500);

  const jobs = (data || []) as CleanupJob[];
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const locations = new Map<string, string[]>();
      for (const attachment of Array.isArray(job.attachments) ? job.attachments : []) {
        if (!attachment.bucket || !attachment.storage_path) continue;
        const paths = locations.get(attachment.bucket) || [];
        paths.push(attachment.storage_path);
        locations.set(attachment.bucket, paths);
      }

      for (const [bucket, paths] of locations) {
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) throw new Error('STORAGE_REMOVE_FAILED');
      }

      const { error: updateError } = await admin
        .from('trip_attachment_cleanup_queue')
        .update({ status: 'completed', completed_at: new Date().toISOString(), last_error: null })
        .eq('id', job.id);
      if (updateError) throw new Error('QUEUE_UPDATE_FAILED');
      completed += 1;
    } catch (error) {
      const code = error instanceof Error ? error.message : 'CLEANUP_FAILED';
      await admin
        .from('trip_attachment_cleanup_queue')
        .update({ status: 'failed', last_error: code.slice(0, 120) })
        .eq('id', job.id);
      failed += 1;
    }
  }

  return json({ claimed: jobs.length, completed, failed });
});
