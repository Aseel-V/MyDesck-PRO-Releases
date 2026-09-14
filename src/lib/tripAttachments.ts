import { SupabaseStorageRepository } from '../data/SupabaseStorageRepository';
import { Attachment } from '../types/trip';

const storage = new SupabaseStorageRepository();

export const TRIP_ATTACHMENTS_BUCKET = 'trip-attachments';

export function isManagedTripAttachment(attachment: Attachment): boolean {
  return Boolean(attachment.bucket && attachment.storage_path);
}

export async function getTripAttachmentUrl(attachment: Attachment): Promise<string> {
  if (!isManagedTripAttachment(attachment)) {
    return attachment.url;
  }

  return storage.signedUrl(attachment.bucket!, attachment.storage_path!, 60 * 15);
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
    Object.entries(byBucket).map(([bucket, paths]) => storage.remove(bucket, paths))
  );
}
