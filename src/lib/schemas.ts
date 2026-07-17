import { z } from 'zod';

export const tripSchema = z.object({
    destination: z.string().min(1, 'Destination is required'),
    client_name: z.string().min(1, 'Client name is required'),
    client_phone: z.string().optional(),

    travelers: z.array(z.object({
        full_name: z.string().optional(),
        passport_number: z.string().optional(),
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

    attachments: z.array(z.object({
        file_name: z.string(),
        url: z.string(),
        type: z.enum(['ticket', 'visa', 'voucher', 'other']),
        bucket: z.string().optional(),
        storage_path: z.string().optional(),
    })).default([]),

    notes: z.string().optional(),
    status: z.enum(['active', 'completed', 'cancelled', 'archived']).default('active'),
}).refine((data) => {
    if (!data.start_date || !data.end_date) return true;
    return new Date(data.end_date) >= new Date(data.start_date);
}, {
    message: "End date must be after start date",
    path: ["end_date"],
}).refine((data) => {
    return data.service_type === 'ticket' || Boolean(data.hotel_name?.trim());
}, {
    message: 'Hotel name is required',
    path: ['hotel_name'],
}).refine((data) => {
    if (data.payment_method !== 'mixed') return true;
    return Math.abs(((data.card_paid_amount || 0) + (data.cash_paid_amount || 0)) - data.amount_paid) < 0.01;
}, {
    message: 'Card and cash amounts must equal the paid amount',
    path: ['card_paid_amount'],
});

export type TripSchemaType = z.infer<typeof tripSchema>;
