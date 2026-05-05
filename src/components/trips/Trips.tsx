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
import { useTripMutations } from '../../hooks/useTripMutations';
import TripCard from './TripCard';
import TripFilters from './TripFilters';
import PDFExportModal from './PDFExportModal';
import ViewTripModal from './ViewTripModal';
import {
  DEFAULT_TRIP_FILTERS,
  TripFilterPreset,
  TripFilterState,
} from './tripFiltersState';
import JSZip from 'jszip';
import { generateMultipleTripsPDF, generateTripInvoice } from '../../lib/pdfGenerator';
import { formatDate, sanitizeFilename } from '../../lib/utils';
import { Skeleton } from '../ui/Skeleton';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import {
  getEffectiveTripDate,
  getTripStatusDescription,
  getTripStatusLabel,
  isTripIncludedInDashboardStats,
  isTripVisibleInTripList,
} from '../../lib/tripStatus';

function normalizeSearchValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getSearchDateStrings(date?: string): string[] {
  if (!date) return [];

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return [date];
  }

  return [
    parsed.toISOString().split('T')[0],
    parsed.toLocaleDateString('en-CA'),
    parsed.toLocaleDateString('en-US'),
    parsed.toLocaleDateString('he-IL'),
    parsed.toLocaleDateString('ar-EG'),
    parsed.getFullYear().toString(),
  ];
}

interface TripsProps {
  filters: TripFilterState;
  onFiltersChange: React.Dispatch<React.SetStateAction<TripFilterState>>;
  initialViewTrip?: Trip;
  onEditTrip?: (trip: Trip) => void;
  onCreateTrip?: () => void;
}

