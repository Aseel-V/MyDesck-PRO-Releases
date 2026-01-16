import { RestaurantOrder, RestaurantTable } from '../../types/restaurant';
import { BusinessProfile } from '../../lib/supabase';
import { UtensilsCrossed } from 'lucide-react';

interface ReceiptTemplateProps {
  order: RestaurantOrder;
  table: RestaurantTable;
  profile: BusinessProfile;
  userFullName?: string;
}

export default function ReceiptTemplate({ order, table, profile, userFullName }: ReceiptTemplateProps) {
  const currencySymbol = profile.preferred_currency === 'ILS' ? '₪' :
    profile.preferred_currency === 'EUR' ? '€' : '$';

  const formattedDate = new Date().toLocaleString('he-IL'); // Or dynamic locale

  // Calculate items total (assuming tax is included or calculated elsewhere, showing breakdown)
  // The 'order' object has total_amount, tax_amount.
  
  return (
    <div className="bg-white text-black p-4 font-mono text-sm leading-tight max-w-[80mm] mx-auto rtl" dir="rtl">
      
      {/* Header */}
      <div className="text-center mb-4 border-b border-black pb-2 border-dashed">
        {profile.logo_url ? (
            <img src={profile.logo_url} alt="Logo" className="h-16 mx-auto mb-2 object-contain grayscale" />
        ) : (
            <div className="flex justify-center mb-2">
                <UtensilsCrossed className="w-8 h-8" />
            </div>
        )}
        <h1 className="text-lg font-bold uppercase">{userFullName || 'מסעדה'}</h1>
        <p className="text-xs">{profile.phone_number}</p>
        <p className="text-xs">ע.מ: {profile.business_registration_number}</p>
        <div className="text-xs mt-2">
            <p>{formattedDate}</p>
            <p>הזמנה #{order.id.slice(0, 6)}</p>
            <p>שולחן: {table.name}</p>
        </div>
      </div>

      {/* Items */}
      <div className="mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black border-dashed">
              <th className="text-right py-1">פריט</th>
              <th className="text-center py-1 w-8">כמ'</th>
              <th className="text-left py-1 w-12">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((item, idx) => (
              <tr key={idx} className="">
                <td className="py-1 pr-1">{item.menu_item?.name || 'פריט'}</td>
                <td className="py-1 text-center">{item.quantity}</td>
                <td className="py-1 text-left pl-1">
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
          <span>סה"כ לתשלום:</span>
          <span>{currencySymbol}{order.total_amount.toFixed(2)}</span>
        </div>
        
        {/* Tax Breakdown */}
        <div className="text-xs text-right mt-2 space-y-1">
            <div className="flex justify-between">
                <span>לפני מע"מ:</span>
                <span>{currencySymbol}{(order.total_amount - order.tax_amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
                <span>מע"מ (17%):</span>
                <span>{currencySymbol}{order.tax_amount.toFixed(2)}</span>
            </div>
        </div>
      </div>

      {/* Service / Footer */}
      <div className="text-center text-xs mt-6 border-t border-black border-dashed pt-4">
        <p className="font-bold mb-1">*** לא כולל שירות ***</p>
        <p>תודה שבחרתם בנו!</p>
        <p className="mt-2 text-[10px]">MyDesck PRO Software</p>
      </div>
    </div>
  );
}
