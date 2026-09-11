import { z } from 'zod';
export const moneySchema = z.object({ unitsText: z.string().regex(/^-?\d+$/), scale: z.number().int().min(0).max(32), currency: z.string().optional(), decimal: z.string().optional() }).passthrough();
const base = { schemaVersion: z.literal(1), ownerUid: z.string(), businessId: z.string().nullable(), isDeleted: z.boolean() };
export const userSchema = z.object({ schemaVersion: z.literal(1), uid: z.string(), userId: z.string(), role: z.string(), isSuspended: z.boolean(), businessId: z.string().nullable() }).passthrough().refine(v => v.uid === v.userId);
export const businessSchema = z.object({ ...base, id: z.string(), businessName: z.string(), isSuspended: z.boolean().nullable() }).passthrough();
export const travelerSchema = z.record(z.string(), z.unknown());
export const tripSchema = z.object({ ...base, id: z.string(), clientName: z.string(), destination: z.string(), startDate: z.string(), endDate: z.string(), currency: z.string(), status: z.string(), salePrice: moneySchema, wholesaleCost: moneySchema, amountPaid: moneySchema, amountDue: moneySchema.optional(), profit: moneySchema.optional(), travelers: z.unknown().optional(), travelersEncoding: z.string().optional(), updatedAtMicros: z.string().optional(), attachments: z.unknown().optional() }).passthrough();
export const planSchema = z.object({ ...base, id: z.string(), tripId: z.string(), currency: z.string(), paymentMethod: z.enum(['card','cash','mixed']), cardTotalMinor: z.number().safe(), cashTotalMinor: z.number().safe(), cashPaidMinor: z.number().safe() }).passthrough();
export const installmentSchema = z.object({ ...base, id: z.string(), tripId: z.string(), paymentPlanId: z.string(), dueDate: z.string(), status: z.string(), expectedAmountMinor: z.number().safe(), paidAmountMinor: z.number().safe() }).passthrough();
export const eventSchema = z.object({ ...base, tripId: z.string(), sequence: z.number().safe(), createdAtMicros: z.string() }).passthrough();
export const auditEventSchema = z.object({ ...base, tripId: z.string(), sequence: z.number().safe(), changedAtMicros: z.string().optional(), createdAtMicros: z.string().optional() }).passthrough()
  .refine(value => Boolean(value.changedAtMicros || value.createdAtMicros), 'audit timestamp required');
export const metadataSchema = z.object({ name: z.string(), path: z.string(), mime: z.string().optional(), size: z.number().nonnegative().optional() }).passthrough();
export function moneyText(value: z.infer<typeof moneySchema>): string {
  const negative = value.unitsText.startsWith('-');
  const digits = value.unitsText.replace(/^-/, '').padStart(value.scale + 1, '0');
  return (negative ? '-' : '') + (value.scale ? digits.slice(0,-value.scale) + '.' + digits.slice(-value.scale) : digits);
}
