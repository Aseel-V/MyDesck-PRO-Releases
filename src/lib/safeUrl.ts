const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;
const UNC_PATH = /^\\\\/;
const LOCAL_SCHEME = /^(file|filesystem):/i;

export function isBrowserSafeImageSrc(value: string | null | undefined): value is string {
  if (!value) return false;

  const src = value.trim();
  if (!src) return false;
  if (LOCAL_SCHEME.test(src) || WINDOWS_ABSOLUTE_PATH.test(src) || UNC_PATH.test(src)) {
    return false;
  }

  if (/^(https?:|data:image\/|blob:)/i.test(src)) return true;

  // App-bundled assets such as /favicon.ico or dashboard.png are fine.
  return !src.includes('\\') && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(src);
}

export function safeImageSrc(value: string | null | undefined): string | null {
  return isBrowserSafeImageSrc(value) ? value.trim() : null;
}
