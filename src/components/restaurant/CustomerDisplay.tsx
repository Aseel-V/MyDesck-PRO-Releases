import { useEffect, useState } from 'react';
import { ShoppingCart, CreditCard, Sparkles, Clock } from 'lucide-react';
import QRCode from 'qrcode';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  modifiers?: string;
}

interface DisplayData {
  mode: 'idle' | 'order' | 'payment' | 'thankyou';
  items?: OrderItem[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  currency?: string;
  businessName?: string;
  message?: string;
}

const currencySymbols: Record<string, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
  GBP: '£'
};

export default function CustomerDisplay() {
  const [data, setData] = useState<DisplayData>({ mode: 'idle' });
  const [qrCode, setQrCode] = useState<string>('');
  const [time, setTime] = useState(new Date());

  // Listen for updates from main window
  useEffect(() => {
    // Use BroadcastChannel for same-origin communication
    const channel = new BroadcastChannel('customer-display');
    
    channel.onmessage = (event) => {
      setData(event.data);
    };

    // Also listen for Electron IPC if available
    const electronAPI = window.electronAPI as {
      onCustomerDisplayUpdate?: (callback: (data: DisplayData) => void) => void;
      removeCustomerDisplayListeners?: () => void;
    } | undefined;
    
    if (electronAPI?.onCustomerDisplayUpdate) {
      electronAPI.onCustomerDisplayUpdate((newData: DisplayData) => {
        setData(newData);
      });
    }

    // Listen for localStorage changes (fallback)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'customerDisplayData' && e.newValue) {
        try {
          setData(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      channel.close();
      window.removeEventListener('storage', handleStorage);
      if (electronAPI?.removeCustomerDisplayListeners) {
        electronAPI.removeCustomerDisplayListeners();
      }
    };
  }, []);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Generate QR code for idle mode
  useEffect(() => {
    if (data.mode === 'idle') {
      QRCode.toDataURL('https://mydesck.pro', { width: 200, margin: 2 })
        .then(setQrCode)
        .catch(console.error);
    }
  }, [data.mode]);

  const symbol = currencySymbols[data.currency || 'ILS'] || '₪';

  // IDLE MODE - Show promotions and branding
  if (data.mode === 'idle') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-8 text-white">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -inset-[10px] bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.15),transparent_70%)]" />
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        <div className="relative z-10 text-center">
          {/* Logo/Business Name */}
          <div className="mb-12">
            <h1 className="text-6xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
              {data.businessName || 'Welcome'}
            </h1>
            <p className="text-xl text-slate-400 tracking-wide">
              מחיר נוחות, שירות מצוין
            </p>
          </div>

          {/* Time */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <Clock className="w-8 h-8 text-blue-400" />
            <span className="text-5xl font-mono font-bold tabular-nums">
              {time.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* QR Code */}
          {qrCode && (
            <div className="bg-white p-4 rounded-2xl shadow-2xl inline-block">
              <img src={qrCode} alt="QR Code" className="w-48 h-48" />
            </div>
          )}
          <p className="text-slate-500 mt-4 text-sm">סרקו לתפריט דיגיטלי</p>

          {/* Sparkle decoration */}
          <Sparkles className="absolute top-10 right-10 w-12 h-12 text-yellow-400 animate-bounce" />
        </div>
      </div>
    );
  }

  // ORDER MODE - Show current order items
  if (data.mode === 'order' || data.mode === 'payment') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col" dir="rtl">
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <ShoppingCart className="w-8 h-8 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">ההזמנה שלך</h1>
                <p className="text-slate-400">בדקו את הפרטים</p>
              </div>
            </div>
            <span className="text-slate-400 font-mono">
              {time.toLocaleTimeString('he-IL')}
            </span>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="space-y-4 max-w-3xl mx-auto">
            {data.items?.map((item, idx) => (
              <div
                key={item.id || idx}
                className="flex items-center justify-between p-6 rounded-2xl bg-slate-800/50 backdrop-blur border border-slate-700"
              >
                <div className="flex items-center gap-4">
                  <span className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 text-lg font-bold">
                    {item.quantity}
                  </span>
                  <div>
                    <p className="text-xl font-semibold text-white">{item.name}</p>
                    {item.modifiers && (
                      <p className="text-slate-400 text-sm">{item.modifiers}</p>
                    )}
                  </div>
                </div>
                <span className="text-2xl font-bold text-white">
                  {symbol}{(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals Footer */}
        <div className="bg-slate-800/80 backdrop-blur border-t border-slate-700 p-8">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Subtotal */}
            <div className="flex justify-between text-slate-400 text-lg">
              <span>סכום ביניים</span>
              <span>{symbol}{data.subtotal?.toFixed(2) || '0.00'}</span>
            </div>
            
            {/* Discount */}
            {data.discount && data.discount > 0 && (
              <div className="flex justify-between text-emerald-400 text-lg">
                <span>הנחה</span>
                <span>-{symbol}{data.discount.toFixed(2)}</span>
              </div>
            )}
            
            {/* Tax */}
            <div className="flex justify-between text-slate-400 text-lg">
              <span>מע"מ</span>
              <span>{symbol}{data.tax?.toFixed(2) || '0.00'}</span>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />

            {/* Total */}
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold text-white">סה"כ לתשלום</span>
              <span className="text-4xl font-black text-blue-400">
                {symbol}{data.total?.toFixed(2) || '0.00'}
              </span>
            </div>

            {/* Payment indicator */}
            {data.mode === 'payment' && (
              <div className="flex items-center justify-center gap-3 pt-6 text-green-400 animate-pulse">
                <CreditCard className="w-8 h-8" />
                <span className="text-xl font-semibold">מחכה לתשלום...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // THANK YOU MODE
  if (data.mode === 'thankyou') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-slate-900 to-emerald-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-32 h-32 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-8 animate-bounce">
            <Sparkles className="w-16 h-16 text-emerald-400" />
          </div>
          <h1 className="text-5xl font-black text-white mb-4">תודה רבה!</h1>
          <p className="text-2xl text-emerald-300">{data.message || 'נתראה שוב בקרוב'}</p>
        </div>
      </div>
    );
  }

  return null;
}
