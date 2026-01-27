
import { useState } from 'react';
import { X, ShoppingCart, Check, Printer } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { BusinessProfile } from '../../lib/supabase';
import MarketReceiptTemplate from './MarketReceiptTemplate';
import { createRoot } from 'react-dom/client';

interface Product {
  id: string;
  name: string;
  nameHe: string;
  price: number;
  type: "unit" | "weight";
}
interface CartItem {
    id: string;
    product?: Product;
    quantity: number;
    weight?: number;
    name?: string;
    price?: number;
}
// Define flexible Transaction type but prioritizing known fields
interface Transaction {
    id: string;
    receipt_number?: string;
    receiptNumber?: string;
    total: number;
    total_amount?: number;
    items: CartItem[];
    payment_method?: string;
    paymentMethod?: string;
    amount_paid?: number;
    amountPaid?: number;
    change: number;
    created_at?: string;
    timestamp?: Date | string;
    tax_amount?: number;
}

interface ReceiptModalProps {
  transaction: Transaction; 
  profile: { business_name?: string | null; phone_number?: string | null; business_registration_number?: string | null; preferred_language?: string | null; preferred_currency?: string | null; logo_url?: string | null; address?: string | null } | null;
  onClose: () => void;
  onSave: (print: boolean) => Promise<void>;
  viewOnly?: boolean;
}

const VAT_RATE = 0.17; // 17% Israeli VAT

function calculatePriceFromVATInclusive(totalWithVAT: number) {
  const beforeVAT = totalWithVAT / (1 + VAT_RATE);
  const vatAmount = totalWithVAT - beforeVAT;
  return { beforeVAT, vatAmount };
}

