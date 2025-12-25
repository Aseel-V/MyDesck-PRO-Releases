import { useState } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip, Payment } from '../../types/trip';

interface UpdatePaymentFormProps {
  trip: Trip;
  onClose: () => void;
  onUpdate: (
    tripId: string,
    amountPaid: number,
    paymentStatus: 'paid' | 'partial' | 'unpaid',
    payments?: Payment[]
  ) => Promise<void>;
}

export default function UpdatePaymentForm({
  trip,
  onClose,
  onUpdate,
}: UpdatePaymentFormProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { convert } = useCurrency();
  const tripCurrency = trip.currency || profile?.preferred_currency || 'USD';
  
  // State for NEW payment
  const [inputCurrency, setInputCurrency] = useState<string>(tripCurrency);
  const [amountToAdd, setAmountToAdd] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card' | 'check'>('transfer');

  const [loading, setLoading] = useState(false);

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'ILS': return '₪';
      default: return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(tripCurrency);
  const totalSalePrice = trip.sale_price || 0;
  
  // Calculate current status (including unsaved new payment for preview?)
  // No, let's keep it simple: Show current state, then add new payment.
  const currentPaid = trip.amount_paid || 0;
  const currentDue = Math.max(0, totalSalePrice - currentPaid);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (amountToAdd <= 0) return;

    setLoading(true);
    try {
      // 1. Create new payment object
      // 1. Convert amount to Trip Currency
      const amountInTripCurrency = convert(amountToAdd, inputCurrency, tripCurrency);

      // 2. Create new payment object
      const newPayment: Payment = {
        date: paymentDate,
        amount: parseFloat(amountInTripCurrency.toFixed(2)),
        method: paymentMethod,
      };

      // 2. Append to existing payments
      // Ensure existing payments is an array (handle legacy nulls)
      const existingPayments = Array.isArray(trip.payments) ? trip.payments : [];
      const updatedPayments = [...existingPayments, newPayment];

      // 3. Recalculate total
      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      // 4. Determine status
      let newStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
      if (newTotalPaid >= totalSalePrice && totalSalePrice > 0) {
        newStatus = 'paid';
      } else if (newTotalPaid > 0) {
        newStatus = 'partial';
      }

      // 5. Submit
      await onUpdate(trip.id, newTotalPaid, newStatus, updatedPayments);
      onClose();
    } catch (error) {
      console.error('Failed to update payment:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-emerald-500/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-40 -left-32 w-80 h-80 bg-sky-500/15 blur-3xl rounded-full" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="glass-panel bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl animate-scaleIn overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-xl font-bold text-slate-50">
                {t('trips.updatePayment')}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {trip.destination} • {trip.client_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800/80 text-slate-300 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
            {/* Summary Card */}
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 space-y-3">
               <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">{t('trips.amountPaid')}</span>
                  <span className="text-lg font-semibold text-emerald-300">
                    {currencySymbol}{currentPaid.toFixed(2)}
                  </span>
               </div>
               <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">{t('trips.amountDue')}</span>
                  <span className="text-lg font-semibold text-rose-300">
                    {currencySymbol}{currentDue.toFixed(2)}
                  </span>
               </div>
               <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                 <div 
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (currentPaid / (totalSalePrice || 1)) * 100)}%` }}
                 />
               </div>
            </div>

            {/* Add New Payment Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Add New Payment
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Amount
                  </label>
                  <div className="flex gap-2">
                      <select
                        value={inputCurrency}
                        onChange={(e) => setInputCurrency(e.target.value)}
                         className="w-24 bg-slate-950/50 border border-slate-700 rounded-lg px-2 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none text-slate-100"
                      >
                         <option value="USD">USD</option>
                         <option value="EUR">EUR</option>
                         <option value="ILS">ILS</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={amountToAdd || ''}
                        onChange={(e) => setAmountToAdd(parseFloat(e.target.value) || 0)}
                        className="flex-1 px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-700 text-slate-100 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-all"
                        placeholder="0.00"
                        autoFocus
                      />
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-700 text-slate-100 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                  />
                </div>

                <div>
                   <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-700 text-slate-100 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                  >
                    <option value="transfer">Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="check">Check</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Total Preview */}
             {amountToAdd > 0 && (
                <div className="py-2 flex justify-between items-center text-sm border-t border-slate-800/50">
                  <span className="text-slate-400">New Total Will Be:</span>
                  <span className="font-bold text-emerald-400">
                    {currencySymbol}
                    {(currentPaid + convert(amountToAdd, inputCurrency, tripCurrency)).toFixed(2)}
                  </span>
                </div>
             )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all text-sm font-medium"
              >
                {t('trips.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading || amountToAdd <= 0}
                className="flex-[2] py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {loading ? t('auth.loading') : 'Add Payment'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
