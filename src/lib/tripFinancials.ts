import type { Trip } from '../types/trip';

export type TripFinancialInput = Pick<
  Trip,
  'sale_price' | 'wholesale_cost' | 'amount_paid' | 'payment_status'
>;

export function finiteMoney(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Database-compatible markup: profit divided by wholesale cost. */
export function calculateTripFinancials(input: TripFinancialInput) {
  const salePrice = finiteMoney(input.sale_price);
  const wholesaleCost = finiteMoney(input.wholesale_cost);
  const amountPaid = finiteMoney(input.amount_paid);
  const profit = roundMoney(salePrice - wholesaleCost);
  const markupPercentage = wholesaleCost > 0
    ? roundMoney((profit / wholesaleCost) * 100)
    : 0;
  const amountDue = roundMoney(Math.max(salePrice - amountPaid, 0));
  const paymentPercentage = salePrice > 0
    ? Math.min(roundMoney((amountPaid / salePrice) * 100), 100)
    : 0;
  const paymentStatus: Trip['payment_status'] = amountPaid <= 0
    ? 'unpaid'
    : amountDue <= 0
      ? 'paid'
      : 'partial';

  return {
    salePrice,
    wholesaleCost,
    amountPaid,
    profit,
    markupPercentage,
    amountDue,
    paymentPercentage,
    paymentStatus,
  };
}
