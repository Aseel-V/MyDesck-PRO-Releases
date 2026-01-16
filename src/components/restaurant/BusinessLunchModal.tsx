import { useState, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { MenuItem, MenuCategory } from '../../types/restaurant';
import { X, ChevronRight, Check } from 'lucide-react';


interface BusinessLunchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selections: { starter?: MenuItem, main?: MenuItem, drink?: MenuItem }, price: number) => void;
    categories: MenuCategory[];
}

const FIXED_PRICE = 59; // Example fixed price

export default function BusinessLunchModal({ isOpen, onClose, onConfirm, categories }: BusinessLunchModalProps) {
    const { t, language } = useLanguage();
    const [step, setStep] = useState<'starter' | 'main' | 'drink'>('starter');
    const [selections, setSelections] = useState<{ starter?: MenuItem, main?: MenuItem, drink?: MenuItem }>({});

    const getItemName = (item: MenuItem) => {
        if (language === 'he' && item.name_he) return item.name_he;
        if (language === 'ar' && item.name_ar) return item.name_ar;
        return item.name;
    };

    // filter items by category names (relaxed matching)
    const starters = useMemo(() => 
        categories.find(c => 
            c.name.toLowerCase().includes('starter') || 
            c.name.includes('ראשונות') || 
            // @ts-expect-error: type property missing on interface
            c.type === 'appetizers'
        )?.items || [], 
    [categories]);

    const mains = useMemo(() => 
        categories.find(c => 
            c.name.toLowerCase().includes('main') || 
            c.name.includes('עיקריות') || 
            // @ts-expect-error: type property missing on interface
            c.type === 'mains'
        )?.items || [], 
    [categories]);

    const drinks = useMemo(() => 
        categories.find(c => 
            c.name.toLowerCase().includes('drink') || 
            c.name.includes('שתייה') || 
            // @ts-expect-error: type property missing on interface
            c.type === 'drinks'
        )?.items || [], 
    [categories]);

    const handleSelect = (item: MenuItem) => {
        setSelections(prev => ({ ...prev, [step]: item }));
        if (step === 'starter') setStep('main');
        else if (step === 'main') setStep('drink');
    };

    const handleFinish = () => {
        onConfirm(selections, FIXED_PRICE);
        onClose();
        // Reset
        setStep('starter');
        setSelections({});
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-emerald-600 text-white">
                    <h2 className="text-xl font-bold">{t('orderModal.businessLunchDetails.title')} (₪{FIXED_PRICE})</h2>
                    <button onClick={onClose}><X /></button>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950 flex flex-wrap gap-2 justify-center border-b border-slate-200 dark:border-slate-800">
                    <StepIndicator active={step === 'starter'} completed={!!selections.starter} label={`${t('orderModal.businessLunchDetails.starter')}`} onClick={() => setStep('starter')} />
                    <ChevronRight className={`text-slate-300 ${language === 'en' ? '' : 'rotate-180'}`} />
                    <StepIndicator active={step === 'main'} completed={!!selections.main} label={`${t('orderModal.businessLunchDetails.main')}`} onClick={() => setStep('main')} />
                    <ChevronRight className={`text-slate-300 ${language === 'en' ? '' : 'rotate-180'}`} />
                    <StepIndicator active={step === 'drink'} completed={!!selections.drink} label={`${t('orderModal.businessLunchDetails.drink')}`} onClick={() => setStep('drink')} />
                </div>

                <div className="h-[400px] overflow-y-auto p-4">
                    <h3 className="font-bold text-lg mb-4 dark:text-white text-center">
                        {step === 'starter' && t('orderModal.businessLunchDetails.chooseStarter')}
                        {step === 'main' && t('orderModal.businessLunchDetails.chooseMain')}
                        {step === 'drink' && t('orderModal.businessLunchDetails.chooseDrink')}
                    </h3>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {(step === 'starter' ? starters : step === 'main' ? mains : drinks).map(item => (
                            <button
                                key={item.id}
                                onClick={() => handleSelect(item)}
                                className={`
                                    p-4 rounded-xl border transition-all text-center flex flex-col items-center
                                    ${selections[step]?.id === item.id 
                                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-500' 
                                        : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 bg-white dark:bg-slate-800'}
                                `}
                            >
                                <div className="font-bold dark:text-white">{getItemName(item)}</div>
                                {item.description && <div className="text-xs text-slate-500 line-clamp-2 mt-1">{item.description}</div>}
                            </button>
                        ))}
                        
                        <button
                             onClick={() => {
                                 // Skip Option
                                 if (step === 'starter') setStep('main');
                                 else if (step === 'main') setStep('drink');
                             }}
                            className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center font-medium"
                        >
                            {t('orderModal.businessLunchDetails.skip')}
                        </button>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900">
                    <div className="text-sm text-slate-500 text-center sm:text-left">
                        <span className="font-semibold">{t('orderModal.businessLunchDetails.selected')}:</span> {[
                            selections.starter ? getItemName(selections.starter) : null, 
                            selections.main ? getItemName(selections.main) : null, 
                            selections.drink ? getItemName(selections.drink) : null
                        ].filter(Boolean).join(' + ')}
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                         {step !== 'starter' && (
                             <button onClick={() => setStep(step === 'drink' ? 'main' : 'starter')} className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">{t('orderModal.businessLunchDetails.back')}</button>
                         )}
                         <button 
                            onClick={handleFinish}
                            disabled={!selections.main} 
                            className="flex-1 sm:flex-none px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {step === 'drink' ? t('orderModal.businessLunchDetails.confirm') : t('orderModal.businessLunchDetails.next')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StepIndicator({ active, completed, label, onClick }: any) {
    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors
            ${active ? 'bg-slate-900 text-white' : completed ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'}`}
        >
            {completed && <Check size={14} />}
            {label}
        </button>
    )
}
