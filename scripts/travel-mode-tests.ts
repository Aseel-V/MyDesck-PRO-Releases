import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapWithConcurrency } from '../src/lib/asyncPool';
import { calculateTripFinancials } from '../src/lib/tripFinancials';
import { toTripInsert, toTripPaymentPlanInput, toTripUpdate } from '../src/lib/tripPayload';
import { stripSensitiveTravelerDraftFields } from '../src/lib/tripPrivacy';
import { getTripDuration } from '../src/lib/tripDates';
import { formatCurrency } from '../src/utils/localeFormatting';
import type { TripFormData } from '../src/types/trip';
import type { Trip } from '../src/types/trip';
import { isMissingRpcError, shouldRetryQuery } from '../src/lib/queryRetryPolicy';
import { createTripCsv, escapeCsvCell } from '../src/lib/tripExport';
import { buildDuplicateTripForm, getDuplicateDatePreview } from '../src/lib/tripDuplicate';
import { createTemplateDataFromTrip, templateContainsSensitiveData } from '../src/lib/tripTemplates';
import { buildWhatsappVariables, containsSensitiveWhatsAppContent, createWhatsAppUrl, findUnknownWhatsappVariables, generateTripWhatsappMessage, interpolateWhatsAppTemplate, normalizeWhatsAppPhone } from '../src/lib/tripWhatsapp';
import { recommendWhatsappMessage } from '../src/lib/tripWhatsappSuggestions';
import { addCalendarMonths, buildInstallmentSchedule, getInstallmentDisplayStatus, paymentMethodIncludesInstallments, summarizeInstallments, validatePaymentSplit } from '../src/lib/tripInstallments';
import { generateInitialItinerary, generatePackingList, organizeActivities, checkTripCompleteness, suggestPrice } from '../src/lib/tripSmartTools';
import { aggregateSalesByCurrency, createReportCsv } from '../src/lib/travelReports';
import { getTripCardPaymentState } from '../src/lib/tripCardPayment';
import { createTripSchema } from '../src/lib/schemas';

const sampleForm: TripFormData = {
  destination: ' Paris ',
  client_name: ' Client ',
  client_phone: '0500000000',
  travelers: [{ full_name: 'Jane Doe', nationality: 'FR' }],
  travelers_count: 1,
  itinerary: [],
  start_date: '2024-02-29',
  end_date: '2024-03-01',
  currency: 'EUR',
  exchange_rate: 1,
  wholesale_cost: 80,
  sale_price: 100,
  payments: [],
  payment_status: 'partial',
  amount_paid: 40,
  payment_method: 'card',
  attachments: [],
  service_type: 'both',
  status: 'active',
};

const draft = stripSensitiveTravelerDraftFields(sampleForm);
assert.ok(!('travelers' in draft), 'draft must exclude traveler details');
assert.ok(!('client_phone' in draft), 'draft must exclude client phone');
assert.ok(!('attachments' in draft), 'draft must exclude attachment metadata');

const maliciousForm = { ...sampleForm, id: 'attacker-id', user_id: 'attacker', deleted_at: 'now', profit: 999 };
const insert = toTripInsert(maliciousForm, 'real-user');
const update = toTripUpdate(maliciousForm);
assert.equal(insert.user_id, 'real-user');
for (const forbidden of ['id', 'created_at', 'deleted_at', 'deleted_by', 'profit', 'profit_percentage']) {
  assert.ok(!(forbidden in insert), `insert must exclude ${forbidden}`);
  assert.ok(!(forbidden in update), `update must exclude ${forbidden}`);
}
assert.ok(!('payment_plan' in insert) && !('payment_plan' in update), 'payment plans must be mapped to their RPC rather than written as unknown trip columns');

assert.deepEqual(calculateTripFinancials(sampleForm), {
  salePrice: 100,
  wholesaleCost: 80,
  amountPaid: 40,
  profit: 20,
  markupPercentage: 25,
  amountDue: 60,
  paymentPercentage: 40,
  paymentStatus: 'partial',
});
assert.equal(calculateTripFinancials({ ...sampleForm, wholesale_cost: 0 }).markupPercentage, 0);
assert.equal(calculateTripFinancials({ ...sampleForm, sale_price: 0, amount_paid: Number.NaN }).amountDue, 0);
assert.equal(calculateTripFinancials({ ...sampleForm, amount_paid: 150 }).amountDue, 0);
for (const currency of ['USD', 'EUR', 'ILS']) {
  assert.match(formatCurrency(1234.5, currency, 'en'), /1[,.]234/);
}

