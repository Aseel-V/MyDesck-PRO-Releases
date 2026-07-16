import { useEffect, useState } from 'react';
import { X, Save, FileText, CreditCard, BedDouble, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { FieldErrors, useForm } from 'react-hook-form';
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
import { removeTripAttachments, getTripAttachmentUrl } from '../../lib/tripAttachments';
import { formatRoomConfiguration, normalizeRoomConfiguration, serializeRoomConfiguration } from '../../lib/tripRoom';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { getEffectivePaymentStatus, getPaymentStatusDescription, getTripStatusDescription } from '../../lib/tripStatus';

interface NewTripFormProps {
  onClose: () => void;
  onSave: (data: TripFormData) => Promise<void>;
  editTrip?: Trip;
}

type FormStep = 'details' | 'rooms' | 'financials' | 'review';
const TRIP_DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

// IMPORTANT: use input type of the schema (matches resolver)
type TripFormValues = z.input<typeof tripSchema>;
type StoredTripDraft = {
  savedAt?: number;
  data?: Partial<TripFormValues>;
};

export default function NewTripForm({ onClose, onSave, editTrip }: NewTripFormProps) {
  const { t, direction } = useLanguage();
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [validationSummary, setValidationSummary] = useState<string[]>([]);
  const { rates, convert } = useCurrency(); // Added convert

  const {
    register,

    handleSubmit,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    setFocus,
    formState: { errors, isDirty },
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: {
      destination: editTrip?.destination || '',
      client_name: editTrip?.client_name || '',
      travelers: editTrip?.travelers || [],
      travelers_count: editTrip?.travelers_count !== undefined ? editTrip.travelers_count : '' as unknown as number,
      itinerary: editTrip?.itinerary || [],
      start_date: editTrip?.start_date || '',
      end_date: editTrip?.end_date || '',
      currency: (editTrip?.currency as TripFormValues['currency']) || (profile?.preferred_currency as TripFormValues['currency']) || 'USD',
      exchange_rate: editTrip?.exchange_rate || 1,
      wholesale_cost: editTrip?.wholesale_cost !== undefined ? editTrip.wholesale_cost : '' as unknown as number,
      sale_price: editTrip?.sale_price !== undefined ? editTrip.sale_price : '' as unknown as number,
      
      // Load saved original values if they exist, otherwise default to "view" logic
      wholesale_original_amount: editTrip?.wholesale_original_amount,
      wholesale_currency: editTrip?.wholesale_currency,
      sale_original_amount: editTrip?.sale_original_amount,
      sale_currency: editTrip?.sale_currency,

      payments: editTrip?.payments || [],
      payment_status:
        (editTrip?.payment_status as TripFormValues['payment_status']) || 'unpaid',
      amount_paid: editTrip?.amount_paid !== undefined ? editTrip.amount_paid : '' as unknown as number,
      payment_date: editTrip?.payment_date || '',
      room_type: normalizeRoomConfiguration(editTrip?.room_type), // JSONB object for room configuration
      board_basis: editTrip?.board_basis || '', // Ensure persistence
      attachments: editTrip?.attachments || [],
      notes: editTrip?.notes || '',
      status: (editTrip?.status as TripFormValues['status']) || 'active',
    },
  });
  const watchedValues = watch();
  const debouncedValues = useDebounce(watchedValues, 1000);
  const draftStorageKey = user?.id ? `new_trip_draft:${user.id}` : null;

  useEffect(() => {
    // Only auto-save if it's a new trip (not editing)
    if (!editTrip && draftStorageKey) {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          savedAt: Date.now(),
          data: debouncedValues,
        })
      );
    }
  }, [debouncedValues, draftStorageKey, editTrip]);

  useEffect(() => {
    localStorage.removeItem('new_trip_draft');

    // Load draft on mount
    if (!editTrip && draftStorageKey) {
      const savedDraft = localStorage.getItem(draftStorageKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft) as StoredTripDraft | Partial<TripFormValues>;
          const wrappedDraft = parsed as StoredTripDraft;
          const savedAt = typeof wrappedDraft.savedAt === 'number' ? wrappedDraft.savedAt : undefined;
          const draftData: Partial<TripFormValues> =
            wrappedDraft.data && typeof wrappedDraft.data === 'object'
              ? wrappedDraft.data
              : (parsed as Partial<TripFormValues>);

          if (savedAt && Date.now() - savedAt > TRIP_DRAFT_TTL_MS) {
            localStorage.removeItem(draftStorageKey);
            return;
          }

          // We could ask the user if they want to restore, but for now let's just restore
          // or show a toast. Let's restore quietly or with a toast.
          // Ideally, we should check if the draft is empty or meaningful.
          if (draftData?.destination || draftData?.client_name) {
            (Object.keys(draftData) as Array<keyof TripFormValues>).forEach((key) => {
              const value = draftData[key];
              if (value !== undefined) {
                setValue(key, value);
              }
            });
            toast.info(t('notifications.draftRestored'));
          }
        } catch (e) {
          console.error('Failed to parse draft', e);
        }
      }
    }
  }, [draftStorageKey, editTrip, setValue, t]);

  useEffect(() => {
    if (!isDirty || loading) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, loading]);


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

  const [profit, setProfit] = useState(0);
  const [profitPercentage, setProfitPercentage] = useState(0);
  const [amountDue, setAmountDue] = useState(0);

  // Room Composition State
  type RoomType = 'Single' | 'Double' | 'Triple' | 'Quad' | 'Suite' | 'Family';
  const [roomCounts, setRoomCounts] = useState<Record<RoomType, number | ''>>({
    Single: '',
    Double: '',
    Triple: '',
    Quad: '',
    Suite: '',
    Family: '',
  });
  const roomConfigPreview = formatRoomConfiguration(roomCounts as unknown as Record<string, number>, t('trips.notSpecified'));

  // Parse initial room_type object to counts
  useEffect(() => { 
     // 1. Room Type Parsing from JSONB object
     if (editTrip?.room_type) {
         const normalizedRooms = normalizeRoomConfiguration(editTrip.room_type);
         setRoomCounts(prevCounts => {
             const newCounts = { ...prevCounts };
             Object.entries(normalizedRooms).forEach(([type, count]) => {
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
    const hasCounts = Object.values(roomCounts).some(c => typeof c === 'number' && c > 0);
    
    if (hasCounts) {
        // Build room configuration object with only non-zero counts
        const roomConfig: Record<string, number> = {};
        Object.entries(roomCounts).forEach(([type, count]) => {
          if (typeof count === 'number' && count > 0) roomConfig[type] = count;
        });
        setValue('room_type', roomConfig); // Store as JSONB object
    } else {
        setValue('room_type', {});
    }
  }, [roomCounts, setValue]);

  useEffect(() => {
    // Profit calc needs real-time conversion.
    
    const safeWholesale = isNaN(Number(wholesaleCost)) ? 0 : Number(wholesaleCost);
    const safeSale = isNaN(Number(salePrice)) ? 0 : Number(salePrice);

    const wCost = convert(safeWholesale, wholesaleCurrency, currency || 'USD'); 
    const sPrice = convert(safeSale, saleCurrency, currency || 'USD');
    
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
    
    const safeSale = isNaN(Number(salePrice)) ? 0 : Number(salePrice);
    const safePaid = isNaN(Number(amountPaid)) ? 0 : Number(amountPaid);

    const sPrice = convert(safeSale, saleCurrency, currency || 'USD');
    const paidInMain = convert(safePaid, amountPaidCurrency, currency || 'USD');
    const due = sPrice - paidInMain;
    setAmountDue(due >= 0 ? due : 0);
  }, [salePrice, saleCurrency, amountPaid, amountPaidCurrency, currency, convert]);

  useEffect(() => {
    const normalizedSale = convert(Number.isFinite(Number(salePrice)) ? Math.max(0, Number(salePrice)) : 0, saleCurrency, currency || 'USD');
    const normalizedPaid = convert(Number.isFinite(Number(amountPaid)) ? Math.max(0, Number(amountPaid)) : 0, amountPaidCurrency, currency || 'USD');
    const nextStatus = getEffectivePaymentStatus({
      payment_status: getValues('payment_status') || 'unpaid',
      sale_price: normalizedSale,
      amount_paid: normalizedPaid,
    });

    if (getValues('payment_status') !== nextStatus) {
      setValue('payment_status', nextStatus, { shouldValidate: false });
    }
  }, [amountPaid, amountPaidCurrency, convert, currency, getValues, saleCurrency, salePrice, setValue]);

  // Auto-update exchange rate when currency changes
  useEffect(() => {
    if (currency && rates && rates[currency]) {
      const rate = rates[currency];
      setValue('exchange_rate', rate);
    }
  }, [currency, rates, setValue]);

  const getCurrencySymbol = (curr: string) => {
    switch (curr) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'ILS': return '₪';
      default: return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(currency || 'USD');
  const validationMessageKeys: Record<string, string> = {
    'Destination is required': 'trips.validation.destinationRequired',
    'Client name is required': 'trips.validation.clientNameRequired',
    'At least 1 traveler is required': 'trips.validation.travelersRequired',
    'Title is required': 'trips.validation.titleRequired',
    'Start date is required': 'trips.validation.startDateRequired',
    'End date is required': 'trips.validation.endDateRequired',
    'Cost cannot be negative': 'trips.validation.costNegative',
    'Price cannot be negative': 'trips.validation.priceNegative',
    'Amount paid cannot be negative': 'trips.validation.amountPaidNegative',
    'End date must be after start date': 'trips.validation.endDateAfterStart',
    'Amount paid cannot exceed sale price after currency conversion': 'trips.validation.amountPaidExceedsSalePrice',
  };

  const translateValidationMessage = (message?: unknown) => {
    if (typeof message !== 'string') return '';
    const key = validationMessageKeys[message];
    return key ? t(key) : message;
  };

  const handleCurrencyChange = (
      field: 'wholesale_cost' | 'sale_price' | 'amount_paid', 
      newCurrency: string, 
      oldCurrency: string
  ) => {
      const currentValue = Number(getValues(field)) || 0;
      // Convert value
      const newValue = convert(currentValue, oldCurrency, newCurrency);
      setValue(field, parseFloat(newValue.toFixed(2)));
  };

  const onSubmit = async (data: TripFormValues) => {
    setLoading(true);
    setValidationSummary([]);
    try {
      // ---------------------------------------------------------
      // NORMALIZE FINANCIALS TO MAIN CURRENCY BEFORE SAVE
      // ---------------------------------------------------------
      // 1. Store the "View" values (Converted to Main Currency) for reporting/dashboard
      if (wholesaleCurrency !== data.currency) {
          data.wholesale_cost = convert(Number(data.wholesale_cost) || 0, wholesaleCurrency, data.currency || 'USD');
      }
      if (saleCurrency !== data.currency) {
          data.sale_price = convert(Number(data.sale_price) || 0, saleCurrency, data.currency || 'USD');
      }

      // 2. Store the "Original" values (User Input) EXACTLY as entered
      // We grab the raw values from the form inputs (which are in the 'independent' currencies)
      const rawWholesale = getValues('wholesale_cost');
      const rawSale = getValues('sale_price');
      
      data.wholesale_original_amount = Number(rawWholesale) || 0;
      data.wholesale_currency = wholesaleCurrency;
      
      data.sale_original_amount = Number(rawSale) || 0;
      data.sale_currency = saleCurrency;
      
      // Auto-update travelers count
      data.travelers_count = (data.travelers?.length || 0) || data.travelers_count;

      // Auto-calculate amount paid from payments array if used
      if (data.payments && data.payments.length > 0) {
        data.amount_paid = data.payments.reduce((sum, p) => sum + p.amount, 0);
      } else if (amountPaidCurrency !== data.currency) {
          // Convert simple amount paid if currency differs and no payments array overrides it
          data.amount_paid = convert(Number(data.amount_paid) || 0, amountPaidCurrency, data.currency || 'USD');
      }

      if (Number(data.amount_paid) > Number(data.sale_price) + 0.01) {
        setError('amount_paid', {
          type: 'manual',
          message: 'Amount paid cannot exceed sale price after currency conversion',
        });
        setValidationSummary([`${t('trips.amountPaid')}: ${t('trips.validation.amountPaidExceedsSalePrice')}`]);
        setActiveStep(getStepForField('amount_paid'));
        window.setTimeout(() => {
          scrollFormToTop();
          setFocus('amount_paid');
        }, 0);
        return;
      }
      clearErrors('amount_paid');

      data.room_type = serializeRoomConfiguration(data.room_type);

      // Sanitize date fields - convert empty strings to null to avoid Postgres "invalid input syntax" error
      const sanitizedData = {
        ...data,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        payment_date: data.payment_date || null,
      };

      await onSave(sanitizedData as unknown as TripFormData);

      // Clear draft on success
      if (!editTrip && draftStorageKey) {
        localStorage.removeItem(draftStorageKey);
      }

      onClose();
    } catch (error) {
      console.error('Failed to save trip:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestClose = () => {
    if (loading) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const handleConfirmDiscard = () => {
    if (!editTrip && draftStorageKey) {
      localStorage.removeItem(draftStorageKey);
    }
    setShowDiscardConfirm(false);
    onClose();
  };

  const handleSalePriceChange = () => {
    clearErrors('amount_paid');
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleRequestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const profitSign = profit >= 0 ? '+' : '';
  const profitColor = profit >= 0 ? 'text-emerald-300' : 'text-rose-300';
  const amountDueColor = amountDue > 0 ? 'text-rose-300' : 'text-emerald-300';
  const currentTripStatus = watch('status');
  const currentPaymentStatus = watch('payment_status');
  const isRtl = direction === 'rtl';
  const currentValues = watch();
  const totalRooms = Object.values(roomCounts).reduce<number>((sum, count) => sum + (Number(count) || 0), 0);
  const steps: Array<{ id: FormStep; label: string; icon: typeof FileText }> = [
    { id: 'details', label: t('trips.formSteps.details'), icon: FileText },
    { id: 'rooms', label: t('trips.formSteps.rooms'), icon: BedDouble },
    { id: 'financials', label: t('trips.formSteps.payment'), icon: CreditCard },
    { id: 'review', label: t('trips.formSteps.review'), icon: CheckCircle2 },
  ];
  const currentStepId = steps[activeStep]?.id || 'details';
  const stepFields: Record<FormStep, Array<keyof TripFormValues>> = {
    details: ['destination', 'client_name', 'travelers_count', 'status', 'start_date', 'end_date'],
    rooms: [],
    financials: ['currency', 'wholesale_cost', 'sale_price', 'amount_paid', 'payment_status'],
    review: [],
  };
  const fieldLabels: Partial<Record<keyof TripFormValues, string>> = {
    destination: t('trips.destination'),
    client_name: t('trips.clientName'),
    travelers_count: t('trips.travelersCount'),
    start_date: t('trips.startDate'),
    end_date: t('trips.endDate'),
    wholesale_cost: t('trips.wholesaleCost'),
    sale_price: t('trips.salePrice'),
    amount_paid: t('trips.amountPaid'),
    currency: t('trips.mainTripCurrency'),
    payment_status: t('trips.paymentStatus'),
  };
  const orderedValidationFields: Array<keyof TripFormValues> = [
    'destination',
    'client_name',
    'travelers_count',
    'start_date',
    'end_date',
    'wholesale_cost',
    'sale_price',
    'amount_paid',
  ];

  const scrollFormToTop = () => {
    document.getElementById('new-trip-form-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getStepForField = (field: keyof TripFormValues) => {
    const index = steps.findIndex((step) => stepFields[step.id].includes(field));
    return index >= 0 ? index : 0;
  };

  const handleInvalidSubmit = (invalidErrors: FieldErrors<TripFormValues>) => {
    const invalidFields = orderedValidationFields.filter((field) => invalidErrors[field]);
    const firstInvalid = invalidFields[0];

    setValidationSummary(
      invalidFields.map((field) => {
        const message = invalidErrors[field]?.message;
        const translatedMessage = translateValidationMessage(message);
        return `${fieldLabels[field] || field}: ${translatedMessage || t('trips.invalidField')}`;
      })
    );

    if (firstInvalid) {
      setActiveStep(getStepForField(firstInvalid));
      window.setTimeout(() => {
        scrollFormToTop();
        setFocus(firstInvalid);
      }, 0);
    }
  };

  const goToStep = (index: number) => {
    setActiveStep(index);
    setValidationSummary([]);
    window.setTimeout(scrollFormToTop, 0);
  };

  const handleContinue = () => {
    setActiveStep((step) => Math.min(step + 1, steps.length - 1));
    setValidationSummary([]);
    window.setTimeout(scrollFormToTop, 0);
  };

  const handleBack = () => {
    setActiveStep((step) => Math.max(step - 1, 0));
    setValidationSummary([]);
    window.setTimeout(scrollFormToTop, 0);
  };

  const notProvided = t('trips.notProvided');
  const getReviewValue = (value?: string | number | null) => {
    if (value === undefined || value === null || value === '') return notProvided;
    return String(value);
  };
  const requiredDetailsMissing = !currentValues.destination || !currentValues.client_name || !currentValues.start_date || !currentValues.end_date || !currentValues.travelers_count;
  const reviewItems = [
    { label: t('trips.clientName'), value: getReviewValue(currentValues.client_name), missing: !currentValues.client_name },
    { label: t('trips.destination'), value: getReviewValue(currentValues.destination), missing: !currentValues.destination },
    {
      label: t('trips.dateRange'),
      value: `${getReviewValue(currentValues.start_date)} - ${getReviewValue(currentValues.end_date)}`,
      missing: !currentValues.start_date || !currentValues.end_date,
    },
    { label: t('trips.travelersCount'), value: getReviewValue(currentValues.travelers_count as number), missing: !currentValues.travelers_count },
    { label: t('trips.roomConfiguration'), value: roomConfigPreview || notProvided, missing: false },
    { label: t('trips.boardBasis'), value: currentValues.board_basis || notProvided, missing: false },
    { label: t('trips.status'), value: t(`trips.statuses.${currentTripStatus}`), missing: false },
    { label: t('trips.paymentStatus'), value: t(`trips.paymentStatuses.${currentPaymentStatus}`), missing: false },
    { label: t('trips.salePrice'), value: `${saleCurrency} ${Number(isNaN(Number(salePrice)) ? 0 : Number(salePrice)).toFixed(2)}`, missing: false },
    { label: t('trips.amountPaid'), value: `${amountPaidCurrency} ${Number(isNaN(Number(amountPaid)) ? 0 : Number(amountPaid)).toFixed(2)}`, missing: false },
    { label: t('trips.amountDue'), value: `${currencySymbol}${amountDue.toFixed(2)}`, missing: false },
  ];


  const handleOpenAttachment = async (file: Trip['attachments'][number]) => {
    try {
      const url = await getTripAttachmentUrl(file);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open attachment:', error);
      toast.error(t('trips.attachmentOpenError'));
    }
  };

  const handleRemoveAttachment = async (index: number) => {
    const current = getValues('attachments') || [];
    const target = current[index];
    if (!target) return;

    setValue('attachments', current.filter((_, i) => i !== index));

    if (target.storage_path && target.bucket) {
      try {
        await removeTripAttachments([target]);
      } catch (error) {
        console.error('Failed to remove attachment from storage:', error);
        toast.error(t('trips.attachmentDeleteError'));
      }
    }
  };

  const baseInputClasses =
    'w-full text-slate-900 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80 transition-all shadow-sm ' +
    'dark:text-slate-100 dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-slate-950/70';

  const errorInputClasses = 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50';
  const labelClasses = 'block text-xs font-semibold tracking-wide text-slate-700 mb-2 dark:text-slate-300';

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-2 sm:p-4 animate-fadeIn" dir={direction}>
      <div className="relative max-w-6xl w-full h-[min(92vh,920px)] my-2 rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col dark:bg-slate-950/95 dark:border-slate-800/80 dark:shadow-[0_22px_65px_rgba(15,23,42,0.95)]">
        {/* gradient line top */}
        <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />

        {/* header */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5 border-b border-slate-200 bg-white/95 shrink-0 dark:border-slate-800/80 dark:bg-slate-950/95">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.25em] text-sky-600/80 dark:text-sky-300/80">
              {editTrip ? t('trips.edit') : t('trips.newTrip')}
            </span>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-50">
              {editTrip ? t('trips.edit') : t('trips.newTrip')}
            </h2>
            <p className="hidden sm:block text-sm text-slate-500 dark:text-slate-400">
              {editTrip
                ? t('trips.editTripSubtitle')
                : t('trips.newTripSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-2 rounded-full border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all dark:border-slate-700/80 dark:bg-slate-950/90 dark:hover:bg-slate-800/80 dark:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 shrink-0 overflow-x-auto dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="flex min-w-max items-center gap-2">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = activeStep === index;
            const isComplete = activeStep > index;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(index)}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap',
                  isActive
                    ? 'border-sky-400 bg-white text-sky-700 shadow-sm dark:bg-slate-950 dark:text-sky-300'
                    : isComplete
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-slate-200 bg-white/60 text-slate-500 hover:bg-white hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-950 dark:hover:text-slate-200',
                )}
              >
                <span className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px]',
                  isComplete ? 'bg-emerald-500 text-white' : isActive ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800',
                )}>
                  {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <Icon className="w-4 h-4" />
                {step.label}
              </button>
            );
          })}
          </div>
        </div>

        {/* form content */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (currentStepId === 'review') {
              void handleSubmit(onSubmit, handleInvalidSubmit)(event);
            } else {
              handleContinue();
            }
          }}
          className="flex flex-col flex-grow overflow-hidden"
        >
          <div id="new-trip-form-content" className="flex-grow overflow-y-auto px-4 py-4 md:px-6 md:py-5 space-y-5">
            {validationSummary.length > 0 && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100" role="alert">
                <p className="text-sm font-bold">{t('trips.validationSummaryTitle')}</p>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
                  {validationSummary.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* DETAILS TAB */}
            {currentStepId === 'details' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-fadeIn">
                <div className="xl:col-span-2">
                  <label className={labelClasses}>{t('trips.destination')} *</label>
                  <input
                    type="text"
                    {...register('destination')}
                    className={cn(baseInputClasses, errors.destination && errorInputClasses)}
                    placeholder={t('trips.destinationPlaceholder')}
                  />
                  {errors.destination && (
                    <p className="text-xs text-rose-400 mt-1">
                      {translateValidationMessage(errors.destination.message)}
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
                    placeholder={t('trips.clientNamePlaceholder')}
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
                      {translateValidationMessage(errors.client_name.message)}
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
                  <p className="mt-1 text-xs text-slate-400">
                    {t('trips.clientPhoneHelper')}
                  </p>
                </div>

                <div>
                  <label className={labelClasses}>{t('trips.status')} *</label>
                  <select {...register('status')} className={baseInputClasses}>
                    <option value="active">{t('trips.statuses.active')}</option>
                    <option value="completed">{t('trips.statuses.completed')}</option>
                    <option value="cancelled">{t('trips.statuses.cancelled')}</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    {getTripStatusDescription(currentTripStatus, t)}
                  </p>
                </div>

                <div>
                  <label className={labelClasses}>{t('trips.travelersCount')}</label>
                   <input
                    type="number"
                    min={1}
                    placeholder="1"
                    {...register('travelers_count', { valueAsNumber: true })}
                    className={cn(baseInputClasses, errors.travelers_count && errorInputClasses)}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    {t('trips.travelersCountHelper')}
                  </p>
                  {errors.travelers_count && (
                    <p className="text-xs text-rose-400 mt-1">
                      {translateValidationMessage(errors.travelers_count.message)}
                    </p>
                  )}
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
                      {translateValidationMessage(errors.start_date.message)}
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
                      {translateValidationMessage(errors.end_date.message)}
                    </p>
                  )}
                </div>
              </div>
            )}


            {currentStepId === 'rooms' && (
              <div className="space-y-5 animate-fadeIn">
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                        {t('trips.roomConfiguration')}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t('trips.roomConfigurationHelper')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300">
                        {t('trips.roomTotal', { count: totalRooms })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRoomCounts({ Single: 0, Double: 0, Triple: 0, Quad: 0, Suite: 0, Family: 0 })}
                        className="text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
                      >
                        {t('trips.resetCounts')}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {(Object.keys(roomCounts) as RoomType[]).map((type) => (
                      <label key={type} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/80">
                        <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {t(`trips.roomTypes.${type}`)}
                        </span>
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={roomCounts[type]}
                          onChange={(e) => {
                            const rawVal = e.target.value;
                            if (rawVal === '') {
                              setRoomCounts(prev => ({ ...prev, [type]: '' }));
                              return;
                            }
                            const val = parseInt(rawVal);
                            setRoomCounts(prev => ({ ...prev, [type]: isNaN(val) || val < 0 ? 0 : val }));
                          }}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-4">
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 block dark:text-slate-400">
                      {t('trips.finalText')}
                    </label>
                    <input
                      type="text"
                      value={roomConfigPreview}
                      readOnly
                      className={cn(baseInputClasses, 'text-xs py-2 bg-white dark:bg-slate-950/80')}
                      placeholder={t('trips.roomConfigurationPlaceholder')}
                    />
                  </div>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

                  <div className="lg:col-span-2">
                    <label className={labelClasses}>{t('trips.description')}</label>
                    <textarea
                      {...register('notes')}
                      className={cn(baseInputClasses, 'min-h-[88px] resize-y')}
                      placeholder={t('trips.descriptionPlaceholder')}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      {t('trips.descriptionHelper')}
                    </p>
                  </div>
                </section>

                <section className="space-y-2">
                  <label className={labelClasses}>{t('trips.attachments')}</label>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      {watch('attachments')?.length ? (
                        watch('attachments')?.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="w-4 h-4 text-sky-500 shrink-0" />
                              <button
                                type="button"
                                onClick={() => handleOpenAttachment(file)}
                                aria-label={t('trips.openAttachment', { fileName: file.file_name })}
                                className="text-sm text-slate-600 truncate underline dark:text-slate-300"
                              >
                                {file.file_name}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleRemoveAttachment(idx)}
                              aria-label={t('trips.removeAttachment', { fileName: file.file_name })}
                              className="p-1 hover:bg-rose-100 text-rose-500 rounded-full transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-800">
                          {t('trips.emptyStates.noAttachmentsInTrip')}
                        </div>
                      )}
                    </div>

                    <div>
                      <FileUpload
                        folderName={user?.id || 'anonymous'}
                        isPrivate
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
                </section>
              </div>
            )}

            {/* FINANCIALS TAB */}
            {currentStepId === 'financials' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className={labelClasses}>{t('trips.mainTripCurrency')}</label>
                    <select {...register('currency')} className={baseInputClasses}>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="ILS">ILS (₪)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                        {t('trips.mainTripCurrencyHelper')}
                    </p>
                  </div>
                  
                  <input type="hidden" {...register('exchange_rate', { valueAsNumber: true })} />
                  <input type="hidden" {...register('payment_status')} />

                  <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:col-span-2 gap-5">
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
                               min={0}
                               placeholder="0.00"
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
                               min={0}
                               placeholder="0.00"
                               {...register('sale_price', { valueAsNumber: true })}
                               onChange={(e) => {
                                 register('sale_price', { valueAsNumber: true }).onChange(e);
                                 handleSalePriceChange();
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
                        {t('trips.convertedProfit', { currency })}
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
                                min={0}
                                placeholder="0.00"
                                {...register('amount_paid', { valueAsNumber: true })}
                                onChange={(e) => {
                                    register('amount_paid', { valueAsNumber: true }).onChange(e);
                                    const val = parseFloat(e.target.value);
                                    const finalVal = isNaN(val) ? 0 : val;
                                    
                                    const saleVal = isNaN(Number(salePrice)) ? 0 : Number(salePrice);
                                    const sPrice = convert(saleVal, saleCurrency, currency || 'USD');
                                    const paidInMain = convert(finalVal, amountPaidCurrency, currency || 'USD');
                                    if (paidInMain <= sPrice + 0.01) {
                                      clearErrors('amount_paid');
                                    }
                                }}
                                className={cn(
                                    baseInputClasses,
                                    errors.amount_paid && errorInputClasses,
                                )}
                            />
                        </div>
                        {errors.amount_paid && (
                            <p className="text-xs text-rose-400 mt-1">
                                {translateValidationMessage(errors.amount_paid.message)}
                            </p>
                        )}
                        <p className="mt-1 text-xs text-slate-400">
                          {getPaymentStatusDescription(currentPaymentStatus, t)}
                        </p>
                    </div>
                    <div>
                        <label className={labelClasses}>
                            {t('trips.paymentDate')}
                        </label>
                        <input
                            type="date"
                            {...register('payment_date')}
                            className={cn(baseInputClasses)}
                        />
                    </div>
                </div>

                <div
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/90"
                  aria-label={t('trips.calculatedPaymentStatus')}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {t('trips.calculatedPaymentStatus')}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {getPaymentStatusDescription(currentPaymentStatus, t)}
                      </p>
                    </div>
                    <span className="inline-flex w-fit rounded-full border border-sky-200 bg-white px-3 py-1 text-sm font-bold text-sky-700 dark:border-sky-500/30 dark:bg-slate-900 dark:text-sky-300">
                      {t(`trips.paymentStatuses.${currentPaymentStatus}`)}
                    </span>
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

            {currentStepId === 'review' && (
              <div className="space-y-5 animate-fadeIn">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                    {t('trips.reviewTitle')}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {t('trips.reviewSubtitle')}
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    { title: t('trips.formSteps.details'), step: 0, items: reviewItems.slice(0, 4), incomplete: requiredDetailsMissing },
                    { title: t('trips.formSteps.rooms'), step: 1, items: reviewItems.slice(4, 6) },
                    { title: t('trips.formSteps.payment'), step: 2, items: reviewItems.slice(7) },
                    { title: t('trips.status'), step: 0, items: [reviewItems[6]] },
                  ].map((section) => (
                    <section
                      key={section.title}
                      className={cn(
                        'rounded-2xl border bg-white p-4 dark:bg-slate-950/80',
                        section.incomplete
                          ? 'border-amber-300 dark:border-amber-500/40'
                          : 'border-slate-200 dark:border-slate-800',
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">{section.title}</h4>
                          {section.incomplete && (
                            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-300">
                              {t('trips.incompleteSection')}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => goToStep(section.step)}
                          className="text-xs font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400"
                        >
                          {t('trips.editSection')}
                        </button>
                      </div>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {section.items.map((item) => (
                          <div key={item.label}>
                            <dt className="text-[11px] font-semibold uppercase text-slate-400">{item.label}</dt>
                            <dd className={cn(
                              'mt-0.5 break-words text-sm font-medium',
                              item.missing ? 'text-amber-600 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100',
                            )}>{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={cn(
            'flex-shrink-0 flex flex-col-reverse sm:flex-row sm:items-center gap-3 px-4 py-3 md:px-6 border-t border-slate-200 bg-white/95 shrink-0 dark:border-slate-800/80 dark:bg-slate-950/95',
            isRtl ? 'sm:justify-start' : 'sm:justify-end',
          )}>
            <button
              type="button"
              onClick={handleRequestClose}
              className="inline-flex w-full sm:w-auto items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-all dark:border-slate-600/80 dark:text-slate-200 dark:bg-slate-950/90 dark:hover:bg-slate-900/90"
            >
              {t('trips.cancel')}
            </button>
            {activeStep > 0 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-60 transition-all dark:border-slate-600/80 dark:text-slate-200 dark:bg-slate-950/90 dark:hover:bg-slate-900/90"
              >
                {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                {t('trips.back')}
              </button>
            )}
            {currentStepId !== 'review' ? (
              <button
                type="button"
                onClick={handleContinue}
                disabled={loading}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 border border-sky-500 shadow-[0_10px_30px_rgba(56,189,248,0.35)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                <span>{t('trips.continue')}</span>
                {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit(onSubmit, handleInvalidSubmit)}
                disabled={loading}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 border border-sky-400/80 shadow-[0_10px_30px_rgba(56,189,248,0.55)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                <Save className="w-4 h-4" />
                <span>{loading ? t('auth.loading') : t('trips.save')}</span>
              </button>
            )}
          </div>
        </form>
      </div>
      <ConfirmationModal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={handleConfirmDiscard}
        title={t('trips.discardChangesTitle')}
        description={
          editTrip
            ? t('trips.discardChangesDescription')
            : t('trips.discardDraftDescription')
        }
        confirmText={t('trips.discardChanges')}
        cancelText={t('trips.keepEditing')}
        variant="warning"
      />
    </div>
  );
}
