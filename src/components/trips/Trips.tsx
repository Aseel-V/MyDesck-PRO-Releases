import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  FileText,
  BarChart3,
  CalendarCheck2,
  Wallet,
  AlertCircle,
  Landmark,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { supabase } from '../../lib/supabase';
import { Trip } from '../../types/trip';
import { useDebounce } from '../../hooks/useDebounce';
import { useTripMutations } from '../../hooks/useTripMutations';
import TripCard from './TripCard';
import TripFilters from './TripFilters';
import UpdatePaymentForm from './UpdatePaymentForm';
import PDFExportModal from './PDFExportModal';
import ViewTripModal from './ViewTripModal';
import JSZip from 'jszip';
import { generateTripInvoice } from '../../lib/pdfGenerator';
import { formatDate } from '../../lib/utils';
import { Skeleton } from '../ui/Skeleton';
import { AnimatePresence, motion } from 'framer-motion';

interface TripsProps {
  filters: {
    search: string;
    paymentStatus: string;
    tripStatus: string;
    year: string;
    month: string;
    destination: string;
  };
  onFiltersChange: React.Dispatch<React.SetStateAction<{
    search: string;
    paymentStatus: string;
    tripStatus: string;
    year: string;
    month: string;
    destination: string;
  }>>;
  initialViewTrip?: Trip;
  onEditTrip?: (trip: Trip) => void;
  onCreateTrip?: () => void;
}

