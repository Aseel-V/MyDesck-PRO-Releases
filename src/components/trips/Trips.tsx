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
  const { deleteTrip, toggleExport } = useTripMutations();

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

  const debouncedSearchTerm = useDebounce(filters.search, 1000);

  useEffect(() => {
    if (initialViewTrip) {
      setViewTrip(initialViewTrip);
    }
  }, [initialViewTrip]);

  const baseActionBtn =
    'inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition-all border-b-2';
  const primaryActionBtn =
    baseActionBtn +
    ' border-sky-400 text-slate-50 bg-slate-900/80 shadow-[0_4px_14px_rgba(15,23,42,0.8)] hover:bg-slate-900 dark:border-sky-400 dark:text-slate-50 dark:bg-slate-900/80 dark:shadow-[0_4px_14px_rgba(15,23,42,0.8)] dark:hover:bg-slate-900 bg-sky-600 shadow-[0_4px_14px_rgba(2,132,199,0.4)] hover:bg-sky-700';
  const secondaryActionBtn =
    baseActionBtn +
    ' border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50 hover:border-slate-300 dark:text-slate-300 dark:hover:text-slate-50 dark:hover:bg-slate-900/50 dark:hover:border-slate-500/80';


  // 1. جلب السنوات المتوفرة باستخدام الدالة الجديدة get_trip_years
  const { data: availableYears = [] } = useQuery({
    queryKey: ['trip-years', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase.rpc('get_trip_years');
      
      if (error) {
        console.error('Error fetching years:', error);
        return [new Date().getFullYear().toString()];
      }
      
      // نستخرج مصفوفة السنوات من النتيجة
      const years = (data as { year: string }[]).map(item => item.year);
      
      // نضمن وجود السنة الحالية
      const currentYear = new Date().getFullYear().toString();
      if (!years.includes(currentYear)) {
        years.unshift(currentYear);
      }
      
      // ترتيب تنازلي
      return years.sort((a: string, b: string) => b.localeCompare(a));
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, 
  });

  // 2. جلب الرحلات للسنة المحددة باستخدام get_trips_by_year
  const { data: { data: rawTrips, count } = { data: [], count: 0 }, isLoading: loading } = useQuery({
    queryKey: ['trips', user?.id, debouncedSearchTerm, filters.paymentStatus, filters.tripStatus, filters.year],
    queryFn: async () => {
      if (!user?.id) return { data: [], count: 0 };

      // استخدم السنة من الفلتر أو السنة الحالية
      const yearToFetch = filters.year || new Date().getFullYear().toString();

      // استدعاء الدالة (RPC) التي أنشأناها في SQL
      const { data, error } = await supabase
        .rpc('get_trips_by_year', { year_input: yearToFetch });

      if (error) throw error;
      
      return { data: data as unknown as Trip[], count: data?.length || 0 };
    },
    enabled: !!user?.id,
  });

  // 3. فلترة البيانات في المتصفح (بحث، حالة، شهر)
  const filteredTrips = useMemo(() => {
    if (!rawTrips) return [];
    
    let filtered = rawTrips;

    // Filter out archived trips by default unless searching specifically (optional, but strictly hiding for now)
    filtered = filtered.filter(t => t.status !== 'archived');

    if (debouncedSearchTerm) {
      const lowerSearch = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (trip) =>
          (trip.client_name && trip.client_name.toLowerCase().includes(lowerSearch)) ||
          (trip.destination && trip.destination.toLowerCase().includes(lowerSearch)) ||
          (trip.client_phone && trip.client_phone.includes(lowerSearch)) || 
          (trip.notes && trip.notes.toLowerCase().includes(lowerSearch))
      );
    }

    if (filters.paymentStatus) {
      if (filters.paymentStatus === 'unpaid') {
         filtered = filtered.filter(t => !t.payment_status || t.payment_status === 'unpaid');
      } else {
         filtered = filtered.filter((trip) => trip.payment_status === filters.paymentStatus);
      }
    }

    if (filters.tripStatus) {
      filtered = filtered.filter((trip) => trip.status === filters.tripStatus);
    }

    if (filters.month) {
      filtered = filtered.filter(trip => {
         // Priority: Payment Date -> Start Date
         const effDate = trip.payment_date || trip.start_date;
         if (!effDate) return false;
         const d = new Date(effDate);
         const m = String(d.getMonth() + 1).padStart(2, '0');
         return m === filters.month;
      });
    }

    if (filters.destination) {
      filtered = filtered.filter((trip) => trip.destination === filters.destination);
    }

    return filtered;
  }, [rawTrips, debouncedSearchTerm, filters.paymentStatus, filters.tripStatus, filters.month, filters.destination]);

  const handleDeleteTrip = (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }
    deleteTrip(id);
    setDeleteConfirm(null);
  };

  const handleToggleExport = (id: string, value: boolean) => {
    toggleExport({ id, value });
  };

  const trips = filteredTrips;

  const availableDestinations = useMemo(() => {
    if (!trips) return [];
    const destinations = new Set(trips.map((trip) => trip.destination));
    return Array.from(destinations).sort();
  }, [trips]);

  const tripsMarkedForExport = useMemo(
    () => trips.filter((trip) => trip.export_to_pdf),
    [trips]
  );
  
  const stats = useMemo(() => {
    if (!trips || trips.length === 0) return { totalTrips: 0, totalRevenue: 0, totalProfit: 0, unpaidAmount: 0, upcoming: 0 };
    
    const totalTrips = count || 0; 
    
    const totalRevenue = trips.reduce((sum, trip) => {
      if (trip.status === 'cancelled') return sum;
      const tripCurrency = trip.currency || currency; 
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
    onEditTrip?.(trip);
  };

  const handleViewTrip = (trip: Trip) => {
    setViewTrip(trip);
  };



  // PDF Export Logic
  const handleExportPDF = async () => {
    try {
        const { jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        
        const doc = new jsPDF();
        
        // Title
        doc.setFontSize(18);
        doc.text(`Financial Summary - ${filters.month || 'All Months'} ${filters.year || new Date().getFullYear()}`, 14, 22);
        
        // Table Data
        const tableData = filteredTrips.map(t => {
            const sale = t.sale_price || 0;
            const cost = t.wholesale_cost || 0;
            const profit = sale - cost;
            // Convert everything to Main Currency (View) for consistency in PDF
            const tripCurr = t.currency || 'USD';
            
            return [
                t.destination,
                t.client_name,
                format(convert(sale, tripCurr, currency), currency),
                format(convert(cost, tripCurr, currency), currency),
                format(convert(profit, tripCurr, currency), currency),
                t.payment_status
            ];
        });

        // Generate Table
        autoTable(doc, {
            head: [['Destination', 'Client', 'Sale', 'Cost', 'Profit', 'Status']],
            body: tableData,
            startY: 30,
        });

        // Footer / Totals
        const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.text(`Total Revenue: ${format(stats.totalRevenue, currency)}`, 14, finalY);
        doc.text(`Total Profit: ${format(stats.totalProfit, currency)}`, 14, finalY + 6);
        
        doc.save('trips_summary.pdf');
    } catch (e) {
        console.error("Export failed", e);
    }
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

  // عرض أول 50 رحلة فقط لمنع التعليق
  const displayTrips = filteredTrips.slice(0, 50);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header + actions */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold gradient-title drop-shadow dark:drop-shadow-none text-slate-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-slate-50 dark:via-sky-100 dark:to-slate-200">
            {t('trips.title')}
          </h2>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-300">
            {count === 0
              ? 'No trips found'
              : `Showing ${displayTrips.length} of ${filteredTrips.length} trips`}
            {currency !== 'USD' && (
              <span className="ml-2 text-xs text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                {currency} {isCurrencyLoading && '...'}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200/80 mr-2 dark:bg-slate-900/80 dark:border-slate-800/80">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-800 dark:text-sky-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
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
              onClick={handleExportPDF}
              className={secondaryActionBtn}
          >
              <FileText className="w-5 h-5" />
              <span>
                Export PDF
              </span>
          </button>

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
        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 flex items-center justify-between shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-md dark:shadow-slate-950/70">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('trips.stats.totalTrips') ?? 'Total Trips'}
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {stats.totalTrips}
            </p>
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
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {format(stats.totalRevenue, currency)}
            </p>
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
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">
              {format(stats.totalProfit, currency)}
            </p>
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
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-300">
              {format(stats.unpaidAmount, currency)}
            </p>
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
            <p className="text-2xl font-bold text-sky-600 dark:text-sky-200">
              {stats.upcoming}
            </p>
          </div>
          <div className="p-3 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/40 dark:text-indigo-300">
            <CalendarCheck2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters: أزرار السنوات ستظهر تلقائياً هنا */}
      <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-sm dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-md dark:shadow-slate-950/60">
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
        <div className="rounded-2xl bg-white border border-slate-200/90 p-12 text-center shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-lg dark:shadow-slate-950/70">
          <div className="flex justify-center mb-4">
            <div className="bg-slate-100 border border-slate-200/80 p-6 rounded-full dark:bg-slate-900/80 dark:border-slate-700/80">
              <FileText className="w-12 h-12 text-slate-400 dark:text-slate-400" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2 dark:text-slate-100">
            {t('trips.noTrips')}
          </h3>
          <p className="text-slate-500 mb-6 dark:text-slate-300">{t('trips.createFirst')}</p>
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
                 يتم عرض أول 50 رحلة فقط لضمان السرعة. استخدم البحث للعثور على المزيد.
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
                      <td className="py-3 px-4 text-slate-900 font-medium dark:text-slate-100">{trip.destination}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{trip.client_name}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                        {formatDate(trip.start_date)}
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
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                        >
                          {trip.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleViewTrip(trip)}
                          className="text-sky-600 hover:text-sky-500 font-medium text-xs dark:text-sky-400 dark:hover:text-sky-300"
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
          {filteredTrips.length > 50 && (
             <div className="p-4 text-center border-t border-slate-200 dark:border-slate-800">
               <span className="text-slate-500 text-sm dark:text-slate-400">
                 يتم عرض أول 50 رحلة فقط. استخدم البحث للعثور على المزيد.
               </span>
             </div>
          )}
        </div>
      )}
      </div>

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