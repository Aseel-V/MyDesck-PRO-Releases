
import { useState } from 'react';
import { X, Printer, ChefHat } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import MarketReceiptTemplate from '../market/MarketReceiptTemplate';
import { createRoot } from 'react-dom/client';
import { BusinessProfile } from '../../lib/supabase';
import { RestaurantOrder, OrderItem } from '../../types/restaurant';

interface RestaurantReceiptModalProps {
  order: RestaurantOrder;
  profile: BusinessProfile | null;
  onClose: () => void;
  onSave?: (print: boolean) => Promise<void>;
  viewOnly?: boolean;
  paymentMethod?: string;
  amountPaid?: number;
  change?: number;
}

export default function RestaurantReceiptModal({ 
    order, 
    profile, 
    onClose, 
    onSave, 
    viewOnly = false,
    paymentMethod,
    amountPaid,
    change = 0
}: RestaurantReceiptModalProps) {
  const [saving, setSaving] = useState(false);
  const { t, direction, language } = useLanguage();
  
  // Map Restaurant order to the format MarketReceiptTemplate expects
  const transaction = {
      id: order.id,
      receipt_number: `REST-${order.order_number || order.id.slice(0,8)}`,
      total: order.total_amount,
      total_amount: order.total_amount,
      items: (order.items || []).map((item: OrderItem) => ({
          id: item.id,
          name: item.menu_item?.name || 'Item',
          nameHe: item.menu_item?.name_he || item.menu_item?.name || 'פריט',
          quantity: item.quantity,
          price: item.price_at_time,
          product: {
              name: item.menu_item?.name,
              nameHe: item.menu_item?.name_he,
              type: 'unit'
          }
      })),
      payment_method: paymentMethod || order.payment_method || 'cash',
      amount_paid: amountPaid || order.total_amount,
      change: change,
      created_at: order.created_at,
      tax_amount: order.tax_amount,
      table: order.table?.name
  };

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
        doc.open();
        doc.write('<html><head><title>Print Receipt</title>');
        doc.write('<style>@page { size: 80mm auto; margin: 0; } body { margin: 0; font-family: monospace; }</style>');
        const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach(s => {
            doc.write(s.outerHTML);
        });
        doc.write('</head><body><div id="print-root"></div></body></html>');
        doc.close();

        const root = createRoot(doc.getElementById('print-root')!);
        root.render(
            <MarketReceiptTemplate 
                transaction={transaction}
                profile={profile as BusinessProfile}
            />
        );

        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 500); 
    }
  };

  const handleSave = async (print: boolean) => {
    try {
      setSaving(true);
      if (print) {
        handlePrint();
      }
      if (onSave) {
          await onSave(print);
      }
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  const timestamp = new Date(order.created_at);
  const locale = language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-IL';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fadeIn">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 z-[110] p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
      >
        <X className="w-8 h-8" />
      </button>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-scaleIn border border-slate-200 dark:border-slate-800" dir={direction}>
        
        {/* Modern Header */}
        <div className="bg-slate-900 p-8 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <ChefHat size={80} />
          </div>
          <div className="relative w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
            <ChefHat className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-black uppercase tracking-widest">{profile?.business_name}</h1>
          <p className="text-slate-400 text-xs mt-1">{timestamp.toLocaleString(locale)}</p>
          <p className="text-[10px] font-mono mt-2 bg-white/10 inline-block px-3 py-1 rounded-full text-slate-300">
            ORDER #{order.order_number || order.id.slice(0,8)}
          </p>
        </div>

        {/* Simplified View in Modal */}
        <div className="p-6">
           <div className="flex justify-between items-center mb-6">
               <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('orderModal.total')}</span>
               <span className="text-3xl font-black text-slate-900 dark:text-white">₪{order.total_amount.toFixed(2)}</span>
           </div>

           {amountPaid !== undefined && (
               <div className="space-y-3 mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                   <div className="flex justify-between text-sm">
                       <span className="text-slate-500">{t('market.receiptModal.paid')}</span>
                       <span className="font-bold">₪{amountPaid.toFixed(2)}</span>
                   </div>
                   <div className="flex justify-between text-base">
                       <span className="text-emerald-500 font-bold">{t('market.change')}</span>
                       <span className="font-black text-emerald-600">₪{change.toFixed(2)}</span>
                   </div>
               </div>
           )}

           <div className="space-y-3">
                {!viewOnly && (
                    <button
                        onClick={() => handleSave(false)}
                        disabled={saving}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all active:scale-95 shadow-xl shadow-emerald-500/20"
                    >
                        {saving ? t('common.saving') : t('market.receiptModal.saveAndClose')}
                    </button>
                )}
                <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/20"
                >
                    <Printer size={20} />
                    {t('market.receiptModal.print')}
                </button>
                <button
                    onClick={onClose}
                    className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-bold transition-all active:scale-95"
                >
                    {t('market.close')}
                </button>
           </div>
        </div>
      </div>
    </div>
  );
}
