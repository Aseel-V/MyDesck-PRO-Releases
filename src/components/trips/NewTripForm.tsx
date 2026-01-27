import { useEffect, useState } from 'react';
import { X, Save, FileText, CreditCard } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip, TripFormData } from '../../types/trip';
import { tripSchema } from '../../lib/schemas';
import { cn } from '../../lib/utils';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useDebounce } from '../../hooks/useDebounce';
import { FileUpload } from '../ui/FileUpload';

interface NewTripFormProps {
  onClose: () => void;
  onSave: (data: TripFormData) => Promise<void>;
  editTrip?: Trip;
}

type Tab = 'details' | 'travelers' | 'itinerary' | 'financials';

// IMPORTANT: use input type of the schema (matches resolver)
type TripFormValues = z.input<typeof tripSchema>;

export default function NewTripForm({ onClose, onSave, editTrip }: NewTripFormProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const { rates, convert } = useCurrency(); // Added convert

  const {
    register,

    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      destination: editTrip?.destination || '',
      client_name: editTrip?.client_name || '',
      travelers: editTrip?.travelers || [],
      travelers_count: editTrip?.travelers_count || 1,
      itinerary: editTrip?.itinerary || [],
      start_date: editTrip?.start_date || '',
      end_date: editTrip?.end_date || '',
      currency: (editTrip?.currency as TripFormValues['currency']) || (profile?.preferred_currency as TripFormValues['currency']) || 'USD',
      exchange_rate: editTrip?.exchange_rate || 1,
      wholesale_cost: editTrip?.wholesale_cost || 0,
      sale_price: editTrip?.sale_price || 0,
      
      // Load saved original values if they exist, otherwise default to "view" logic
      wholesale_original_amount: editTrip?.wholesale_original_amount,
      wholesale_currency: editTrip?.wholesale_currency,
      sale_original_amount: editTrip?.sale_original_amount,
      sale_currency: editTrip?.sale_currency,

      payments: editTrip?.payments || [],
      payment_status:
        (editTrip?.payment_status as TripFormValues['payment_status']) || 'unpaid',
      amount_paid: editTrip?.amount_paid || 0,
      payment_date: editTrip?.payment_date || '',
      room_type: editTrip?.room_type || {}, // JSONB object for room configuration
      board_basis: editTrip?.board_basis || '', // Ensure persistence
      attachments: editTrip?.attachments || [],
      notes: editTrip?.notes || '',
      status: (editTrip?.status as TripFormValues['status']) || 'active',
    },
  });

  // ------------------------------------------------------------------
  // 1. Auto-Save Logic
  // ------------------------------------------------------------------
  const watchedValues = watch();
  const debouncedValues = useDebounce(watchedValues, 1000);

  useEffect(() => {
    // Only auto-save if it's a new trip (not editing)
    if (!editTrip) {
      localStorage.setItem('new_trip_draft', JSON.stringify(debouncedValues));
    }
  }, [debouncedValues, editTrip]);

  useEffect(() => {
    // Load draft on mount
    if (!editTrip) {
      const savedDraft = localStorage.getItem('new_trip_draft');
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          // We could ask the user if they want to restore, but for now let's just restore
          // or show a toast. Let's restore quietly or with a toast.
          // Ideally, we should check if the draft is empty or meaningful.
          if (parsed.destination || parsed.client_name) {
            Object.keys(parsed).forEach((key) => {
              setValue(key as keyof TripFormValues, parsed[key]);
            });
            toast.info(t('notifications.draftRestored') || 'Draft restored');
          }
        } catch (e) {
          console.error('Failed to parse draft', e);
        }
      }
    }
  }, [editTrip, setValue, t]);

  // ------------------------------------------------------------------
  // 2. Autocomplete Logic
  // ------------------------------------------------------------------
  const { data: distinctClients = [] } = useQuery({
    queryKey: ['distinct-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('client_name')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Deduplicate by client_name
      const unique = new Map();
      data?.forEach((item: { client_name: string }) => {
        if (item.client_name && !unique.has(item.client_name)) {
          unique.set(item.client_name, item);
        }
      });
      return Array.from(unique.values());
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });



  const wholesaleCost = watch('wholesale_cost');
  const salePrice = watch('sale_price');
  const amountPaid = watch('amount_paid');
  const currency = watch('currency');

  // Independent Currency State for Inputs
  // Priority: 1. Saved Original Currency from DB. 2. Fallback to trip currency.
  const [wholesaleCurrency, setWholesaleCurrency] = useState<string>(
      editTrip?.wholesale_currency || editTrip?.currency || profile?.preferred_currency || 'USD'
  );
  const [saleCurrency, setSaleCurrency] = useState<string>(
      editTrip?.sale_currency || editTrip?.currency || profile?.preferred_currency || 'USD'
  );
  const [amountPaidCurrency, setAmountPaidCurrency] = useState<string>(
      editTrip?.currency || profile?.preferred_currency || 'USD'
  );

  // Initialize independent currencies when trip loads
  useEffect(() => {
    if (editTrip) {
      // If we have explicit original currency saved, use it.
      if (editTrip.wholesale_currency) setWholesaleCurrency(editTrip.wholesale_currency);
      else if (editTrip.currency) setWholesaleCurrency(editTrip.currency);

      if (editTrip.sale_currency) setSaleCurrency(editTrip.sale_currency);
      else if (editTrip.currency) setSaleCurrency(editTrip.currency);
    }
  }, [editTrip]);

  // When global currency changes (e.g. from draft load or user change main currency), sync ONLY if we haven't diverged?
  // Actually, the main currency dropdown should probably control the "Base" for the trip.
  // We'll keep local states independent.

  const [profit, setProfit] = useState(0);
  const [profitPercentage, setProfitPercentage] = useState(0);
  const [amountDue, setAmountDue] = useState(0);

  // Room Composition State
  type RoomType = 'Single' | 'Double' | 'Triple' | 'Quad' | 'Suite' | 'Family';
  const [roomCounts, setRoomCounts] = useState<Record<RoomType, number>>({
    Single: 0,
    Double: 0,
    Triple: 0,
    Quad: 0,
    Suite: 0,
    Family: 0,
  });

  // Parse initial room_type object to counts
  useEffect(() => { 
     // 1. Room Type Parsing from JSONB object
     if (editTrip?.room_type && typeof editTrip.room_type === 'object') {
         setRoomCounts(prevCounts => {
             const newCounts = { ...prevCounts };
             Object.entries(editTrip.room_type || {}).forEach(([type, count]) => {
                 if (type in newCounts && typeof count === 'number') {
                     newCounts[type as RoomType] = count;
                 }
             });
             return newCounts;
         });
     }

     // 2. Load Original Financial Values (if they exist)
     if (editTrip) {
         if (editTrip.wholesale_original_amount !== undefined && editTrip.wholesale_original_amount !== null) {
             setValue('wholesale_cost', editTrip.wholesale_original_amount);
         }
         if (editTrip.sale_original_amount !== undefined && editTrip.sale_original_amount !== null) {
             setValue('sale_price', editTrip.sale_original_amount);
         }
      }
   }, [editTrip, setValue]); // Run ONCE on mount or when editTrip changes
  
  // Sync room_type JSONB object when counts change
  useEffect(() => {
    // Only update if one of the counts is > 0
    // Prevent overwriting existing object with empty if counts are 0 on load
    const hasCounts = Object.values(roomCounts).some(c => c > 0);
    
    if (hasCounts) {
        // Build room configuration object with only non-zero counts
        const roomConfig: Record<string, number> = {};
        Object.entries(roomCounts).forEach(([type, count]) => {
          if (count > 0) roomConfig[type] = count;
        });
        setValue('room_type', roomConfig); // Store as JSONB object
    }
  }, [roomCounts, setValue]);

  useEffect(() => {
    // Normalize to Main Currency for profit calc
    // If independent currencies are used, the visual inputs are in those currencies.
    // The `wholesaleCost` and `salePrice` variables from `watch` are the NUMBERS in the form.
    // We need to know what currency they are in to calculate profit correctly if we wanted to show specific profit.
    // However, `watch` values ARE what gets submitted.
    // Requirement: "store the original currency and value, but calculate display value based on Base Currency".
    // Since we don't have new columns, we will assume the User changes the Main Currency to the "Base" they want,
    // and if they use the independent conversions, we convert the value INTO the Main Currency before setting setValue.
    // WAIT. The user said: "If a user enters 2000 in USD and then switches... to ILS, numeric value should convert".
    // This implies the standard flow: Input is tied to Dropdown.
    
    // Profit Calculation: Always based on what's in the form (which should always be normalized to 'currency' ON SUBMIT, 
    // but in the UI, if wholesale is 100 ILS and Sale is 50 USD, profit calc is complex).
    // SIMPLIFICATION: We will enforce that the Form Values (wholesale_cost, sale_price) are ALWAYS in the Trip's Main `currency`.
    // The "Independent Dropdown" is just a helper to allow them to enter "2000 ILS" and have it auto-convert to USD (if Trip is USD).
    // But the user asked for "Select specific currency... independently".
    // Use Case: Wholesale is paid in ILS. Sale is in USD.
    // If I force conversion, I lose the "Original" value of 2000 ILS.
    // Since I cannot change SCHEMA, I MUST force conversion to keep data valid in 1 currency.
    // I will treat the dropdowns as "Converter Tools".
    // When you change the dropdown:
    // 1. It converts the current value to the NEW currency.
    // 2. It updates the state `wholesaleCurrency`.
    // NOTE: This effectively changes the "viewing" currency.
    // BUT, if `wholesaleCurrency` != `currency` (Main), we have a mismatch.
    // 
    // REVISED STRATEGY: 
    // The form inputs `wholesale_cost` and `sale_price` will hold the value in `wholesaleCurrency` and `saleCurrency` respectively.
    // On Submit, we convert everything to `currency` (Main) to store in DB consistently.
    // Profit calc needs real-time conversion.
    
    const wCost = convert(wholesaleCost || 0, wholesaleCurrency, currency || 'USD'); 
    const sPrice = convert(salePrice || 0, saleCurrency, currency || 'USD');
    
    const calculatedProfit = sPrice - wCost;
    const calculatedPercentage = wCost > 0 ? (calculatedProfit / wCost) * 100 : 0;
    
    setProfit(calculatedProfit);
    setProfitPercentage(calculatedPercentage);
  }, [wholesaleCost, salePrice, currency, wholesaleCurrency, saleCurrency, convert]); // Added dependencies

  useEffect(() => {
    // Amount due calc
    // Amount Paid is in... let's say Main Currency? Or its own?
    // Let's assume Amount Paid matches Sale Price currency usually.
    // Let's stick to Sales Currency for Amount Paid for simplicity/consistency with Sale.
    // Or just Main Currency? The existing code `syncPaymentStatusWithAmount` uses raw values.
    // We will assume Amount Paid is in `currency` (Main) for now to avoid too much complexity, 
    // because `payments` array has history.
    
    const sPrice = convert(salePrice || 0, saleCurrency, currency || 'USD');
    const paidInMain = convert(amountPaid || 0, amountPaidCurrency, currency || 'USD');
    const due = sPrice - paidInMain;
    setAmountDue(due >= 0 ? due : 0);
  }, [salePrice, saleCurrency, amountPaid, amountPaidCurrency, currency, convert]);

  // Auto-update exchange rate when currency changes
  useEffect(() => {
    if (currency && rates && rates[currency]) {
      const rate = rates[currency];
      setValue('exchange_rate', rate);
    }
  }, [currency, rates, setValue]);

  // Sync payment status with amount paid
  const syncPaymentStatusWithAmount = (paid: number, price: number) => {
    if (paid <= 0) {
      setValue('payment_status', 'unpaid');
    } else if (paid < price - 1) { // Tolerance
      setValue('payment_status', 'partial');
    } else {
      setValue('payment_status', 'paid');
    }
  };

  const getCurrencySymbol = (curr: string) => {
    switch (curr) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'ILS': return '₪';
      default: return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(currency || 'USD');

  const handleCurrencyChange = (
      field: 'wholesale_cost' | 'sale_price' | 'amount_paid', 
      newCurrency: string, 
      oldCurrency: string
  ) => {
      const currentValue = getValues(field) || 0;
      // Convert value
      const newValue = convert(currentValue, oldCurrency, newCurrency);
      setValue(field, parseFloat(newValue.toFixed(2)));
  };

  const onSubmit = async (data: TripFormValues) => {
    setLoading(true);
    try {
      // ---------------------------------------------------------
      // NORMALIZE FINANCIALS TO MAIN CURRENCY BEFORE SAVE
      // ---------------------------------------------------------
      // 1. Store the "View" values (Converted to Main Currency) for reporting/dashboard
      if (wholesaleCurrency !== data.currency) {
          data.wholesale_cost = convert(data.wholesale_cost, wholesaleCurrency, data.currency || 'USD');
      }
      if (saleCurrency !== data.currency) {
          data.sale_price = convert(data.sale_price, saleCurrency, data.currency || 'USD');
      }

      // 2. Store the "Original" values (User Input) EXACTLY as entered
      // We grab the raw values from the form inputs (which are in the 'independent' currencies)
      const rawWholesale = getValues('wholesale_cost');
      const rawSale = getValues('sale_price');
      
      data.wholesale_original_amount = rawWholesale;
      data.wholesale_currency = wholesaleCurrency;
      
      data.sale_original_amount = rawSale;
      data.sale_currency = saleCurrency;
      
      // Auto-update travelers count
      data.travelers_count = (data.travelers?.length || 0) || data.travelers_count;

      // Auto-calculate amount paid from payments array if used
      if (data.payments && data.payments.length > 0) {
        data.amount_paid = data.payments.reduce((sum, p) => sum + p.amount, 0);
      } else if (amountPaidCurrency !== data.currency) {
          // Convert simple amount paid if currency differs and no payments array overrides it
          data.amount_paid = convert(data.amount_paid, amountPaidCurrency, data.currency || 'USD');
      }

      // Sanitize date fields - convert empty strings to null to avoid Postgres "invalid input syntax" error
      const sanitizedData = {
        ...data,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        payment_date: data.payment_date || null,
      };

      await onSave(sanitizedData as unknown as TripFormData);

      // Clear draft on success
      if (!editTrip) {
        localStorage.removeItem('new_trip_draft');
      }

      onClose();
    } catch (error) {
      console.error('Failed to save trip:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSalePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Logic for sale price auto-updates (like payment status)
    // We deal with the Raw Value here (in saleCurrency)
    let value = parseFloat(e.target.value);
    if (isNaN(value) || value < 0) value = 0;
    setValue('sale_price', value);
    
    // Convert to Main to compare with Amount Paid (which is in Main)
    const valueInMain = convert(value, saleCurrency, currency || 'USD');
    
    const paid = amountPaid || 0;
    if (paid > valueInMain) {
       // Optional: Auto-update amount paid if it exceeds price? 
       // Usually better not to touch amount paid unless it was equal before.
       // syncPaymentStatusWithAmount(paid, valueInMain);
    } 
    // Always sync status
    syncPaymentStatusWithAmount(paid, valueInMain);
  };

  const profitSign = profit >= 0 ? '+' : '';
  const profitColor = profit >= 0 ? 'text-emerald-300' : 'text-rose-300';
  const amountDueColor = amountDue > 0 ? 'text-rose-300' : 'text-emerald-300';

  const baseInputClasses =
    'w-full text-slate-900 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80 transition-all shadow-sm ' +
    'dark:text-slate-100 dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-slate-950/70';

  const errorInputClasses = 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50';
  const labelClasses = 'block text-xs font-semibold tracking-wide text-slate-700 mb-2 dark:text-slate-300';

  const tabs = [
    { id: 'details', label: t('trips.details') || 'Details', icon: FileText },
    { id: 'financials', label: t('trips.financials') || 'Financials', icon: CreditCard },
  ] as const;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="relative max-w-4xl w-full max-h-[90vh] my-6 rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col dark:bg-slate-950/95 dark:border-slate-800/80 dark:shadow-[0_22px_65px_rgba(15,23,42,0.95)]">
        {/* gradient line top */}
        <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white/95 shrink-0 dark:border-slate-800/80 dark:bg-slate-950/95">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.25em] text-sky-600/80 dark:text-sky-300/80">
              {editTrip ? t('trips.edit') : t('trips.newTrip')}
            </span>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-50">
              {editTrip ? t('trips.edit') : t('trips.newTrip')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all dark:border-slate-700/80 dark:bg-slate-950/90 dark:hover:bg-slate-800/80 dark:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 shrink-0 overflow-x-auto dark:border-slate-800/80 dark:bg-slate-900/50">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap',
                  isActive
                    ? 'border-sky-500 text-sky-600 bg-white dark:text-sky-400 dark:bg-slate-800/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/30',
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* form content */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-grow overflow-hidden">
          <div className="flex-grow overflow-y-auto px-5 py-4 md:px-6 md:py-5 space-y-6">
            {/* DETAILS TAB */}
            {activeTab === 'details' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
                <div className="md:col-span-2">
                  <label className={labelClasses}>{t('trips.destination')} *</label>
                  <input
                    type="text"
                    {...register('destination')}
                    className={cn(baseInputClasses, errors.destination && errorInputClasses)}
                  />
                  {errors.destination && (
                    <p className="text-xs text-rose-400 mt-1">
                      {errors.destination.message as string}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClasses}>{t('trips.clientName')} *</label>
                  <input
                    type="text"
                    {...register('client_name')}
                    className={cn(baseInputClasses, errors.client_name && errorInputClasses)}
                    list="client-names"
                    onChange={(e) => {
                      register('client_name').onChange(e);
                      // If we had phone number logic, we'd call it here
                    }}
                  />
                  <datalist id="client-names">
                    {distinctClients.map((c: { client_name: string }, i: number) => (
                      <option key={i} value={c.client_name} />
                    ))}
                  </datalist>
                  {errors.client_name && (
                    <p className="text-xs text-rose-400 mt-1">
                      {errors.client_name.message as string}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClasses}>{t('trips.clientPhone')}</label>
                  <input
                    type="tel"
                    {...register('client_phone')}
                    className={baseInputClasses}
                    placeholder="+1234567890"
                  />
                </div>

                <div>
                  <label className={labelClasses}>{t('trips.status')} *</label>
                  <select {...register('status')} className={baseInputClasses}>
                    <option value="active">{t('trips.statuses.active')}</option>
                    <option value="completed">{t('trips.statuses.completed')}</option>
                    <option value="cancelled">{t('trips.statuses.cancelled')}</option>
                  </select>
                </div>

                <div>
                  <label className={labelClasses}>{t('trips.travelersCount')}</label>
                  <input
                    type="number"
                    {...register('travelers_count', { valueAsNumber: true })}
                    className={cn(baseInputClasses, errors.travelers_count && errorInputClasses)}
                    min={1}
                  />
                  {errors.travelers_count && (
                    <p className="text-xs text-rose-400 mt-1">
                      {errors.travelers_count.message as string}
                    </p>
                  )}
                </div>


                {/* Room Composition Selector */}
                <div className="md:col-span-2 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 dark:bg-slate-900/30 dark:border-slate-800/50">
                   <div className="flex items-center justify-between">
                        <label className={labelClasses}>{t('trips.roomConfiguration')}</label>
                        {/* Clear button to reset counts */}
                        <button 
                             type="button"
                             onClick={() => setRoomCounts({ Single: 0, Double: 0, Triple: 0, Quad: 0, Suite: 0, Family: 0 })}
                             className="text-[10px] text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
                        >
                            {t('trips.resetCounts')}
                        </button>
                   </div>
                   
                   <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                       {(Object.keys(roomCounts) as RoomType[]).map((type) => (
                           <div key={type} className="flex flex-col items-center gap-1">
                               <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t(`trips.roomTypes.${type}`) || type}</span>
                               <input
                                   type="number"
                                   min={0}
                                   value={roomCounts[type]}
                                   onChange={(e) => {
                                       const val = parseInt(e.target.value) || 0;
                                       setRoomCounts(prev => ({ ...prev, [type]: val }));
                                   }}
                                    className="w-full text-center bg-white border border-slate-300 rounded-lg py-1.5 text-xs text-slate-900 focus:ring-1 focus:ring-sky-500 dark:bg-slate-950 dark:border-slate-700 dark:text-white"
                               />
                           </div>
                       ))}
                   </div>
                   
                   {/* Manual Override / Final String */}
                   <div className="mt-2">
                       <label className="text-[10px] text-slate-500 mb-1 block dark:text-slate-500">{t('trips.finalText')}</label>
                       <input
                         type="text"
                         {...register('room_type')}
                         className={cn(baseInputClasses, 'text-xs py-2')}
                         placeholder="e.g. Single x1, Double x2"
                       />
                   </div>
                </div>

                {/* Board Basis Selector */}
                <div>
                   <label className={labelClasses}>{t('trips.boardBasis')}</label>
                   <select {...register('board_basis')} className={baseInputClasses}>
                        <option value="">{t('trips.notSpecified')}</option>
                        <option value="Room Only">{t('trips.boardTypes.roomOnly')}</option>
                        <option value="Bed & Breakfast">{t('trips.boardTypes.bedAndBreakfast')}</option>
                        <option value="Half Board">{t('trips.boardTypes.halfBoard')}</option>
                        <option value="Full Board">{t('trips.boardTypes.fullBoard')}</option>
                        <option value="All Inclusive">{t('trips.boardTypes.allInclusive')}</option>
                   </select>
                </div>

                <div>
                  <label className={labelClasses}>{t('trips.startDate')} *</label>
                  <input
                    type="date"
                    {...register('start_date')}
                    className={cn(baseInputClasses, errors.start_date && errorInputClasses)}
                  />
                  {errors.start_date && (
                    <p className="text-xs text-rose-400 mt-1">
                      {errors.start_date.message as string}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClasses}>{t('trips.endDate')} *</label>
                  <input
                    type="date"
                    {...register('end_date')}
                    className={cn(baseInputClasses, errors.end_date && errorInputClasses)}
                  />
                  {errors.end_date && (
                    <p className="text-xs text-rose-400 mt-1">
                      {errors.end_date.message as string}
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className={labelClasses}>{t('trips.description')}</label>
                  <textarea
                    {...register('notes')}
                    className={cn(baseInputClasses, 'min-h-[100px] resize-y')}
                    placeholder={t('trips.descriptionPlaceholder') || 'Add trip description...'}
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                    <label className={labelClasses}>{t('trips.attachments')}</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* File List */}
                        <div className="space-y-2">
                            {watch('attachments')?.map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                                    <div className="flex items-center gap-2 truncate">
                                        <FileText className="w-4 h-4 text-sky-500 shrink-0" />
                                        <a href={file.url} target="_blank" rel="noreferrer" className="text-sm text-slate-600 truncate underline dark:text-slate-300">
                                            {file.file_name}
                                        </a>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const current = getValues('attachments');
                                            setValue('attachments', current.filter((_, i) => i !== idx));
                                        }}
                                        className="p-1 hover:bg-rose-100 text-rose-500 rounded-full transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        
                        {/* Uploader */}
                        <div>
                             <FileUpload 
                                folderName={profile?.id || 'public'} 
                                onUploadComplete={(newFile) => {
                                    const current = getValues('attachments') || [];
                                    setValue('attachments', [...current, newFile]);
                                }} 
                             />
                             <p className="text-[10px] text-slate-400 mt-2 text-center">
                                {t('trips.uploadConstraints', { size: '15MB' })}
                             </p>
                        </div>
                    </div>
                </div>
              </div>
            )}



            {/* FINANCIALS TAB */}
            {activeTab === 'financials' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className={labelClasses}>Main Trip Currency</label>
                    <select {...register('currency')} className={baseInputClasses}>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="ILS">ILS (₪)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                        Base currency for reporting and dashboard.
                    </p>
                  </div>
                  
                  
                  <input type="hidden" {...register('exchange_rate', { valueAsNumber: true })} />

                  <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className={labelClasses}>
                          {t('trips.wholesaleCost')}
                        </label>
                        <div className="flex gap-2">
                             <select
                                value={wholesaleCurrency}
                                onChange={(e) => {
                                    const newCurr = e.target.value;
                                    handleCurrencyChange('wholesale_cost', newCurr, wholesaleCurrency);
                                    setWholesaleCurrency(newCurr);
                                }}
                                className="w-24 bg-slate-100 border border-slate-200 rounded-xl px-2 text-sm focus:outline-none dark:bg-slate-900 dark:border-slate-800"
                             >
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="ILS">ILS</option>
                             </select>
                            <input
                              type="number"
                              step="0.01"
                              {...register('wholesale_cost', { valueAsNumber: true })}
                              className={cn(
                                baseInputClasses,
                                errors.wholesale_cost && errorInputClasses,
                              )}
                            />
                        </div>
                      </div>
                      <div>
                        <label className={labelClasses}>
                          {t('trips.salePrice')}
                        </label>
                        <div className="flex gap-2">
                             <select
                                value={saleCurrency}
                                onChange={(e) => {
                                    const newCurr = e.target.value;
                                    handleCurrencyChange('sale_price', newCurr, saleCurrency);
                                    setSaleCurrency(newCurr);
                                }}
                                className="w-24 bg-slate-100 border border-slate-200 rounded-xl px-2 text-sm focus:outline-none dark:bg-slate-900 dark:border-slate-800"
                             >
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="ILS">ILS</option>
                             </select>
                            <input
                              type="number"
                              step="0.01"
                              {...register('sale_price', { valueAsNumber: true })}
                              onChange={(e) => {
                                register('sale_price', { valueAsNumber: true }).onChange(e);
                                handleSalePriceChange(e);
                              }}
                              className={cn(baseInputClasses, errors.sale_price && errorInputClasses)}
                            />
                        </div>
                      </div>
                  </div>
                </div>

                {/* Profit Card */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-inner dark:shadow-slate-950/80">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1 font-medium dark:text-slate-400">
                        {t('trips.profit')} (Converted to {currency})
                      </p>
                      <p className={`text-2xl font-bold ${profitColor}`}>
                        {profitSign}
                        {currencySymbol}
                        {Math.abs(profit).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-1 font-medium dark:text-slate-400">
                        {t('trips.profitPercentage')}
                      </p>
                      <p className={`text-2xl font-bold ${profitColor}`}>
                        {profitSign}
                        {profitPercentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payment Date & Amount Paid - Simplified Payment */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className={labelClasses}>
                            {t('trips.amountPaid')}
                        </label>
                        <div className="flex gap-2">
                             <select
                                value={amountPaidCurrency}
                                onChange={(e) => {
                                    const newCurr = e.target.value;
                                    handleCurrencyChange('amount_paid', newCurr, amountPaidCurrency);
                                    setAmountPaidCurrency(newCurr);
                                }}
                                className="w-24 bg-slate-100 border border-slate-200 rounded-xl px-2 text-sm focus:outline-none dark:bg-slate-900 dark:border-slate-800"
                             >
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="ILS">ILS</option>
                             </select>
                            <input
                                type="number"
                                step="0.01"
                                {...register('amount_paid', { valueAsNumber: true })}
                                onChange={(e) => {
                                    register('amount_paid', { valueAsNumber: true }).onChange(e);
                                    const val = parseFloat(e.target.value);
                                    const finalVal = isNaN(val) ? 0 : val;
                                    
                                    // Convert this input value to Main Currency before syncing status
                                    const paidInMain = convert(finalVal, amountPaidCurrency, currency || 'USD');
                                    const sPrice = convert(salePrice || 0, saleCurrency, currency || 'USD');
                                    syncPaymentStatusWithAmount(paidInMain, sPrice);
                                }}
                                className={cn(
                                    baseInputClasses,
                                    errors.amount_paid && errorInputClasses,
                                )}
                            />
                        </div>
                        {errors.amount_paid && (
                            <p className="text-xs text-rose-400 mt-1">
                                {errors.amount_paid.message as string}
                            </p>
                        )}
                    </div>
                    <div>
                        <label className={labelClasses}>
                            {t('trips.paymentDate') || 'Payment Date'}
                        </label>
                        <input
                            type="date"
                            {...register('payment_date')}
                            className={cn(baseInputClasses)}
                        />
                    </div>
                </div>

                {/* Payments Section (Optional/Advanced) */}
                <div className="space-y-3 hidden"> 
                   {/* Hidden for now to simplify based on user request, but kept code if needed or for backward compat if we want to toggle it */}
                   {/* If we want to fully remove, we can. For now hiding to prevent confusion vs the new simple fields which might not sync perfectly if we keep both visible without logic */}
                </div>

                {/* Amount Due */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/90">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      {t('trips.amountDue')}
                    </p>
                    <p className={`text-xl font-bold ${amountDueColor}`}>
                      {currencySymbol}
                      {amountDue.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 flex items-center justify-end gap-3 px-5 py-4 md:px-6 border-t border-slate-200 bg-white/95 shrink-0 dark:border-slate-800/80 dark:bg-slate-950/95">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-all dark:border-slate-600/80 dark:text-slate-200 dark:bg-slate-950/90 dark:hover:bg-slate-900/90"
            >
              {t('trips.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white 
              bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 
              border border-sky-400/80 shadow-[0_10px_30px_rgba(56,189,248,0.55)]
              disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? t('auth.loading') : t('trips.save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}