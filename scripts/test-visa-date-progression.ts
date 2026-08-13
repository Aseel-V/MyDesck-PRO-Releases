import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTravelBusinessDate } from '../src/lib/businessDate';
import { summarizeInstallments, type InstallmentLike } from '../src/lib/tripInstallments';

const visa: InstallmentLike[] = [
  ['2026-08-02', 100000], ['2026-09-02', 100000], ['2026-10-02', 100000],
  ['2026-11-02', 100000], ['2026-12-02', 100000],
].map(([due_date, expected_amount_minor]) => ({
  due_date: String(due_date), expected_amount_minor: Number(expected_amount_minor), paid_amount_minor: 0, status: 'scheduled',
}));

for (const [today, paid, count] of [
  ['2026-08-01', 0, 0],
  ['2026-08-02', 100000, 1],
  ['2026-09-01', 100000, 1],
  ['2026-09-02', 200000, 2],
  ['2026-12-03', 500000, 5],
] as const) {
  const value = summarizeInstallments(visa, today);
  assert.equal(value.paidMinor, paid, `${today} Visa amount`);
  assert.equal(value.completed, count, `${today} Visa count`);
  assert.equal(value.remainingMinor, 500000 - paid, `${today} Visa future amount`);
}

const mixed = (today: string) => {
  const schedule = summarizeInstallments(visa.slice(0, 2), today);
  const cash = 300000;
  return { paid: cash + schedule.paidMinor, remaining: Math.max(500000 - cash - schedule.paidMinor, 0) };
};
assert.deepEqual(mixed('2026-08-01'), { paid: 300000, remaining: 200000 });
assert.deepEqual(mixed('2026-08-02'), { paid: 400000, remaining: 100000 });
assert.deepEqual(mixed('2026-09-02'), { paid: 500000, remaining: 0 });

assert.equal(getTravelBusinessDate(new Date('2026-08-01T20:59:59.999Z')), '2026-08-01');
assert.equal(getTravelBusinessDate(new Date('2026-08-01T21:00:00.000Z')), '2026-08-02');

const migration = readFileSync('supabase/migrations/20260813120000_automatic_visa_schedule_collection.sql', 'utf8');
assert.match(migration, /status <> 'cancelled' AND i\.due_date <= b\.today/);
assert.match(migration, /actual_schedule_total_minor <> visa_schedule_total_minor THEN 'schedule_mismatch'/);
assert.match(migration, /manual_visa_received_minor/);
assert.match(migration, /visa_overdue_unconfirmed_minor', 0/);
assert.match(migration, /ON CONFLICT \(user_id, dedupe_key\) DO NOTHING/);
assert.match(migration, /due_date::timestamp AT TIME ZONE 'Asia\/Jerusalem'\) > rollout_at/);

console.log('Visa date progression, Mixed totals, timezone boundary, and rollout contracts passed.');
