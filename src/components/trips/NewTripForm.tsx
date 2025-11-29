import { useEffect, useState } from 'react';
import { X, Save, Plus, Trash2, Calendar, User, CreditCard, FileText } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Trip, TripFormData } from '../../types/trip';
import { tripSchema } from '../../lib/schemas';
import { cn } from '../../lib/utils';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useDebounce } from '../../hooks/useDebounce';

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
  const { profile: _profile } = useAuth(); // avoid unused variable warning
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('details');

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
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
      currency: (editTrip?.currency as TripFormValues['currency']) || 'USD',
      exchange_rate: editTrip?.exchange_rate || 1,
      wholesale_cost: editTrip?.wholesale_cost || 0,
      sale_price: editTrip?.sale_price || 0,
      payments: editTrip?.payments || [],
      payment_status:
        (editTrip?.payment_status as TripFormValues['payment_status']) || 'unpaid',
      amount_paid: editTrip?.amount_paid || 0,
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
              setValue(key as any, parsed[key]);
            });
            toast.info(t('trips.draftRestored', 'Draft restored'));
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
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Deduplicate by client_name
      const unique = new Map();
      data?.forEach((item: any) => {
        if (item.client_name && !unique.has(item.client_name)) {
          unique.set(item.client_name, item);
        }
      });
      return Array.from(unique.values());
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { fields: travelerFields, append: appendTraveler, remove: removeTraveler } =
    useFieldArray({
      control,
      name: 'travelers',
    });

  const { fields: itineraryFields, append: appendItinerary, remove: removeItinerary } =
    useFieldArray({
      control,
      name: 'itinerary',
    });

  const { fields: paymentFields, append: appendPayment, remove: removePayment } =
    useFieldArray({
      control,
      name: 'payments',
    });

  const wholesaleCost = watch('wholesale_cost');
  const salePrice = watch('sale_price');
  const amountPaid = watch('amount_paid');
  const currency = watch('currency');

  const [profit, setProfit] = useState(0);
  const [profitPercentage, setProfitPercentage] = useState(0);
  const [amountDue, setAmountDue] = useState(0);

  useEffect(() => {
    const calculatedProfit = (salePrice || 0) - (wholesaleCost || 0);
    const calculatedPercentage =
      wholesaleCost > 0 ? (calculatedProfit / wholesaleCost) * 100 : 0;
    setProfit(calculatedProfit);
    setProfitPercentage(calculatedPercentage);
  }, [wholesaleCost, salePrice]);

  useEffect(() => {
    const due = (salePrice || 0) - (amountPaid || 0);
    setAmountDue(due >= 0 ? due : 0);
  }, [salePrice, amountPaid]);

  // Sync payment status with amount paid
  const syncPaymentStatusWithAmount = (paid: number, price: number) => {
    if (paid <= 0) {
      setValue('payment_status', 'unpaid');
    } else if (paid < price) {
      setValue('payment_status', 'partial');
    } else {
      setValue('payment_status', 'paid');
    }
  };

  const getCurrencySymbol = (curr: string) => {
    switch (curr) {
      case 'USD':
        return '$';
      case 'EUR':
        return '€';
      case 'ILS':
        return '₪';
      default:
        return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(currency || 'USD');

  const onSubmit = async (data: TripFormValues) => {
    setLoading(true);
    try {
      // Auto-update travelers count
      data.travelers_count = data.travelers.length || data.travelers_count;

      // Auto-calculate amount paid from payments array if used
      if (data.payments && data.payments.length > 0) {
        data.amount_paid = data.payments.reduce((sum, p) => sum + p.amount, 0);
      }

      await onSave(data as TripFormData);

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
    let value = parseFloat(e.target.value);
    if (isNaN(value) || value < 0) value = 0;
    setValue('sale_price', value);
    const paid = amountPaid || 0;
    if (paid > value) {
      setValue('amount_paid', value);
      syncPaymentStatusWithAmount(value, value);
    } else {
      syncPaymentStatusWithAmount(paid, value);
    }
  };

  const profitSign = profit >= 0 ? '+' : '';
  const profitColor = profit >= 0 ? 'text-emerald-300' : 'text-rose-300';
  const amountDueColor = amountDue > 0 ? 'text-rose-300' : 'text-emerald-300';

  const baseInputClasses =
    'w-full text-slate-100 placeholder-slate-400 bg-slate-950/90 border border-slate-800/80 rounded-xl px-3 py-2.5 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80 transition-all shadow-sm shadow-slate-950/70';

  const errorInputClasses = 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50';
  const labelClasses = 'block text-xs font-semibold tracking-wide text-slate-300 mb-2';

  const tabs = [
    { id: 'details', label: t('trips.details') || 'Details', icon: FileText },
    { id: 'travelers', label: t('trips.travelers') || 'Travelers', icon: User },
    { id: 'itinerary', label: t('trips.itinerary') || 'Itinerary', icon: Calendar },
    { id: 'financials', label: t('trips.financials') || 'Financials', icon: CreditCard },
  ] as const;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="relative max-w-4xl w-full max-h-[90vh] my-6 rounded-2xl bg-slate-950/95 border border-slate-800/80 shadow-[0_22px_65px_rgba(15,23,42,0.95)] overflow-hidden flex flex-col">
        {/* gradient line top */}
        <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-950/95 shrink-0">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.25em] text-sky-300/80">
              {editTrip ? t('trips.edit') : t('trips.newTrip')}
            </span>
            <h2 className="text-lg md:text-xl font-bold text-slate-50">
              {editTrip ? t('trips.edit') : t('trips.newTrip')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full border border-slate-700/80 bg-slate-950/90 hover:bg-slate-800/80 text-slate-300 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800/80 bg-slate-900/50 shrink-0 overflow-x-auto">
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
                    ? 'border-sky-500 text-sky-400 bg-slate-800/50'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30',
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
                    {distinctClients.map((c: any, i: number) => (
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
                  <label className={labelClasses}>{t('trips.status')} *</label>
                  <select {...register('status')} className={baseInputClasses}>
                    <option value="active">{t('trips.statuses.active')}</option>
                    <option value="completed">{t('trips.statuses.completed')}</option>
                    <option value="cancelled">{t('trips.statuses.cancelled')}</option>
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
                  <label className={labelClasses}>{t('trips.notes')}</label>
                  <textarea
                    {...register('notes')}
                    rows={4}
                    className={cn(baseInputClasses, 'resize-none')}
                    placeholder={t('trips.notes') || 'Add notes...'}
                  />
                </div>
              </div>
            )}

            {/* TRAVELERS TAB */}
            {activeTab === 'travelers' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-200">Travelers List</h3>
                  <button
                    type="button"
                    onClick={() =>
                      appendTraveler({
                        full_name: '',
                        passport_number: '',
                        nationality: '',
                        room_type: 'double',
                      })
                    }
                    className="text-xs flex items-center gap-1 bg-sky-500/10 text-sky-400 px-3 py-1.5 rounded-lg border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Traveler
                  </button>
                </div>

                {travelerFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 relative group"
                  >
                    <button
                      type="button"
                      onClick={() => removeTraveler(index)}
                      className="absolute top-2 right-2 p-1.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClasses}>Full Name</label>
                        <input
                          {...register(`travelers.${index}.full_name` as const)}
                          placeholder="Full Name"
                          className={baseInputClasses}
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>Passport Number</label>
                        <input
                          {...register(`travelers.${index}.passport_number` as const)}
                          placeholder="Passport Number"
                          className={baseInputClasses}
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>Nationality</label>
                        <input
                          {...register(`travelers.${index}.nationality` as const)}
                          placeholder="Nationality"
                          className={baseInputClasses}
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>Room Type</label>
                        <select
                          {...register(`travelers.${index}.room_type` as const)}
                          className={baseInputClasses}
                        >
                          <option value="single">Single</option>
                          <option value="double">Double</option>
                          <option value="triple">Triple</option>
                          <option value="suite">Suite</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                {travelerFields.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                    No travelers added yet.
                  </div>
                )}
              </div>
            )}

            {/* ITINERARY TAB */}
            {activeTab === 'itinerary' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-200">Itinerary</h3>
                  <button
                    type="button"
                    onClick={() =>
                      appendItinerary({
                        day: itineraryFields.length + 1,
                        title: '',
                        description: '',
                      })
                    }
                    className="text-xs flex items-center gap-1 bg-sky-500/10 text-sky-400 px-3 py-1.5 rounded-lg border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Day
                  </button>
                </div>

                {itineraryFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 relative group"
                  >
                    <button
                      type="button"
                      onClick={() => removeItinerary(index)}
                      className="absolute top-2 right-2 p-1.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="flex gap-4 items-start">
                      <div className="w-16 shrink-0">
                        <label className={labelClasses}>Day</label>
                        <input
                          type="number"
                          {...register(`itinerary.${index}.day` as const, {
                            valueAsNumber: true,
                          })}
                          className={baseInputClasses}
                        />
                      </div>
                      <div className="flex-grow space-y-3">
                        <div>
                          <label className={labelClasses}>Title</label>
                          <input
                            {...register(`itinerary.${index}.title` as const)}
                            placeholder="e.g. Arrival & City Tour"
                            className={baseInputClasses}
                          />
                        </div>
                        <div>
                          <label className={labelClasses}>Description</label>
                          <textarea
                            {...register(`itinerary.${index}.description` as const)}
                            rows={2}
                            placeholder="Detailed activities..."
                            className={cn(baseInputClasses, 'resize-none')}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* FINANCIALS TAB */}
            {activeTab === 'financials' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className={labelClasses}>Currency</label>
                    <select {...register('currency')} className={baseInputClasses}>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="ILS">ILS (₪)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClasses}>Exchange Rate</label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('exchange_rate', { valueAsNumber: true })}
                      className={baseInputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>
                      {t('trips.wholesaleCost')} ({currencySymbol})
                    </label>
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
                  <div>
                    <label className={labelClasses}>
                      {t('trips.salePrice')} ({currencySymbol})
                    </label>
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

                {/* Profit Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 shadow-inner shadow-slate-950/80">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-400 mb-1 font-medium">
                        {t('trips.profit')}
                      </p>
                      <p className={`text-2xl font-bold ${profitColor}`}>
                        {profitSign}
                        {currencySymbol}
                        {Math.abs(profit).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400 mb-1 font-medium">
                        {t('trips.profitPercentage')}
                      </p>
                      <p className={`text-2xl font-bold ${profitColor}`}>
                        {profitSign}
                        {profitPercentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payments Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-slate-200">Payments</h3>
                    <button
                      type="button"
                      onClick={() =>
                        appendPayment({
                          date: new Date().toISOString().split('T')[0],
                          amount: 0,
                          method: 'transfer',
                        })
                      }
                      className="text-xs flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Payment
                    </button>
                  </div>

                  {paymentFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-12 gap-3 items-end p-3 rounded-xl bg-slate-900/30 border border-slate-800/50"
                    >
                      <div className="col-span-4">
                        <label className={labelClasses}>Date</label>
                        <input
                          type="date"
                          {...register(`payments.${index}.date` as const)}
                          className={baseInputClasses}
                        />
                      </div>
                      <div className="col-span-3">
                        <label className={labelClasses}>Amount</label>
                        <input
                          type="number"
                          {...register(`payments.${index}.amount` as const, {
                            valueAsNumber: true,
                          })}
                          className={baseInputClasses}
                        />
                      </div>
                      <div className="col-span-4">
                        <label className={labelClasses}>Method</label>
                        <select
                          {...register(`payments.${index}.method` as const)}
                          className={baseInputClasses}
                        >
                          <option value="cash">Cash</option>
                          <option value="transfer">Transfer</option>
                          <option value="card">Card</option>
                          <option value="check">Check</option>
                        </select>
                      </div>
                      <div className="col-span-1 flex justify-center pb-2">
                        <button
                          type="button"
                          onClick={() => removePayment(index)}
                          className="text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Amount Due */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-400">
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
          <div className="flex-shrink-0 flex items-center justify-end gap-3 px-5 py-4 md:px-6 border-t border-slate-800/80 bg-slate-950/95 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-600/80 text-slate-200 bg-slate-950/90 hover:bg-slate-900/90 transition-all"
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
