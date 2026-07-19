export type InstallmentStoredStatus = 'scheduled' | 'paid' | 'partially_paid' | 'cancelled';
export type InstallmentDisplayStatus = InstallmentStoredStatus | 'due_soon' | 'due_today' | 'overdue';

export interface InstallmentDraft {
  installmentNumber: number;
  dueDate: string;
  expectedAmountMinor: number;
}

export interface InstallmentLike {
  due_date: string;
  expected_amount_minor: number;
  paid_amount_minor: number;
  status: InstallmentStoredStatus;
}

export function paymentMethodIncludesInstallments(method: 'card' | 'cash' | 'mixed' | null | undefined): boolean {
  return method === 'card' || method === 'mixed';
}

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('INVALID_DATE');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addCalendarMonths(value: string, months: number): string {
  const { year, month, day } = parseIsoDate(value);
  const absoluteMonth = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth - targetYear * 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function toMinorUnits(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_AMOUNT');
  return Math.round((value + Number.EPSILON) * 100);
}

export function fromMinorUnits(value: number): number {
  return value / 100;
}

export function buildInstallmentSchedule(totalMinor: number, count: number, firstDate: string): InstallmentDraft[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw new Error('INVALID_AMOUNT');
  if (!Number.isInteger(count) || count < 1 || count > 120 || count > totalMinor) throw new Error('INVALID_INSTALLMENT_COUNT');
  parseIsoDate(firstDate);
  const base = Math.floor(totalMinor / count);
  return Array.from({ length: count }, (_, index) => ({
    installmentNumber: index + 1,
    dueDate: addCalendarMonths(firstDate, index),
    expectedAmountMinor: index === count - 1 ? totalMinor - base * (count - 1) : base,
  }));
}

export function validatePaymentSplit(totalMinor: number, cardMinor: number, cashMinor: number): boolean {
  return [totalMinor, cardMinor, cashMinor].every(Number.isSafeInteger)
    && totalMinor >= 0 && cardMinor >= 0 && cashMinor >= 0 && cardMinor + cashMinor === totalMinor;
}

export function getInstallmentDisplayStatus(item: InstallmentLike, today: string, dueSoonDays = 7): InstallmentDisplayStatus {
  if (item.status === 'cancelled' || item.status === 'paid' || item.status === 'partially_paid') return item.status;
  if (item.due_date < today) return 'overdue';
  if (item.due_date === today) return 'due_today';
  const due = Date.parse(`${item.due_date}T12:00:00Z`);
  const current = Date.parse(`${today}T12:00:00Z`);
  return due - current <= dueSoonDays * 86_400_000 ? 'due_soon' : 'scheduled';
}

export function summarizeInstallments(items: InstallmentLike[], today: string) {
  const active = items.filter((item) => item.status !== 'cancelled');
  const expectedMinor = active.reduce((sum, item) => sum + item.expected_amount_minor, 0);
  const paidMinor = active.reduce((sum, item) => sum + item.paid_amount_minor, 0);
  const next = active
    .filter((item) => item.paid_amount_minor < item.expected_amount_minor)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
  return {
    expectedMinor,
    paidMinor,
    remainingMinor: expectedMinor - paidMinor,
    overdueMinor: active
      .filter((item) => getInstallmentDisplayStatus(item, today) === 'overdue')
      .reduce((sum, item) => sum + item.expected_amount_minor - item.paid_amount_minor, 0),
    completed: active.filter((item) => item.status === 'paid').length,
    total: active.length,
    next,
  };
}
