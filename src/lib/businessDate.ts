export const TRAVEL_BUSINESS_TIME_ZONE = 'Asia/Jerusalem';

export function getTravelBusinessDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TRAVEL_BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function compareDateOnly(left: string, right: string): number {
  return left.slice(0, 10).localeCompare(right.slice(0, 10));
}
