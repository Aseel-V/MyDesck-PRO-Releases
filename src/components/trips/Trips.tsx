import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  HelpCircle,
  Loader2,
  Download,
  Printer,
  Trash2,
  FileSpreadsheet,
  Sheet,
  Bell,
  BookTemplate,
  ChevronDown,
  FileBarChart,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { supabase } from '../../lib/supabase';
import { Trip } from '../../types/trip';
import { useTripMutations } from '../../hooks/useTripMutations';
import TripCard from './TripCard';
import TripFilters from './TripFilters';
import ViewTripModal from './ViewTripModal';
import {
  DEFAULT_TRIP_FILTERS,
  TripFilterPreset,
  TripFilterState,
} from './tripFiltersState';
import JSZip from 'jszip';
import { generateTripInvoice } from '../../lib/pdfGenerator';
import { cn, formatDate, sanitizeFilename } from '../../lib/utils';
import { Skeleton } from '../ui/Skeleton';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { Button } from '../travel-ui/Button';
import { StatusBadge } from '../travel-ui/StatusBadge';
import { Surface } from '../travel-ui/Surface';
import {
  getPaymentStatusDescription,
  getTripStatusDescription,
  getTripStatusLabel,
} from '../../lib/tripStatus';
import { fetchAllFilteredTrips, fetchTripDetails, fetchTripPage, TRIPS_PAGE_SIZE } from '../../lib/tripQueries';
import { mapWithConcurrency } from '../../lib/asyncPool';
import { TripPagination } from './TripPagination';
import { getSafeErrorCode } from '../../lib/safeError';
import { TripTrash } from './TripTrash';
import { TripSortControl } from './TripSortControl';
import type { TripSortKey } from '../../lib/tripQueries';
import { createTripCsv, createTripXlsx, downloadBlob, type TripExportLabels } from '../../lib/tripExport';
import { TripNotificationCenter } from './TripNotificationCenter';
import { TripTemplatesPanel } from './TripTemplatesPanel';
import { DuplicateTripDialog } from './DuplicateTripDialog';
import { TripWhatsappDialog } from './TripWhatsappDialog';
import type { WhatsappMessageType } from '../../lib/tripWhatsapp';
import { TravelReportsPanel } from '../analytics/TravelReportsPanel';

interface TripsProps {
  filters: TripFilterState;
  onFiltersChange: React.Dispatch<React.SetStateAction<TripFilterState>>;
  initialViewTrip?: Trip;
  onEditTrip?: (trip: Trip) => void;
  onCreateTrip?: () => void;
  onCreateFromTemplate?: (draft: Trip) => void;
}

