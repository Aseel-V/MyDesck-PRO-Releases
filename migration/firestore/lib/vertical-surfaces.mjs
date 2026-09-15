/** The selector's two composition roots: the shipped Supabase product and the Firebase production root. */
export const PRODUCT_ROOTS = { shipped: 'src/production-main.tsx', firebase: 'src/firebase-main.tsx' };

/** The only modules allowed to touch Supabase Storage: the client and StorageRepository. */
export const STORAGE_ALLOWLIST = ['src/data/supabaseStorageClient.ts', 'src/data/SupabaseStorageRepository.ts'];

/**
 * Source files that belong to each product vertical, for attributing call sites, guard violations and
 * evidence. Shared platform files belong to none.
 */
export const VERTICAL_SURFACES = {
  supermarket: [/^src\/components\/dashboards\/SupermarketDashboard\.tsx$/, /^src\/components\/market\//, /^src\/modules\/market\//],
  auto_repair: [/^src\/components\/cars\//, /^src\/components\/repair\//, /^src\/components\/dashboards\/AutoRepairDashboard\.tsx$/,
    /^src\/lib\/repair(PdfGenerator|WhatsApp)\.ts$/],
  car_parts: [/^src\/components\/parts\//, /^src\/components\/dashboards\/CarPartsDashboard\.tsx$/],
  restaurant: [/^src\/components\/restaurant\//, /^src\/hooks\/useRestaurant\.ts$/, /^src\/hooks\/useKitchenDisplay\.ts$/,
    /^src\/contexts\/RestaurantRoleContext\.tsx$/, /^src\/components\/analytics\/(RestaurantAnalytics|RestaurantOrderModal|EditRestaurantOrderModal)\.tsx$/,
    /^src\/components\/dashboards\/RestaurantDashboard\.tsx$/, /^src\/lib\/(restaurantCalculator|demandForecasting)\.ts$/],
  tourism: [/^src\/components\/trips\//, /^src\/lib\/trip[A-Z]/, /^src\/lib\/(travelReports|analyticsQueries|pdfGenerator|paymentContractCompatibility|visaPaymentArrivals)\.ts$/,
    /^src\/hooks\/use(TripMutations|TripDraft|VisaPaymentArrivals)\.ts$/, /^src\/components\/analytics\/(Analytics|TravelReportsPanel|AnalyticsEngine)\.tsx?$/,
    /^src\/components\/analytics\/components\//, /^src\/components\/dashboards\/(TourismDashboard|TravelOperationsDashboard)\.tsx$/,
    /^src\/data\/SupabaseTripRepository\.ts$/, /^src\/components\/CommandPalette\.tsx$/, /^src\/pages\/GuideWallet\.tsx$/],
  phone_shop: [/^src\/components\/dashboards\/PhoneShopDashboard\.tsx$/],
  clothes_shop: [/^src\/components\/dashboards\/ClothesShopDashboard\.tsx$/],
  furniture_store: [/^src\/components\/dashboards\/FurnitureStoreDashboard\.tsx$/],
};

export const verticalOf = (file) => Object.entries(VERTICAL_SURFACES)
  .find(([, patterns]) => patterns.some((pattern) => pattern.test(file)))?.[0] ?? null;
