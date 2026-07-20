import { useState, useEffect } from 'react';
import { Percent, DollarSign, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface DiscountModalProps {
  onClose: () => void;
  onConfirm: (type: 'percent' | 'amount', value: number, reason: string) => void;
  currentTotal: number;
}

export function DiscountModal({ onClose, onConfirm, currentTotal }: DiscountModalProps) {
  const { t } = useLanguage();
  const [type, setType] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState<string>('');
  const [reason, setReason] = useState<string>(t('orderModal.discountModal.reasons.comp'));

  useEffect(() => {
    setReason(t('orderModal.discountModal.reasons.comp'));
  }, [t]);

  const handleSubmit = () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return;
    
    // Simple validation
    if (type === 'percent' && numValue > 100) return;
    if (type === 'amount' && numValue > currentTotal) return;

    onConfirm(type, numValue, reason);
  };

  const calculatedDiscount = type === 'percent' 
    ? (currentTotal * (parseFloat(value) || 0)) / 100 
    : (parseFloat(value) || 0);

  const newTotal = Math.max(0, currentTotal - calculatedDiscount);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800">
        
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-lg dark:text-white">{t('orderModal.discountModal.title')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Type Selector */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => { setType('percent'); setValue(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                type === 'percent' 
                  ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Percent size={16} /> {t('orderModal.discountModal.percentage')}
            </button>
            <button
              onClick={() => { setType('amount'); setValue(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                type === 'amount' 
                  ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <DollarSign size={16} /> {t('orderModal.discountModal.fixedAmount')}
            </button>
          </div>

          {/* Value Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {type === 'percent' ? `${t('orderModal.discountModal.percentage')} (%)` : `${t('orderModal.discountModal.fixedAmount')} (₪)`}
            </label>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full text-3xl font-bold p-4 border rounded-xl text-center focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              placeholder="0"
              autoFocus
            />
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('orderModal.discountModal.reason')}
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {[
                { key: 'comp', val: t('orderModal.discountModal.reasons.comp') },
                { key: 'staff', val: t('orderModal.discountModal.reasons.staff') },
                { key: 'vip', val: t('orderModal.discountModal.reasons.vip') },
                { key: 'service', val: t('orderModal.discountModal.reasons.service') }
              ].map(r => (
                <button
                  key={r.key}
                  onClick={() => setReason(r.val)}
                  className={`py-2 px-3 rounded-lg text-[10px] font-medium border ${
                    reason === r.val
                      ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
                  }`}
                >
                  {r.val}
                </button>
              ))}
            </div>
            <input
               type="text"
               value={reason}
               onChange={(e) => setReason(e.target.value)}
               className="w-full p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
               placeholder={t('orderModal.discountModal.otherReason')}
            />
          </div>

          {/* Summary */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl space-y-2 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>{t('orderModal.discountModal.originalTotal')}</span>
              <span>₪{currentTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-red-500 font-medium">
              <span>{t('orderModal.discount')}</span>
              <span>-₪{calculatedDiscount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-900 dark:text-white font-bold text-lg pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>{t('orderModal.discountModal.newTotal')}</span>
              <span>₪{newTotal.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!value || parseFloat(value) <= 0}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {t('orderModal.discountModal.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
