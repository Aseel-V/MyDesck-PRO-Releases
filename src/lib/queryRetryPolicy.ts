type QueryError = {
  status?: number;
  code?: string;
  message?: string;
};

const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 422]);
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const PERMANENT_CODES = new Set(['PGRST202', '42883', '22P02', '23502', '23503', '23505', '42501']);

export function getQueryErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const status = (error as QueryError).status;
  return typeof status === 'number' ? status : undefined;
}

export function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as QueryError;
  const message = value.message?.toLowerCase() ?? '';
  return value.status === 404 || value.code === 'PGRST202' || value.code === '42883' ||
    message.includes('could not find the function') || message.includes('undefined function');
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3 || isMissingRpcError(error)) return false;
  const value = (error ?? {}) as QueryError;
  if (value.code && PERMANENT_CODES.has(value.code)) return false;
  if (value.status && PERMANENT_STATUSES.has(value.status)) return false;
  if (value.status) return RETRYABLE_STATUSES.has(value.status);

  const message = value.message?.toLowerCase() ?? String(error).toLowerCase();
  return failureCount < 2 && (
    message.includes('failed to fetch') || message.includes('network') || message.includes('timeout')
  );
}

export function queryRetryDelay(attempt: number, error: unknown): number {
  const status = getQueryErrorStatus(error);
  const base = status === 429 ? 1500 : 500;
  return Math.min(base * 2 ** attempt, 10_000);
}
