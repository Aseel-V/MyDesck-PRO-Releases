import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { Trip } from "../types/trip";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { AnimatePresence } from "framer-motion";
import MotionWrapper from "./MotionWrapper";
import { CommandPalette } from "./CommandPalette";
import { TripFormData } from "../types/trip";
import { useTripMutations } from "../hooks/useTripMutations";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import NewYearOverlay from "./ui/NewYearOverlay";
import { DEFAULT_TRIP_FILTERS } from "./trips/tripFiltersState";
import { ErrorBoundary } from "./ErrorBoundary";
import { ExchangeRateStrip } from './travel-ui/ExchangeRateStrip';
import {
  getEffectiveTripDate,
  isTripEligibleForAlert,
  isTripIncludedInDashboardStats,
} from "../lib/tripStatus";

// Lazy load components
const Settings = lazy(() => import("./Settings"));
const Trips = lazy(() => import("./trips/Trips"));
const Analytics = lazy(() => import("./analytics/Analytics"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard"));
const NewTripForm = lazy(() => import("./trips/NewTripForm"));
const Cars = lazy(() => import('./cars/Cars'));
const CarPartsInventory = lazy(() => import('./parts/CarPartsInventory'));

// Lazy load dashboards
const RestaurantDashboard = lazy(() => import("./dashboards/RestaurantDashboard"));
const SupermarketDashboard = lazy(() => import("./dashboards/SupermarketDashboard"));
const PhoneShopDashboard = lazy(() => import("./dashboards/PhoneShopDashboard"));
const CarPartsDashboard = lazy(() => import("./dashboards/CarPartsDashboard"));
const ClothesShopDashboard = lazy(() => import("./dashboards/ClothesShopDashboard"));
const FurnitureStoreDashboard = lazy(() => import("./dashboards/FurnitureStoreDashboard"));
const TourismDashboard = lazy(() => import("./dashboards/TourismDashboard"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500"></div>
  </div>
);

type Page = "home" | "trips" | "analytics" | "settings" | "admin" | "parts";

type AdminStats = {
  totalUsers: number;
  totalAdmins: number;
  totalRegularUsers: number;
  newUsersThisMonth: number;
};

interface StatsUserProfile {
  role: string;
  created_at: string;
  [key: string]: unknown;
}

export default function Dashboard() {
  const { profile, user, isAdmin } = useAuth();

  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [showNavbar, setShowNavbar] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<Trip | undefined>(undefined);
  const [adminStats, setAdminStats] = useState<AdminStats>({
    totalUsers: 0,
    totalAdmins: 0,
    totalRegularUsers: 0,
    newUsersThisMonth: 0,
  });

  // State for NewTripForm (Lifted from Trips.tsx)
  const [showNewTripForm, setShowNewTripForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | undefined>(undefined);
  const { saveTrip } = useTripMutations();

  // Trip Filters State (Lifted for Persistence)
  const [tripFilters, setTripFilters] = useState(DEFAULT_TRIP_FILTERS);

  // Alert System State
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const handleCreateTrip = () => {
    setSelectedTrip(undefined);
    setEditingTrip(undefined);
    setShowNewTripForm(true);
  };

  const handleEditTrip = (trip: Trip) => {
    setEditingTrip(trip);
    setShowNewTripForm(true);
  };

  // Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Keyboard Shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrlKey: true,
      action: () => setIsCommandPaletteOpen((prev) => !prev),
      preventDefault: true,
    },
    {
      key: 'n',
      ctrlKey: true,
      action: handleCreateTrip,
      preventDefault: true,
    },
  ]);

  const handleSaveTrip = async (data: TripFormData) => {
    await saveTrip({ formData: data, editTripId: editingTrip?.id });
    setShowNewTripForm(false);
    setEditingTrip(undefined);
  };

  const handleCloseNewTripForm = () => {
    setShowNewTripForm(false);
    setEditingTrip(undefined);
  };

  // 🧭 Load Trips (For regular business profiles)
  const {
    data: trips = [],
    isLoading,
  } = useQuery<Trip[]>({
    queryKey: ["trips", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as Trip[];
    },
    enabled: !!user?.id && !isAdmin,
  });

  // 👑 Platform Admin Stats
  async function fetchAdminUserStats() {
    try {
      const { data, error } = await supabase.from("user_profiles").select("*");
      if (error) throw error;

      const users = (data || []) as StatsUserProfile[];
      const totalUsers = users.length;
      const totalAdmins = users.filter((p) => p.role === "admin").length;
      const totalRegularUsers = users.filter((p) => p.role === "user").length;

      const now = new Date();
      const newUsersThisMonth = users.filter((p) => {
        const d = new Date(p.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;

      setAdminStats({
        totalUsers,
        totalAdmins,
        totalRegularUsers,
        newUsersThisMonth,
      });
    } catch (e) {
      console.error("Error fetching admin stats:", e);
    }
  }

  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      fetchAdminUserStats();
    }
  }, [user, isAdmin]);

  // State for Year Filter
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  // Derive available years from trips
  const availableYears = useMemo(() => {
    if (!trips || trips.length === 0) return [new Date().getFullYear().toString()];
    const years = new Set(
      trips
        .filter(isTripIncludedInDashboardStats)
        .map((tr) => {
          const effDate = getEffectiveTripDate(tr);
          return new Date(effDate).getFullYear().toString();
        })
    );
    const currentYear = new Date().getFullYear().toString();
    if (!years.has(currentYear)) years.add(currentYear);
    
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [trips]);

  // Filter trips by year
  const filteredTrips = useMemo(() => {
    return trips.filter(trip => {
      if (!isTripIncludedInDashboardStats(trip)) return false;
      const effDate = getEffectiveTripDate(trip);
      return new Date(effDate).getFullYear().toString() === yearFilter;
    });
  }, [trips, yearFilter]);

  // Filter top 5 recent trips
  const recentTrips = useMemo(() => filteredTrips.slice(0, 5), [filteredTrips]);

  // Compute Alerts
  const alerts = useMemo(() => {
    return trips.filter(trip => {
      if (dismissedAlerts.includes(trip.id)) return false;
      return isTripEligibleForAlert(trip);
    });
  }, [trips, dismissedAlerts]);

  const handleDismissAlert = (tripId: string) => {
    setDismissedAlerts(prev => [...prev, tripId]);
  };

  const handleNavigate = (page: Page) => {
    setCurrentPage(page);
  };

  const handleSelectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    setCurrentPage("trips");
  };

  const isBentoDashboardVisible = 
    currentPage === "home" && 
    (
      !profile?.business_type || 
      profile?.business_type === 'tourism' || 
      profile?.business_type === 'auto_repair' || 
      isAdmin
    );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 relative">
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={handleNavigate}
        onSelectTrip={handleSelectTrip}
        onCreateTrip={handleCreateTrip}
      />

      {showNewTripForm && (
        <Suspense fallback={<PageLoader />}>
          <NewTripForm
            onClose={handleCloseNewTripForm}
            onSave={handleSaveTrip}
            editTrip={editingTrip}
          />
        </Suspense>
      )}

      {/* New Year Celebration Overlay */}
      <NewYearOverlay />

      {showNavbar && (
        <Navbar 
          onNavigate={handleNavigate} 
          currentPage={currentPage} 
          onOpenSearch={() => setIsCommandPaletteOpen(true)}
        />
      )}

      {profile?.business_type === 'tourism' && currentPage !== 'settings' && (
        <div className="app-exchange-rate relative z-20 pt-20 ps-4 sm:ps-6 lg:pt-24 lg:ps-8">
          <ExchangeRateStrip />
        </div>
      )}

      <main className="relative z-10 flex-1 w-full mx-auto pt-6 pb-10 space-y-6 px-4 sm:px-6 lg:px-8 max-w-none">
        <AnimatePresence mode="wait">
          {/* Main default Bento dashboard */}
          {isBentoDashboardVisible && (
            <MotionWrapper key="home">
              <Suspense fallback={<PageLoader />}>
                <TourismDashboard
                  trips={trips}
                  filteredTrips={filteredTrips}
                  isLoading={isLoading}
                  profile={profile}
                  isAdmin={isAdmin}
                  yearFilter={yearFilter}
                  setYearFilter={setYearFilter}
                  availableYears={availableYears}
                  recentTrips={recentTrips}
                  alerts={alerts}
                  onDismissAlert={handleDismissAlert}
                  onSelectTrip={handleSelectTrip}
                  onNavigate={(page) => setCurrentPage(page as Page)}
                  onCreateTrip={handleCreateTrip}
                  adminStats={adminStats}
                />
              </Suspense>
            </MotionWrapper>
          )}

          {/* Tourism & Auto Repair Trip Lists */}
          {currentPage === "trips" && !isAdmin && (!profile?.business_type || profile?.business_type === 'tourism' || profile?.business_type === 'auto_repair') && (
            <MotionWrapper key="trips">
              <Suspense fallback={<PageLoader />}>
                {profile?.business_type === 'auto_repair' ? (
                    <Cars onToggleNavbar={setShowNavbar} />
                ) : (
                    <Trips
                      filters={tripFilters}
                      onFiltersChange={setTripFilters}
                      initialViewTrip={selectedTrip}
                      onEditTrip={handleEditTrip}
                      onCreateTrip={handleCreateTrip}
                    />
                )}
              </Suspense>
            </MotionWrapper>
          )}

          {/* Analytics View */}
          {currentPage === "analytics" && (
            <MotionWrapper key="analytics">
              <Suspense fallback={<PageLoader />}>
                <Analytics
                  trips={trips}
                  onSelectTrip={handleSelectTrip}
                  onOpenTripsWithFilter={(opts: { month?: string; pendingOnly?: boolean }) => {
                    if (opts) {
                      setTripFilters(prev => ({
                        ...prev,
                        month: opts.month || prev.month,
                        paymentStatus: opts.pendingOnly ? 'partial' : prev.paymentStatus
                      }));
                    }
                    setCurrentPage("trips");
                  }}
                />
              </Suspense>
            </MotionWrapper>
          )}

          {/* Car Parts Inventory View */}
          {currentPage === "parts" && profile?.business_type === 'auto_repair' && (
            <MotionWrapper key="parts">
              <Suspense fallback={<PageLoader />}>
                <CarPartsInventory />
              </Suspense>
            </MotionWrapper>
          )}

          {/* Settings Screen */}
          {currentPage === "settings" && (
            <MotionWrapper key="settings">
              <Suspense fallback={<PageLoader />}>
                <Settings />
              </Suspense>
            </MotionWrapper>
          )}

          {/* Admin Dashboard */}
          {currentPage === "admin" && isAdmin && (
            <MotionWrapper key="admin">
              <Suspense fallback={<PageLoader />}>
                <AdminDashboard />
              </Suspense>
            </MotionWrapper>
          )}

          {/* Business-Specific Multi-Tenant Dashboards */}
          {profile?.business_type === 'restaurant' && !isAdmin && currentPage === 'home' && (
             <MotionWrapper key="restaurant">
                <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <RestaurantDashboard 
                      onToggleNavbar={(show: boolean) => setShowNavbar(show)} 
                    />
                  </Suspense>
                </ErrorBoundary>
             </MotionWrapper>
          )}
          {profile?.business_type === 'supermarket' && !isAdmin && currentPage === 'home' && (
             <MotionWrapper key="supermarket">
               <Suspense fallback={<PageLoader />}>
                 <SupermarketDashboard />
               </Suspense>
             </MotionWrapper>
          )}
          {profile?.business_type === 'phone_shop' && !isAdmin && currentPage === 'home' && (
             <MotionWrapper key="phone_shop">
               <Suspense fallback={<PageLoader />}>
                 <PhoneShopDashboard />
               </Suspense>
             </MotionWrapper>
          )}
          {profile?.business_type === 'car_parts' && !isAdmin && currentPage === 'home' && (
             <MotionWrapper key="car_parts">
               <Suspense fallback={<PageLoader />}>
                 <CarPartsDashboard />
               </Suspense>
             </MotionWrapper>
          )}
          {profile?.business_type === 'clothes_shop' && !isAdmin && currentPage === 'home' && (
             <MotionWrapper key="clothes_shop">
               <Suspense fallback={<PageLoader />}>
                 <ClothesShopDashboard />
               </Suspense>
             </MotionWrapper>
          )}
          {profile?.business_type === 'furniture_store' && !isAdmin && currentPage === 'home' && (
             <MotionWrapper key="furniture_store">
               <Suspense fallback={<PageLoader />}>
                 <FurnitureStoreDashboard />
               </Suspense>
             </MotionWrapper>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}
