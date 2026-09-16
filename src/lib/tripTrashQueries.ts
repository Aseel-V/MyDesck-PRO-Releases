import { getBackend } from '../data/backend';
import type { Trip } from '../types/trip';

export interface DeletedTrip extends Trip {
  deleted_at: string;
  purge_at: string;
  cleanup_status: string | null;
}

export interface DeletedTripsPage {
  items: DeletedTrip[];
  total_count: number;
}

export async function fetchDeletedTripsPage(page: number, search: string, pageSize = 20): Promise<DeletedTripsPage> {
  return getBackend().travel.getDeletedTripsPage(page, search, pageSize);
}

export async function restoreDeletedTrips(ids: string[]): Promise<number> {
  return getBackend().travel.restoreDeletedTrips(ids);
}

export async function permanentlyDeleteTrips(ids: string[]): Promise<number> {
  return getBackend().travel.permanentlyDeleteTrips(ids);
}

export async function retryAttachmentCleanup(jobId: number): Promise<void> {
  await getBackend().travel.retryAttachmentCleanup(jobId);
}
