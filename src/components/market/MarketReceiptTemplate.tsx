import { BusinessProfile } from '../../lib/supabase';
import { ShoppingCart } from 'lucide-react';
import { translations, Language } from '../../i18n/translations';

// Duplicate definition or import shareable type if possible. 
// For now, based on ReceiptModal info:
interface Transaction {
    id: string;
    receipt_number?: string;
    receiptNumber?: string;
    total: number;
    total_amount?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
    payment_method?: string;
    paymentMethod?: string; // fallback
    amount_paid?: number;
    amountPaid?: number; // fallback
    change: number;
    created_at?: string;
    timestamp?: Date | string;
    tax_amount?: number; // if available, otherwise calc
    table?: string;
}

interface MarketReceiptTemplateProps {
  transaction: Transaction;
  profile: BusinessProfile;
  userFullName?: string;
}

export default function MarketReceiptTemplate({ transaction, profile, userFullName }: MarketReceiptTemplateProps) {
  // Use profile preferred language, fallback to Hebrew if not set
  const language = (profile.preferred_language as Language) || 'he';
  const validLanguage = ['en', 'ar', 'he'].includes(language) ? language : 'he';
  
  const currencySymbol = profile.preferred_currency === 'ILS' ? '₪' :
    profile.preferred_currency === 'EUR' ? '€' : '$';

  const localeMap: Record<string, string> = {
    he: 'he-IL-u-nu-latn',
    ar: 'ar-EG-u-nu-latn',
    en: 'en-US',
  };
  const locale = localeMap[validLanguage] || 'he-IL';
  const timestamp = transaction.created_at ? new Date(transaction.created_at) : (transaction.timestamp instanceof Date ? transaction.timestamp : new Date(transaction.timestamp || new Date()));
  const formattedDate = timestamp.toLocaleString(locale);

  const isRTL = validLanguage !== 'en';

  // Helper to get translation based on selected language
  const t = (path: string, fallback?: string): string => {
    const keys = path.split('.');
    const value = translations[validLanguage] as unknown;
    
    let current = value;
    for (const key of keys) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
      } else {
        current = undefined;
        break;
      }
    }
    
    if (current === undefined && !path.startsWith('settings.')) {
        current = value; // Reset
        const altKeys = ['settings', ...keys];
        for (const key of altKeys) {
            if (current && typeof current === 'object') {
                current = (current as Record<string, unknown>)[key];
            } else {
                current = undefined;
                break;
            }
        }
    }

    if (current !== undefined && current !== null && (typeof current === 'string' || typeof current === 'number')) {
        return String(current);
    }
    return fallback || path;
  };

  const totalAmount = transaction.total_amount || transaction.total || 0;
  // Calculate VAT if not present
  const taxAmount = transaction.tax_amount || (totalAmount - (totalAmount / 1.17));
  const subtotal = totalAmount - taxAmount;

  return (
    <div className={`bg-white text-black p-4 font-mono text-sm leading-tight max-w-[80mm] mx-auto ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* Header */}
      <div className="text-center mb-4 border-b border-black pb-2 border-dashed">
        {profile.logo_url ? (
            <img src={profile.logo_url} alt="Logo" className="h-16 mx-auto mb-2 object-contain grayscale" />
        ) : (
            <div className="flex justify-center mb-2">
                <ShoppingCart className="w-8 h-8" />
            </div>
        )}
        <h1 className="text-lg font-bold uppercase">{userFullName || profile.business_name}</h1>
        <p className="text-xs">{profile.phone_number}</p>
        <p className="text-xs">{t('business.regNumber', t('settings.business.regNumber', 'Reg. No'))}: {profile.business_registration_number}</p>
        <p className="text-xs">{profile.address}</p>
        <div className="text-xs mt-2">
            <p>{formattedDate}</p>
            <p>{t('market.receiptModal.receipt', 'Receipt')}: #{transaction.receipt_number || transaction.receiptNumber}</p>
            {transaction.table && <p>{t('restaurant.receipt.table', 'Table')}: {transaction.table}</p>}
        </div>
      </div>

      {/* Items */}
      <div className="mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black border-dashed">
              <th className={`py-1 ${isRTL ? 'text-right' : 'text-left'}`}>{t('market.receiptModal.item', 'Item')}</th>
              <th className="text-center py-1 w-8">{t('market.receiptModal.qty', 'Qty')}</th>
              <th className={`py-1 w-12 ${isRTL ? 'text-left' : 'text-right'}`}>{t('market.receiptModal.total', 'Total')}</th>
            </tr>
          </thead>
          <tbody>
            {transaction.items?.map((item, idx) => (
              <tr key={idx} className="">
                <td className={`py-1 ${isRTL ? 'pl-1' : 'pr-1'}`}>
                  {isRTL ? (item.product?.nameHe || item.name) : (item.product?.name || item.name || item.product?.nameHe)}
                </td>
                <td className="py-1 text-center">
                   {item.product?.type === 'weight' || item.weight
                      ? item.weight?.toFixed(3)
                      : item.quantity}
                </td>
                <td className={`py-1 ${isRTL ? 'text-left' : 'text-right'}`}>
                  {( (item.price || item.product?.price || 0) * (item.quantity || (item.product?.type === 'weight' ? item.weight : 1)) ).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="border-t border-black border-dashed pt-2 mb-4">
        <div className="flex justify-between font-bold text-xl mb-1 mt-2">
          <span>{t('market.receiptModal.totalToPay', 'Total to Pay')}:</span>
          <span>{currencySymbol}{totalAmount.toFixed(2)}</span>
        </div>
        
        {/* Tax Breakdown */}
        <div className={`text-xs mt-2 space-y-1 ${isRTL ? 'text-right' : 'text-left'}`}>
            <div className="flex justify-between">
                <span>{t('market.receiptModal.beforeVat', 'Before VAT')}:</span>
                <span>{currencySymbol}{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
                <span>{t('market.receiptModal.vat', 'VAT')}:</span>
                <span>{currencySymbol}{taxAmount.toFixed(2)}</span>
            </div>
        </div>

        {/* Payment Details */}
          <div className={`text-xs mt-2 pt-2 border-t border-dashed border-gray-400 space-y-1 ${isRTL ? 'text-right' : 'text-left'}`}>
             <div className="flex justify-between">
                <span>{t('market.receiptModal.paid', 'Paid')}:</span>
                <span>{currencySymbol}{(transaction.amount_paid || transaction.amountPaid || 0).toFixed(2)}</span>
             </div>
              <div className="flex justify-between">
                <span>{t('market.receiptModal.change', 'Change')}:</span>
                <span>{currencySymbol}{(transaction.change || 0).toFixed(2)}</span>
             </div>
        </div>

      </div>

      {/* Footer */}
      <div className="text-center text-xs mt-6 border-t border-black border-dashed pt-4">
        <p className="font-bold mb-2">*** {t('restaurant.receipt.serviceNotIncluded', 'Service Not Included')} ***</p>
        <p className="font-bold mb-1">{t('market.receiptModal.thankYou', 'Thank you for choosing us!')}</p>
        <p className="mt-2 text-[10px]">MyDesck PRO Software</p>
      </div>
    </div>
  );
}
