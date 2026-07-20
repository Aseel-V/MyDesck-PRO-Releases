const DAY_MS = 86_400_000;

export function toDateOnlyTimestamp(value?: string | null): number | null {
  if (!value) return null;
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
