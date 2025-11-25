import { z } from 'zod';

export const tripSchema = z.object({
    destination: z.string().min(1, 'Destination is required'),
    client_name: z.string().min(1, 'Client name is required'),
    travelers_count: z.number().min(1, 'At least 1 traveler is required'),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    wholesale_cost: z.number().min(0, 'Cost cannot be negative'),
    sale_price: z.number().min(0, 'Price cannot be negative'),
    payment_status: z.enum(['paid', 'partial', 'unpaid']),
    amount_paid: z.number().min(0, 'Amount paid cannot be negative'),
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