assert.deepEqual(getTripDuration('2024-02-29', '2024-03-01'), { nights: 1, days: 2 });
assert.deepEqual(getTripDuration('2024-03-10', '2024-03-10'), { nights: 0, days: 1 });
assert.deepEqual(getTripDuration('2024-12-31', '2025-01-01'), { nights: 1, days: 2 });
assert.equal(getTripDuration('2025-01-02', '2025-01-01'), null);

assert.equal(addCalendarMonths('2024-01-31', 1), '2024-02-29');
assert.equal(addCalendarMonths('2024-01-31', 2), '2024-03-31');
assert.equal(addCalendarMonths('2023-01-31', 1), '2023-02-28');
assert.equal(addCalendarMonths('2024-12-31', 1), '2025-01-31');
const schedule = buildInstallmentSchedule(100000, 3, '2024-01-31');
assert.deepEqual(schedule.map((item) => item.expectedAmountMinor), [33333, 33333, 33334]);
assert.equal(schedule.reduce((sum, item) => sum + item.expectedAmountMinor, 0), 100000);
assert.deepEqual(schedule.map((item) => item.dueDate), ['2024-01-31', '2024-02-29', '2024-03-31']);
assert.equal(validatePaymentSplit(100000, 60000, 40000), true);
assert.equal(validatePaymentSplit(100000, 60000, 39999), false);
assert.equal(paymentMethodIncludesInstallments('card'), true);
assert.equal(paymentMethodIncludesInstallments('mixed'), true);
assert.equal(paymentMethodIncludesInstallments('cash'), false);
const sixInstallments = buildInstallmentSchedule(100001, 6, '2026-01-31');
assert.equal(sixInstallments.length, 6);
assert.deepEqual(sixInstallments.map((item) => item.dueDate), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
assert.equal(sixInstallments.reduce((sum, item) => sum + item.expectedAmountMinor, 0), 100001);
assert.equal(sixInstallments[5].expectedAmountMinor, 16671, 'the final installment receives the rounding remainder');
const installmentRows = schedule.map((item) => ({ due_date: item.dueDate, expected_amount_minor: item.expectedAmountMinor, paid_amount_minor: 0, status: 'scheduled' as const }));
assert.equal(getInstallmentDisplayStatus(installmentRows[0], '2024-02-01'), 'overdue');
assert.equal(getInstallmentDisplayStatus(installmentRows[1], '2024-02-29'), 'due_today');
assert.equal(summarizeInstallments(installmentRows, '2024-02-01').overdueMinor, 33333);

let active = 0;
let peak = 0;
const poolResults = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
  active += 1;
  peak = Math.max(peak, active);
  await new Promise((resolve) => setTimeout(resolve, 5));
  active -= 1;
  if (value === 4) throw new Error('expected failure');
  return value;
});
assert.equal(peak, 2, 'batch work must respect the concurrency limit');
assert.equal(poolResults.filter((result) => result.status === 'fulfilled').length, 5);
assert.equal(poolResults.filter((result) => result.status === 'rejected').length, 1);

assert.equal(isMissingRpcError({ status: 404 }), true);
assert.equal(isMissingRpcError({ code: 'PGRST202' }), true);
assert.equal(shouldRetryQuery(0, { status: 404 }), false);
assert.equal(shouldRetryQuery(0, { status: 403 }), false);
assert.equal(shouldRetryQuery(0, { code: '42883' }), false);
assert.equal(shouldRetryQuery(0, { status: 503 }), true);
assert.equal(shouldRetryQuery(3, { status: 503 }), false);

