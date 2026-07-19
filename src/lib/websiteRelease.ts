export const APP_VERSION = __APP_VERSION__;

export interface WebsiteVersionMetadata {
  version: string;
  releasedAt: string;
  required: boolean;
}

export interface ReleaseNotes {
  version: string;
  releasedAt: string;
  title: Record<'en' | 'he' | 'ar', string>;
  changes: Record<'en' | 'he' | 'ar', string[]>;
}

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function compareStableVersions(left: string, right: string): number | null {
  if (!stableVersion.test(left) || !stableVersion.test(right)) return null;
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

export function isNewerWebsiteVersion(candidate: string, current = APP_VERSION): boolean {
  return compareStableVersions(candidate, current) === 1;
}

function publicUrl(file: string): string {
  return new URL(`/${file}`, window.location.origin).toString();
}

function isVersionMetadata(value: unknown): value is WebsiteVersionMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as Record<string, unknown>;
  return typeof metadata.version === 'string'
    && stableVersion.test(metadata.version)
    && typeof metadata.releasedAt === 'string'
    && !Number.isNaN(Date.parse(metadata.releasedAt))
    && typeof metadata.required === 'boolean';
}

function isReleaseNotes(value: unknown): value is ReleaseNotes {
  if (!value || typeof value !== 'object') return false;
  const notes = value as Record<string, unknown>;
  return typeof notes.version === 'string'
    && stableVersion.test(notes.version)
    && typeof notes.releasedAt === 'string'
    && ['en', 'he', 'ar'].every((language) => typeof (notes.title as Record<string, unknown>)?.[language] === 'string'
      && Array.isArray((notes.changes as Record<string, unknown>)?.[language]));
}

async function fetchPublicJson(file: string): Promise<unknown> {
  const response = await fetch(`${publicUrl(file)}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('RELEASE_METADATA_UNAVAILABLE');
  return response.json();
}

export async function fetchWebsiteVersionMetadata(): Promise<WebsiteVersionMetadata | null> {
  try {
    const value = await fetchPublicJson('version.json');
    return isVersionMetadata(value) ? value : null;
  } catch {
    return null;
  }
}

export async function fetchReleaseNotes(): Promise<ReleaseNotes | null> {
  try {
    const value = await fetchPublicJson('release-notes.json');
    return isReleaseNotes(value) ? value : null;
  } catch {
    return null;
  }
}

export const updatePreferenceKey = (version: string) => `mydesck:website-update-later:${version}`;
const laterDelayMs = 24 * 60 * 60 * 1000;

export function shouldDeferWebsiteUpdate(version: string, now = Date.now()): boolean {
  try {
    const stored = Number(localStorage.getItem(updatePreferenceKey(version)));
    return Number.isFinite(stored) && stored > now - laterDelayMs;
  } catch {
    return false;
  }
}

export function deferWebsiteUpdate(version: string, now = Date.now()): void {
  try { localStorage.setItem(updatePreferenceKey(version), String(now)); } catch { /* Storage is optional. */ }
}
