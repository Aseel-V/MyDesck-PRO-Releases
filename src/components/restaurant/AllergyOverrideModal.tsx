
import { AlertTriangle } from 'lucide-react';
import { MenuItem } from '../../types/restaurant';

interface AllergyOverrideModalProps {
  item: MenuItem;
  matchingAllergens: string[];
  overrideText: string;
  setOverrideText: (text: string) => void;
  overrideReason: string;
  setOverrideReason: (reason: string) => void;
  isHolding: boolean;
  startHold: () => void;
  endHold: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}

export default function AllergyOverrideModal({
  item,
  matchingAllergens,
  overrideText,
  setOverrideText,
  overrideReason,
  setOverrideReason,
  isHolding,
  startHold,
  endHold,
  onCancel,
  t
}: AllergyOverrideModalProps) {
  return (
    <div className="fixed inset-0 bg-red-900/80 flex items-center justify-center z-[60] backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border-4 border-red-500">
        {/* Header */}
        <div className="bg-red-500 p-6 text-white text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
            <AlertTriangle size={32} className="text-red-600" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-wider">{t('allergySafety.criticalAlert')}</h2>
        </div>
        
        <div className="p-8">
           <div className="text-center mb-6">
             <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
               {item.name}: {t('orderEntry.itemContainsAllergen')}
             </p>
             <div className="flex flex-wrap gap-2 justify-center">
               {matchingAllergens.map((allergen) => (
                 <span
                   key={allergen}
                   className="px-4 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-base font-bold border border-red-200"
                 >
                   {allergen}
                 </span>
               ))}
             </div>
           </div>

           {/* Typed Confirmation */}
           <div className="mb-6 space-y-4">
             <div>
               <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                 {t('allergySafety.overridePrompt')} <span className="font-mono bg-slate-200 px-1 rounded text-red-600">{t('allergySafety.expectedText')}</span>
               </label>
               <input 
                 type="text" 
                 value={overrideText}
                 onChange={(e) => setOverrideText(e.target.value)}
                 className="w-full text-center text-xl font-bold tracking-widest uppercase border-2 border-red-200 rounded-lg py-3 focus:border-red-500 focus:outline-none dark:bg-slate-800 dark:border-slate-700"
                 placeholder={t('allergySafety.expectedTextPlaceholder')}
                 autoComplete="off"
               />
             </div>
             
             <div>
               <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                 {t('allergySafety.overrideReason')}
               </label>
               <input 
                 type="text" 
                 value={overrideReason}
                 onChange={(e) => setOverrideReason(e.target.value)}
                 className="w-full border rounded-lg py-2 px-3 text-sm dark:bg-slate-800 dark:border-slate-700"
                 placeholder={t('allergySafety.overrideReasonPlaceholder') || 'Reason for exception...'}
               />
             </div>
           </div>

           {/* Actions */}
           <div className="flex gap-4">
             <button
               onClick={onCancel}
               className="flex-1 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-lg shadow-lg"
             >
               {t('allergySafety.cancelSafe')}
             </button>
             
             <div className="flex-1 relative">
                <button
                  onMouseDown={startHold}
                  onMouseUp={endHold}
                  onMouseLeave={endHold}
                  onTouchStart={startHold}
                  onTouchEnd={endHold}
                  disabled={overrideText !== t('allergySafety.expectedText')}
                  className={`
                    w-full h-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all
                    ${overrideText === t('allergySafety.expectedText') 
                      ? 'bg-white border-2 border-red-500 text-red-500 hover:bg-red-50' 
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed border-none'}
                    ${isHolding ? 'scale-95 bg-red-100' : ''}
                  `}
                >
                  {isHolding ? t('allergySafety.holding') : t('allergySafety.holdToConfirm')}
                </button>
                {/* Progress Bar for Hold */}
                {isHolding && (
                  <div className="absolute bottom-0 left-0 h-1 bg-red-500 transition-all duration-[3000ms] ease-linear w-full rounded-b-xl" />
                )}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
