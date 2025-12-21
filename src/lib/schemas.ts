import { z } from 'zod';

export const tripSchema = z.object({
    destination: z.string().min(1, 'Destination is required'),
    client_name: z.string().min(1, 'Client name is required'),

    travelers: z.array(z.object({
        full_name: z.string().optional(),
        passport_number: z.string().optional(),
        nationality: z.string().optional(),
        room_type: z.enum(['single', 'double', 'triple', 'suite']).optional(),
    })).default([]),
    travelers_count: z.number().min(1, 'At least 1 traveler is required'),

    itinerary: z.array(z.object({
        day: z.number(),
        date: z.string().optional(),
        title: z.string().min(1, 'Title is required'),
        description: z.string(),
    })).default([]),

    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),

    currency: z.enum(['USD', 'EUR', 'ILS']).default('USD'),
    exchange_rate: z.number().default(1),
    wholesale_cost: z.number().min(0, 'Cost cannot be negative'),
    sale_price: z.number().min(0, 'Price cannot be negative'),

    payments: z.array(z.object({
        date: z.string(),
        amount: z.number().min(0),
        method: z.enum(['cash', 'transfer', 'card', 'check']),
        receipt_id: z.string().optional(),
    })),
    payment_status: z.enum(['paid', 'partial', 'unpaid']),
    amount_paid: z.number().min(0, 'Amount paid cannot be negative'),
    payment_date: z.string().optional(),

    attachments: z.array(z.object({
        file_name: z.string(),
        url: z.string(),
        type: z.enum(['ticket', 'visa', 'voucher', 'other']),
    })),

    notes: z.string().optional(),
    status: z.enum(['active', 'completed', 'cancelled']),
}).refine((data) => {
    if (!data.start_date || !data.end_date) return true;
    return new Date(data.end_date) >= new Date(data.start_date);
}, {
    message: "End date must be after start date",
    path: ["end_date"],
}).refine((data) => {
    return data.amount_paid <= data.sale_price;
}, {
    message: "Amount paid cannot exceed sale price",
    path: ["amount_paid"],
});

export type TripSchemaType = z.infer<typeof tripSchema>;
