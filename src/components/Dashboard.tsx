import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { Trip } from "../types/trip";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { AnimatePresence } from "framer-motion";
import MotionWrapper from "./MotionWrapper";

import { Toaster } from "sonner";
import { CommandPalette } from "./CommandPalette";
import { Skeleton } from "./ui/Skeleton";
import { TripFormData } from "../types/trip";
import { useTripMutations } from "../hooks/useTripMutations";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import NewYearOverlay from "./ui/NewYearOverlay";
import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  getEffectiveTripDate,
  isTripEligibleForAlert,
  isTripIncludedInDashboardStats,
} from "../lib/tripStatus";

// Lazy load heavy components for better performance
const Settings = lazy(() => import("./Settings"));
const Trips = lazy(() => import("./trips/Trips"));
const Analytics = lazy(() => import("./analytics/Analytics"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard"));
const NewTripForm = lazy(() => import("./trips/NewTripForm"));
const Cars = lazy(() => import('./cars/Cars'));
const CarPartsInventory = lazy(() => import('./parts/CarPartsInventory'));

// Lazy load business-specific dashboards
const RestaurantDashboard = lazy(() => import("./dashboards/RestaurantDashboard"));
const SupermarketDashboard = lazy(() => import("./dashboards/SupermarketDashboard"));
const PhoneShopDashboard = lazy(() => import("./dashboards/PhoneShopDashboard"));
const CarPartsDashboard = lazy(() => import("./dashboards/CarPartsDashboard"));
const ClothesShopDashboard = lazy(() => import("./dashboards/ClothesShopDashboard"));
const FurnitureStoreDashboard = lazy(() => import("./dashboards/FurnitureStoreDashboard"));

// Loading fallback component
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

// Local interface for stats calculation
interface StatsUserProfile {
  role: string;
  created_at: string;
  [key: string]: unknown;
}

export default function Dashboard() {
  const { profile, user, isAdmin } = useAuth();
  const { t } = useLanguage();

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
  const [tripFilters, setTripFilters] = useState({
    search: '',
    paymentStatus: '',
    tripStatus: '',
    year: new Date().getFullYear().toString(),
    month: '',
    destination: ''
  });

  // Alert System State
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const handleCreateTrip = () => {
    setSelectedTrip(undefined);
    setShowNewTripForm(true); // Assuming setIsNewTripModalOpen is a typo and setShowNewTripForm is intended
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

  // 🧭 تحميل الرحلات (للمستخدم العادي فقط)
  const {
    data: trips = [],
    isLoading,
    error,
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

  // 👑 إحصائيات الأدمن
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
      console.error("Error fetching admin user stats:", e);
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

  // 📊 إحصائيات الداشبورد للمستخدم العادي (Filtered)
  const totalTrips = filteredTrips.length;
  const today = new Date().toISOString().split("T")[0];

  const upcomingTrips = filteredTrips.filter((trip) => trip.start_date >= today).length;
  const uniqueClients = new Set(filteredTrips.map((trip) => trip.client_name)).size;
  const totalTravelers = filteredTrips.reduce(
    (sum, trip) => sum + (trip.travelers_count || 0),
    0
  );
  // Keep recent trips global or filtered? Plan said global.
  // Actually, let's keep recent trips as global recent, so they don't disappear when selecting an old year.
  // BUT the user asked for "show 2026 also". If they select 2026, they expect to see 2026 stats. 
  // Recent trips usually means "what did I just do?". 
  // I will use `trips` (all trips) for Recent Trips, but `filteredTrips` for the top stats cards.
  // UPDATE: User requested Recent Trips to be filtered by year as well ("show the 2026 also").
  const recentTrips = filteredTrips.slice(0, 5);

  // Compute Alerts
  const alerts = trips.filter(trip => {
    if (dismissedAlerts.includes(trip.id)) return false;
    return isTripEligibleForAlert(trip);
  });

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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 relative">
      <Toaster position="top-center" theme="dark" richColors closeButton />
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

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-10 space-y-6">
        <AnimatePresence mode="wait">
          {currentPage === "home" && (!profile?.business_type || profile?.business_type === 'tourism' || profile?.business_type === 'auto_repair' || isAdmin) && (
            <MotionWrapper key="home" className="space-y-6">
              {/* Alerts Section */}
              {alerts.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold px-1">
                    {t('notifications.title') || 'Notifications'}
                  </h2>
                  <div className="grid gap-3">
                    {alerts.map(trip => {
                      const tripDate = new Date(getEffectiveTripDate(trip));
                      const todayDate = new Date();
                      todayDate.setHours(0, 0, 0, 0);
                      tripDate.setHours(0, 0, 0, 0);
                      const diffTime = tripDate.getTime() - todayDate.getTime();
                      const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                      const statusLabel = trip.payment_status === 'partial' 
                        ? (t('trips.paymentStatuses.partial') || 'partial')
                        : (t('trips.paymentStatuses.unpaid') || 'unpaid');

                      const message = t('notifications.paymentDueMessage', "{{clientName}}'s trip to {{destination}} has a pending {{status}} payment.")
                        .replace('{{clientName}}', trip.client_name)
                        .replace('{{destination}}', trip.destination)
                        .replace('{{status}}', statusLabel);

                      return (
                        <div
                          key={trip.id}
                          className="group relative overflow-hidden bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between transition-all hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        >
                          <div className="flex items-start gap-4">
                            <div className="p-2.5 rounded-full bg-amber-100/50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0">
                              <AlertTriangle size={20} className="fill-current/20" />
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                {t('notifications.paymentReminder') || 'Payment Reminder'}
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                                  {daysUntil === 0 
                                    ? (t('notifications.today') || 'Today') 
                                    : (t('notifications.inDays')?.replace('{{count}}', daysUntil.toString()) || `In ${daysUntil} days`)}
                                </span>
                              </h3>
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                {message}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 pl-14 md:pl-0">
                            <button
                              onClick={() => handleSelectTrip(trip)}
                              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg transition-colors"
                            >
                              {t('notifications.viewTrip') || 'View Trip'}
                              <ArrowRight size={14} />
                            </button>
                            <button
                              onClick={() => handleDismissAlert(trip.id)}
                              className="p-1.5 text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
                              title="Dismiss"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Hero / Welcome panel */}
              <div className="glass-panel border border-slate-200/80 bg-white/95 rounded-2xl p-6 sm:p-8 shadow-xl dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-[0_22px_75px_rgba(15,23,42,0.98)]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-sky-300/80">
                      {isAdmin ? "Admin Overview" : "Dashboard"}
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-sky-800 to-slate-700 drop-shadow-sm dark:from-slate-50 dark:via-sky-100 dark:to-slate-200 dark:drop-shadow-[0_0_16px_rgba(15,23,42,0.9)]">
                      {t('dashboard.welcome')},{" "}
                      <span className="whitespace-nowrap">
                        {profile?.business_name || t('appName')}
                      </span>
                    </h1>
                    <p className="text-slate-600/90 max-w-2xl text-sm sm:text-[15px] dark:text-slate-300/90">
                      {isAdmin
                        ? "Manage users and monitor platform growth with a clear overview of the system."
                        : "Track your trips, clients and profit — keep your travel business organized in one smart place."}
                    </p>

                    {/* Year Selector for Users */}
                    {!isAdmin && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {availableYears.map((year) => (
                          <button
                            key={year}
                            onClick={() => setYearFilter(year)}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                              yearFilter === year
                                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                                : 'bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    )}

                    {error && !isAdmin && (
                      <p className="text-xs text-rose-400 mt-2">
                        Failed to load trips. Please try again later.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-stretch md:items-end gap-3 min-w-[210px]">
                    <div className="inline-flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2.5 shadow-md shadow-slate-200/80 dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-slate-950/80">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {t('dashboard.settings')}
                      </span>
                      <span className="text-xs text-slate-500/90 dark:text-slate-400/90">MyDesck PRO</span>
                    </div>

                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 shadow-md shadow-slate-200/80 dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-slate-950/80">
                      <span className="text-[11px] text-slate-400">Currency</span>
                      <span className="text-sm font-semibold text-sky-300">
                        {profile?.preferred_currency || "USD"}
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 shadow-md shadow-slate-200/80 dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-slate-950/80">
                      <span className="text-[11px] text-slate-400">Language</span>
                      <span className="text-sm font-semibold text-sky-300">
                        {t(`languages.${(profile?.preferred_language || "en")}`)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats + Quick actions */}
              {isAdmin ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="glass-panel bg-slate-950/90 border border-sky-500/30 rounded-2xl p-5 shadow-[0_18px_55px_rgba(15,23,42,0.9)]">
                    <p className="text-xs font-medium text-sky-200/80 mb-1">
                      Total Users
                    </p>
                    <p className="text-3xl font-bold text-slate-50 leading-tight">
                      {adminStats.totalUsers}
                    </p>
                  </div>
                  <div className="glass-panel bg-slate-950/90 border border-violet-500/35 rounded-2xl p-5 shadow-[0_18px_55px_rgba(15,23,42,0.9)]">
                    <p className="text-xs font-medium text-violet-200/80 mb-1">
                      Admins
                    </p>
                    <p className="text-3xl font-bold text-slate-50 leading-tight">
                      {adminStats.totalAdmins}
                    </p>
                  </div>
                  <div className="glass-panel bg-slate-950/90 border border-emerald-500/35 rounded-2xl p-5 shadow-[0_18px_55px_rgba(15,23,42,0.9)]">
                    <p className="text-xs font-medium text-emerald-200/80 mb-1">
                      Regular Users
                    </p>
                    <p className="text-3xl font-bold text-slate-50 leading-tight">
                      {adminStats.totalRegularUsers}
                    </p>
                  </div>
                  <div className="glass-panel bg-slate-950/90 border border-amber-500/35 rounded-2xl p-5 shadow-[0_18px_55px_rgba(15,23,42,0.9)]">
                    <p className="text-xs font-medium text-amber-200/80 mb-1">
                      New This Month
                    </p>
                    <p className="text-3xl font-bold text-slate-50 leading-tight">
                      {adminStats.newUsersThisMonth}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Total trips */}
                  {isLoading ? (
                    <Skeleton className="h-[140px] w-full rounded-2xl" />
                  ) : (
                    <div
                      className="glass-panel col-span-1 bg-gradient-to-br from-sky-500/10 via-sky-600/5 to-white/90 border border-sky-500/30 rounded-2xl p-5 shadow-lg hover:scale-[1.02] transition-transform cursor-pointer dark:from-sky-500/25 dark:via-sky-600/10 dark:to-slate-950/90 dark:border-sky-500/40 dark:shadow-[0_20px_60px_rgba(8,47,73,0.95)]"
                      onClick={() => setCurrentPage("trips")}
                    >
                      <p className="text-xs font-medium text-sky-100/85 mb-1">
                        {t('dashboard.trips')}
                      </p>
                      <p className="text-3xl font-bold text-slate-900 leading-tight dark:text-slate-50">
                        {totalTrips}
                      </p>
                      <p className="text-xs text-slate-500/90 mt-2 dark:text-slate-200/90">
                        Total trips managed in MyDesck PRO
                      </p>
                    </div>
                  )}

                  {/* Upcoming trips */}
                  {isLoading ? (
                    <Skeleton className="h-[140px] w-full rounded-2xl" />
                  ) : (
                    <div className="glass-panel bg-white/90 border border-emerald-500/30 rounded-2xl p-5 shadow-lg dark:bg-slate-950/90 dark:border-emerald-500/40 dark:shadow-[0_18px_55px_rgba(6,78,59,0.9)]">
                      <p className="text-xs font-medium text-emerald-200/85 mb-1">
                        Upcoming trips
                      </p>
                      <p className="text-3xl font-bold text-slate-900 leading-tight dark:text-slate-50">
                        {upcomingTrips}
                      </p>
                      <p className="text-xs text-slate-500/90 mt-2 dark:text-slate-200/90">
                        Starting from today and later
                      </p>
                    </div>
                  )}

                  {/* Clients */}
                  {isLoading ? (
                    <Skeleton className="h-[140px] w-full rounded-2xl" />
                  ) : (
                    <div className="glass-panel bg-white/90 border border-amber-500/30 rounded-2xl p-5 shadow-lg dark:bg-slate-950/90 dark:border-amber-500/40 dark:shadow-[0_18px_55px_rgba(120,53,15,0.9)]">
                      <p className="text-xs font-medium text-amber-200/85 mb-1">
                        Active clients
                      </p>
                      <p className="text-3xl font-bold text-slate-900 leading-tight dark:text-slate-50">
                        {uniqueClients}
                      </p>
                      <p className="text-xs text-slate-500/90 mt-2 dark:text-slate-200/90">
                        Unique client names across all trips
                      </p>
                    </div>
                  )}

                  {/* Travelers */}
                  {isLoading ? (
                    <Skeleton className="h-[140px] w-full rounded-2xl" />
                  ) : (
                    <div className="glass-panel bg-white/90 border border-fuchsia-500/30 rounded-2xl p-5 shadow-lg dark:bg-slate-950/90 dark:border-fuchsia-500/40 dark:shadow-[0_18px_55px_rgba(88,28,135,0.9)]">
                      <p className="text-xs font-medium text-fuchsia-200/85 mb-1">
                        Total travelers
                      </p>
                      <p className="text-3xl font-bold text-slate-900 leading-tight dark:text-slate-50">
                        {totalTravelers}
                      </p>
                      <p className="text-xs text-slate-500/90 mt-2 dark:text-slate-200/90">
                        Sum of travelers in all trips
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {!isAdmin && (
                  <div className="glass-panel lg:col-span-2 bg-white/90 border border-slate-200/80 rounded-2xl p-6 shadow-xl dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-[0_20px_60px_rgba(15,23,42,0.95)]">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                        {t('dashboard.recentTrips')}
                      </h2>
                      <button
                        onClick={() => setCurrentPage("trips")}
                        className="text-xs font-medium text-sky-300 hover:text-sky-200"
                      >
                        {t('dashboard.viewAll')}
                      </button>
                    </div>
                    {isLoading ? (
                      <Skeleton className="h-[160px] w-full rounded-2xl" />
                    ) : recentTrips.length === 0 ? (
                      <div className="text-sm text-slate-400">
                        No trips yet. Create your first trip from the{" "}
                        <span className="text-sky-300 font-medium">
                          {t('dashboard.trips')}
                        </span>{" "}
                        page.
                      </div>
                    ) : (
                      <>
                        <div className="block sm:hidden space-y-3">
                        {recentTrips.map((trip) => (
                          <div key={trip.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{trip.destination}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{trip.client_name}</p>
                              </div>
                              <span
                                className={`inline-flex px-2 py-1 rounded-full text-[10px] font-semibold ${trip.status === "active"
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                                  : trip.status === "completed"
                                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/40"
                                    : "bg-rose-500/15 text-rose-300 border border-rose-500/40"
                                  }`}
                              >
                                {trip.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                <span>{trip.start_date}</span>
                                <span>•</span>
                                <span>{trip.travelers_count} Travelers</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="hidden sm:block overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-200/80 dark:text-slate-400 dark:border-slate-800/80">
                              <th className="text-left py-2 pr-4 font-medium">
                                {t('trips.destination')}
                              </th>
                              <th className="text-left py-2 pr-4 font-medium">
                                {t('trips.clientName')}
                              </th>
                              <th className="text-left py-2 pr-4 font-medium">
                                {t('trips.startDate')}
                              </th>
                              <th className="text-left py-2 pr-4 font-medium">
                                {t('trips.travelers')}
                              </th>
                              <th className="text-left py-2 pr-4 font-medium">
                                {t('trips.status')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentTrips.map((trip) => (
                              <tr
                                key={trip.id}
                                className="border-b border-slate-200/70 last:border-0 dark:border-slate-900/70"
                              >
                                <td className="py-2 pr-4 text-slate-900 whitespace-nowrap dark:text-slate-100">
                                  {trip.destination}
                                </td>
                                <td className="py-2 pr-4 text-slate-600 whitespace-nowrap dark:text-slate-300">
                                  {trip.client_name}
                                </td>
                                <td className="py-2 pr-4 text-slate-600 whitespace-nowrap dark:text-slate-300">
                                  {trip.start_date}
                                </td>
                                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                                  {trip.travelers_count}
                                </td>
                                <td className="py-2 pr-4">
                                  <span
                                    className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold ${trip.status === "active"
                                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                                      : trip.status === "completed"
                                        ? "bg-sky-500/15 text-sky-300 border border-sky-500/40"
                                        : "bg-rose-500/15 text-rose-300 border border-rose-500/40"
                                      }`}
                                  >
                                    {trip.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      </>
                    )}
                  </div>
                )}

                {/* Quick actions / Shortcuts */}
                <div className="space-y-4">
                  <div className="glass-panel bg-white/90 border border-slate-200/80 rounded-2xl p-6 shadow-xl dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-[0_20px_60px_rgba(15,23,42,0.95)]">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3 dark:text-slate-50">
                      {isAdmin ? "Admin shortcuts" : t('dashboard.quickActions')}
                    </h2>
                    <p className="text-sm text-slate-400 mb-4">
                      {isAdmin
                        ? "Move quickly to key admin areas."
                        : t('dashboard.quickActionsSubtitle')}
                    </p>
                    <div className="space-y-3">
                      {!isAdmin && (
                        <button
                          onClick={() => setCurrentPage("trips")}
                          className="w-full text-sm font-semibold inline-flex items-center justify-between px-4 py-3 rounded-xl bg-sky-600/95 hover:bg-sky-500 text-white transition shadow-[0_16px_40px_rgba(56,189,248,0.6)]"
                        >
                          <span>{t('dashboard.openTrips')}</span>
                          <span className="text-xs text-sky-100/90">
                            {t('dashboard.manageBookings')}
                          </span>
                        </button>
                      )}

                      {isAdmin && (
                        <button
                          onClick={() => setCurrentPage("admin")}
                          className="w-full text-sm font-semibold inline-flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-600/95 hover:bg-emerald-500 text-white transition shadow-[0_16px_40px_rgba(16,185,129,0.6)]"
                        >
                          <span>Open Admin Panel</span>
                          <span className="text-xs text-emerald-100/90">
                            Manage users & settings
                          </span>
                        </button>
                      )}

                      <button
                        onClick={() => setCurrentPage("settings")}
                        className="w-full text-sm font-semibold inline-flex items-center justify-between px-4 py-3 rounded-xl bg-slate-100/95 hover:bg-slate-200 text-slate-900 transition shadow-sm dark:bg-slate-900/95 dark:hover:bg-slate-800 dark:text-slate-100 dark:shadow-[0_16px_40px_rgba(15,23,42,0.8)]"
                      >
                        <span>{t('dashboard.openSettings')}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-300">
                          {t('dashboard.brandingLanguageCurrency')}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </MotionWrapper>
          )}

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

          {currentPage === "analytics" && (
            <MotionWrapper key="analytics">
              <Suspense fallback={<PageLoader />}>
                <Analytics
                  trips={trips}
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

          {currentPage === "parts" && profile?.business_type === 'auto_repair' && (
            <MotionWrapper key="parts">
              <Suspense fallback={<PageLoader />}>
                <CarPartsInventory />
              </Suspense>
            </MotionWrapper>
          )}

          {currentPage === "settings" && (
            <MotionWrapper key="settings">
              <Suspense fallback={<PageLoader />}>
                <Settings />
              </Suspense>
            </MotionWrapper>
          )}

          {currentPage === "admin" && isAdmin && (
            <MotionWrapper key="admin">
              <Suspense fallback={<PageLoader />}>
                <AdminDashboard />
              </Suspense>
            </MotionWrapper>
          )}

          {/* Dynamic Business Dashboards - Active on "home" page */}
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
          {/* Auto Repair removed from here as it is now integrated into generic structure */}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}
