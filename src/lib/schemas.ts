import { z } from 'zod';
import { buildInstallmentSchedule, toMinorUnits, validatePaymentSplit } from './tripInstallments';

const nonNegativeMoney = z.preprocess(
    (value) => value === '' || value === null || value === undefined || Number.isNaN(Number(value)) ? 0 : Number(value),
    z.number().min(0)
);

const paymentPlanSchema = z.object({
    plan_id: z.string().uuid().nullable().optional(),
    card_total: nonNegativeMoney,
    cash_total: nonNegativeMoney,
    installment_count: z.preprocess(
        (value) => value === '' || value === null || value === undefined || Number.isNaN(Number(value)) ? 1 : Number(value),
        z.number().int().min(1, 'Installment count must be at least 1').max(120)
    ),
    first_installment_date: z.string().default(''),
});

const tripBaseSchema = z.object({
    destination: z.string().min(1, 'Destination is required'),
    client_name: z.string().min(1, 'Client name is required'),
    client_phone: z.string().optional(),

    travelers: z.array(z.object({
        full_name: z.string().optional(),
        nationality: z.string().optional(),
        room_type: z.enum(['single', 'double', 'triple', 'suite']).optional(),
    })).default([]),
    travelers_count: z.preprocess(
        (val) => (val === '' || val === null || val === undefined || isNaN(Number(val)) ? 1 : Number(val)),
        z.number().min(1, 'At least 1 traveler is required')
    ),
    room_type: z.record(z.string(), z.number()).optional(),
    board_basis: z.string().optional(),
    hotel_name: z.string().optional(),
    service_type: z.enum(['ticket', 'hotel', 'both']).default('both'),
    trip_type: z.enum(['one_way', 'round_trip']).optional(),
    airline_name: z.string().optional(),
    flight_number: z.string().optional(),
    booking_reference: z.string().optional(),
    departure_airport: z.string().optional(),
    arrival_airport: z.string().optional(),
    departure_datetime: z.string().optional(),
    arrival_datetime: z.string().optional(),
    return_flight_number: z.string().optional(),
    return_departure_airport: z.string().optional(),
    return_arrival_airport: z.string().optional(),
    return_departure_datetime: z.string().optional(),
    return_arrival_datetime: z.string().optional(),
    ticket_class: z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
    ticket_cost_ils: z.number().min(0).optional(),
    ticket_notes: z.string().optional(),

    itinerary: z.array(z.object({
        day: z.number(),
        date: z.string().optional(),
        title: z.string().min(1, 'Title is required'),
        description: z.string(),
    })).default([]),

    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),

    currency: z.enum(['USD', 'EUR', 'ILS']).default('ILS'),
    exchange_rate: z.number().default(1),
    wholesale_cost: z.preprocess(
        (val) => (val === '' || val === null || val === undefined || isNaN(Number(val)) ? 0 : Number(val)),
        z.number().min(0, 'Cost cannot be negative')
    ),
    sale_price: z.preprocess(
        (val) => (val === '' || val === null || val === undefined || isNaN(Number(val)) ? 0 : Number(val)),
        z.number().min(0, 'Price cannot be negative')
    ),

    // Stored Original Values
    wholesale_original_amount: z.number().optional(),
    wholesale_currency: z.string().optional(),
    sale_original_amount: z.number().optional(),
    sale_currency: z.string().optional(),

    payments: z.array(z.object({
        date: z.string(),
        amount: z.number().min(0),
        method: z.enum(['cash', 'transfer', 'card', 'check']),
        receipt_id: z.string().optional(),
    })).default([]),
    payment_status: z.enum(['paid', 'partial', 'unpaid']),
    amount_paid: z.preprocess(
        (val) => (val === '' || val === null || val === undefined || isNaN(Number(val)) ? 0 : Number(val)),
        z.number().min(0, 'Amount paid cannot be negative')
    ),
    payment_date: z.string().optional(),
    payment_method: z.enum(['card', 'cash', 'mixed']).nullable().optional(),
    card_paid_amount: z.number().min(0).optional(),
    cash_paid_amount: z.number().min(0).optional(),
    payment_plan: paymentPlanSchema.nullable().optional(),
    source_template_id: z.string().uuid().nullable().optional(),
    source_template_name: z.string().max(120).nullable().optional(),

    attachments: z.array(z.object({
        file_name: z.string(),
        url: z.string(),
        type: z.enum(['ticket', 'visa', 'voucher', 'other']),
        bucket: z.string().optional(),
        storage_path: z.string().optional(),
    })).default([]),

    notes: z.string().optional(),
    status: z.enum(['active', 'completed', 'cancelled', 'archived']).default('active'),
});

export function createTripSchema({ allowMissingLegacyHotel = false } = {}) {
    return tripBaseSchema.refine((data) => {
    if (!data.start_date || !data.end_date) return true;
    return new Date(data.end_date) >= new Date(data.start_date);
}, {
    message: "End date must be after start date",
    path: ["end_date"],
}).refine((data) => {
    return allowMissingLegacyHotel || data.service_type === 'ticket' || Boolean(data.hotel_name?.trim());
}, {
    message: 'Hotel name is required',
    path: ['hotel_name'],
}).refine((data) => {
    if (data.payment_method !== 'mixed') return true;
    return Math.abs(((data.card_paid_amount || 0) + (data.cash_paid_amount || 0)) - data.amount_paid) < 0.01;
}, {
    message: 'Card and cash amounts must equal the paid amount',
    path: ['card_paid_amount'],
}).superRefine((data, context) => {
    if (data.payment_method !== 'card' && data.payment_method !== 'mixed') return;
    const plan = data.payment_plan;
    if (!plan || plan.card_total <= 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Card total must be greater than 0', path: ['payment_plan', 'card_total'] });
        return;
    }
    if (!plan.first_installment_date) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'First installment date is required', path: ['payment_plan', 'first_installment_date'] });
    }
    if (data.payment_method === 'mixed' && !validatePaymentSplit(toMinorUnits(data.sale_price), toMinorUnits(plan.card_total), toMinorUnits(plan.cash_total))) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Card and cash totals must equal the sale price', path: ['payment_plan', 'cash_total'] });
    }
    if (data.payment_method === 'mixed' && plan.cash_total <= 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cash total must be greater than 0 for mixed payment', path: ['payment_plan', 'cash_total'] });
    }
    if (data.payment_method === 'mixed' && (data.cash_paid_amount || 0) > plan.cash_total) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Confirmed cash cannot exceed the cash total', path: ['cash_paid_amount'] });
    }
    if (!plan.first_installment_date) return;
    try {
        const totalMinor = toMinorUnits(plan.card_total);
        const schedule = buildInstallmentSchedule(totalMinor, plan.installment_count, plan.first_installment_date);
        if (schedule.reduce((sum, item) => sum + item.expectedAmountMinor, 0) !== totalMinor) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Installment schedule must equal the card total', path: ['payment_plan', 'installment_count'] });
        }
    } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Installment schedule is invalid', path: ['payment_plan', 'installment_count'] });
    }
});
}

export const tripSchema = createTripSchema();

export type TripSchemaType = z.infer<typeof tripSchema>;