assert.equal(escapeCsvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
assert.equal(escapeCsvCell('+1'), '"\'+1"');
const exportLabels = { destination: 'Destination', client: 'Client', start: 'Start', end: 'End', status: 'Status', paymentStatus: 'Payment', currency: 'Currency', salePrice: 'Sale', amountPaid: 'Paid', amountDue: 'Due' };
const completeTrip: Trip = {
  ...sampleForm, id: '11111111-1111-4111-8111-111111111111', user_id: 'user', destination: '=Danger', client_name: 'Client',
  profit: 20, profit_percentage: 20, amount_due: 60, export_to_pdf: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  notes: 'internal', checklist_flight: false, checklist_hotel: false, checklist_payment: false,
};
const scheduledTrip: Trip = {
  ...completeTrip,
  payment_method: 'mixed',
  start_date: '2025-03-20',
  end_date: '2025-03-25',
  payment_plan_summary: {
    plan_id: '33333333-3333-4333-8333-333333333333', source: 'native', payment_method: 'mixed', currency: 'EUR',
    card_total_minor: 60000, cash_total_minor: 40000, cash_paid_minor: 10000, installment_count: 6,
    processed_installments: 2, scheduled_minor_to_date: 20000, remaining_scheduled_minor: 40000,
    next_installment_minor: 10000, next_installment_date: '2025-03-15', final_installment_date: '2025-06-15',
  },
};
const cardPayment = getTripCardPaymentState(scheduledTrip, '2025-03-10');
assert.equal(cardPayment.hasVisaSchedule, true);
assert.equal(cardPayment.processedInstallments, 2);
assert.equal(Math.round(cardPayment.visaProgress), 33);
assert.equal(cardPayment.combinedRemainingMinor, 70000);
assert.equal(cardPayment.nextInstallmentDate, '2025-03-15');
assert.equal(cardPayment.attention?.key, 'visaAfterTrip');
assert.equal(getTripCardPaymentState({ ...scheduledTrip, payment_plan_summary: { ...scheduledTrip.payment_plan_summary!, processed_installments: 6, scheduled_minor_to_date: 60000, remaining_scheduled_minor: 0, next_installment_minor: null, next_installment_date: null } }, '2025-07-01').statusChip?.key, 'visaComplete');
const planForm: TripFormData = { ...sampleForm, service_type: 'ticket', sale_price: 1000.01, amount_paid: 100, payment_method: 'mixed', card_paid_amount: 0, cash_paid_amount: 100, payment_date: '2026-01-15', payment_plan: { plan_id: null, card_total: 600, cash_total: 400.01, installment_count: 6, first_installment_date: '2026-01-31' } };
const mappedPlan = toTripPaymentPlanInput(planForm);
assert.deepEqual(mappedPlan, { existingPlanId: null, method: 'mixed', currency: 'EUR', cardTotalMinor: 60000, cashTotalMinor: 40001, installmentCount: 6, firstDate: '2026-01-31', confirmedCashMinor: 10000, paymentDate: '2026-01-15' });
assert.equal(createTripSchema().safeParse(planForm).success, true, 'valid submitted payload includes an exact installment plan');
assert.equal(createTripSchema().safeParse({ ...planForm, payment_plan: { ...planForm.payment_plan!, installment_count: 0 } }).success, false);
assert.equal(createTripSchema().safeParse({ ...planForm, payment_plan: { ...planForm.payment_plan!, cash_total: 1 } }).success, false);
assert.deepEqual((stripSensitiveTravelerDraftFields(planForm) as TripFormData).payment_plan, planForm.payment_plan, 'draft persistence must retain non-sensitive payment-plan fields');
const csv = createTripCsv([completeTrip], exportLabels);
assert.ok(csv.includes("'=Danger"));
assert.ok(!csv.includes('A12345678'));
assert.ok(!csv.includes('attachments'));

const legacyTrip = { ...completeTrip, travelers: [{ full_name: 'Jane Doe', nationality: 'FR', passport_number: 'enc:v1:legacy-ciphertext' }] } as unknown as Trip;
const duplicate = buildDuplicateTripForm(legacyTrip, { travelers: true, itinerary: true, hotel: true, flights: true, attachments: false, notes: true, pricing: true, payments: false, startDate: '2025-01-01', endDate: '2025-01-01' });
assert.equal(duplicate.payments.length, 0);
assert.equal(duplicate.amount_paid, 0);
assert.equal(duplicate.client_phone, undefined);
assert.ok(!('id' in duplicate));
assert.ok(!JSON.stringify(duplicate).includes('legacy-ciphertext'));
assert.deepEqual(getDuplicateDatePreview(completeTrip, '2025-02-01'), { shiftDays: 338, endDate: '2025-02-02', durationDays: 2 });
const shiftedTrip = { ...completeTrip, itinerary: [{ day: 1, date: '2024-02-29', title: 'Start', description: '' }], departure_datetime: '2024-02-29T08:00:00.000Z' };
const shifted = buildDuplicateTripForm(shiftedTrip, { travelers: false, itinerary: true, hotel: true, flights: true, attachments: false, notes: false, pricing: false, payments: false, startDate: '2025-02-28', endDate: '2025-03-01' });
assert.equal(shifted.itinerary[0].date, '2025-02-28');
assert.equal(shifted.departure_datetime?.slice(0, 10), '2025-02-28');

const template = createTemplateDataFromTrip(completeTrip);
assert.ok(!JSON.stringify(template).includes('A12345678'));
assert.ok(!JSON.stringify(template).includes('0500000000'));
assert.equal(templateContainsSensitiveData({ internal_notes: 'passport A12345678' }), true);

const generatedItinerary = generateInitialItinerary({ startDate: '2025-01-01', endDate: '2025-01-04', categories: ['culture'], freeDay: true });
assert.equal(generatedItinerary.length, 4);
assert.deepEqual(generatedItinerary.map((item) => item.title), ['arrival', 'activity_day', 'free_day', 'departure']);
assert.ok(!JSON.stringify(generatedItinerary).match(/price|opening|restaurant/i), 'generator must not invent live facts');
const organized = organizeActivities([
  { id: 'flex', date: '2025-01-02', startTime: '09:30', durationMinutes: 90, area: 'B' },
  { id: 'fixed', date: '2025-01-02', startTime: '10:00', durationMinutes: 60, area: 'A', fixed: true },
]);
assert.equal(organized.organized[0].id, 'fixed');
assert.equal(organized.warnings.length, 1);
assert.ok(!JSON.stringify(generatePackingList({ days: 4, weather: 'cold', activities: ['hiking'] })).toLowerCase().includes('passport'));
assert.ok(checkTripCompleteness({}).some((finding) => finding.code === 'client_name' && finding.level === 'error'));
assert.deepEqual(suggestPrice({ wholesaleCost: 100, targetMarkup: 25, minimumProfit: 10 }), { suggestedSalePrice: 125, expectedProfit: 25, markup: 25, historicalAverage: null, hasSufficientHistory: false });

const otherCurrencyTrip = { ...completeTrip, id: '22222222-2222-4222-8222-222222222222', currency: 'ILS' as const, sale_price: 200, wholesale_cost: 150, profit: 50, amount_paid: 100, amount_due: 100 };
const currencyReports = aggregateSalesByCurrency([completeTrip, otherCurrencyTrip]);
assert.deepEqual(currencyReports.map((item) => item.currency), ['EUR', 'ILS']);
assert.equal(currencyReports[0].sales, 100);
assert.ok(createReportCsv([{ destination: '=Formula' }], [{ key: 'destination', label: 'Destination' }], '2025-01-01').includes("'=Formula"));

assert.equal(normalizeWhatsAppPhone('0501234567'), '+972501234567');
assert.equal(normalizeWhatsAppPhone('050-123-4567'), '+972501234567');
assert.equal(normalizeWhatsAppPhone('+972 50-123-4567'), '+972501234567');
assert.equal(normalizeWhatsAppPhone('972501234567'), '+972501234567');
assert.equal(normalizeWhatsAppPhone('+14155552671'), '+14155552671');
assert.equal(normalizeWhatsAppPhone('4155552671'), null, 'ambiguous foreign numbers must not receive a guessed country code');
assert.equal(normalizeWhatsAppPhone('12'), null);
assert.equal(containsSensitiveWhatsAppContent('passport A12345678'), true);
const message = interpolateWhatsAppTemplate('Hello {{clientName}} - {{destination}} {{amountDue}} {{currency}}', completeTrip, 'Agency');
assert.equal(message, 'Hello Client - =Danger 60 EUR');
assert.equal(interpolateWhatsAppTemplate('{{nextInstallmentAmount}} {{currency}} {{nextInstallmentDate}}', completeTrip, 'Agency', { nextAmount: '25', nextDate: '2025-02-01' }), '25 EUR 2025-02-01');
assert.match(createWhatsAppUrl('+972501234567', message) || '', /^https:\/\/wa\.me\/972501234567\?text=/);
assert.match(createWhatsAppUrl('+972501234567', 'passport A12345678') || '', /passport%20A12345678/, 'sensitive edits warn but remain under explicit user control');
assert.deepEqual(findUnknownWhatsappVariables('{{client_name}} {{profit}} {{made_up}}'), ['profit', 'made_up']);
const safeWhatsappVariables = buildWhatsappVariables(scheduledTrip, 'en', { businessName: 'Agency' });
assert.equal(safeWhatsappVariables.client_name, 'Client');
assert.ok(!JSON.stringify(safeWhatsappVariables).match(/internal|wholesale|profit|attachment|passport/i), 'message variables must contain client-safe data only');
const whatsappMessages: Record<string, string> = {
  'trips.whatsapp.messages.visa_installment': 'Hello {{client_name}}\nPlanned {{installment_number}}/{{installment_count}}: {{next_installment_amount}} on {{next_installment_date}}\nRemaining scheduled: {{remaining_scheduled_amount}}',
  'trips.whatsapp.messages.hotel_details': 'Hotel: {{hotel_name}}\nRooms: {{room_information}}',
  'trips.whatsapp.messages.signature': 'Agency',
};
const translateWhatsapp = (key: string) => whatsappMessages[key] || key;
const visaMessage = generateTripWhatsappMessage('visa_installment', scheduledTrip, 'en', translateWhatsapp, { businessName: 'Agency' });
assert.match(visaMessage.message, /Planned 3\/6/);
assert.match(visaMessage.message, /Remaining scheduled/);
assert.ok(!visaMessage.message.match(/confirmed by|bank confirmed/i), 'scheduled Visa text must not claim bank confirmation');
const noHotelMessage = generateTripWhatsappMessage('hotel_details', completeTrip, 'en', translateWhatsapp);
assert.deepEqual(noHotelMessage.missing, ['hotel']);
assert.ok(!noHotelMessage.message.match(/undefined|null/i));
assert.equal(recommendWhatsappMessage({ ...completeTrip, start_date: '2025-03-15', end_date: '2025-03-20' }, { plan: null, installments: [] }, '2025-03-10'), 'final_reminder');
assert.equal(recommendWhatsappMessage({ ...completeTrip, start_date: '2025-02-01', end_date: '2025-02-05' }, { plan: null, installments: [] }, '2025-03-10'), 'thank_you');

const migration = readFileSync('supabase/migrations/20260719090000_travel_mode_production_hardening.sql', 'utf8');
const tripsSource = readFileSync('src/components/trips/Trips.tsx', 'utf8');
const tripFiltersSource = readFileSync('src/components/trips/TripFilters.tsx', 'utf8');
const tripToolbarTranslations = Object.fromEntries(['en', 'he', 'ar'].map((locale) => [locale, JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')).trips.toolbar])) as Record<string, Record<string, string>>;
const dashboardSource = readFileSync('src/components/Dashboard.tsx', 'utf8');
const pdfSource = readFileSync('src/lib/pdfGenerator.ts', 'utf8');
const rpcMigration = readFileSync('supabase/migrations/20260719130000_refresh_travel_rpc_contracts.sql', 'utf8');
const featureMigration = readFileSync('supabase/migrations/20260719140000_travel_mode_product_features.sql', 'utf8');
const serverPdf = readFileSync('supabase/functions/generate-trip-pdf/index.ts', 'utf8');
const measuredChart = readFileSync('src/components/travel-ui/MeasuredChart.tsx', 'utf8');
const tripDetailsSource = readFileSync('src/components/trips/ViewTripModal.tsx', 'utf8');
const tripTypeSource = readFileSync('src/types/trip.ts', 'utf8');
const travelChartSources = [
  readFileSync('src/components/analytics/Analytics.tsx', 'utf8'),
  readFileSync('src/components/dashboards/TourismDashboard.tsx', 'utf8'),
  readFileSync('src/components/dashboards/TravelOperationsDashboard.tsx', 'utf8'),
  readFileSync('src/components/analytics/components/TrendChart.tsx', 'utf8'),
  readFileSync('src/components/analytics/components/DestinationPerformance.tsx', 'utf8'),
];
const runtimeRepairMigration = readFileSync('supabase/migrations/20260719150000_fix_trip_detail_and_write_runtime.sql', 'utf8');
const runtimeVerification = readFileSync('scripts/verify-travel-runtime.sql', 'utf8');
const workflowMigration = readFileSync('supabase/migrations/20260719160000_travel_mode_smart_workflows.sql', 'utf8');
const workflowVerification = readFileSync('scripts/verify-travel-smart-workflows.sql', 'utf8');
const optionalPassportCleanup = readFileSync('scripts/optional-remove-legacy-passports.sql', 'utf8');
const tripCardSource = readFileSync('src/components/trips/TripCard.tsx', 'utf8');
const tripCardTranslations = Object.fromEntries(['en', 'he', 'ar'].map((locale) => [locale, JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')).trips.actions])) as Record<string, Record<string, string>>;
const newTripFormSource = readFileSync('src/components/trips/NewTripForm.tsx', 'utf8');
const installmentFieldsSource = readFileSync('src/components/trips/TripInstallmentPlanFields.tsx', 'utf8');
const tripMutationsSource = readFileSync('src/hooks/useTripMutations.ts', 'utf8');
const cardSummaryMigration = readFileSync('supabase/migrations/20260719170000_trip_card_payment_summary.sql', 'utf8');
const whatsappMigration = readFileSync('supabase/migrations/20260719180000_travel_whatsapp_composer.sql', 'utf8');
const whatsappDialogSource = readFileSync('src/components/trips/TripWhatsappDialog.tsx', 'utf8');
for (const requiredSql of [
  'trip_encrypt_travelers', 'auth.uid()', 'deleted_at IS NULL', 'trip_financial_audit',
  'ENABLE ROW LEVEL SECURITY', 'FOR UPDATE SKIP LOCKED', 'claim_trip_attachment_cleanup',
  'REVOKE ALL ON FUNCTION public.get_trip_details', 'GRANT EXECUTE ON FUNCTION public.purge_deleted_trips(integer) TO service_role',
]) assert.ok(migration.includes(requiredSql), `migration must include ${requiredSql}`);
assert.ok(!migration.toLowerCase().includes('organization_id'));
assert.ok(!tripsSource.includes('slice(0, 50)'), 'the list must not hide records after 50');
assert.ok(tripsSource.includes('fetchTripDetails'), 'heavy details must be lazy-loaded');
assert.ok(tripsSource.includes('mapWithConcurrency(exportTrips, 2'), 'PDF export concurrency must be bounded');
assert.deepEqual([tripToolbarTranslations.en.newTrip, tripToolbarTranslations.he.newTrip, tripToolbarTranslations.ar.newTrip], ['New Trip', 'טיול חדש', 'رحلة جديدة']);
assert.deepEqual([tripToolbarTranslations.en.moreActions, tripToolbarTranslations.he.moreActions, tripToolbarTranslations.ar.moreActions], ['More Actions', 'פעולות נוספות', 'إجراءات إضافية']);
for (const key of ['trash','reports','notifications','gridView','listView','export','saveFilter','resetFilters','templates','help']) assert.ok(['en','he','ar'].every((locale) => tripToolbarTranslations[locale][key]?.trim()), `toolbar ${key} must be localized`);
for (const action of ['newTrip','reports','notifications','trash']) assert.ok(tripsSource.includes(`t('trips.toolbar.${action}')`), `main toolbar must visibly label ${action}`);
assert.ok(tripsSource.indexOf("t('trips.toolbar.newTrip')") < tripsSource.indexOf("t('trips.toolbar.reports')"), 'main actions must preserve their logical priority order');
assert.ok(tripsSource.includes('role="group"') && tripsSource.includes('aria-pressed={viewMode === \'grid\'}') && tripsSource.includes('aria-pressed={viewMode === \'list\'}'), 'Grid and List must be an accessible segmented control');
assert.ok(tripsSource.includes('leadingControls={<') && tripFiltersSource.includes('{leadingControls}') && tripFiltersSource.includes('{trailingControls}'), 'view/data controls must render beside search and filters');
assert.ok(tripFiltersSource.includes("t('trips.toolbar.saveFilter')") && tripFiltersSource.includes("t('trips.toolbar.resetFilters')"), 'filter save and reset must remain inside the filter surface');
assert.ok(tripsSource.includes("t('trips.toolbar.moreActions')") && tripsSource.includes('aria-haspopup="menu"'), 'secondary actions must use a labeled menu trigger');
assert.ok(tripsSource.includes('setShowTemplates(true)') && tripsSource.includes('setShowStatusHelp(true)'), 'Templates and Help behavior must remain available');
assert.ok(tripsSource.includes("event.key === 'Escape'") && tripsSource.includes("className=\"absolute end-0"), 'toolbar menus must support Escape and logical RTL positioning');
assert.ok(!tripsSource.match(/size="icon"[^>]+setShow(?:Templates|Notifications|Trash|StatusHelp)/), 'toolbar actions must not regress to unlabeled icon-only controls');
assert.ok(!dashboardSource.includes('.from("trips")'), 'dashboard trip data must use the lightweight RPC');
assert.ok(pdfSource.includes('finally') && pdfSource.includes('removeChild(container)'), 'temporary PDF DOM must be cleaned up');
for (const signature of [
  'get_trip_details(p_trip_id uuid)',
  'get_trip_dashboard_items(p_year text)',
  'get_trips_page(',
  "GRANT EXECUTE ON FUNCTION public.get_trip_details(uuid) TO authenticated",
  "NOTIFY pgrst, 'reload schema'",
]) assert.ok(rpcMigration.includes(signature), `RPC migration must include ${signature}`);
assert.ok(featureMigration.includes('ENABLE ROW LEVEL SECURITY'));
assert.ok(featureMigration.includes('GRANT EXECUTE ON FUNCTION public.generate_trip_notifications(timestamptz) TO service_role'));
assert.ok(featureMigration.includes('REVOKE ALL ON FUNCTION public.generate_trip_notifications(timestamptz) FROM PUBLIC, anon, authenticated'));
assert.ok(serverPdf.includes('client.auth.getUser()') && serverPdf.includes("client.rpc('get_trip_details'"));
assert.ok(serverPdf.includes('SENSITIVE_EXPORT_NOT_ENABLED'));
assert.ok(!serverPdf.includes('passport_number'));
assert.ok(measuredChart.includes('ResizeObserver') && measuredChart.includes('minimumSize'));
for (const chartSource of travelChartSources) {
  assert.ok(chartSource.includes('MeasuredChart'), 'Travel charts must be gated by measured dimensions');
  assert.ok(chartSource.includes('initialDimension={{ width: 1, height: 1 }}'), 'Recharts must not initialize at -1 dimensions');
}
for (const runtimeContract of [
  'public.get_trip_details(p_trip_id uuid)',
  'RETURNS jsonb',
  'SET search_path = pg_catalog, public, private, extensions',
  'public.encrypt_trip_travelers_before_write()',
  'BEFORE INSERT OR UPDATE OF travelers ON public.trips',
  'GRANT EXECUTE ON FUNCTION public.get_trip_details(uuid) TO authenticated',
  "NOTIFY pgrst, 'reload schema'",
]) assert.ok(runtimeRepairMigration.includes(runtimeContract), `runtime repair must include ${runtimeContract}`);
assert.ok(!runtimeRepairMigration.match(/UPDATE\s+public\.trips/i), 'runtime repair must not rewrite trip rows');
assert.ok(!runtimeRepairMigration.match(/DELETE\s+FROM\s+public\.trips/i), 'runtime repair must not delete trip rows');
assert.ok(!tripDetailsSource.match(/passport|revealPassport|hidePassport/i), 'trip details must not expose legacy passport UI');
assert.ok(!tripTypeSource.includes('passport_number'), 'active trip types must not include legacy passport fields');
assert.ok(runtimeVerification.includes('pg_get_function_arguments'));
assert.ok(runtimeVerification.includes('SET LOCAL ROLE authenticated'));
assert.ok(runtimeVerification.includes('SET travelers = travelers'));
assert.ok(runtimeVerification.trimEnd().endsWith('ROLLBACK;'));
for (const contract of [
  'trip_payment_plans','trip_installments','trip_installment_events','ENABLE ROW LEVEL SECURITY',
  'create_trip_payment_plan','record_trip_installment_payment','get_travel_reports',
  "item - 'passport_number'", "source IN ('native','legacy')", "NOTIFY pgrst, 'reload schema'",
]) assert.ok(workflowMigration.includes(contract), `workflow migration must include ${contract}`);
assert.ok(workflowMigration.includes('AS "month"') && !workflowMigration.match(/::date\s+month\b/i), 'monthly report alias must remain valid PostgreSQL syntax');
assert.ok(!workflowMigration.match(/DELETE\s+FROM\s+public\.trips/i));
assert.ok(!workflowMigration.match(/UPDATE\s+public\.trips\s+(?:AS\s+\w+\s+)?SET/i), 'workflow migration must not rewrite existing trip rows');
assert.ok(workflowVerification.includes('SET LOCAL ROLE authenticated') && workflowVerification.trimEnd().endsWith('ROLLBACK;'));
assert.ok(optionalPassportCleanup.includes('OPTIONAL, DESTRUCTIVE ADMIN CLEANUP') && optionalPassportCleanup.trimEnd().endsWith('ROLLBACK;'));
assert.ok(tripCardSource.includes('role="progressbar"') && tripCardSource.includes('aria-expanded={expanded}'));
assert.ok(tripCardSource.includes("event.key === 'ArrowDown'") && tripCardSource.includes("event.key === 'Escape'"));
assert.ok(tripCardSource.includes("direction === 'rtl'") && tripCardSource.includes("'rotate-180'"));
assert.ok(tripCardSource.includes('break-words') && tripsSource.includes('grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3'));
assert.ok(!tripCardSource.match(/recordPayment|markAsPaid|record_trip_installment_payment/i), 'trip cards must not provide a payment write shortcut');
assert.deepEqual([tripCardTranslations.en.edit, tripCardTranslations.he.edit, tripCardTranslations.ar.edit], ['Edit', 'עריכה', 'تعديل']);
assert.deepEqual([tripCardTranslations.en.pdf, tripCardTranslations.he.pdf, tripCardTranslations.ar.pdf], ['PDF', 'PDF', 'PDF']);
for (const key of ['editAria', 'pdfAria', 'pdfLoading']) assert.ok(['en', 'he', 'ar'].every((locale) => tripCardTranslations[locale][key]?.trim()), `trip card action ${key} must be localized`);
assert.ok(tripCardSource.includes("t('trips.actions.edit')") && tripCardSource.includes("t('trips.actions.pdf')"), 'Edit and PDF must render visible localized labels');
assert.ok(tripCardSource.includes('bg-amber-400') && tripCardSource.includes('text-slate-950'), 'Edit must use the high-contrast amber action style');
assert.ok(tripCardSource.includes('bg-sky-700') && tripCardSource.includes('text-white'), 'PDF must use the high-contrast blue action style');
assert.ok(tripCardSource.includes('onClick={() => onEdit(trip)}') && tripCardSource.includes('onClick={() => void onOpenPdfPreview(trip)}'), 'Edit and PDF callbacks must remain unchanged');
assert.ok(tripCardSource.includes('grid-cols-3') && tripCardSource.includes('min-w-0') && tripCardSource.includes('min-h-11'), 'mobile action row must retain three visible 44px actions without overflow');
assert.ok(tripCardSource.includes('aria-busy={isPreparingPdf}') && tripCardSource.includes('role="status"'), 'PDF loading must be announced accessibly');
assert.ok(tripCardSource.includes('dir={direction}') && tripCardSource.includes('end-0'), 'card actions and overflow menu must inherit RTL and use logical alignment');
assert.ok(!tripCardSource.match(/aria-label=\{t\('trips\.edit'\)\}[\s\S]{0,100}<Edit[^>]*\/>\s*<\/button>/), 'Edit must not regress to an icon-only action');
for (const cardAction of ['onDuplicate(trip)', 'onSaveTemplate(trip)', 'onOpenSourceTemplate(trip)', 'onWhatsapp(trip)', 'onArchive(trip)']) {
  assert.ok(tripCardSource.includes(cardAction), `trip card must expose ${cardAction}`);
}
for (const cardContract of ['payment_plan_summary', 'LEFT JOIN LATERAL', 'trip_payment_plans', 'trip_installments', 'source_template_id', "NOTIFY pgrst,'reload schema'"]) {
  assert.ok(cardSummaryMigration.includes(cardContract), `card summary migration must include ${cardContract}`);
}
assert.ok(!cardSummaryMigration.match(/UPDATE\s+public\.trips\s+(?:AS\s+\w+\s+)?SET/i), 'card summary migration must not rewrite trip rows');
assert.ok(!cardSummaryMigration.match(/DELETE\s+FROM\s+public\.trips/i), 'card summary migration must not delete trip rows');
for (const contract of ['Change number', 'window.open(url', "'noopener,noreferrer'", 'phone_suffix', 'confirmBeforeOpen']) assert.ok(whatsappDialogSource.includes(contract) || whatsappDialogSource.includes(contract.replace('Change number', 'changeNumber')), `WhatsApp composer must include ${contract}`);
assert.ok(!whatsappDialogSource.match(/send-whatsapp|message.*sent|delivered|read_at/i), 'Travel WhatsApp composer must remain manual and must not claim delivery');
assert.ok(!whatsappDialogSource.includes('p_metadata: { body') && !whatsappDialogSource.includes('p_metadata: { message'), 'activity metadata must not store message bodies');
assert.ok(whatsappMigration.includes("to_regclass('public.trip_whatsapp_templates')") && whatsappMigration.includes("NOTIFY pgrst, 'reload schema'"));
assert.ok(newTripFormSource.includes("fetchTripPaymentPlan(editTrip!.id)") && newTripFormSource.includes("setValue('payment_plan'"), 'edit mode must hydrate the existing payment plan');
assert.ok(newTripFormSource.includes('<TripInstallmentPlanFields') && newTripFormSource.includes('direction={direction}'), 'the live installment section must preserve RTL direction');
assert.ok(installmentFieldsSource.includes("paymentMethodIncludesInstallments(method)") && installmentFieldsSource.includes('if (!includesCard) return null'), 'cash must hide installment fields while card and mixed reveal them');
for (const field of ['card_total', 'cash_total', 'installment_count', 'first_installment_date']) assert.ok(installmentFieldsSource.includes(field), `installment form must include ${field}`);
assert.ok(tripMutationsSource.includes('toTripPaymentPlanInput(formData)') && (tripMutationsSource.includes('save_trip_transaction') || tripMutationsSource.includes('syncTripPaymentPlan(data.id, paymentPlan)')), 'trip submission must persist its payment plan');

console.log('Travel Mode focused tests passed');
