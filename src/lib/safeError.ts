export function getSafeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UNKNOWN_ERROR';
  const candidate = error as { code?: unknown; name?: unknown };
  if (typeof candidate.code === 'string' && /^[A-Z0-9_-]{1,64}$/i.test(candidate.code)) return candidate.code;
  if (typeof candidate.name === 'string' && /^[A-Z0-9_-]{1,64}$/i.test(candidate.name)) return candidate.name;
  return 'UNKNOWN_ERROR';
}

export interface SafeDatabaseErrorDiagnostic {
  code: string;
  message?: string;
  hint?: string;
}

function sanitizeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/(passport|secret|token|encryption[_ -]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function getSafeDatabaseErrorDiagnostic(error: unknown): SafeDatabaseErrorDiagnostic {
  const diagnostic: SafeDatabaseErrorDiagnostic = { code: getSafeErrorCode(error) };
  if (!error || typeof error !== 'object') return diagnostic;
  const candidate = error as { message?: unknown; hint?: unknown };
  diagnostic.message = sanitizeDiagnosticText(candidate.message);
  diagnostic.hint = sanitizeDiagnosticText(candidate.hint);
  return diagnostic;
}

export function logSafeDatabaseError(context: string, error: unknown): void {
  if (import.meta.env.DEV) console.error(context, getSafeDatabaseErrorDiagnostic(error));
  else console.error(context, getSafeErrorCode(error));
}