export default function ReceiptModal({ transaction, profile, onClose, onSave, viewOnly = false }: ReceiptModalProps) {
  const { beforeVAT, vatAmount } = calculatePriceFromVATInclusive(transaction.total_amount || transaction.total);
  const [saving, setSaving] = useState(false);
  const { t, direction, language } = useLanguage();
  
  const handlePrint = () => {
    // Create a hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    // Write content to iframe
    const doc = iframe.contentWindow?.document;
    if (doc) {
        doc.open();
        doc.write('<html><head><title>Print Receipt</title>');
        // Add minimal styles or copy stylesheets if needed. For thermal receipt, mostly inline or simple.
        doc.write('<style>@page { size: 80mm auto; margin: 0; } body { margin: 0; font-family: monospace; }</style>');
        // If we rely on Tailwind, we might need to inject it, but MarketReceiptTemplate uses standard classes. 
        // We'll trust the inline styles or basic structure. 
        // Actually, since MarketReceiptTemplate relies on Tailwind classes (bg-white, text-black, etc.), 
        // printing without Tailwind CSS won't look 100% right unless we bundle CSS.
        // A better approach for "quick" fix without setup changes:
        // Copy all style tags from main document.
        const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach(s => {
            doc.write(s.outerHTML);
        });
        doc.write('</head><body><div id="print-root"></div></body></html>');
        doc.close();

        // Render the template into the iframe
        const root = createRoot(doc.getElementById('print-root')!);
        root.render(
            <MarketReceiptTemplate 
                transaction={transaction}
                profile={profile as BusinessProfile}
            />
        );

        // Wait for styles/rendering then print
        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            // Cleanup
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
      if (!viewOnly || print) { 
        await onSave(print);
      }
    } catch (error) {
      console.error('Error saving:', error);
      alert(t('market.saveError'));
    } finally {
      setSaving(false);
    }
  };



  const timestamp = transaction.created_at ? new Date(transaction.created_at) : (transaction.timestamp instanceof Date ? transaction.timestamp : new Date(transaction.timestamp || Date.now()));
  const locale = language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-IL';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn">
      {/* Close button (X) top right of modal container */}
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 z-[110] p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
      >
        <X className="w-8 h-8" />
      </button>

      <div className="bg-gradient-to-b from-white to-slate-50 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200 animate-scaleIn" dir={direction}>
        
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 p-6 text-white relative overflow-hidden">
          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'radial-gradient(circle at 30% 50%, white 2px, transparent 2px)',
            backgroundSize: '24px 24px'
          }} />
          
          {/* Logo/Icon */}
          <div className="relative w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur-sm p-3 border border-white/30 shadow-lg">
            <ShoppingCart className="w-full h-full text-white" />
          </div>
          
          {/* Business Name */}
          <h1 className="relative text-2xl font-bold text-center tracking-wide drop-shadow-sm">
            {profile?.business_name || t('market.title')}
          </h1>
          
          {/* Date & Receipt Number */}
          <div className="relative mt-3 text-center">
            <p className="text-white/80 text-sm">
              {timestamp.toLocaleString(locale)}
            </p>
            <p className="text-sm font-bold bg-white/20 rounded-full px-4 py-1 inline-block mt-2">
              {t('market.receiptModal.title')} #{transaction.receipt_number || transaction.receiptNumber}
            </p>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="p-5 max-h-[50vh] overflow-y-auto">
          
          {/* Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <div className="col-span-6 text-start">{t('market.receiptModal.item')}</div>
              <div className="col-span-3 text-center">{t('market.receiptModal.qty')}</div>
              <div className="col-span-3 text-end">{t('market.receiptModal.total')}</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-slate-100">
              {transaction.items && transaction.items.map((item: CartItem, idx: number) => (
                <div key={item.id || idx} className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
                  <div className="col-span-6 text-start">
                    <span className="text-sm font-medium text-slate-800">{direction === 'rtl' ? (item.product?.nameHe || item.name || '') : (item.product?.name || item.name || item.product?.nameHe || '')}</span>
                  </div>
                  <div className="col-span-3 text-center text-sm text-slate-500">
                    {(item.product?.type === "weight" || item.weight)
                      ? `${item.weight?.toFixed(3)} ${t('market.weightKg')}`
                      : item.quantity}
                  </div>
                  <div className="col-span-3 text-end text-sm font-bold text-slate-800">
                    ₪{(
                      (item.price || item.product?.price || 0) * (item.quantity || (item.product?.type === 'weight' ? (item.weight || 0) : 1))
                    ).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between text-slate-500">
              <span>{t('market.receiptModal.beforeVat')}:</span>
              <span>₪{beforeVAT.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{t('market.receiptModal.vat')}:</span>
              <span>₪{vatAmount.toFixed(2)}</span>
            </div>
          </div>
          
          {/* Grand Total */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg mb-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-medium">{t('market.receiptModal.grandTotal')}:</span>
              <span className="text-3xl font-bold">₪{(transaction.total_amount || transaction.total).toFixed(2)}</span>
            </div>
          </div>
          
          {/* Payment Info / Change */}
          {(transaction.payment_method === "cash" || transaction.paymentMethod === "cash") && (transaction.change > 0) && (
            <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-center text-sm text-emerald-700 mb-2">
                <span>{t('market.receiptModal.paid')}:</span>
                <span className="font-medium">₪{(transaction.amount_paid || transaction.amountPaid || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-emerald-700">{t('market.receiptModal.change')}:</span>
                <span className="text-2xl font-bold text-emerald-600">₪{transaction.change.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center mt-6 pt-4 border-t border-dashed border-slate-300">
            <p className="font-bold text-slate-600 text-lg">{t('market.receiptModal.thankYou')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('market.receiptModal.software')}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex gap-3">
          {!viewOnly ? (
            <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:from-emerald-600 hover:to-green-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-70"
            >
                {saving ? (
                <span className="animate-pulse">{t('market.receiptModal.saving')}</span>
                ) : (
                <>
                    <Check className="w-6 h-6" />
                    {t('market.receiptModal.saveAndClose')}
                </>
                )}
            </button>
          ) : (
            <button
                onClick={onClose}
                className="flex-1 py-4 bg-slate-200 text-slate-700 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-slate-300 transition-all shadow-sm hover:shadow-md"
            >
                <X className="w-6 h-6" />
                {t('market.close')}
            </button>
          )}
          
          <button
            onClick={() => handlePrint()}
            disabled={saving}
            className="flex-1 py-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-70"
          >
            <Printer className="w-6 h-6" />
            {t('market.receiptModal.print')}
          </button>
        </div>
      </div>
    </div>
  );
}