export default function Trips({ filters, onFiltersChange, initialViewTrip, onEditTrip, onCreateTrip }: TripsProps) {
  const { t } = useLanguage();
  const { user, profile, userProfile } = useAuth();
  const { convert, format, currency, isLoading: isCurrencyLoading } = useCurrency();
  const { deleteTrip, updatePayment, toggleExport } = useTripMutations();

  // const [showNewTripForm, setShowNewTripForm] = useState(false); // Lifted to Dashboard
  const [showUpdatePaymentForm, setShowUpdatePaymentForm] = useState(false);
  // const [editingTrip, setEditingTrip] = useState<Trip | undefined>(undefined); // Lifted to Dashboard
  const [paymentTrip, setPaymentTrip] = useState<Trip | undefined>(undefined);
  const [viewTrip, setViewTrip] = useState<Trip | undefined>(undefined);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showPDFExport, setShowPDFExport] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isExportingBatch, setIsExportingBatch] = useState(false);

  // Filter setters
  const setSearchTerm = (val: string) => onFiltersChange(prev => ({ ...prev, search: val }));
  const setPaymentStatusFilter = (val: string) => onFiltersChange(prev => ({ ...prev, paymentStatus: val }));
  const setYearFilter = (val: string) => onFiltersChange(prev => ({ ...prev, year: val }));
  const setMonthFilter = (val: string) => onFiltersChange(prev => ({ ...prev, month: val }));
  const setDestinationFilter = (val: string) => onFiltersChange(prev => ({ ...prev, destination: val }));

  const debouncedSearchTerm = useDebounce(filters.search, 300);

  // Pagination
  const [page, setPage] = useState(1);
  // PAGE_SIZE removed

  useEffect(() => {
    if (initialViewTrip) {
      setViewTrip(initialViewTrip);
    }
  }, [initialViewTrip]);

  // Reset page when filters change
  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, filters.paymentStatus, filters.tripStatus, filters.year, filters.month, filters.destination]);

  const baseActionBtn =
    'inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition-all border-b-2';
  const primaryActionBtn =
    baseActionBtn +
    ' border-sky-400 text-slate-50 bg-slate-900/80 shadow-[0_4px_14px_rgba(15,23,42,0.8)] hover:bg-slate-900';
  const secondaryActionBtn =
    baseActionBtn +
    ' border-transparent text-slate-300 hover:text-slate-50 hover:bg-slate-900/50 hover:border-slate-500/80';

  // Query to get available years based on EFFECTIVE DATE (Cash Basis)
  const { data: availableYears = [] } = useQuery({
    queryKey: ['trip-years', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // Fetch both dates to determine effective year
      const { data } = await supabase
        .from('trips')
        .select('start_date, payment_date')
        .eq('user_id', user.id);
      
      if (!data) return [new Date().getFullYear().toString()];

      const years = new Set(
        data.map((t) => {
          // Effective Date Rule: Payment Date OR Start Date
          const effDate = t.payment_date || t.start_date;
          return new Date(effDate).getFullYear().toString();
        })
      );
      // Ensure current year is always available
      years.add(new Date().getFullYear().toString());
      
      return Array.from(years).sort((a, b) => b.localeCompare(a));
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const { data: { data: rawTrips, count } = { data: [], count: 0 }, isLoading: loading } = useQuery({
    queryKey: ['trips', user?.id, debouncedSearchTerm, filters.paymentStatus, filters.tripStatus, page], // Removed year/month from key as we filter client side
    queryFn: async () => {
      if (!user?.id) return { data: [], count: 0 };

      let query = supabase
        .from('trips')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id);

      // Apply filters that don't depend on Effective Date logic
      // We fetch ALL trips (matching search/status) and filter by Year/Month CLIENT-SIDE
      // This is crucial for "Effective Date" logic (Trip in 2026 paid in 2025 -> shows in 2025)
      
      const { data, error, count } = await query
        .order('start_date', { ascending: false });

      if (error) throw error;
      return { data: data as unknown as Trip[], count: count || 0 };
    },
    enabled: !!user?.id,
  });

  // Client-side Cash-Basis Filtering
  const filteredTrips = useMemo(() => {
    if (!rawTrips) return [];
    
    let filtered = rawTrips;

    // 1. Filter by search term
    if (debouncedSearchTerm) {
      const lowerSearch = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (trip) =>
          (trip.client_name && trip.client_name.toLowerCase().includes(lowerSearch)) ||
          (trip.destination && trip.destination.toLowerCase().includes(lowerSearch)) ||
          (trip.notes && trip.notes.toLowerCase().includes(lowerSearch))
      );
    }

    // 2. Filter by Payment Status
    if (filters.paymentStatus) {
      if (filters.paymentStatus === 'unpaid') {
         // Allow 'unpaid' OR null/undefined
         filtered = filtered.filter(t => !t.payment_status || t.payment_status === 'unpaid');
      } else {
         filtered = filtered.filter((trip) => trip.payment_status === filters.paymentStatus);
      }
    }

    // 3. Filter by Trip Status
    if (filters.tripStatus) {
      filtered = filtered.filter((trip) => trip.status === filters.tripStatus);
    }

    // 4. Filter by Year (Cash-Basis: Effective Date)
    if (filters.year) {
      filtered = filtered.filter(trip => {
         const effDate = trip.payment_date || trip.start_date;
         if (!effDate) return false;
         return new Date(effDate).getFullYear().toString() === filters.year;
      });
    }

    // 5. Filter by Month
    if (filters.month) {
      filtered = filtered.filter(trip => {
         const effDate = trip.payment_date || trip.start_date;
         if (!effDate) return false;
         const d = new Date(effDate);
         const m = String(d.getMonth() + 1).padStart(2, '0');
         return m === filters.month;
      });
    }

    // 6. Filter by Destination
    if (filters.destination) {
      filtered = filtered.filter((trip) => trip.destination === filters.destination);
    }

    return filtered;
  }, [rawTrips, debouncedSearchTerm, filters.paymentStatus, filters.tripStatus, filters.year, filters.month, filters.destination]);

  // saveTripMutation moved to useTripMutations hook
  // handleSaveTrip moved to Dashboard

  // updatePaymentMutation moved to useTripMutations hook

  const handleUpdatePayment = async (tripId: string, amountPaid: number, paymentStatus: 'paid' | 'partial' | 'unpaid') => {
    await updatePayment({ tripId, amountPaid, paymentStatus });
  };

  // deleteTripMutation moved to useTripMutations hook

  const handleDeleteTrip = (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }
    deleteTrip(id);
    setDeleteConfirm(null);
  };

  // toggleExportMutation moved to useTripMutations hook

  const handleToggleExport = (id: string, value: boolean) => {
    toggleExport({ id, value });
  };

  const trips = filteredTrips; // Alias for compatibility with rest of component
  // count variable will be the total fetched, not filtered. 
  // We might want to update the displayed count to filteredTrips.length

  // saveTripMutation moved to useTripMutations hook
  // handleSaveTrip moved to Dashboard
  // ... (rest of handlers)

  // availableYears moved to useQuery above

  const availableDestinations = useMemo(() => {
    if (!trips) return [];
    const destinations = new Set(trips.map((trip) => trip.destination));
    return Array.from(destinations).sort();
  }, [trips]);

  const tripsMarkedForExport = useMemo(
    () => trips.filter((trip) => trip.export_to_pdf),
    [trips]
  );
  
  // ... (Stats calculation on current page)
  
  // Separate query for Stats (No Pagination)
  

  const stats = useMemo(() => {
    if (!trips || trips.length === 0) return { totalTrips: 0, totalRevenue: 0, totalProfit: 0, unpaidAmount: 0, upcoming: 0 };
    
    // Since we now load ALL trips, totalTrips is just length. count is also fine.
    const totalTrips = count || 0; 
    
    // Correctly convert each trip's values to the user's display currency before summing
    const totalRevenue = trips.reduce((sum, trip) => {
      if (trip.status === 'cancelled') return sum;
      const tripCurrency = trip.currency || currency; // Default to user currency if missing
      const price = trip.sale_price || 0;
      return sum + convert(price, tripCurrency, currency);
    }, 0);

    const totalProfit = trips.reduce((sum, trip) => {
       if (trip.status === 'cancelled') return sum;
       const tripCurrency = trip.currency || currency;
       const profit = typeof trip.profit === 'number'
          ? trip.profit
          : (trip.sale_price || 0) - (trip.wholesale_cost || 0);
       return sum + convert(profit, tripCurrency, currency);
    }, 0);

    const unpaidAmount = trips.reduce((sum, trip) => {
       if (trip.status === 'cancelled') return sum;
       const tripCurrency = trip.currency || currency;
       const due = (trip.sale_price || 0) - (trip.amount_paid || 0);
       const positiveDue = due > 0 ? due : 0;
       return sum + convert(positiveDue, tripCurrency, currency);
    }, 0);

    const now = new Date();
    const upcomingTrips = trips.filter((trip) => {
      if (!trip.start_date) return false;
      const start = new Date(trip.start_date);
      return start >= now;
    }).length;

    return {
      totalTrips,
      totalRevenue,
      totalProfit,
      unpaidAmount,
      upcoming: upcomingTrips,
    };
  }, [trips, count, convert, currency]);

  const handleEditTrip = (trip: Trip) => {
    // setEditingTrip(trip);
    // setShowNewTripForm(true);
    onEditTrip?.(trip);
  };

  const handleUpdatePaymentClick = (trip: Trip) => {
    setPaymentTrip(trip);
    setShowUpdatePaymentForm(true);
  };

  const handleViewTrip = (trip: Trip) => {
    setViewTrip(trip);
  };

  // const handleCloseNewTripForm = () => {
  //   setShowNewTripForm(false);
  //   setEditingTrip(undefined);
  // };

  const handleCloseUpdatePaymentForm = () => {
    setShowUpdatePaymentForm(false);
    setPaymentTrip(undefined);
  };

  const handleDownloadAllInvoices = async () => {
    if (!filteredTrips.length || !user || !profile) return;
    setIsExportingBatch(true);

    const userFullName = userProfile?.full_name || '';
    const phoneNumber = userProfile?.phone_number || '';
    const language = profile.preferred_language || 'en';

    try {
      const zip = new JSZip();
      const folder = zip.folder(`Invoices_${new Date().toISOString().split('T')[0]}`);
      if (!folder) throw new Error('Failed to create zip folder');

      await Promise.all(
        filteredTrips.map(async (trip) => {
          try {
            const pdfBytes = await generateTripInvoice(
              trip,
              profile,
              userFullName,
              phoneNumber,
              language
            );
            const fileName = `Invoice_${trip.client_name}_${trip.destination}.pdf`;
            folder.file(fileName, pdfBytes);
          } catch (e) {
            console.error(`Failed to generate PDF for trip ${trip.id}`, e);
          }
        })
      );

      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoices_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating batch zip:', error);
    } finally {
      setIsExportingBatch(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>

        <Skeleton className="h-20 w-full rounded-2xl" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[280px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header + actions */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold gradient-title drop-shadow">
            {t('trips.title')}
          </h2>
          <p className="text-sm text-slate-300 mt-1">
            {count === 0
              ? 'No trips found'
              : `Showing ${filteredTrips.length} of ${count} trips`}
            {currency !== 'USD' && (
              <span className="ml-2 text-xs text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                {currency} {isCurrencyLoading && '...'}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900/80 rounded-xl p-1 border border-slate-800/80 mr-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                ? 'bg-slate-800 text-sky-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list'
                ? 'bg-slate-800 text-sky-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Batch Download Button */}
          {filteredTrips.length > 0 && (
            <button
              onClick={handleDownloadAllInvoices}
              disabled={isExportingBatch}
              className={secondaryActionBtn}
              title="Download all displayed invoices"
            >
              <FileText className="w-5 h-5" />
              <span>
                {isExportingBatch ? 'Zipping...' : 'Download All'}
              </span>
            </button>
          )}

          {tripsMarkedForExport.length > 0 && (
            <button
              onClick={() => setShowPDFExport(true)}
              className={secondaryActionBtn}
            >
              <FileText className="w-5 h-5" />
              <span>
                {t('trips.exportToPdf')} ({tripsMarkedForExport.length})
              </span>
            </button>
          )}

          <button
            onClick={() => onCreateTrip?.()}
            className={primaryActionBtn}
          >
            <Plus className="w-5 h-5" />
            <span>{t('trips.newTrip')}</span>
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-4 flex items-center justify-between shadow-md shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {t('trips.stats.totalTrips') ?? 'Total Trips'}
            </p>
            <p className="text-2xl font-bold text-slate-50">
              {stats.totalTrips}
            </p>
          </div>
          <div className="p-3 rounded-full bg-sky-500/10 border border-sky-500/40">
            <BarChart3 className="w-6 h-6 text-sky-400" />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-4 flex items-center justify-between shadow-md shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {t('trips.stats.totalRevenue') ?? 'Revenue (Page)'}
            </p>
            <p className="text-2xl font-bold text-slate-50">
              {format(stats.totalRevenue, currency)}
            </p>
          </div>
          <div className="p-3 rounded-full bg-indigo-500/10 border border-indigo-500/40">
            <Landmark className="w-6 h-6 text-indigo-300" />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-4 flex items-center justify-between shadow-md shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {t('trips.stats.totalProfit') ?? 'Profit (Page)'}
            </p>
            <p className="text-2xl font-bold text-emerald-300">
              {format(stats.totalProfit, currency)}
            </p>
          </div>
          <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/40">
            <Wallet className="w-6 h-6 text-emerald-400" />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-4 flex items-center justify-between shadow-md shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {t('trips.stats.unpaidAmount') ?? 'Unpaid (Page)'}
            </p>
            <p className="text-2xl font-bold text-rose-300">
              {format(stats.unpaidAmount, currency)}
            </p>
          </div>
          <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/40">
            <AlertCircle className="w-6 h-6 text-rose-400" />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-4 flex items-center justify-between shadow-md shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {t('trips.stats.upcoming') ?? 'Upcoming'}
            </p>
            <p className="text-2xl font-bold text-sky-200">
              {stats.upcoming}
            </p>
          </div>
          <div className="p-3 rounded-full bg-indigo-500/10 border border-indigo-500/40">
            <CalendarCheck2 className="w-6 h-6 text-indigo-300" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-slate-950/90 border border-slate-800/80 p-4 shadow-md shadow-slate-950/60">
        <TripFilters
          searchTerm={filters.search}
          onSearchChange={setSearchTerm}
          paymentStatusFilter={filters.paymentStatus}
          onPaymentStatusFilterChange={setPaymentStatusFilter}
          yearFilter={filters.year}
          onYearFilterChange={setYearFilter}
          monthFilter={filters.month}
          onMonthFilterChange={setMonthFilter}
          destinationFilter={filters.destination}
          onDestinationFilterChange={setDestinationFilter}
          availableYears={availableYears}
          availableDestinations={availableDestinations}
        />
      </div>

      {/* List / empty state */}
      <div className="min-h-[400px]">
      {filteredTrips.length === 0 ? (
        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-12 text-center shadow-lg shadow-slate-950/70">
          <div className="flex justify-center mb-4">
            <div className="bg-slate-900/80 border border-slate-700/80 p-6 rounded-full">
              <FileText className="w-12 h-12 text-slate-400" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-slate-100 mb-2">
            {t('trips.noTrips')}
          </h3>
          <p className="text-slate-300 mb-6">{t('trips.createFirst')}</p>
          <button
            onClick={() => onCreateTrip?.()}
            className={primaryActionBtn}
          >
            <Plus className="w-5 h-5" />
            <span>{t('trips.newTrip')}</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredTrips.map((trip) => (
              <motion.div
                layout
                key={trip.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <TripCard
                  trip={trip}
                  onEdit={handleEditTrip}
                  onDelete={handleDeleteTrip}
                  onUpdatePayment={handleUpdatePaymentClick}
                  onToggleExport={handleToggleExport}
                  onView={handleViewTrip}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="glass-panel bg-slate-950/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg shadow-slate-950/70">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-800/80 sticky top-0 z-10 backdrop-blur-md">
                  <th className="text-left py-3 px-4 font-medium text-slate-400">Destination</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-400">Client</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-400">Dates</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-400">Price</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-400">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                <AnimatePresence mode="popLayout">
                  {filteredTrips.map((trip) => (
                    <motion.tr
                      layout
                      key={trip.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-slate-900/30 transition-colors"
                    >
                      <td className="py-3 px-4 text-slate-100 font-medium">{trip.destination}</td>
                      <td className="py-3 px-4 text-slate-300">{trip.client_name}</td>
                      <td className="py-3 px-4 text-slate-400">
                        {formatDate(trip.start_date)}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {format(trip.sale_price || 0, trip.currency || currency)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${trip.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : trip.status === 'completed'
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                        >
                          {trip.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleViewTrip(trip)}
                          className="text-sky-400 hover:text-sky-300 font-medium text-xs"
                        >
                          View
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* Pagination Controls */}


      {/* NewTripForm removed from here, rendered in Dashboard */}

      {
        showUpdatePaymentForm && paymentTrip && (
          <UpdatePaymentForm
            trip={paymentTrip}
            onClose={handleCloseUpdatePaymentForm}
            onUpdate={handleUpdatePayment}
          />
        )
      }

      {
        viewTrip && (
          <ViewTripModal trip={viewTrip} onClose={() => setViewTrip(undefined)} />
        )
      }

      {
        deleteConfirm && (
          <div className="fixed bottom-8 right-8 bg-red-600 text-white px-6 py-4 rounded-lg shadow-2xl animate-scaleIn z-50">
            <p className="font-semibold mb-2">{t('trips.confirmDelete')}</p>
            <p className="text-sm opacity-90">{t('trips.deleteWarning')}</p>
          </div>
        )
      }

      {
        showPDFExport && (
          <PDFExportModal
            trips={tripsMarkedForExport}
            onClose={() => setShowPDFExport(false)}
          />
        )
      }
    </div >
  );
}
