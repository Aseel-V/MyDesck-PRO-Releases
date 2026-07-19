import { supabase } from './supabase';
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
  const { data, error } = await supabase.from('trip_notifications').select('id,trip_id,notification_type,title_key,body_key,params,read_at,snoozed_until,dismissed_at,completed_at,scheduled_for,created_at').is('dismissed_at', null).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data;
}

export async function markAllTripNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_all_trip_notifications_read');
  if (error) throw error;
}

export async function snoozeTripNotification(id: string, until: string): Promise<void> {
  const { error } = await supabase.from('trip_notifications').update({ snoozed_until: until }).eq('id', id);
  if (error) throw error;
}

export async function dismissTripNotification(id: string): Promise<void> {
  const { error } = await supabase.from('trip_notifications').update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function clearCompletedTripNotifications(): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('trip_notifications').update({ dismissed_at: now }).not('completed_at', 'is', null);
  if (error) throw error;
}

export async function markTripNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('trip_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function getTripNotificationSettings(userId: string): Promise<TripNotificationSettings> {
  const defaults: TripNotificationSettings = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem', upcoming_enabled: true, upcoming_days: 30, trip_reminder_days: [30,14,7,1,0], payment_enabled: true, payment_reminder_days: [7,3,1,0], cleanup_enabled: true, retention_enabled: true };
  const { data, error } = await supabase.from('trip_notification_settings').select('timezone,upcoming_enabled,upcoming_days,trip_reminder_days,payment_enabled,payment_reminder_days,cleanup_enabled,retention_enabled').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ?? defaults;
}

export async function saveTripNotificationSettings(userId: string, settings: TripNotificationSettings): Promise<void> {
  const { error } = await supabase.from('trip_notification_settings').upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() });
  if (error) throw error;
}
