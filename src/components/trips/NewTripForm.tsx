import { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Trip, TripFormData } from '../../types/trip';
import { tripSchema, TripSchemaType } from '../../lib/schemas';

interface NewTripFormProps {
  onClose: () => void;
  onSave: (data: TripFormData) => Promise<void>;
  editTrip?: Trip;
}

export default function NewTripForm({ onClose, onSave, editTrip }: NewTripFormProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TripSchemaType>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      destination: editTrip?.destination || '',
      client_name: editTrip?.client_name || '',
      travelers_count: editTrip?.travelers_count || 1,
      start_date: editTrip?.start_date || '',
      end_date: editTrip?.end_date || '',
      wholesale_cost: editTrip?.wholesale_cost || 0,
      sale_price: editTrip?.sale_price || 0,
      payment_status: (editTrip?.payment_status as 'paid' | 'partial' | 'unpaid') || 'unpaid',
      amount_paid: editTrip?.amount_paid || 0,
      notes: editTrip?.notes || '',
      status: (editTrip?.status as 'active' | 'completed' | 'cancelled') || 'active',
    },
  });

  const wholesaleCost = watch('wholesale_cost');
  const salePrice = watch('sale_price');
  const amountPaid = watch('amount_paid');

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

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
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

  const currencySymbol = getCurrencySymbol(profile?.preferred_currency || 'USD');

  const onSubmit = async (data: TripSchemaType) => {
    setLoading(true);
    try {
      await onSave(data);
      onClose();
    } catch (error) {
      console.error('Failed to save trip:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountPaidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseFloat(e.target.value);
    if (isNaN(value) || value < 0) value = 0;
    if (value > salePrice) value = salePrice;

    setValue('amount_paid', value);
    syncPaymentStatusWithAmount(value, salePrice);
  };

  const handleSalePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseFloat(e.target.value);
    if (isNaN(value) || value < 0) value = 0;

    setValue('sale_price', value);

    if (amountPaid > value) {
      setValue('amount_paid', value);
      syncPaymentStatusWithAmount(value, value);
    } else {
      syncPaymentStatusWithAmount(amountPaid, value);
    }
  };

  const profitSign = profit >= 0 ? '+' : '';
  const profitColor = profit >= 0 ? 'text-emerald-300' : 'text-rose-300';
  const amountDueColor = amountDue > 0 ? 'text-rose-300' : 'text-emerald-300';

  const baseInputClasses =
    'w-full text-slate-100 placeholder-slate-400 bg-slate-950/90 border border-slate-800/80 rounded-xl px-3 py-2.5 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80 transition-all shadow-sm shadow-slate-950/70';

  const errorInputClasses = 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50';

  const labelClasses =
    'block text-xs font-semibold tracking-wide text-slate-300 mb-2';

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="relative max-w-3xl w-full max-h-[90vh] my-6 rounded-2xl bg-slate-950/95 border border-slate-800/80 shadow-[0_22px_65px_rgba(15,23,42,0.95)] overflow-hidden">
        {/* gradient line top */}
        <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-950/95">
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

        {/* form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-grow">
          <div className="flex-grow px-5 py-4 md:px-6 md:py-5 space-y-5 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClasses}>
                  {t('trips.destination')} *
                </label>
                <input
                  type="text"
                  {...register('destination')}
                  className={`${baseInputClasses} ${errors.destination ? errorInputClasses : ''}`}
                />
                {errors.destination && (
                  <p className="text-xs text-rose-400 mt-1">{errors.destination.message}</p>
                )}
              </div>

              <div>
                <label className={labelClasses}>
                  {t('trips.clientName')} *
                </label>
                <input
                  type="text"
                  {...register('client_name')}
                  className={`${baseInputClasses} ${errors.client_name ? errorInputClasses : ''}`}
                />
                {errors.client_name && (
                  <p className="text-xs text-rose-400 mt-1">{errors.client_name.message}</p>
                )}
              </div>

              <div>
                <label className={labelClasses}>
                  {t('trips.travelersCount')} *
                </label>
                <input
                  type="number"
                  min="1"
                  {...register('travelers_count', { valueAsNumber: true })}
                  className={`${baseInputClasses} ${errors.travelers_count ? errorInputClasses : ''}`}
                />
                {errors.travelers_count && (
                  <p className="text-xs text-rose-400 mt-1">{errors.travelers_count.message}</p>
                )}
              </div>

              <div>
                <label className={labelClasses}>
                  {t('trips.status')} *
                </label>
                <select
                  {...register('status')}
                  className={baseInputClasses}
                >
                  <option value="active">{t('trips.statuses.active')}</option>
                  <option value="completed">{t('trips.statuses.completed')}</option>
                  <option value="cancelled">{t('trips.statuses.cancelled')}</option>
                </select>
              </div>

              <div>
                <label className={labelClasses}>
                  {t('trips.startDate')} *
                </label>
                <input
                  type="date"
                  {...register('start_date')}
                  className={`${baseInputClasses} ${errors.start_date ? errorInputClasses : ''}`}
                />
                {errors.start_date && (
                  <p className="text-xs text-rose-400 mt-1">{errors.start_date.message}</p>
                )}
              </div>

              <div>
                <label className={labelClasses}>
                  {t('trips.endDate')} *
                </label>
                <input
                  type="date"
                  {...register('end_date')}
                  className={`${baseInputClasses} ${errors.end_date ? errorInputClasses : ''}`}
                />
                {errors.end_date && (
                  <p className="text-xs text-rose-400 mt-1">{errors.end_date.message}</p>
                )}
              </div>

              <div>
                <label className={labelClasses}>
                  {t('trips.wholesaleCost')} ({currencySymbol}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('wholesale_cost', { valueAsNumber: true })}
                  className={`${baseInputClasses} ${errors.wholesale_cost ? errorInputClasses : ''}`}
                />
                {errors.wholesale_cost && (
                  <p className="text-xs text-rose-400 mt-1">{errors.wholesale_cost.message}</p>
                )}
              </div>

              <div>
                <label className={labelClasses}>
                  {t('trips.salePrice')} ({currencySymbol}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('sale_price', { valueAsNumber: true })}
                  onChange={(e) => {
                    register('sale_price', { valueAsNumber: true }).onChange(e);
                    handleSalePriceChange(e);
                  }}
                  className={`${baseInputClasses} ${errors.sale_price ? errorInputClasses : ''}`}
                />
                {errors.sale_price && (
                  <p className="text-xs text-rose-400 mt-1">{errors.sale_price.message}</p>
                )}
              </div>
            </div>

            {/* profit card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 md:px-5 md:py-4 shadow-inner shadow-slate-950/80">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClasses}>
                  {t('trips.paymentStatus')} *
                </label>
                <select
                  {...register('payment_status')}
                  className={baseInputClasses}
                >
                  <option value="unpaid">
                    {t('trips.paymentStatuses.unpaid')}
                  </option>
                  <option value="partial">
                    {t('trips.paymentStatuses.partial')}
                  </option>
                  <option value="paid">
                    {t('trips.paymentStatuses.paid')}
                  </option>
                </select>
              </div>

              <div>
                <label className={labelClasses}>
                  {t('trips.amountPaid')} ({currencySymbol}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={salePrice}
                  {...register('amount_paid', { valueAsNumber: true })}
                  onChange={(e) => {
                    register('amount_paid', { valueAsNumber: true }).onChange(e);
                    handleAmountPaidChange(e);
                  }}
                  className={`${baseInputClasses} ${errors.amount_paid ? errorInputClasses : ''}`}
                />
                {errors.amount_paid && (
                  <p className="text-xs text-rose-400 mt-1">{errors.amount_paid.message}</p>
                )}
              </div>
            </div>

            {/* amount due */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 md:px-5 md:py-4">
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

            {/* notes */}
            <div>
              <label className={labelClasses}>{t('trips.notes')}</label>
              <textarea
                {...register('notes')}
                rows={3}
                className={`${baseInputClasses} resize-none`}
                placeholder={t('trips.notes') || 'Add notes...'}
              />
            </div>
          </div>

          {/* footer buttons */}
          <div className="flex-shrink-0 flex items-center justify-end gap-3 px-5 py-4 md:px-6 border-t border-slate-800/80 bg-slate-950/95">
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
