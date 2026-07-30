const DAY_MS = 86_400_000;

export function parseDateOnly(value?: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

export function parseDateOnlyToLocalDate(value?: string | null): Date | null {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
}

export function toDateOnlyTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = parseDateOnly(value);
  if (parsed) {
    return Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getTripDuration(startDate?: string | null, endDate?: string | null) {
  const start = toDateOnlyTimestamp(startDate);
  const end = toDateOnlyTimestamp(endDate);
  if (start === null || end === null || end < start) return null;

  const nights = Math.round((end - start) / DAY_MS);
  return { nights, days: nights + 1 };
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
