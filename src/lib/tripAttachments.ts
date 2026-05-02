import { supabase } from './supabase';
import { Attachment } from '../types/trip';

export const TRIP_ATTACHMENTS_BUCKET = 'trip-attachments';

export function isManagedTripAttachment(attachment: Attachment): boolean {
  return Boolean(attachment.bucket && attachment.storage_path);
}

export async function getTripAttachmentUrl(attachment: Attachment): Promise<string> {
  if (!isManagedTripAttachment(attachment)) {
    return attachment.url;
  }

  const { data, error } = await supabase.storage
    .from(attachment.bucket!)
    .createSignedUrl(attachment.storage_path!, 60 * 15);

  if (error) throw error;
  return data.signedUrl;
}

export async function removeTripAttachments(attachments: Attachment[]): Promise<void> {
  const managed = attachments.filter(isManagedTripAttachment);
  if (!managed.length) return;

  const byBucket = managed.reduce<Record<string, string[]>>((acc, attachment) => {
    const bucket = attachment.bucket!;
    const path = attachment.storage_path!;
    if (!acc[bucket]) acc[bucket] = [];
    acc[bucket].push(path);
    return acc;
  }, {});

  await Promise.all(
    Object.entries(byBucket).map(async ([bucket, paths]) => {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) throw error;
    })
  );
}
