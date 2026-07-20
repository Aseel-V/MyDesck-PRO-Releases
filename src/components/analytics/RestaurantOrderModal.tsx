import { useState, useEffect } from 'react';
import { X, Printer, Clock, StickyNote } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { RestaurantOrder } from '../../types/restaurant';
import ReceiptTemplate from '../invoice/ReceiptTemplate';
import { supabase, BusinessProfile } from '../../lib/supabase';

interface RestaurantOrderModalProps {
    order: RestaurantOrder;
    onClose: () => void;
}

// Helper for date formatting
const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        }).format(date);
    } catch {
        return dateStr;
    }
};

const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit' 
        }).format(date);
    } catch {
        return '';
    }
};

export default function RestaurantOrderModal({ order, onClose }: RestaurantOrderModalProps) {
    const { t, direction, formatCurrency } = useLanguage();
    const [profile, setProfile] = useState<BusinessProfile | null>(null);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        const { data } = await supabase.from('business_profiles').select('*').single();
        if (data) setProfile(data);
    };

    const handlePrint = () => {
        window.print();
    };

    // Calculate duration
    const getDuration = () => {
        if (!order.created_at || !order.closed_at) return null;
        const start = new Date(order.created_at).getTime();
        const end = new Date(order.closed_at).getTime();
        const diffMs = end - start;
        
        const minutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (hours > 0) return `${hours}h ${remainingMinutes}m`;
        return `${minutes}m`;
    };

    const duration = getDuration();

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" dir={direction}>
                
                {/* Header */}
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 p-2 rounded-lg">
                             <Printer className="w-5 h-5" />
                        </div>
                        <div>
                             <h2 className="text-lg font-bold">{t('restaurantAnalytics.viewOrder')} #{order.order_number || order.id.slice(0,6)}</h2>
                             <p className="text-xs text-slate-400">{formatDate(order.created_at)}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content - Two Columns */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-slate-50 dark:bg-slate-900">
                    
                    {/* Left Column: Order Details */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 border-r border-slate-200 dark:border-slate-800">
                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wider font-bold mb-2">
                                    <Clock className="w-4 h-4" />
                                    Duration
                                </div>
                                <div className="text-xl font-bold text-slate-800 dark:text-slate-200">
                                    {duration || 'Active'}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    {formatTime(order.created_at)} - {order.closed_at ? formatTime(order.closed_at) : 'Now'}
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wider font-bold mb-2">
                                    <StickyNote className="w-4 h-4" />
                                    {t('restaurantAnalytics.tableAction')}
                                </div>
                                <div className="text-xl font-bold text-slate-800 dark:text-slate-200">
                                    {order.table?.name || 'Table'}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    {order.server?.full_name || 'Staff'}
                                </div>
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                        <th className="px-4 py-3 text-start">{t('restaurantAnalytics.items')}</th>
                                        <th className="px-4 py-3 text-center">{t('restaurantAnalytics.quantity')}</th>
                                        <th className="px-4 py-3 text-end">{t('restaurantAnalytics.price')}</th>
                                        <th className="px-4 py-3 text-end">{t('restaurantAnalytics.total')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {order.items?.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                                                {item.menu_item?.name || 'Item'}
                                                {item.notes && <p className="text-xs text-slate-400 font-normal">{item.notes}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">{item.quantity}</td>
                                            <td className="px-4 py-3 text-end text-slate-600 dark:text-slate-400">{formatCurrency(item.price_at_time)}</td>
                                            <td className="px-4 py-3 text-end font-bold text-slate-800 dark:text-slate-200">
                                                {formatCurrency(item.price_at_time * item.quantity)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                         {/* Totals Section */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 space-y-3">
                            <div className="flex justify-between text-slate-500">
                                <span>{t('restaurantAnalytics.subtotal')}</span>
                                <span>{formatCurrency(order.subtotal_amount || (order.total_amount - order.tax_amount))}</span>
                            </div>
                            <div className="flex justify-between text-slate-500">
                                <span>{t('restaurantAnalytics.tax')} (17%)</span>
                                <span>{formatCurrency(order.tax_amount || 0)}</span>
                            </div>
                             {order.discount_amount > 0 && (
                                <div className="flex justify-between text-rose-500">
                                    <span>{t('restaurantAnalytics.discount')}</span>
                                    <span>-{formatCurrency(order.discount_amount)}</span>
                                </div>
                            )}
                             {order.tip_amount > 0 && (
                                <div className="flex justify-between text-amber-500">
                                    <span>{t('restaurantAnalytics.tips')}</span>
                                    <span>{formatCurrency(order.tip_amount)}</span>
                                </div>
                            )}
                            <div className="border-t border-slate-100 dark:border-slate-700 pt-3 flex justify-between font-black text-xl text-slate-900 dark:text-white">
                                <span>{t('restaurantAnalytics.total')}</span>
                                <span>{formatCurrency(order.total_amount)}</span>
                            </div>
                             <div className="text-center text-xs text-slate-400 mt-2 bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                                {order.payment_method} | {order.payment_status}
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Receipt Preview (Trip Mode Style) */}
                    <div className="w-full md:w-[400px] bg-slate-200 dark:bg-slate-950 p-6 flex flex-col items-center justify-center border-l border-slate-300 dark:border-slate-800 relative shadow-inner">
                        <div className="absolute top-4 left-4 text-xs font-bold text-slate-500 uppercase tracking-widest pointer-events-none select-none print:hidden">
                            Live Preview
                        </div>
                        
                        <div className="w-full max-w-[320px] shadow-2xl rotate-1 transition-transform hover:rotate-0 duration-500 print:shadow-none print:transform-none print:w-full print:max-w-none print:rotate-0">
                            <div id="print-area">
                                {profile ? (
                                    <ReceiptTemplate 
                                        order={order} 
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        table={{ name: order.table?.name || 'Table' } as any}
                                        profile={profile}
                                        userFullName={order.server?.full_name} 
                                    />
                                ) : (
                                    <div className="bg-white h-[400px] flex items-center justify-center text-slate-400">
                                        Loading Receipt...
                                    </div>
                                )}
                            </div>
                        </div>

                         <div className="mt-8 flex gap-3 w-full max-w-[320px]">
                             <button
                                onClick={handlePrint}
                                className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition flex items-center justify-center gap-2"
                             >
                                 <Printer className="w-4 h-4" />
                                 {t('restaurantAnalytics.print')}
                             </button>
                         </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
