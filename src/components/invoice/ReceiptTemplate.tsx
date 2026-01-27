import { RestaurantOrder, RestaurantTable } from '../../types/restaurant';
import { BusinessProfile } from '../../lib/supabase';
import { UtensilsCrossed } from 'lucide-react';
import { translations, Language } from '../../i18n/translations';

interface ReceiptTemplateProps {
  order: RestaurantOrder;
  table: RestaurantTable;
  profile: BusinessProfile;
  userFullName?: string;
}

export default function ReceiptTemplate({ order, table, profile, userFullName }: ReceiptTemplateProps) {
  // Use profile preferred language, fallback to Hebrew if not set
  const language = (profile.preferred_language as Language) || 'he';
  const validLanguage = ['en', 'ar', 'he'].includes(language) ? language : 'he';
  
  const currencySymbol = profile.preferred_currency === 'ILS' ? '₪' :
    profile.preferred_currency === 'EUR' ? '€' : '$';

  const localeMap: Record<string, string> = {
    he: 'he-IL',
    ar: 'ar-EG',
    en: 'en-US',
  };
  const locale = localeMap[validLanguage] || 'he-IL';
  const formattedDate = new Date().toLocaleString(locale);

  const isRTL = validLanguage !== 'en';

  // Helper to get translation based on selected language
  const t = (path: string, fallback?: string): string => {
    const keys = path.split('.');
    // Access the dictionary for the specific language
    const value = translations[validLanguage] as unknown;
    
    // Attempt lookup using the provided path
    let current = value;
    for (const key of keys) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
      } else {
        current = undefined;
        break;
      }
    }
    
    // If exact path not found, try prepending 'settings.' (structure variation handling)
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

    // Return found value, or fallback, or the key itself
    if (current !== undefined && current !== null && (typeof current === 'string' || typeof current === 'number')) {
        return String(current);
    }
    return fallback || path;
  };

  return (
    <div className={`bg-white text-black p-4 font-mono text-sm leading-tight max-w-[80mm] print:max-w-full mx-auto ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* Header */}
      <div className="text-center mb-4 border-b border-black pb-2 border-dashed">
        {profile.logo_url ? (
            <img src={profile.logo_url} alt="Logo" className="h-16 mx-auto mb-2 object-contain grayscale" />
        ) : (
            <div className="flex justify-center mb-2">
                <UtensilsCrossed className="w-8 h-8" />
            </div>
        )}
        <h1 className="text-lg font-bold uppercase">{userFullName || profile.business_name}</h1>
        <p className="text-xs">{profile.phone_number}</p>
        <p className="text-xs">{t('business.regNumber', t('settings.business.regNumber', 'Reg. No'))}: {profile.business_registration_number}</p>
        <p className="text-xs">{profile.address}</p>
        <div className="text-xs mt-2">
            <p>{formattedDate}</p>
            <p>{t('restaurant.receipt.order')}: #{order.id.slice(0, 6)}</p>
            <p>{t('restaurant.receipt.table')}: {table.name}</p>
        </div>
      </div>

      {/* Items */}
      <div className="mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black border-dashed">
              <th className={`py-1 ${isRTL ? 'text-right' : 'text-left'}`}>{t('restaurant.receipt.item')}</th>
              <th className="text-center py-1 w-8">{t('restaurant.receipt.qty')}</th>
              <th className={`py-1 w-12 ${isRTL ? 'text-left' : 'text-right'}`}>{t('restaurant.receipt.total')}</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((item, idx) => (
              <tr key={idx} className="">
                <td className={`py-1 ${isRTL ? 'pl-1' : 'pr-1'}`}>{item.menu_item?.name || t('restaurant.receipt.item')}</td>
                <td className="py-1 text-center">{item.quantity}</td>
                <td className={`py-1 ${isRTL ? 'text-left' : 'text-right'}`}>
                  {(item.price_at_time * item.quantity).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="border-t border-black border-dashed pt-2 mb-4">
        <div className="flex justify-between font-bold text-base mb-1">
          <span>{t('restaurant.receipt.totalPayment')}:</span>
          <span>{currencySymbol}{order.total_amount.toFixed(2)}</span>
        </div>
        
        {/* Tax Breakdown */}
        <div className={`text-xs mt-2 space-y-1 ${isRTL ? 'text-right' : 'text-left'}`}>
            <div className="flex justify-between">
                <span>{t('restaurant.receipt.subtotal')}:</span>
                <span>{currencySymbol}{(order.total_amount - order.tax_amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
                <span>{t('restaurant.receipt.vat')} (17%):</span>
                <span>{currencySymbol}{order.tax_amount.toFixed(2)}</span>
            </div>
        </div>
      </div>

      {/* Service / Footer */}
      <div className="text-center text-xs mt-6 border-t border-black border-dashed pt-4">
        <p className="font-bold mb-1">{t('restaurant.receipt.serviceNotIncluded')}</p>
        <p>{t('restaurant.receipt.thankYou')}</p>
        <p className="mt-2 text-[10px]">MyDesck PRO Software</p>
      </div>
    </div>
  );
}
