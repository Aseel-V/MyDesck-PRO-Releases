import { getBackend } from '../data/backend';
import type { Json } from '../types/database';

export interface TripNotification {
  id: string; trip_id: string | null; notification_type: string; title_key: string; body_key: string;
  params: Json; read_at: string | null; snoozed_until: string | null; dismissed_at: string | null; completed_at: string | null; scheduled_for: string; created_at: string;
}

export interface TripNotificationSettings {
  timezone: string; upcoming_enabled: boolean; upcoming_days: number;
  trip_reminder_days: number[]; payment_enabled: boolean; payment_reminder_days: number[]; cleanup_enabled: boolean; retention_enabled: boolean;
}

export async function fetchTripNotifications(): Promise<TripNotification[]> {
  return getBackend().travel.listTripNotifications();
}

export async function markAllTripNotificationsRead(): Promise<void> {
  await getBackend().travel.markAllTripNotificationsRead();
}

export async function snoozeTripNotification(id: string, until: string): Promise<void> {
  await getBackend().travel.snoozeTripNotification(id, until);
}

export async function dismissTripNotification(id: string): Promise<void> {
  await getBackend().travel.dismissTripNotification(id);
}

export async function clearCompletedTripNotifications(): Promise<void> {
  await getBackend().travel.clearCompletedTripNotifications();
}

export async function markTripNotificationRead(id: string): Promise<void> {
  await getBackend().travel.markTripNotificationRead(id);
}

export async function getTripNotificationSettings(userId: string): Promise<TripNotificationSettings> {
  const defaults: TripNotificationSettings = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem', upcoming_enabled: true, upcoming_days: 30, trip_reminder_days: [30,14,7,1,0], payment_enabled: true, payment_reminder_days: [7,3,1,0], cleanup_enabled: true, retention_enabled: true };
  const data = await getBackend().travel.getTripNotificationSettings(userId);
  return data ?? defaults;
}

export async function saveTripNotificationSettings(userId: string, settings: TripNotificationSettings): Promise<void> {
  await getBackend().travel.saveTripNotificationSettings(userId, settings);
}