export default function Trips({ filters, onFiltersChange, initialViewTrip, onEditTrip, onCreateTrip, onCreateFromTemplate }: TripsProps) {
  const { t, direction, language } = useLanguage();
  const { user, profile, userProfile } = useAuth();
  const { convert, format, currency, isLoading: isCurrencyLoading } = useCurrency();
  const { deleteTrip, archiveTrip, isDeleting } = useTripMutations();

  const [viewTrip, setViewTrip] = useState<Trip | undefined>(undefined);
  const [tripPendingDelete, setTripPendingDelete] = useState<Trip | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const [batchExportProgress, setBatchExportProgress] = useState({ completed: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<TripSortKey>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('travel_mode_sort_key');
      if (saved) return saved as TripSortKey;
    }
    return 'updated_desc';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('travel_mode_sort_key', sortKey);
    }
  }, [sortKey]);

  const handleSortChange = (newSortKey: TripSortKey) => {
    setSortKey(newSortKey);
    setPage(1);
  };

  const [loadingTripId, setLoadingTripId] = useState<string | null>(null);
  const [pdfGeneratingTripIds, setPdfGeneratingTripIds] = useState<string[]>([]);
  const [pdfPreview, setPdfPreview] = useState<{ trip: Trip; url: string; filename: string } | null>(null);
  const [savedPresets, setSavedPresets] = useState<TripFilterPreset[]>([]);
  const [showStatusHelp, setShowStatusHelp] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [dataExport, setDataExport] = useState<'csv' | 'xlsx' | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [cardAction, setCardAction] = useState<{ type: 'duplicate' | 'template' | 'source-template' | 'whatsapp'; trip: Trip; whatsappType?: WhatsappMessageType } | null>(null);
  const pdfPreviewDialogRef = useRef<HTMLDivElement>(null);
  const pdfPreviewFrameRef = useRef<HTMLIFrameElement>(null);
  const pdfPreviewTriggerRef = useRef<HTMLElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const moreActionsRef = useRef<HTMLDivElement>(null);

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
      console.error('Failed to read trip filter presets:', getSafeErrorCode(error));
      setSavedPresets([]);
    }
  }, [presetStorageKey]);

  useEffect(() => {
    if (!presetStorageKey) return;
    localStorage.setItem(presetStorageKey, JSON.stringify(savedPresets));
  }, [presetStorageKey, savedPresets]);

  useEffect(() => {
    if (!showStatusHelp) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowStatusHelp(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showStatusHelp]);

  useEffect(() => {
    setPage(1);
  }, [filters.destination, filters.month, filters.paymentStatus, filters.search, filters.tripStatus, filters.year]);

  useEffect(() => {
    if (!exportMenuOpen && !moreActionsOpen) return;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!exportMenuRef.current?.contains(target)) setExportMenuOpen(false);
      if (!moreActionsRef.current?.contains(target)) setMoreActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setExportMenuOpen(false); setMoreActionsOpen(false); }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [exportMenuOpen, moreActionsOpen]);

  const baseActionBtn =
    'inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition-all border-b-2';
  const primaryActionBtn =
    baseActionBtn +
    ' border-sky-400 text-slate-50 bg-slate-900/80 shadow-[0_4px_14px_rgba(15,23,42,0.8)] hover:bg-slate-900 dark:border-sky-400 dark:text-slate-50 dark:bg-slate-900/80 dark:shadow-[0_4px_14px_rgba(15,23,42,0.8)] dark:hover:bg-slate-900 bg-sky-600 shadow-[0_4px_14px_rgba(2,132,199,0.4)] hover:bg-sky-700';
  const secondaryActionBtn =
    baseActionBtn +
    ' border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50 hover:border-slate-300 dark:text-slate-300 dark:hover:text-slate-50 dark:hover:bg-slate-900/50 dark:hover:border-slate-500/80';
  const statCardClasses =
    'min-w-0 p-4 sm:p-5 flex items-start justify-between gap-3 border-b border-slate-200 last:border-b-0 sm:border-b-0 sm:border-e sm:last:border-e-0 dark:border-slate-800';
  const statLabelClasses =
    'text-xs text-slate-500 dark:text-slate-400 font-medium leading-snug break-words';
  const statValueClasses =
    'mt-1 text-lg sm:text-xl font-semibold leading-tight break-words [overflow-wrap:anywhere] tabular-nums';
  const statIconClasses =
    'hidden';

  const { data: availableYears = [] } = useQuery({
    queryKey: ['trip-years', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase.rpc('get_trip_years');

      if (error) {
        console.error('Error fetching trip years:', getSafeErrorCode(error));
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
    data: pageData,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['trips-page', user?.id, filters, sortKey, page],
    queryFn: async () => {
      if (!user?.id) return null;
      return fetchTripPage({
        year: filters.year || new Date().getFullYear().toString(),
        page,
        search: filters.search,
        paymentStatus: filters.paymentStatus,
        tripStatus: filters.tripStatus,
        month: filters.month,
        destination: filters.destination,
        sortKey,
      });
    },
    enabled: !!user?.id,
    placeholderData: (previousData) => previousData,
  });
  const trips = pageData?.items ?? [];
  const count = pageData?.total_count ?? 0;
  const availableDestinations = pageData?.destinations ?? [];
  const totalPages = Math.max(1, Math.ceil(count / TRIPS_PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const hasActiveFilters = Boolean(
    filters.search ||
    filters.paymentStatus ||
    filters.tripStatus ||
    filters.month ||
    filters.destination ||
    filters.year !== DEFAULT_TRIP_FILTERS.year
  );

  const stats = useMemo(() => {
    if (!pageData) {
      return { totalTrips: 0, totalRevenue: 0, totalProfit: 0, unpaidAmount: 0, upcoming: 0 };
    }
    const totalRevenue = pageData.summary.reduce((sum, item) => sum + convert(item.revenue, item.currency, currency), 0);
    const totalProfit = pageData.summary.reduce((sum, item) => sum + convert(item.profit, item.currency, currency), 0);
    const unpaidAmount = pageData.summary.reduce((sum, item) => sum + convert(item.amount_due, item.currency, currency), 0);

    return {
      totalTrips: pageData.summary.reduce((sum, item) => sum + item.trip_count, 0),
      totalRevenue,
      totalProfit,
      unpaidAmount,
      upcoming: pageData.upcoming_count,
    };
  }, [convert, currency, pageData]);

  const handleDeleteTrip = (id: string) => {
    const trip = trips.find((item) => item.id === id);
    if (trip) {
      setTripPendingDelete(trip);
    }
  };

  const handleDataExport = async (kind: 'csv' | 'xlsx') => {
    setDataExport(kind);
    try {
      const exportTrips = await fetchAllFilteredTrips({
        year: filters.year || new Date().getFullYear().toString(), search: filters.search,
        paymentStatus: filters.paymentStatus, tripStatus: filters.tripStatus,
        month: filters.month, destination: filters.destination,
      });
      const labels: TripExportLabels = {
        destination: t('trips.destination'), client: t('trips.clientName'), start: t('trips.startDate'), end: t('trips.endDate'),
        status: t('trips.status'), paymentStatus: t('trips.paymentStatus'), currency: t('trips.mainTripCurrency'),
        salePrice: t('trips.salePrice'), amountPaid: t('trips.amountPaid'), amountDue: t('trips.amountDue'),
      };
      const name = `${t('trips.export.dataFileName')}_${filters.year}_${language}`;
      if (kind === 'csv') downloadBlob(new Blob([createTripCsv(exportTrips, labels)], { type: 'text/csv;charset=utf-8' }), name, 'csv');
      else downloadBlob(await createTripXlsx(exportTrips, labels), name, 'xlsx');
      toast.success(t('trips.export.complete', { count: exportTrips.length }));
    } catch (exportError) {
      console.error('Trip data export failed:', getSafeErrorCode(exportError));
      toast.error(t('trips.export.failed'));
    } finally { setDataExport(null); }
  };

  const loadTripDetails = async (tripId: string) => {
    setLoadingTripId(tripId);
    try {
      return await fetchTripDetails(tripId);
    } catch {
      toast.error(t('trips.loadDetailsError'));
      return null;
    } finally {
      setLoadingTripId(null);
    }
  };

  const handleEditTrip = async (trip: Trip) => {
    const details = await loadTripDetails(trip.id);
    if (details) onEditTrip?.(details);
  };

  const handleViewTrip = async (trip: Trip) => {
    const details = await loadTripDetails(trip.id);
    if (details) setViewTrip(details);
  };

  const openCardAction = async (type: 'duplicate' | 'template' | 'whatsapp', trip: Trip) => {
    const details = await loadTripDetails(trip.id);
    if (details) setCardAction({ type, trip: details });
  };

  const handleArchiveTrip = async (trip: Trip) => {
    try { await archiveTrip(trip.id); void refetch(); }
    catch { /* mutation owns localized feedback */ }
  };

  const openTripPdfPreview = async (trip: Trip) => {
    if (!profile || !user || pdfGeneratingTripIds.includes(trip.id)) return;
    pdfPreviewTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPdfGeneratingTripIds((ids) => [...ids, trip.id]);
    try {
      const details = await fetchTripDetails(trip.id);
      const pdfBytes = await generateTripInvoice(details, profile, userProfile?.full_name || '', userProfile?.phone_number || '', profile.preferred_language || 'en');
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const filename = `${sanitizeFilename(`Invoice_${trip.destination}_${trip.id.slice(0, 8)}`, `trip_${trip.id.slice(0, 8)}`)}.pdf`;
      setPdfPreview({ trip: details, url, filename });
    } catch {
      console.error('PDF preview generation failed');
      toast.error(t('trips.pdfPreviewFailed'));
    } finally {
      setPdfGeneratingTripIds((ids) => ids.filter((id) => id !== trip.id));
    }
  };

  const closePdfPreview = () => {
    if (pdfPreview) {
      window.URL.revokeObjectURL(pdfPreview.url);
      setPdfPreview(null);
    }
    window.requestAnimationFrame(() => pdfPreviewTriggerRef.current?.focus());
  };

  const printPdfPreview = () => {
    const previewWindow = pdfPreviewFrameRef.current?.contentWindow;
    if (!previewWindow) {
      toast.error(t('trips.unableToDisplayPdf'));
      return;
    }
    previewWindow.focus();
    previewWindow.print();
  };

  const savePdfPreview = () => {
    if (!pdfPreview) return;
    const link = document.createElement('a');
    link.href = pdfPreview.url;
    link.download = pdfPreview.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (!pdfPreview) return;
    const dialog = pdfPreviewDialogRef.current;
    if (!dialog) return;

    dialog.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        window.URL.revokeObjectURL(pdfPreview.url);
        setPdfPreview(null);
        window.requestAnimationFrame(() => pdfPreviewTriggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pdfPreview]);

  useEffect(() => {
    if (!pdfPreview) return;
    document.body.classList.add('pdf-preview-open');
    return () => document.body.classList.remove('pdf-preview-open');
  }, [pdfPreview]);

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

  const handleDownloadAllInvoices = async () => {
    if (!count || !user || !profile) return;
    setIsExportingBatch(true);

    const userFullName = userProfile?.full_name || '';
    const phoneNumber = userProfile?.phone_number || '';
    const selectedLanguage = profile.preferred_language || 'en';

    try {
      const zip = new JSZip();
      const folder = zip.folder(`Invoices_${new Date().toISOString().split('T')[0]}`);
      if (!folder) throw new Error('Failed to create zip folder');

      const pageCount = Math.ceil(count / 100);
      const listPageResults = await mapWithConcurrency(
        Array.from({ length: pageCount }, (_, index) => index + 1),
        3,
        (pageNumber) => fetchTripPage({
          year: filters.year || new Date().getFullYear().toString(),
          page: pageNumber,
          pageSize: 100,
          search: filters.search,
          paymentStatus: filters.paymentStatus,
          tripStatus: filters.tripStatus,
          month: filters.month,
          destination: filters.destination,
        })
      );
      if (listPageResults.some((result) => result.status === 'rejected')) {
        throw new Error('TRIP_LIST_EXPORT_FETCH_FAILED');
      }
      const exportTrips = listPageResults.flatMap((result) => result.value?.items ?? []);
      setBatchExportProgress({ completed: 0, total: exportTrips.length });

      const results = await mapWithConcurrency(exportTrips, 2, async (trip) => {
            const details = await fetchTripDetails(trip.id);
            const pdfBytes = await generateTripInvoice(
              details,
              profile,
              userFullName,
              phoneNumber,
              selectedLanguage
            );

            const fileName = `${sanitizeFilename(`Invoice_${trip.destination}_${trip.id.slice(0, 8)}`, `trip_${trip.id.slice(0, 8)}`)}.pdf`;
            folder.file(fileName, pdfBytes);
            return trip.id;
      }, (completed, total) => setBatchExportProgress({ completed, total }));

      const failureCount = results.filter((result) => result.status === 'rejected').length;
      if (failureCount > 0) toast.warning(t('trips.batchExportPartialFailure', { count: failureCount }));

      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = `Invoices_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch {
      console.error('Error generating batch zip');
      toast.error(t('trips.batchExportFailed'));
    } finally {
      setIsExportingBatch(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-fadeIn">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4 items-stretch">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-[132px] w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
          {[...Array(6)].map((_, index) => (
            <Skeleton key={index} className="h-[280px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const displayTrips = trips;
  const hasSearchTerm = Boolean(filters.search.trim());

  let emptyStateTitle = t('trips.emptyStates.noTripsTitle');
  let emptyStateDescription = t('trips.emptyStates.noTripsDescription');
  let showCreateAction = count === 0;
  let showClearAction = hasActiveFilters;

  if (count > 0) {
    showCreateAction = true;
    if (hasSearchTerm) {
      emptyStateTitle = t('trips.emptyStates.noSearchResultsTitle');
      emptyStateDescription = t('trips.emptyStates.noSearchResultsDescription');
    } else if (hasActiveFilters) {
      emptyStateTitle = t('trips.noMatchingTrips');
      emptyStateDescription = t('trips.tryAdjustingFilters');
    } else {
      emptyStateTitle = t('trips.noTrips');
      emptyStateDescription = t('trips.createFirst');
      showCreateAction = true;
      showClearAction = false;
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 animate-fadeIn" dir={direction}>
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 xl:flex-row xl:items-end xl:justify-between dark:border-slate-800/80">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            {t('trips.title')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 break-words dark:text-slate-300">
            {count === 0
              ? t('trips.emptyStates.noTripsTitle')
              : t('trips.resultsSummary', { shown: displayTrips.length, total: count })}
            {currency !== 'USD' && (
              <span className="ms-2 inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                {currency} {isCurrencyLoading && '...'}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end" aria-label={t('trips.toolbar.mainActions')}>
          <Button variant="primary" onClick={() => onCreateTrip?.()}><Plus className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.newTrip')}</Button>
          <Button variant="secondary" onClick={() => setShowReports(true)}><FileBarChart className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.reports')}</Button>
          <Button variant="secondary" onClick={() => setShowNotifications(true)}><Bell className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.notifications')}</Button>
          <Button variant="ghost" onClick={() => setShowTrash(true)}><Trash2 className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.trash')}</Button>
        </div>
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 dark:border-slate-800 dark:bg-slate-900">
        <div className={statCardClasses}>
          <div className="min-w-0 flex-1">
            <p className={statLabelClasses}>
              {t('trips.stats.totalTrips')}
            </p>
            <p className={`${statValueClasses} text-slate-900 dark:text-slate-50`}>{stats.totalTrips}</p>
          </div>
          <div className={`${statIconClasses} bg-sky-100 border-sky-200 text-sky-600 dark:bg-sky-500/10 dark:border-sky-500/40 dark:text-sky-400`}>
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className={statCardClasses}>
          <div className="min-w-0 flex-1">
            <p className={statLabelClasses}>
              {t('trips.stats.totalRevenue')}
            </p>
            <p className={`${statValueClasses} text-slate-900 dark:text-slate-50`} title={format(stats.totalRevenue, currency)}>
              {format(stats.totalRevenue, currency)}
            </p>
          </div>
          <div className={`${statIconClasses} bg-indigo-100 border-indigo-200 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/40 dark:text-indigo-300`}>
            <Landmark className="w-6 h-6" />
          </div>
        </div>

        <div className={statCardClasses}>
          <div className="min-w-0 flex-1">
            <p className={statLabelClasses}>
              {t('trips.stats.totalProfit')}
            </p>
            <p className={`${statValueClasses} text-emerald-600 dark:text-emerald-300`} title={format(stats.totalProfit, currency)}>
              {format(stats.totalProfit, currency)}
            </p>
          </div>
          <div className={`${statIconClasses} bg-emerald-100 border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-400`}>
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        <div className={statCardClasses}>
          <div className="min-w-0 flex-1">
            <p className={statLabelClasses}>
              {t('trips.stats.unpaidAmount')}
            </p>
            <p className={`${statValueClasses} text-rose-600 dark:text-rose-300`} title={format(stats.unpaidAmount, currency)}>
              {format(stats.unpaidAmount, currency)}
            </p>
          </div>
          <div className={`${statIconClasses} bg-rose-100 border-rose-200 text-rose-600 dark:bg-rose-500/10 dark:border-rose-500/40 dark:text-rose-400`}>
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        <div className={statCardClasses}>
          <div className="min-w-0 flex-1">
            <p className={statLabelClasses}>
              {t('trips.stats.upcoming')}
            </p>
            <p className={`${statValueClasses} text-sky-600 dark:text-sky-200`}>{stats.upcoming}</p>
          </div>
          <div className={`${statIconClasses} bg-indigo-100 border-indigo-200 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/40 dark:text-indigo-300`}>
            <CalendarCheck2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      <Surface className="p-3 sm:p-4">
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
          leadingControls={<>
            <TripSortControl sortKey={sortKey} onChange={handleSortChange} />
            <div className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900" role="group" aria-label={t('trips.toolbar.viewMode')}>
              <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500', viewMode === 'grid' ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800')}><LayoutGrid className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.gridView')}</button>
              <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500', viewMode === 'list' ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800')}><List className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.listView')}</button>
            </div>
            <div ref={exportMenuRef} className="relative">
              <Button variant="secondary" aria-haspopup="menu" aria-expanded={exportMenuOpen} onClick={() => { setExportMenuOpen((value) => !value); setMoreActionsOpen(false); }} disabled={dataExport !== null || isExportingBatch}>{dataExport !== null || isExportingBatch ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/> : <Download className="h-4 w-4" aria-hidden="true"/>}{t('trips.toolbar.export')}<ChevronDown className="h-4 w-4" aria-hidden="true"/>{isExportingBatch && <span className="sr-only" role="status">{t('trips.batchExportProgress', batchExportProgress)}</span>}</Button>
              {exportMenuOpen && <div role="menu" className="absolute end-0 top-12 z-40 w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">{([['csv', Sheet, 'exportCsv'], ['xlsx', FileSpreadsheet, 'exportXlsx']] as const).map(([kind, Icon, key]) => <button key={kind} role="menuitem" type="button" className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-start text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => { setExportMenuOpen(false); void handleDataExport(kind); }}><Icon className="h-4 w-4" aria-hidden="true"/>{t(`trips.toolbar.${key}`)}</button>)}{trips.length > 0 && <button role="menuitem" type="button" className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-start text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => { setExportMenuOpen(false); void handleDownloadAllInvoices(); }}><FileText className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.exportInvoices')}</button>}</div>}
            </div>
          </>}
          trailingControls={<div ref={moreActionsRef} className="relative">
            <Button variant="ghost" aria-haspopup="menu" aria-expanded={moreActionsOpen} onClick={() => { setMoreActionsOpen((value) => !value); setExportMenuOpen(false); }}><MoreHorizontal className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.moreActions')}<ChevronDown className="h-4 w-4" aria-hidden="true"/></Button>
            {moreActionsOpen && <div role="menu" className="absolute end-0 top-12 z-40 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"><button role="menuitem" type="button" className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-start text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => { setMoreActionsOpen(false); setShowTemplates(true); }}><BookTemplate className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.templates')}</button><button role="menuitem" type="button" className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-start text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => { setMoreActionsOpen(false); setShowStatusHelp(true); }}><HelpCircle className="h-4 w-4" aria-hidden="true"/>{t('trips.toolbar.help')}</button></div>}
          </div>}
        />
      </Surface>

      <div className="min-h-[400px]">
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">{t('trips.loadError')}</p>
                <p className="text-sm opacity-80">{t('trips.loadErrorHelp')}</p>
              </div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-500 transition-colors"
              >
                {t('trips.retry')}
              </button>
            </div>
          </div>
        )}

        {trips.length === 0 ? (
          error ? (
            <div className="rounded-2xl bg-white border border-slate-200/90 p-12 text-center shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-lg dark:shadow-slate-950/70">
              <div className="flex justify-center mb-4">
                <div className="bg-rose-100 border border-rose-200/80 p-6 rounded-full dark:bg-rose-950/30 dark:border-rose-900/50">
                  <AlertCircle className="w-12 h-12 text-rose-500 dark:text-rose-400" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2 dark:text-slate-100">{t('trips.loadError')}</h3>
              <p className="text-slate-500 mb-6 dark:text-slate-300">{t('trips.loadErrorHelp')}</p>
              <button
                onClick={() => void refetch()}
                className={primaryActionBtn}
              >
                <span>{t('trips.retry')}</span>
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
                    <span>{t('trips.clearFilters')}</span>
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
          <motion.div layout className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
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
                    onOpenPdfPreview={openTripPdfPreview}
                    isPreparingPdf={pdfGeneratingTripIds.includes(trip.id)}
                    onView={handleViewTrip}
                    onDuplicate={(value) => void openCardAction('duplicate', value)}
                    onSaveTemplate={(value) => void openCardAction('template', value)}
                    onOpenSourceTemplate={(value) => setCardAction({ type: 'source-template', trip: value })}
                    onWhatsapp={(value) => void openCardAction('whatsapp', value)}
                    onArchive={(value) => void handleArchiveTrip(value)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

          </motion.div>
        ) : (
          <Surface className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur-md dark:bg-slate-900/50 dark:border-slate-800/80">
                    <th scope="col" className="text-start py-3 px-4 font-medium text-slate-500 dark:text-slate-400">{t('trips.destination')}</th>
                    <th scope="col" className="text-start py-3 px-4 font-medium text-slate-500 dark:text-slate-400">{t('trips.clientName')}</th>
                    <th scope="col" className="text-start py-3 px-4 font-medium text-slate-500 dark:text-slate-400">{t('trips.dateRange')}</th>
                    <th scope="col" className="text-start py-3 px-4 font-medium text-slate-500 dark:text-slate-400">{t('trips.salePrice')}</th>
                    <th scope="col" className="text-start py-3 px-4 font-medium text-slate-500 dark:text-slate-400">{t('trips.status')}</th>
                    <th scope="col" className="text-end py-3 px-4 font-medium text-slate-500 dark:text-slate-400">{t('admin.table.actions')}</th>
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
                          <StatusBadge
                            tone={trip.status === 'active' || trip.status === 'completed' ? 'success' : trip.status === 'archived' ? 'neutral' : 'danger'}
                            title={getTripStatusDescription(trip.status, t)}
                          >
                            {getTripStatusLabel(trip.status, t)}
                          </StatusBadge>
                        </td>
                        <td className="py-3 px-4 text-end">
                          <div className="inline-flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => void openTripPdfPreview(trip)}
                              disabled={pdfGeneratingTripIds.includes(trip.id)}
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-sky-500 bg-white px-2 text-xs font-bold text-sky-600 transition-colors hover:bg-sky-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-transparent dark:text-sky-400"
                              title={pdfGeneratingTripIds.includes(trip.id) ? t('trips.preparingPdf') : t('trips.openPdfPreview')}
                              aria-label={pdfGeneratingTripIds.includes(trip.id) ? t('trips.preparingPdf') : t('trips.openPdfPreview')}
                            >
                              {pdfGeneratingTripIds.includes(trip.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
                              <span dir="ltr">PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleViewTrip(trip)}
                              disabled={loadingTripId === trip.id}
                              className="text-sky-600 hover:text-sky-500 font-medium text-xs disabled:cursor-wait disabled:opacity-60 dark:text-sky-400 dark:hover:text-sky-300"
                            >
                              {loadingTripId === trip.id ? t('trips.loadingDetails') : t('trips.viewTrip')}
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </Surface>
        )}

        {count > 0 && (
          <TripPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>

      {showStatusHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trips-status-help-title"
          dir={direction}
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            aria-label={t('trips.closeHelp')}
            onClick={() => setShowStatusHelp(false)}
          />
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 dark:shadow-slate-950/80">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <p id="trips-status-help-title" className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  {t('trips.helpTitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStatusHelp(false)}
                aria-label={t('trips.closeHelp')}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  {t('trips.statusLegendTitle')}
                </h3>
                <div className="mt-3 grid gap-3">
                  {(['active', 'completed', 'cancelled', 'archived'] as const).map((status) => (
                    <div key={status} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {t(`trips.statuses.${status}`)}
                      </span>
                      <span>{getTripStatusDescription(status, t)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  {t('trips.paymentLegendTitle')}
                </h3>
                <div className="mt-3 grid gap-3">
                  {(['paid', 'partial', 'unpaid'] as const).map((status) => (
                    <div key={status} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {t(`trips.paymentStatuses.${status}`)}
                      </span>
                      <span>{getPaymentStatusDescription(status, t)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {pdfPreview && createPortal(
        <div
          className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col bg-slate-100 dark:bg-slate-950"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trip-pdf-preview-title"
          dir={direction}
        >
          <div
            ref={pdfPreviewDialogRef}
            tabIndex={-1}
            className="isolate flex h-full w-full flex-col overflow-hidden bg-white outline-none dark:bg-slate-950"
          >
            <header className="relative z-10 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={closePdfPreview}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-900"
                  aria-label={t('trips.closePdfPreview')}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('trips.backToTrips')}</span>
                </button>
                <div className="min-w-0">
                  <p id="trip-pdf-preview-title" className="text-base font-bold text-slate-900 dark:text-slate-50">
                    {t('trips.pdfPreview')}
                  </p>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                    {pdfPreview.trip.destination}{' · '}{pdfPreview.trip.client_name}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={printPdfPreview}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  {t('trips.printPdf')}
                </button>
                <button
                  type="button"
                  onClick={savePdfPreview}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span dir="ltr">PDF</span>
                  {t('trips.savePdf')}
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 bg-slate-100 [contain:layout_paint] dark:bg-slate-900">
              <iframe
                ref={pdfPreviewFrameRef}
                src={pdfPreview.url}
                title={t('trips.pdfPreview')}
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {viewTrip && (
        <ViewTripModal
          trip={viewTrip}
          onClose={() => setViewTrip(undefined)}
          onUpdate={() => void refetch()}
        />
      )}

      {showTrash && <TripTrash onClose={() => setShowTrash(false)} />}
      {showNotifications && <TripNotificationCenter onClose={() => setShowNotifications(false)} onOpenTrip={(id) => { setShowNotifications(false); void loadTripDetails(id).then((details) => { if (details) setViewTrip(details); }); }} onOpenWhatsapp={(id, whatsappType) => { setShowNotifications(false); void loadTripDetails(id).then((details) => { if (details) setCardAction({ type: 'whatsapp', trip: details, whatsappType }); }); }} />}
      {showTemplates && <TripTemplatesPanel onClose={() => setShowTemplates(false)} onUse={onCreateFromTemplate} />}
      {showReports && <TravelReportsPanel year={filters.year} destination={filters.destination || undefined} currency={currency || undefined} onClose={() => setShowReports(false)} />}
      {cardAction?.type === 'duplicate' && <DuplicateTripDialog trip={cardAction.trip} onClose={() => setCardAction(null)} onCreated={() => void refetch()} />}
      {cardAction?.type === 'template' && <TripTemplatesPanel sourceTrip={cardAction.trip} onClose={() => setCardAction(null)} />}
      {cardAction?.type === 'source-template' && cardAction.trip.source_template_id && <TripTemplatesPanel initialTemplateId={cardAction.trip.source_template_id} onClose={() => setCardAction(null)} />}
      {cardAction?.type === 'whatsapp' && <TripWhatsappDialog trip={cardAction.trip} initialType={cardAction.whatsappType} onClose={() => setCardAction(null)} />}

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
        confirmText={t('trips.moveToTrash')}
        cancelText={t('trips.cancel')}
        variant="danger"
        isLoading={isDeleting}
      />

    </div>
  );
}