export default function Trips({ filters, onFiltersChange, initialViewTrip, onEditTrip, onCreateTrip }: TripsProps) {
  const { t, language } = useLanguage();
  const { user, profile, userProfile } = useAuth();
  const { convert, format, currency, isLoading: isCurrencyLoading } = useCurrency();
  const { deleteTrip, toggleExport, isDeleting } = useTripMutations();

  const [viewTrip, setViewTrip] = useState<Trip | undefined>(undefined);
  const [tripPendingDelete, setTripPendingDelete] = useState<Trip | null>(null);
  const [showPDFExport, setShowPDFExport] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const [savedPresets, setSavedPresets] = useState<TripFilterPreset[]>([]);

  const presetStorageKey = user?.id ? `trip_filter_presets:${user.id}` : null;

  const setSearchTerm = (val: string) => onFiltersChange((prev) => ({ ...prev, search: val }));
  const setPaymentStatusFilter = (val: string) => onFiltersChange((prev) => ({ ...prev, paymentStatus: val }));
  const setTripStatusFilter = (val: string) => onFiltersChange((prev) => ({ ...prev, tripStatus: val }));
  const setYearFilter = (val: string) => onFiltersChange((prev) => ({ ...prev, year: val }));
  const setMonthFilter = (val: string) => onFiltersChange((prev) => ({ ...prev, month: val }));
  const setDestinationFilter = (val: string) => onFiltersChange((prev) => ({ ...prev, destination: val }));

  useEffect(() => {
    if (initialViewTrip) {
      setViewTrip(initialViewTrip);
    }
  }, [initialViewTrip]);

  useEffect(() => {
    if (!presetStorageKey) {
      setSavedPresets([]);
      return;
    }

    const rawPresets = localStorage.getItem(presetStorageKey);
    if (!rawPresets) {
      setSavedPresets([]);
      return;
    }

    try {
      const parsed = JSON.parse(rawPresets) as TripFilterPreset[];
      setSavedPresets(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      console.error('Failed to read trip filter presets:', error);
      setSavedPresets([]);
    }
  }, [presetStorageKey]);

  useEffect(() => {
    if (!presetStorageKey) return;
    localStorage.setItem(presetStorageKey, JSON.stringify(savedPresets));
  }, [presetStorageKey, savedPresets]);

  const baseActionBtn =
    'inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition-all border-b-2';
  const primaryActionBtn =
    baseActionBtn +
    ' border-sky-400 text-slate-50 bg-slate-900/80 shadow-[0_4px_14px_rgba(15,23,42,0.8)] hover:bg-slate-900 dark:border-sky-400 dark:text-slate-50 dark:bg-slate-900/80 dark:shadow-[0_4px_14px_rgba(15,23,42,0.8)] dark:hover:bg-slate-900 bg-sky-600 shadow-[0_4px_14px_rgba(2,132,199,0.4)] hover:bg-sky-700';
  const secondaryActionBtn =
    baseActionBtn +
    ' border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50 hover:border-slate-300 dark:text-slate-300 dark:hover:text-slate-50 dark:hover:bg-slate-900/50 dark:hover:border-slate-500/80';

  const { data: availableYears = [] } = useQuery({
    queryKey: ['trip-years', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase.rpc('get_trip_years');

      if (error) {
        console.error('Error fetching years:', error);
        return [new Date().getFullYear().toString()];
      }

      const years = (data as { year: string }[]).map((item) => item.year);
      const currentYear = new Date().getFullYear().toString();
      if (!years.includes(currentYear)) {
        years.unshift(currentYear);
      }

      return years.sort((a: string, b: string) => b.localeCompare(a));
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: { data: rawTrips, count } = { data: [], count: 0 },
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['trips', user?.id, filters.year],
    queryFn: async () => {
      if (!user?.id) return { data: [], count: 0 };

      const yearToFetch = filters.year || new Date().getFullYear().toString();
      const { data, error } = await supabase.rpc('get_trips_by_year', { year_input: yearToFetch });

      if (error) throw error;

      return { data: data as unknown as Trip[], count: data?.length || 0 };
    },
    enabled: !!user?.id,
  });

  const searchableTrips = useMemo(() => {
    if (!rawTrips) return [];

    let filtered = rawTrips;

    if (filters.search) {
      const normalizedSearch = normalizeSearchValue(filters.search);
      const searchTokens = normalizedSearch.split(' ').filter(Boolean);

      filtered = filtered.filter((trip) => {
        const travelerFields = trip.travelers?.flatMap((traveler) => [
          traveler.full_name,
          traveler.passport_number,
          traveler.nationality,
          traveler.room_type,
        ]) || [];

        const attachmentFields = trip.attachments?.flatMap((attachment) => [
          attachment.file_name,
          attachment.type,
        ]) || [];

        const searchIndex = normalizeSearchValue([
          trip.destination,
          trip.client_name,
          trip.client_phone,
          trip.notes,
          trip.status,
          getTripStatusLabel(trip.status, t),
          trip.payment_status,
          t(`trips.paymentStatuses.${trip.payment_status}`),
          trip.board_basis,
          ...travelerFields,
          ...attachmentFields,
          ...getSearchDateStrings(trip.start_date),
          ...getSearchDateStrings(trip.end_date),
          ...getSearchDateStrings(trip.payment_date),
        ].filter(Boolean).join(' '));

        return searchTokens.every((token) => searchIndex.includes(token));
      });
    }

    if (filters.paymentStatus) {
      if (filters.paymentStatus === 'unpaid') {
        filtered = filtered.filter((trip) => !trip.payment_status || trip.payment_status === 'unpaid');
      } else {
        filtered = filtered.filter((trip) => trip.payment_status === filters.paymentStatus);
      }
    }

    if (filters.tripStatus) {
      filtered = filtered.filter((trip) => trip.status === filters.tripStatus);
    }

    if (filters.month) {
      filtered = filtered.filter((trip) => {
        const effectiveDate = getEffectiveTripDate(trip);
        if (!effectiveDate) return false;
        const parsed = new Date(effectiveDate);
        return String(parsed.getMonth() + 1).padStart(2, '0') === filters.month;
      });
    }

    if (filters.destination) {
      filtered = filtered.filter((trip) => trip.destination === filters.destination);
    }

    return filtered;
  }, [filters.destination, filters.month, filters.paymentStatus, filters.search, filters.tripStatus, rawTrips, t]);

  const archivedTripsMatchingCurrentFilters = useMemo(
    () => searchableTrips.filter((trip) => trip.status === 'archived'),
    [searchableTrips]
  );

  const filteredTrips = useMemo(() => {
    if (filters.tripStatus === 'archived') {
      return archivedTripsMatchingCurrentFilters;
    }

    return searchableTrips.filter(isTripVisibleInTripList);
  }, [archivedTripsMatchingCurrentFilters, filters.tripStatus, searchableTrips]);

  const trips = filteredTrips;
  const availableDestinations = useMemo(() => {
    const destinations = new Set(searchableTrips.map((trip) => trip.destination));
    return Array.from(destinations).sort();
  }, [searchableTrips]);

  const tripsMarkedForExport = useMemo(
    () => trips.filter((trip) => trip.export_to_pdf),
    [trips]
  );

  const hasActiveFilters = Boolean(
    filters.search ||
    filters.paymentStatus ||
    filters.tripStatus ||
    filters.month ||
    filters.destination ||
    filters.year !== DEFAULT_TRIP_FILTERS.year
  );

  const stats = useMemo(() => {
    if (!trips.length) {
      return { totalTrips: 0, totalRevenue: 0, totalProfit: 0, unpaidAmount: 0, upcoming: 0 };
    }

    const statTrips = trips.filter(isTripIncludedInDashboardStats);

    const totalRevenue = statTrips.reduce((sum, trip) => {
      const tripCurrency = trip.currency || currency;
      return sum + convert(trip.sale_price || 0, tripCurrency, currency);
    }, 0);

    const totalProfit = statTrips.reduce((sum, trip) => {
      const tripCurrency = trip.currency || currency;
      const profit = typeof trip.profit === 'number'
        ? trip.profit
        : (trip.sale_price || 0) - (trip.wholesale_cost || 0);

      return sum + convert(profit, tripCurrency, currency);
    }, 0);

    const unpaidAmount = statTrips.reduce((sum, trip) => {
      const tripCurrency = trip.currency || currency;
      const due = (trip.sale_price || 0) - (trip.amount_paid || 0);
      return sum + convert(due > 0 ? due : 0, tripCurrency, currency);
    }, 0);

    const upcoming = statTrips.filter((trip) => {
      if (!trip.start_date) return false;
      return new Date(trip.start_date) >= new Date();
    }).length;

    return {
      totalTrips: statTrips.length,
      totalRevenue,
      totalProfit,
      unpaidAmount,
      upcoming,
    };
  }, [convert, currency, trips]);

  const handleDeleteTrip = (id: string) => {
    const trip = trips.find((item) => item.id === id);
    if (trip) {
      setTripPendingDelete(trip);
    }
  };

  const handleEditTrip = (trip: Trip) => {
    onEditTrip?.(trip);
  };

  const handleViewTrip = (trip: Trip) => {
    setViewTrip(trip);
  };

  const handleToggleExport = (id: string, value: boolean) => {
    toggleExport({ id, value });
  };

  const clearFilters = () => {
    onFiltersChange(DEFAULT_TRIP_FILTERS);
  };

  const saveCurrentPreset = (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return false;

    setSavedPresets((prev) => {
      const nextPreset: TripFilterPreset = {
        id: `${Date.now()}`,
        name: normalizedName,
        filters: { ...filters },
      };

      return [nextPreset, ...prev].slice(0, 12);
    });

    return true;
  };

  const applyPreset = (presetId: string) => {
    const preset = savedPresets.find((item) => item.id === presetId);
    if (!preset) return;
    onFiltersChange({ ...preset.filters });
  };

  const deletePreset = (presetId: string) => {
    setSavedPresets((prev) => prev.filter((item) => item.id !== presetId));
  };

  const handleExportPDF = async () => {
    try {
      if (!filteredTrips.length || !profile || !user) return;

      const pdfBytes = await generateMultipleTripsPDF({
        profile,
        trips: filteredTrips,
        userFullName: userProfile?.full_name || profile.business_name || '',
        phoneNumber: userProfile?.phone_number || profile.phone_number || '',
        language: (language as 'en' | 'ar' | 'he') || 'en',
      });

      const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(pdfUrl, '_blank');

      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error) {
      console.error('Export failed', error);
    }
  };

  const handleDownloadAllInvoices = async () => {
    if (!filteredTrips.length || !user || !profile) return;
    setIsExportingBatch(true);

    const userFullName = userProfile?.full_name || '';
    const phoneNumber = userProfile?.phone_number || '';
    const selectedLanguage = profile.preferred_language || 'en';

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
              selectedLanguage
            );

            const fileName = `${sanitizeFilename(`Invoice_${trip.client_name}_${trip.destination}`, `trip_${trip.id.slice(0, 8)}`)}.pdf`;
            folder.file(fileName, pdfBytes);
          } catch (error) {
            console.error(`Failed to generate PDF for trip ${trip.id}`, error);
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
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <Skeleton key={index} className="h-[280px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const displayTrips = filteredTrips.slice(0, 50);
  const hasSearchTerm = Boolean(normalizeSearchValue(filters.search));
  const archivedHiddenCount = filters.tripStatus === 'archived' ? 0 : archivedTripsMatchingCurrentFilters.length;

  let emptyStateTitle = t('trips.emptyStates.noTripsTitle') || 'No trips yet';
  let emptyStateDescription =
    t('trips.emptyStates.noTripsDescription') ||
    'Start by creating your first trip so you can track dates, payments, and files in one place.';
  let showCreateAction = count === 0;
  let showClearAction = hasActiveFilters;
  let secondaryAction: { label: string; onClick: () => void } | null = null;

  if (count > 0) {
    showCreateAction = true;
    if (hasSearchTerm) {
      emptyStateTitle = t('trips.emptyStates.noSearchResultsTitle') || 'No trips matched your search';
      emptyStateDescription =
        t('trips.emptyStates.noSearchResultsDescription') ||
        'Try a shorter search, a different keyword, or clear the current filters.';
    } else if (archivedHiddenCount > 0 && !filters.tripStatus) {
      emptyStateTitle = t('trips.emptyStates.archivedHiddenTitle') || 'Only archived trips match right now';
      emptyStateDescription =
        t('trips.emptyStates.archivedHiddenDescription') ||
        'Archived trips are hidden from the main list until you filter for them.';
      secondaryAction = {
        label: t('trips.showArchived') || 'Show archived trips',
        onClick: () => setTripStatusFilter('archived'),
      };
    } else if (hasActiveFilters) {
      emptyStateTitle = t('trips.noMatchingTrips') || 'No trips match these filters';
      emptyStateDescription = t('trips.tryAdjustingFilters') || 'Try clearing or adjusting the current filters.';
    } else {
      emptyStateTitle = t('trips.noTrips') || 'No trips found';
      emptyStateDescription = t('trips.createFirst') || 'Create your first trip to get started.';
      showCreateAction = true;
      showClearAction = false;
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold gradient-title drop-shadow dark:drop-shadow-none text-slate-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-slate-50 dark:via-sky-100 dark:to-slate-200">
            {t('trips.title')}
          </h2>
          <p className="text-sm text-slate-500 mt-1 break-words dark:text-slate-300">
            {count === 0
              ? (t('trips.emptyStates.noTripsTitle') || 'No trips yet')
              : (t('trips.resultsSummary', { shown: displayTrips.length, total: filteredTrips.length }) || `Showing ${displayTrips.length} of ${filteredTrips.length} trips`)}
            {currency !== 'USD' && (
              <span className="ml-2 text-xs text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                {currency} {isCurrencyLoading && '...'}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap xl:justify-end">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800/80">
            <button
              onClick={() => setViewMode('grid')}
              type="button"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-800 dark:text-sky-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              type="button"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list'
                ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-800 dark:text-sky-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {filteredTrips.length > 0 && (
            <button
              onClick={handleDownloadAllInvoices}
              disabled={isExportingBatch}
              className={secondaryActionBtn}
              title="Download all displayed invoices"
            >
              <FileText className="w-5 h-5" />
              <span className="hidden md:inline">
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
              <span className="hidden md:inline">
                {t('trips.exportToPdf')} ({tripsMarkedForExport.length})
              </span>
            </button>
          )}

          <button
            onClick={handleExportPDF}
            className={secondaryActionBtn}
          >
            <FileText className="w-5 h-5" />
            <span className="hidden md:inline">Export PDF</span>
          </button>

          <button
            onClick={() => onCreateTrip?.()}
            className={primaryActionBtn}
          >
            <Plus className="w-5 h-5" />
            <span className="hidden md:inline">{t('trips.newTrip')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 flex items-center justify-between shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-md dark:shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('trips.stats.totalTrips') ?? 'Total Trips'}
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{stats.totalTrips}</p>
          </div>
          <div className="p-3 rounded-full bg-sky-100 border border-sky-200 text-sky-600 dark:bg-sky-500/10 dark:border-sky-500/40 dark:text-sky-400">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 flex items-center justify-between shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-md dark:shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('trips.stats.totalRevenue') ?? 'Revenue (Page)'}
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{format(stats.totalRevenue, currency)}</p>
          </div>
          <div className="p-3 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/40 dark:text-indigo-300">
            <Landmark className="w-6 h-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 flex items-center justify-between shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-md dark:shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('trips.stats.totalProfit') ?? 'Profit (Page)'}
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">{format(stats.totalProfit, currency)}</p>
          </div>
          <div className="p-3 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-400">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 flex items-center justify-between shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-md dark:shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('trips.stats.unpaidAmount') ?? 'Unpaid (Page)'}
            </p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-300">{format(stats.unpaidAmount, currency)}</p>
          </div>
          <div className="p-3 rounded-full bg-rose-100 border border-rose-200 text-rose-600 dark:bg-rose-500/10 dark:border-rose-500/40 dark:text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 flex items-center justify-between shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-md dark:shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('trips.stats.upcoming') ?? 'Upcoming'}
            </p>
            <p className="text-2xl font-bold text-sky-600 dark:text-sky-200">{stats.upcoming}</p>
          </div>
          <div className="p-3 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/40 dark:text-indigo-300">
            <CalendarCheck2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-sm dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-md dark:shadow-slate-950/60">
        <TripFilters
          searchTerm={filters.search}
          onSearchChange={setSearchTerm}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          presets={savedPresets}
          onSavePreset={saveCurrentPreset}
          onApplyPreset={applyPreset}
          onDeletePreset={deletePreset}
          paymentStatusFilter={filters.paymentStatus}
          onPaymentStatusFilterChange={setPaymentStatusFilter}
          tripStatusFilter={filters.tripStatus}
          onTripStatusFilterChange={setTripStatusFilter}
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

      <div className="min-h-[400px]">
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Failed to load trips</p>
                <p className="text-sm opacity-80">Please retry. This is a loading problem, not an empty result.</p>
              </div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-500 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {filteredTrips.length === 0 ? (
          error ? (
            <div className="rounded-2xl bg-white border border-slate-200/90 p-12 text-center shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-lg dark:shadow-slate-950/70">
              <div className="flex justify-center mb-4">
                <div className="bg-rose-100 border border-rose-200/80 p-6 rounded-full dark:bg-rose-950/30 dark:border-rose-900/50">
                  <AlertCircle className="w-12 h-12 text-rose-500 dark:text-rose-400" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2 dark:text-slate-100">Failed to load trips</h3>
              <p className="text-slate-500 mb-6 dark:text-slate-300">Please retry. This is a loading problem, not an empty result.</p>
              <button
                onClick={() => void refetch()}
                className={primaryActionBtn}
              >
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-slate-200/90 p-8 sm:p-12 text-center shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-lg dark:shadow-slate-950/70">
              <div className="flex justify-center mb-4">
                <div className="bg-slate-100 border border-slate-200/80 p-6 rounded-full dark:bg-slate-900/80 dark:border-slate-700/80">
                  <FileText className="w-12 h-12 text-slate-400 dark:text-slate-400" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2 dark:text-slate-100">{emptyStateTitle}</h3>
              <p className="text-slate-500 mb-6 max-w-xl mx-auto dark:text-slate-300">{emptyStateDescription}</p>
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                {showClearAction && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={secondaryActionBtn}
                  >
                    <span>{t('trips.clearFilters') || 'Clear filters'}</span>
                  </button>
                )}
                {secondaryAction && (
                  <button
                    type="button"
                    onClick={secondaryAction.onClick}
                    className={secondaryActionBtn}
                  >
                    <span>{secondaryAction.label}</span>
                  </button>
                )}
                {showCreateAction && (
                  <button
                    onClick={() => onCreateTrip?.()}
                    className={primaryActionBtn}
                  >
                    <Plus className="w-5 h-5" />
                    <span>{t('trips.newTrip')}</span>
                  </button>
                )}
              </div>
            </div>
          )
        ) : viewMode === 'grid' ? (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {displayTrips.map((trip) => (
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
                    onToggleExport={handleToggleExport}
                    onView={handleViewTrip}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredTrips.length > 50 && (
              <div className="col-span-full text-center py-6">
                <span className="text-slate-500 text-sm bg-slate-100 px-4 py-2 rounded-full border border-slate-200 dark:text-slate-400 dark:bg-slate-900/50 dark:border-slate-800">
                  {t('trips.limitNotice') || 'Showing the first 50 trips for faster browsing. Use search or filters to narrow the list.'}
                </span>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="glass-panel bg-white/90 border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-lg dark:shadow-slate-950/70">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur-md dark:bg-slate-900/50 dark:border-slate-800/80">
                    <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Destination</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Client</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Dates</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Price</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                  <AnimatePresence mode="popLayout">
                    {displayTrips.map((trip) => (
                      <motion.tr
                        layout
                        key={trip.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-900/30"
                      >
                        <td className="py-3 px-4 text-slate-900 font-medium max-w-[180px] truncate dark:text-slate-100">{trip.destination}</td>
                        <td className="py-3 px-4 text-slate-600 max-w-[180px] truncate dark:text-slate-300">{trip.client_name}</td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          <div>{formatDate(trip.start_date)}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{formatDate(trip.end_date)}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {format(trip.sale_price || 0, trip.currency || currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${trip.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : trip.status === 'completed'
                                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                : trip.status === 'archived'
                                  ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            title={getTripStatusDescription(trip.status, t)}
                          >
                            {getTripStatusLabel(trip.status, t)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleViewTrip(trip)}
                            className="text-sky-600 hover:text-sky-500 font-medium text-xs dark:text-sky-400 dark:hover:text-sky-300"
                          >
                            {t('trips.viewTrip') || 'View'}
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            {filteredTrips.length > 50 && (
              <div className="p-4 text-center border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 text-sm dark:text-slate-400">
                  {t('trips.limitNotice') || 'Showing the first 50 trips for faster browsing. Use search or filters to narrow the list.'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {viewTrip && (
        <ViewTripModal
          trip={viewTrip}
          onClose={() => setViewTrip(undefined)}
          onUpdate={() => void refetch()}
        />
      )}

      <ConfirmationModal
        isOpen={!!tripPendingDelete}
        onClose={() => setTripPendingDelete(null)}
        onConfirm={() => {
          if (tripPendingDelete) {
            void deleteTrip(tripPendingDelete.id).then(() => {
              setTripPendingDelete(null);
            });
          }
        }}
        title={t('trips.confirmDelete')}
        description={
          tripPendingDelete
            ? `${tripPendingDelete.destination} - ${tripPendingDelete.client_name}. ${t('trips.deleteWarning')}`
            : t('trips.deleteWarning')
        }
        confirmText={t('trips.delete') || 'Delete'}
        cancelText={t('trips.cancel') || 'Cancel'}
        variant="danger"
        isLoading={isDeleting}
      />

      {showPDFExport && (
        <PDFExportModal
          trips={tripsMarkedForExport}
          onClose={() => setShowPDFExport(false)}
          onExportComplete={() => {
            tripsMarkedForExport.forEach((trip) => {
              toggleExport({ id: trip.id, value: false });
            });
          }}
        />
      )}
    </div>
  );
}
