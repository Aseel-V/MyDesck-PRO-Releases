import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
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
import { Trip, TripFormData } from '../../types/trip';
import { useDebounce } from '../../hooks/useDebounce';
import TripCard from './TripCard';
import TripFilters from './TripFilters';
import NewTripForm from './NewTripForm';
import UpdatePaymentForm from './UpdatePaymentForm';
import PDFExportModal from './PDFExportModal';
import ViewTripModal from './ViewTripModal';
import { Skeleton } from '../ui/Skeleton';
import { AnimatePresence, motion } from 'framer-motion';

interface TripsProps {
  initialFilters?: {
    month?: string; // format YYYY-MM
    pendingOnly?: boolean;
  };
  initialViewTrip?: Trip;
}

export default function Trips({ initialFilters, initialViewTrip }: TripsProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { convert, format, currency, isLoading: isCurrencyLoading } = useCurrency();
  const queryClient = useQueryClient();

  const [showNewTripForm, setShowNewTripForm] = useState(false);
  const [showUpdatePaymentForm, setShowUpdatePaymentForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | undefined>(undefined);
  const [paymentTrip, setPaymentTrip] = useState<Trip | undefined>(undefined);
  const [viewTrip, setViewTrip] = useState<Trip | undefined>(undefined);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showPDFExport, setShowPDFExport] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');

  // Apply initial filters from Dashboard/Analytics (month and pending)
  useEffect(() => {
    if (!initialFilters) return;
    const { month, pendingOnly } = initialFilters;

    // Reset all filters first
    setSearchTerm('');
    setStatusFilter('');
    setYearFilter('');
    setMonthFilter('');
    setDestinationFilter('');

    // Then apply incoming filters
    if (typeof pendingOnly === 'boolean' && pendingOnly) {
      // Map "Pending" to payment status = partial (חלקי)
      setStatusFilter('partial');
    }
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, m] = month.split('-');
      setYearFilter(year);
      setMonthFilter(m);
    }
  }, [initialFilters]);

  useEffect(() => {
    if (initialViewTrip) {
      setViewTrip(initialViewTrip);
    }
  }, [initialViewTrip]);

  const baseActionBtn =
    'inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition-all border-b-2';
  const primaryActionBtn =
    baseActionBtn +
    ' border-sky-400 text-slate-50 bg-slate-900/80 shadow-[0_4px_14px_rgba(15,23,42,0.8)] hover:bg-slate-900';
  const secondaryActionBtn =
    baseActionBtn +
    ' border-transparent text-slate-300 hover:text-slate-50 hover:bg-slate-900/50 hover:border-slate-500/80';

  const { data: { data: trips, count } = { data: [], count: 0 }, isLoading: loading } = useQuery({
    queryKey: ['trips', user?.id, debouncedSearchTerm, statusFilter, yearFilter, monthFilter, destinationFilter],
    queryFn: async () => {
      if (!user?.id) return { data: [], count: 0 };

      let query = supabase
        .from('trips')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id);

      // Apply filters
      if (debouncedSearchTerm) {
        query = query.or(`destination.ilike.%${debouncedSearchTerm}%,client_name.ilike.%${debouncedSearchTerm}%,notes.ilike.%${debouncedSearchTerm}%`);
      }

      if (statusFilter) {
        // Check both payment_status and status columns as per original logic
        query = query.or(`payment_status.eq.${statusFilter},status.eq.${statusFilter}`);
      }

      if (yearFilter) {
        const startDate = `${yearFilter}-01-01`;
        const endDate = `${yearFilter}-12-31`;
        query = query.gte('start_date', startDate).lte('start_date', endDate);
      }

      if (monthFilter) {
        if (yearFilter) {
          const start = `${yearFilter}-${monthFilter}-01`;
          // Calculate end of month
          const end = new Date(parseInt(yearFilter), parseInt(monthFilter), 0).toISOString().split('T')[0];
          query = query.gte('start_date', start).lte('start_date', end);
        }
      }

      if (destinationFilter) {
        query = query.eq('destination', destinationFilter);
      }

      const { data, error, count } = await query
        .order('start_date', { ascending: false });

      if (error) throw error;
      return { data: data as Trip[], count: count || 0 };
    },
    enabled: !!user?.id,
  });

  const saveTripMutation = useMutation({
    mutationFn: async (formData: TripFormData) => {
      if (!user?.id) throw new Error('User not authenticated');

      if (editingTrip) {
        const { error } = await supabase
          .from('trips')
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq('id', editingTrip.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trips')
          .insert([{ ...formData, user_id: user.id }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setShowNewTripForm(false);
      setEditingTrip(undefined);
    },
    onError: (error: any) => {
      console.error('Error saving trip:', error);
    }
  });

  const handleSaveTrip = async (formData: TripFormData) => {
    await saveTripMutation.mutateAsync(formData);
  };

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ tripId, amountPaid, paymentStatus }: { tripId: string, amountPaid: number, paymentStatus: 'paid' | 'partial' | 'unpaid' }) => {
      const { error } = await supabase
        .from('trips')
        .update({
          amount_paid: amountPaid,
          payment_status: paymentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tripId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setShowUpdatePaymentForm(false);
      setPaymentTrip(undefined);
    },
    onError: (error: any) => {
      console.error('Error updating payment:', error);
    }
  });

  const handleUpdatePayment = async (tripId: string, amountPaid: number, paymentStatus: 'paid' | 'partial' | 'unpaid') => {
    await updatePaymentMutation.mutateAsync({ tripId, amountPaid, paymentStatus });
  };

  const deleteTripMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trips').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setDeleteConfirm(null);
    },
    onError: (error: any) => {
      console.error('Error deleting trip:', error);
    }
  });

  const handleDeleteTrip = (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }
    deleteTripMutation.mutate(id);
  };

  const toggleExportMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string, value: boolean }) => {
      const { error } = await supabase
        .from('trips')
        .update({ export_to_pdf: value, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
    onError: (error: any) => {
      console.error('Error toggling export:', error);
    }
  });

  const handleToggleExport = (id: string, value: boolean) => {
    toggleExportMutation.mutate({ id, value });
  };

  const filteredTrips = trips || [];

  const availableYears = useMemo(() => {
    const years = new Set(
      trips.map((trip) => new Date(trip.start_date).getFullYear().toString())
    );
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [trips]);

  const availableDestinations = useMemo(() => {
    const destinations = new Set(trips.map((trip) => trip.destination));
    return Array.from(destinations).sort();
  }, [trips]);

  const tripsMarkedForExport = useMemo(
    () => trips.filter((trip) => trip.export_to_pdf),
    [trips]
  );

  // Statistics with Currency Conversion
  const stats = useMemo(() => {
    const totalTrips = trips.length;

    // Calculate totals in base currency (USD) first, then convert
    // OR convert each item. Converting sum is more efficient if rate is constant.
    // However, if we want per-item precision, we might convert each.
    // Given convert() is linear, sum(convert(x)) == convert(sum(x)).

    const totalRevenueBase = trips.reduce(
      (sum, trip) => sum + (trip.sale_price || 0),
      0
    );

    const totalProfitBase = trips.reduce((sum, trip) => {
      const profit =
        typeof trip.profit === 'number'
          ? trip.profit
          : (trip.sale_price || 0) - (trip.wholesale_cost || 0);
      return sum + profit;
    }, 0);

    const totalUnpaidBase = trips.reduce((sum, trip) => {
      const due = (trip.sale_price || 0) - (trip.amount_paid || 0);
      return sum + (due > 0 ? due : 0);
    }, 0);

    const now = new Date();
    const upcomingTrips = trips.filter((trip) => {
      const start = new Date(trip.start_date);
      return start >= new Date(now.toDateString());
    }).length;

    return {
      totalTrips,
      totalRevenue: convert(totalRevenueBase),
      totalProfit: convert(totalProfitBase),
      unpaidAmount: convert(totalUnpaidBase),
      upcoming: upcomingTrips,
    };
  }, [trips, convert]);

  const handleEditTrip = (trip: Trip) => {
    setEditingTrip(trip);
    setShowNewTripForm(true);
  };

  const handleUpdatePaymentClick = (trip: Trip) => {
    setPaymentTrip(trip);
    setShowUpdatePaymentForm(true);
  };

  const handleViewTrip = (trip: Trip) => {
    setViewTrip(trip);
  };

  const handleCloseNewTripForm = () => {
    setShowNewTripForm(false);
    setEditingTrip(undefined);
  };

  const handleCloseUpdatePaymentForm = () => {
    setShowUpdatePaymentForm(false);
    setPaymentTrip(undefined);
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
            onClick={() => setShowNewTripForm(true)}
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
              {t('trips.stats.totalRevenue') ?? 'Total Revenue'}
            </p>
            <p className="text-2xl font-bold text-slate-50">
              {format(stats.totalRevenue)}
            </p>
          </div>
          <div className="p-3 rounded-full bg-indigo-500/10 border border-indigo-500/40">
            <Landmark className="w-6 h-6 text-indigo-300" />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-4 flex items-center justify-between shadow-md shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {t('trips.stats.totalProfit') ?? 'Total Profit'}
            </p>
            <p className="text-2xl font-bold text-emerald-300">
              {format(stats.totalProfit)}
            </p>
          </div>
          <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/40">
            <Wallet className="w-6 h-6 text-emerald-400" />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-4 flex items-center justify-between shadow-md shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {t('trips.stats.unpaidAmount') ?? 'Unpaid Amount'}
            </p>
            <p className="text-2xl font-bold text-rose-300">
              {format(stats.unpaidAmount)}
            </p>
          </div>
          <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/40">
            <AlertCircle className="w-6 h-6 text-rose-400" />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-4 flex items-center justify-between shadow-md shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {t('trips.stats.upcoming') ?? 'Upcoming Trips'}
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
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          yearFilter={yearFilter}
          onYearFilterChange={setYearFilter}
          monthFilter={monthFilter}
          onMonthFilterChange={setMonthFilter}
          destinationFilter={destinationFilter}
          onDestinationFilterChange={setDestinationFilter}
          availableYears={availableYears}
          availableDestinations={availableDestinations}
        />
      </div>

      {/* List / empty state */}
      {filteredTrips.length === 0 ? (
        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 p-12 text-center shadow-lg shadow-slate-950/70">
          <div className="flex justify-center mb-4">
            <div className="bg-slate-900/80 border border-slate-700/80 p-6 rounded-full">
              <Trash2 className="w-12 h-12 text-slate-400" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-slate-100 mb-2">
            {t('trips.noTrips')}
          </h3>
          <p className="text-slate-300 mb-6">{t('trips.createFirst')}</p>
          <button
            onClick={() => setShowNewTripForm(true)}
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
                        {new Date(trip.start_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {format(trip.sale_price || 0)}
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

      {
        showNewTripForm && (
          <NewTripForm
            onClose={handleCloseNewTripForm}
            onSave={handleSaveTrip}
            editTrip={editingTrip}
          />
        )
      }

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
