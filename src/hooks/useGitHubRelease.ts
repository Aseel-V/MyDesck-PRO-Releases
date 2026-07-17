import { useCallback, useEffect, useState } from 'react';

const REPO_OWNER = 'Aseel-V';
const REPO_NAME = 'MyDesck-PRO-Releases';
const RELEASE_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const CACHE_KEY = 'mydesck_latest_stable_release';
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

export const WINDOWS_INSTALLER_NAME = 'MyDesck-PRO-Setup.exe';
export const STABLE_WINDOWS_DOWNLOAD_URL =
  `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${WINDOWS_INSTALLER_NAME}`;
export const RELEASES_PAGE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
}

export interface ReleaseData {
  tag_name: string;
  published_at: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

interface CachedRelease {
  cachedAt: number;
  data: ReleaseData;
}

let memoryCache: CachedRelease | null = null;
let pendingRequest: Promise<ReleaseData> | null = null;

function isTrustedAssetUrl(urlValue: string) {
  try {
    const url = new URL(urlValue);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith(`/${REPO_OWNER}/${REPO_NAME}/releases/download/`);
  } catch {
    return false;
  }
}

function isTrustedReleaseUrl(urlValue: string) {
  try {
    const url = new URL(urlValue);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith(`/${REPO_OWNER}/${REPO_NAME}/releases/`);
  } catch {
    return false;
  }
}

function isStableRelease(value: unknown): value is ReleaseData {
  if (!value || typeof value !== 'object') return false;
  const release = value as Partial<ReleaseData>;
  return typeof release.tag_name === 'string'
    && /^v?\d+\.\d+\.\d+$/.test(release.tag_name)
    && release.draft === false
    && release.prerelease === false
    && typeof release.published_at === 'string'
    && typeof release.html_url === 'string'
    && isTrustedReleaseUrl(release.html_url)
    && Array.isArray(release.assets);
}

function readSessionCache() {
  if (memoryCache && Date.now() - memoryCache.cachedAt < CACHE_TTL_MS) return memoryCache.data;
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedRelease;
    if (Date.now() - cached.cachedAt >= CACHE_TTL_MS || !isStableRelease(cached.data)) {
      window.sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    memoryCache = cached;
    return cached.data;
  } catch {
    return null;
  }
}

function writeSessionCache(data: ReleaseData) {
  memoryCache = { cachedAt: Date.now(), data };
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache));
  } catch {
    // Session storage may be unavailable; the module-level cache still prevents duplicate requests.
  }
}

async function fetchLatestStableRelease() {
  const cached = readSessionCache();
  if (cached) return cached;
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(RELEASE_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('release-request-failed');
      const json: unknown = await response.json();
      if (!isStableRelease(json)) throw new Error('invalid-stable-release');
      writeSessionCache(json);
      return json;
    } finally {
      window.clearTimeout(timeout);
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

export function getWindowsInstallerAsset(release: ReleaseData | null) {
  return release?.assets.find((asset) =>
    asset.name === WINDOWS_INSTALLER_NAME && isTrustedAssetUrl(asset.browser_download_url)
  ) ?? null;
}

export function getMacInstallerAsset(release: ReleaseData | null) {
  const version = getVisibleReleaseVersion(release);
  if (!version) return null;
  const expectedName = new RegExp(`^MyDesck-PRO-${version.replace(/\./g, '\\.')}-(?:arm64|x64|universal)\\.dmg$`);
  return release?.assets.find((asset) =>
    expectedName.test(asset.name) && isTrustedAssetUrl(asset.browser_download_url)
  ) ?? null;
}

export function getVisibleReleaseVersion(release: ReleaseData | null) {
  return release?.tag_name.replace(/^v/, '') ?? null;
}

export function useGitHubRelease() {
  const [data, setData] = useState<ReleaseData | null>(() => readSessionCache());
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState(false);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    void fetchLatestStableRelease()
      .then((release) => {
        if (active) setData(release);
      })
      .catch((requestError) => {
        if (import.meta.env.DEV) console.warn('Latest release lookup failed:', requestError);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [requestId]);

  const retry = useCallback(() => {
    memoryCache = null;
    pendingRequest = null;
    try {
      window.sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // A retry still works through the in-memory state when storage is blocked.
    }
    setRequestId((current) => current + 1);
  }, []);

  return { data, loading, error, retry };
}
