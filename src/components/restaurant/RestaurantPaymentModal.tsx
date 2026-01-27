
import { useState, useRef, useEffect } from 'react';
import { X, Banknote, CreditCard, Smartphone, ChevronLeft, Check } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

type PaymentMethod = 'cash' | 'card' | 'bit';

interface RestaurantPaymentModalProps {
    total: number;
    isOpen: boolean;
    onClose: () => void;
    onComplete: (method: PaymentMethod, amountPaid: number) => void;
}

export default function RestaurantPaymentModal({ total, isOpen, onClose, onComplete }: RestaurantPaymentModalProps) {
    const { t, direction, formatCurrency } = useLanguage();
    const [method, setMethod] = useState<PaymentMethod | null>(null);
    const [cashAmount, setCashAmount] = useState('');
    const cashInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (method === 'cash') {
            setTimeout(() => cashInputRef.current?.focus(), 100);
        }
    }, [method]);

    if (!isOpen) return null;

    const change = method === 'cash' && cashAmount ? parseFloat(cashAmount) - total : 0;

    const handleComplete = () => {
        if (method === 'cash') {
            const paid = parseFloat(cashAmount) || 0;
            if (paid >= total) {
                onComplete(method, paid);
            }
        } else if (method) {
            onComplete(method, total);
        }
    };

    const quickCashAmounts = [10, 20, 50, 100, 200, 500];

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800" dir={direction}>
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white relative">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                    <div className="text-center">
                        <p className="text-blue-100 text-sm font-bold uppercase tracking-widest mb-1">{t('orderModal.total')}</p>
                        <p className="text-5xl font-black">{formatCurrency(total)}</p>
                    </div>
                </div>

                <div className="p-8">
                    {/* Payment Method Selection */}
                    {!method && (
                        <div className="space-y-4">
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">{t('market.payment')}</p>
                            
                            <button
                                onClick={() => setMethod('cash')}
                                className="w-full flex items-center gap-4 p-5 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all group"
                            >
                                <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Banknote className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="text-start">
                                    <p className="font-black text-xl text-slate-900 dark:text-white">{t('market.cash')}</p>
                                    <p className="text-sm text-slate-500">Fast checkout with cash</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setMethod('card')}
                                className="w-full flex items-center gap-4 p-5 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all group"
                            >
                                <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <CreditCard className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="text-start">
                                    <p className="font-black text-xl text-slate-900 dark:text-white">{t('market.creditCard')}</p>
                                    <p className="text-sm text-slate-500">Secure card payment</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setMethod('bit')}
                                className="w-full flex items-center gap-4 p-5 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all group"
                            >
                                <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Smartphone className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div className="text-start">
                                    <p className="font-black text-xl text-slate-900 dark:text-white">Digital / Bit</p>
                                    <p className="text-sm text-slate-500">Mobile & Digital Wallets</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Cash Payment Flow */}
                    {method === 'cash' && (
                        <div className="space-y-6">
                            <button
                                onClick={() => setMethod(null)}
                                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white font-bold transition-colors"
                            >
                                <ChevronLeft size={18} />
                                <span>{t('admin.table.back')}</span>
                            </button>

                            <div className="space-y-4">
                                <label className="block text-sm font-black text-slate-500 uppercase tracking-widest text-center">
                                    {t('market.payment')}
                                </label>
                                <div className="relative">
                                    <input
                                        ref={cashInputRef}
                                        type="number"
                                        value={cashAmount}
                                        onChange={(e) => setCashAmount(e.target.value)}
                                        className="w-full px-4 py-6 text-4xl font-black text-center border-2 border-slate-200 dark:border-slate-700 rounded-3xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                                        placeholder="0.00"
                                    />
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-bold">₪</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {quickCashAmounts.map((amount) => (
                                    <button
                                        key={amount}
                                        onClick={() => setCashAmount(amount.toString())}
                                        className="py-3 px-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                                    >
                                        ₪{amount}
                                    </button>
                                ))}
                            </div>

                            {parseFloat(cashAmount) >= total ? (
                                <div className="bg-emerald-500 text-white rounded-3xl p-6 text-center shadow-xl shadow-emerald-500/20 animate-bounceIn">
                                    <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest mb-1">{t('market.change')}</p>
                                    <p className="text-4xl font-black">
                                        {formatCurrency(change)}
                                    </p>
                                </div>
                            ) : cashAmount && (
                                <div className="bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl p-4 text-center text-sm font-bold">
                                   Need {formatCurrency(total - parseFloat(cashAmount))} more
                                </div>
                            )}

                            <button
                                onClick={handleComplete}
                                disabled={!cashAmount || parseFloat(cashAmount) < total}
                                className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/20 active:scale-95"
                            >
                                <Check size={24} strokeWidth={3} />
                                {t('market.makePayment')}
                            </button>
                        </div>
                    )}

                    {/* Card/Bit Flow */}
                    {(method === 'card' || method === 'bit') && (
                        <div className="space-y-6">
                            <button
                                onClick={() => setMethod(null)}
                                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:white font-bold transition-colors"
                            >
                                <ChevronLeft size={18} />
                                <span>{t('admin.table.back')}</span>
                            </button>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-10 text-center border-2 border-dashed border-slate-200 dark:border-slate-700">
                                {method === 'card' ? (
                                    <div className="relative inline-block">
                                        <CreditCard className="w-24 h-24 mx-auto text-blue-500 mb-6 animate-pulse" />
                                        <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
                                    </div>
                                ) : (
                                    <div className="relative inline-block">
                                        <Smartphone className="w-24 h-24 mx-auto text-purple-500 mb-6 animate-pulse" />
                                        <div className="absolute inset-0 bg-purple-500/20 blur-3xl rounded-full" />
                                    </div>
                                )}
                                <p className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                                    {method === 'card' ? t('market.creditCard') : 'Digital Wallet / Bit'}
                                </p>
                                <p className="text-slate-500 font-medium">Please process the transaction on the terminal</p>
                            </div>

                            <button
                                onClick={handleComplete}
                                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-600/20 active:scale-95"
                            >
                                <Check size={24} strokeWidth={3} />
                                {t('market.confirm')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
