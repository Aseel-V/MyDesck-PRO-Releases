export const DEMO_FIXTURE_VERSION = '2026.09.20-v1' as const;

export type DemoIndustry = 'travel' | 'supermarket' | 'restaurant' | 'auto-repair';
export type DemoReadiness = 'available' | 'early-access';
export type DemoScreenId =
  | 'travel-dashboard'
  | 'travel-trips'
  | 'travel-payments'
  | 'travel-installments'
  | 'travel-analytics'
  | 'supermarket-pos'
  | 'supermarket-sales'
  | 'restaurant-floor'
  | 'restaurant-kds'
  | 'auto-repair-order';

export interface DemoScreenDefinition {
  id: DemoScreenId;
  industry: DemoIndustry;
  readiness: DemoReadiness;
}

export const demoScreens: readonly DemoScreenDefinition[] = [
  { id: 'travel-dashboard', industry: 'travel', readiness: 'available' },
  { id: 'travel-trips', industry: 'travel', readiness: 'available' },
  { id: 'travel-payments', industry: 'travel', readiness: 'available' },
  { id: 'travel-installments', industry: 'travel', readiness: 'available' },
  { id: 'travel-analytics', industry: 'travel', readiness: 'available' },
  { id: 'supermarket-pos', industry: 'supermarket', readiness: 'available' },
  { id: 'supermarket-sales', industry: 'supermarket', readiness: 'available' },
  { id: 'restaurant-floor', industry: 'restaurant', readiness: 'early-access' },
  { id: 'restaurant-kds', industry: 'restaurant', readiness: 'early-access' },
  { id: 'auto-repair-order', industry: 'auto-repair', readiness: 'early-access' },
] as const;

export const industryScreens: Record<DemoIndustry, readonly DemoScreenId[]> = {
  travel: ['travel-dashboard', 'travel-trips', 'travel-payments', 'travel-installments', 'travel-analytics'],
  supermarket: ['supermarket-pos', 'supermarket-sales'],
  restaurant: ['restaurant-floor', 'restaurant-kds'],
  'auto-repair': ['auto-repair-order'],
};

export const industryReadiness: Record<DemoIndustry, DemoReadiness> = {
  travel: 'available', supermarket: 'available', restaurant: 'early-access', 'auto-repair': 'early-access',
};

export const travelFixture = {
  metrics: { activeTrips: 12, collectedPercent: 84, outstanding: 18640, profit: 27480 },
  trips: [
    { id: 'DEMO-TR-1042', customer: 'Nadia Karim', destination: 'Athens', travelers: 4, departure: '2026-10-12', status: 'confirmed', amount: 12400 },
    { id: 'DEMO-TR-1041', customer: 'Omar Haddad', destination: 'Istanbul', travelers: 2, departure: '2026-10-18', status: 'planning', amount: 7860 },
    { id: 'DEMO-TR-1039', customer: 'Lina Cohen', destination: 'Rome', travelers: 3, departure: '2026-11-03', status: 'confirmed', amount: 9650 },
  ],
  paymentHealth: [
    { customer: 'Omar Haddad', trip: 'DEMO-TR-1041', total: 7860, collected: 4200, outstanding: 3660, status: 'partial' },
    { customer: 'Nadia Karim', trip: 'DEMO-TR-1042', total: 12400, collected: 10400, outstanding: 2000, status: 'partial' },
    { customer: 'Lina Cohen', trip: 'DEMO-TR-1039', total: 9650, collected: 9650, outstanding: 0, status: 'paid' },
  ],
  installments: [
    { id: 'DEMO-IN-1', due: '2026-09-28', amount: 1800, status: 'due' },
    { id: 'DEMO-IN-2', due: '2026-10-12', amount: 1860, status: 'scheduled' },
    { id: 'DEMO-IN-3', due: '2026-08-28', amount: 2100, status: 'paid' },
  ],
  analytics: {
    months: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    revenue: [46, 58, 51, 72, 68, 86],
    profit: [31, 40, 35, 48, 45, 59],
    destinations: [
      { label: 'Athens', value: 34 }, { label: 'Istanbul', value: 28 }, { label: 'Rome', value: 22 }, { label: 'Other', value: 16 },
    ],
  },
} as const;

export const supermarketFixture = {
  cart: [
    { id: 'DEMO-SKU-401', name: 'Whole grain bread', quantity: 2, unitPrice: 4.9 },
    { id: 'DEMO-SKU-188', name: 'Fresh milk 1L', quantity: 1, unitPrice: 6.4 },
    { id: 'DEMO-SKU-722', name: 'Local tomatoes', quantity: 1.24, unitPrice: 7.9 },
  ],
  subtotal: 25.996,
  vat: 4.419,
  total: 30.415,
  sales: [
    { id: 'DEMO-SALE-2054', time: '14:32', items: 8, method: 'card', total: 96.4 },
    { id: 'DEMO-SALE-2053', time: '14:27', items: 3, method: 'cash', total: 30.42 },
    { id: 'DEMO-SALE-2052', time: '14:19', items: 12, method: 'card', total: 184.8 },
  ],
  metrics: { transactions: 148, sales: 8240, averageBasket: 55.68, vat: 1197.26 },
} as const;

export const restaurantFixture = {
  tables: [
    { id: 'T1', seats: 2, status: 'available', x: 10, y: 15 },
    { id: 'T2', seats: 4, status: 'seated', x: 40, y: 12 },
    { id: 'T3', seats: 4, status: 'reserved', x: 72, y: 18 },
    { id: 'T4', seats: 6, status: 'seated', x: 18, y: 58 },
    { id: 'T5', seats: 2, status: 'available', x: 55, y: 57 },
    { id: 'T6', seats: 4, status: 'available', x: 79, y: 62 },
  ],
  tickets: [
    { id: 'DEMO-KDS-81', table: 'T2', elapsed: 4, status: 'newOrders', items: ['2 × Halloumi salad', '1 × Lemon soda'] },
    { id: 'DEMO-KDS-79', table: 'T4', elapsed: 11, status: 'preparing', items: ['2 × Grilled fish', '1 × Pasta'] },
    { id: 'DEMO-KDS-76', table: 'Pickup', elapsed: 16, status: 'ready', items: ['1 × Family platter', '3 × Juice'] },
  ],
} as const;

export const autoRepairFixture = {
  order: {
    id: 'DEMO-WO-119', vehicle: 'Toyota Corolla · 2021', registration: '58-741-26', owner: 'Maya Levi', mileage: 68320,
    status: 'inProgress', diagnosis: 'Front brake vibration and scheduled 60K service review.',
    labor: [
      { description: 'Brake inspection', hours: 0.8, amount: 240 },
      { description: 'Scheduled service', hours: 1.2, amount: 360 },
    ],
    parts: [
      { description: 'Front brake pads', quantity: 1, amount: 420 },
      { description: 'Engine oil and filter', quantity: 1, amount: 210 },
    ],
    total: 1230,
  },
} as const;

export function isDemoScreenId(value: string | null): value is DemoScreenId {
  return demoScreens.some((screen) => screen.id === value);
}

export function isDemoIndustry(value: string | null): value is DemoIndustry {
  return value === 'travel' || value === 'supermarket' || value === 'restaurant' || value === 'auto-repair';
}
