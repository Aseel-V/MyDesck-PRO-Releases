import { useState, type KeyboardEvent } from 'react';
import {
  CalendarDays,
  CircleDollarSign,
  PackageSearch,
  ReceiptText,
  Route,
  ShoppingBasket,
  Soup,
  Users,
} from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { MarketingBadge } from '../components/primitives';

type ProductMode = 'travel' | 'supermarket' | 'restaurant' | 'auto-repair';

const labels = {
  en: {
    travel: 'Travel', supermarket: 'Supermarket', restaurant: 'Restaurant', autoRepair: 'Auto repair',
    today: 'Workspace overview', active: 'Active records', collected: 'Collected', open: 'Open balance',
    recent: 'Recent workflow', customer: 'Customer', status: 'Status', amount: 'Amount', ready: 'Ready', pending: 'Follow-up',
  },
  ar: {
    travel: 'السفر', supermarket: 'المتجر', restaurant: 'المطعم', autoRepair: 'ورشة السيارات',
    today: 'نظرة على المساحة', active: 'سجلات نشطة', collected: 'تم تحصيله', open: 'رصيد مفتوح',
    recent: 'سير العمل الأخير', customer: 'العميل', status: 'الحالة', amount: 'المبلغ', ready: 'جاهز', pending: 'متابعة',
  },
  he: {
    travel: 'נסיעות', supermarket: 'סופרמרקט', restaurant: 'מסעדה', autoRepair: 'מוסך',
    today: 'סקירת סביבת עבודה', active: 'רשומות פעילות', collected: 'נגבה', open: 'יתרה פתוחה',
    recent: 'תהליך אחרון', customer: 'לקוח', status: 'סטטוס', amount: 'סכום', ready: 'מוכן', pending: 'מעקב',
  },
} as const;

const sampleRows = {
  travel: ['North Coast group', 'City weekend', 'Spring program'],
  supermarket: ['Basket #1048', 'Basket #1047', 'Basket #1046'],
  restaurant: ['Table 08', 'Table 12', 'Reservation 18:30'],
  'auto-repair': ['Vehicle 458', 'Vehicle 271', 'Work order 119'],
};

function ModeIcon({ mode }: { mode: ProductMode }) {
  const Icon = mode === 'travel' ? Route : mode === 'supermarket' ? ShoppingBasket : mode === 'restaurant' ? Soup : PackageSearch;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}

export function ProductFrame({ initialMode = 'travel', fixed = false, label }: { initialMode?: ProductMode; fixed?: boolean; label?: string }) {
  const { locale, copy } = useMarketingLanguage();
  const text = labels[locale];
  const modes: ProductMode[] = fixed ? [initialMode] : ['travel', 'supermarket', 'restaurant'];
  const [mode, setMode] = useState<ProductMode>(initialMode);

  const modeName = mode === 'auto-repair' ? text.autoRepair : text[mode];

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + delta + modes.length) % modes.length;
    setMode(modes[nextIndex]);
    document.getElementById(`product-tab-${modes[nextIndex]}`)?.focus();
  };

  return (
    <figure className="overflow-hidden rounded-[1.35rem] border border-slate-700/60 bg-slate-950 shadow-[0_32px_80px_rgba(2,6,23,0.28)]" aria-label={label || copy.common.productPreview}>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-800 px-4 sm:px-5">
        <div className="flex items-center gap-2" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
        <span className="truncate text-xs font-semibold text-slate-400">MyDesck PRO · {modeName}</span>
      </div>
      {!fixed && (
        <div role="tablist" aria-label={copy.common.productPreview} className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/70 p-2">
          {modes.map((tabMode, index) => {
            const tabLabel = tabMode === 'auto-repair' ? text.autoRepair : text[tabMode];
            const selected = mode === tabMode;
            return (
              <button
                key={tabMode}
                id={`product-tab-${tabMode}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls="product-preview-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setMode(tabMode)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${selected ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <ModeIcon mode={tabMode} />{tabLabel}
                {tabMode === 'restaurant' && <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] text-amber-200">{copy.common.earlyAccess}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div id="product-preview-panel" role="tabpanel" className="bg-slate-100 p-3 text-slate-950 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
          <aside className="hidden rounded-xl bg-slate-900 p-3 text-slate-300 sm:block">
            <div className="mb-5 flex items-center gap-2 border-b border-slate-700 pb-4"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300"><ModeIcon mode={mode} /></div><span className="text-xs font-bold text-white">{modeName}</span></div>
            {[text.today, text.active, text.recent].map((item, index) => <div key={item} className={`mb-1 rounded-lg px-3 py-2.5 text-xs ${index === 0 ? 'bg-slate-700 text-white' : ''}`}>{item}</div>)}
          </aside>
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{modeName}</p><h3 className="mt-1 text-base font-bold sm:text-lg">{text.today}</h3></div><MarketingBadge tone={mode === 'restaurant' || mode === 'auto-repair' ? 'early' : 'available'}>{mode === 'restaurant' || mode === 'auto-repair' ? copy.common.earlyAccess : copy.common.available}</MarketingBadge></div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: CalendarDays, label: text.active, value: mode === 'travel' ? '12' : mode === 'supermarket' ? '148' : '8' },
                { icon: CircleDollarSign, label: text.collected, value: '84%' },
                { icon: ReceiptText, label: text.open, value: '16%' },
              ].map(({ icon: Icon, label: metricLabel, value }) => (
                <div key={metricLabel} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><Icon className="h-4 w-4 text-sky-700" aria-hidden="true" /><p className="mt-3 truncate text-[10px] font-semibold text-slate-500">{metricLabel}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></div>
              ))}
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><span className="text-xs font-bold">{text.recent}</span><Users className="h-4 w-4 text-slate-400" aria-hidden="true" /></div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><span>{text.customer}</span><span>{text.status}</span><span>{text.amount}</span></div>
              {sampleRows[mode].map((row, index) => (
                <div key={row} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 text-xs last:border-0"><span className="truncate font-semibold">{row}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${index === 1 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{index === 1 ? text.pending : text.ready}</span><span className="text-end font-semibold tabular-nums" dir="ltr">{index === 0 ? '1,240' : index === 1 ? '680' : '320'}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="bg-slate-900 px-4 py-2 text-center text-[11px] text-slate-400">{copy.common.sanitizedPreview}</figcaption>
    </figure>
  );
}
