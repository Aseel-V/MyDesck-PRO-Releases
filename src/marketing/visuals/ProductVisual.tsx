import type { ReactNode } from 'react';
import {
  BarChart3, CalendarDays, CarFront, CircleDollarSign, Clock3, CreditCard,
  Gauge, PackageSearch, Plane, ReceiptText, ScanLine, ShoppingBasket, Table2,
} from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { phase2Content } from '../content/phase2Content';
import {
  autoRepairFixture, DEMO_FIXTURE_VERSION, restaurantFixture, supermarketFixture, travelFixture,
  type DemoScreenId,
} from '../demo/demoFixtures';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function DemoShell({ screen, children }: { screen: DemoScreenId; children: ReactNode }) {
  const { locale } = useMarketingLanguage();
  const p2 = phase2Content[locale];
  const early = screen.startsWith('restaurant') || screen.startsWith('auto-repair');
  return (
    <figure className="product-visual overflow-hidden rounded-[1.4rem] border border-slate-700/70 bg-slate-950 shadow-[0_32px_80px_rgba(2,6,23,0.24)]" data-demo-fixture={DEMO_FIXTURE_VERSION}>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-800 px-4 sm:px-5">
        <div className="flex items-center gap-2" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
        <span className="truncate text-xs font-semibold text-slate-400">MyDesck PRO · {p2.demo.screens[screen].label}</span>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${early ? 'bg-amber-300/15 text-amber-200' : 'bg-emerald-300/15 text-emerald-200'}`}>{early ? p2.demo.status['early-access'] : p2.demo.status.available}</span>
      </div>
      <div className="bg-slate-100 p-2.5 text-slate-950 sm:p-4">{children}</div>
      <figcaption className="flex flex-wrap items-center justify-center gap-x-2 bg-slate-900 px-4 py-2 text-center text-[11px] text-slate-400">
        <span>{p2.demo.syntheticLabel}</span><span aria-hidden="true">·</span><span>{DEMO_FIXTURE_VERSION}</span>
      </figcaption>
    </figure>
  );
}

function Metric({ icon: Icon, label, value, tone = 'sky' }: { icon: typeof Gauge; label: string; value: string; tone?: 'sky' | 'emerald' | 'amber' }) {
  const color = tone === 'emerald' ? 'text-emerald-700 bg-emerald-50' : tone === 'amber' ? 'text-amber-800 bg-amber-50' : 'text-sky-800 bg-sky-50';
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}><Icon className="h-4 w-4" aria-hidden="true" /></span><p className="mt-2 truncate text-[10px] font-semibold text-slate-500">{label}</p><p className="mt-0.5 text-base font-bold tabular-nums sm:text-lg" dir="ltr">{value}</p></div>;
}

function StatusPill({ label, tone }: { label: string; tone: 'green' | 'amber' | 'red' | 'blue' }) {
  const classes = { green: 'bg-emerald-50 text-emerald-800', amber: 'bg-amber-50 text-amber-900', red: 'bg-rose-50 text-rose-800', blue: 'bg-sky-50 text-sky-800' };
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${classes[tone]}`}>{label}</span>;
}

function TravelDashboard() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  return <DemoShell screen="travel-dashboard"><div className="grid gap-3 lg:grid-cols-[9.5rem_1fr]"><aside className="hidden rounded-xl bg-slate-900 p-3 text-xs text-slate-300 lg:block"><div className="mb-5 flex items-center gap-2 border-b border-slate-700 pb-3 font-bold text-white"><Plane className="h-4 w-4 text-sky-300" />Travel</div>{[ui.overview, ui.recentTrips, ui.paymentHealth].map((item, index) => <div key={item} className={`mb-1 rounded-lg px-3 py-2 ${index === 0 ? 'bg-slate-700 text-white' : ''}`}>{item}</div>)}</aside><div className="min-w-0"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric icon={CalendarDays} label={ui.activeTrips} value={`${travelFixture.metrics.activeTrips}`} /><Metric icon={CircleDollarSign} label={ui.collected} value={`${travelFixture.metrics.collectedPercent}%`} tone="emerald" /><Metric icon={ReceiptText} label={ui.outstanding} value={money.format(travelFixture.metrics.outstanding)} tone="amber" /><Metric icon={BarChart3} label={ui.profit} value={money.format(travelFixture.metrics.profit)} /></div><div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><b className="text-xs">{ui.attention}</b><StatusPill label="2" tone="amber" /></div>{travelFixture.paymentHealth.slice(0, 2).map((row) => <div key={row.trip} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs last:border-0"><div className="min-w-0"><b className="block truncate"><bdi>{row.customer}</bdi></b><span className="text-slate-500" dir="ltr">{row.trip}</span></div><div className="text-end"><b className="tabular-nums" dir="ltr">{money.format(row.outstanding)}</b><div><StatusPill label={ui.followUp} tone="amber" /></div></div></div>)}</div></div></div></DemoShell>;
}

function TravelTrips() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  return <DemoShell screen="travel-trips"><div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><b className="text-sm">{ui.recentTrips}</b><span className="text-xs text-slate-500">12 {ui.activeTrips}</span></div><div className="hidden grid-cols-[1.3fr_1fr_.7fr_.8fr] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:grid"><span>{ui.customer}</span><span>{ui.destination}</span><span>{ui.departure}</span><span>{ui.status}</span></div>{travelFixture.trips.map((trip) => <div key={trip.id} className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-100 px-4 py-3 text-xs sm:grid-cols-[1.3fr_1fr_.7fr_.8fr] sm:border-t-0"><div className="min-w-0"><b className="block truncate"><bdi>{trip.customer}</bdi></b><span className="text-slate-500" dir="ltr">{trip.id} · {trip.travelers} {ui.travelers}</span></div><span className="hidden self-center sm:block"><bdi>{trip.destination}</bdi></span><span className="hidden self-center tabular-nums sm:block" dir="ltr">{trip.departure}</span><div className="self-center text-end sm:text-start"><StatusPill label={trip.status === 'confirmed' ? ui.confirmed : ui.planning} tone={trip.status === 'confirmed' ? 'green' : 'blue'} /></div></div>)}</div></DemoShell>;
}

function TravelPayments() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  return <DemoShell screen="travel-payments"><div className="grid gap-3 sm:grid-cols-3"><Metric icon={CircleDollarSign} label={ui.collected} value="26,110" tone="emerald" /><Metric icon={Clock3} label={ui.scheduled} value="3,860" /><Metric icon={ReceiptText} label={ui.outstanding} value="5,660" tone="amber" /></div><div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3 text-sm font-bold">{ui.paymentHealth}</div>{travelFixture.paymentHealth.map((row) => { const percent = Math.round(row.collected / row.total * 100); return <div key={row.trip} className="grid gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center"><div className="text-xs"><b className="block"><bdi>{row.customer}</bdi></b><span className="text-slate-500" dir="ltr">{row.trip}</span></div><div><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>{ui.collected}</span><span dir="ltr">{percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-700" style={{ width: `${percent}%` }} /></div></div><StatusPill label={row.status === 'paid' ? ui.paid : ui.partial} tone={row.status === 'paid' ? 'green' : 'amber'} /></div>; })}</div></DemoShell>;
}

function TravelInstallments() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  return <DemoShell screen="travel-installments"><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><b className="text-sm">{ui.installments}</b><p className="mt-1 text-xs text-slate-500" dir="ltr">DEMO-TR-1041 · Omar Haddad</p></div><StatusPill label={ui.partial} tone="amber" /></div><ol className="mt-5 space-y-0">{travelFixture.installments.map((item, index) => <li key={item.id} className="relative grid grid-cols-[2rem_1fr_auto] gap-3 pb-5 last:pb-0"><span className={`z-10 flex h-8 w-8 items-center justify-center rounded-full ${item.status === 'paid' ? 'bg-emerald-600 text-white' : item.status === 'due' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{index + 1}</span>{index < travelFixture.installments.length - 1 && <span className="absolute start-4 top-8 h-[calc(100%-2rem)] w-px bg-slate-200" />}<div className="text-xs"><b className="block tabular-nums" dir="ltr">{item.due}</b><span className="text-slate-500" dir="ltr">{item.id}</span></div><div className="text-end"><b className="block tabular-nums" dir="ltr">{money.format(item.amount)}</b><StatusPill label={item.status === 'paid' ? ui.paid : item.status === 'due' ? ui.due : ui.scheduled} tone={item.status === 'paid' ? 'green' : item.status === 'due' ? 'amber' : 'blue'} /></div></li>)}</ol></div></DemoShell>;
}

function TravelAnalytics() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  return <DemoShell screen="travel-analytics"><div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]"><div className="rounded-xl border border-slate-200 bg-white p-4"><b className="text-sm">{ui.revenueTrend}</b><div className="mt-6 flex h-40 items-end gap-3" aria-label={ui.revenueTrend}>{travelFixture.analytics.revenue.map((height, index) => <div key={travelFixture.analytics.months[index]} className="flex flex-1 flex-col items-center gap-2"><div className="flex h-28 items-end gap-1"><span className="w-2 rounded-t bg-sky-700" style={{ height: `${height}%` }} /><span className="w-2 rounded-t bg-emerald-500" style={{ height: `${travelFixture.analytics.profit[index]}%` }} /></div><span className="text-[9px] text-slate-500">{travelFixture.analytics.months[index]}</span></div>)}</div></div><div className="rounded-xl border border-slate-200 bg-white p-4"><b className="text-sm">{ui.destinationMix}</b><div className="mt-5 space-y-3">{travelFixture.analytics.destinations.map((item) => <div key={item.label}><div className="mb-1 flex justify-between text-xs"><bdi>{item.label}</bdi><span dir="ltr">{item.value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-700" style={{ width: `${item.value * 2.3}%` }} /></div></div>)}</div></div></div></DemoShell>;
}

function SupermarketPos() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  return <DemoShell screen="supermarket-pos"><div className="grid overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-white lg:grid-cols-[1.3fr_.7fr]"><div className="p-4"><div className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-300"><ScanLine className="h-4 w-4" /><span>{ui.scanPrompt}</span></div><div className="mt-4"><div className="mb-2 flex items-center justify-between text-xs"><b>{ui.basket}</b><span className="text-slate-400"><bdi>{supermarketFixture.cart.length} {ui.items}</bdi></span></div>{supermarketFixture.cart.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-700 py-3 text-xs"><div><b className="block"><bdi>{item.name}</bdi></b><span className="text-slate-400" dir="ltr">{item.id}</span></div><div className="text-end"><span className="block" dir="ltr">{item.quantity} × {item.unitPrice.toFixed(2)}</span><b dir="ltr">{(item.quantity * item.unitPrice).toFixed(2)}</b></div></div>)}</div></div><aside className="border-t border-slate-700 bg-slate-800 p-4 lg:border-s lg:border-t-0"><ReceiptText className="h-5 w-5 text-sky-300" /><p className="mt-5 text-xs text-slate-400">{ui.total}</p><p className="mt-1 text-4xl font-bold tabular-nums" dir="ltr">{supermarketFixture.total.toFixed(2)}</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" className="min-h-12 rounded-lg bg-emerald-500 text-xs font-bold text-slate-950">{ui.cash}</button><button type="button" className="min-h-12 rounded-lg bg-sky-500 text-xs font-bold text-slate-950">{ui.card}</button></div></aside></div></DemoShell>;
}

function SupermarketSales() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  return <DemoShell screen="supermarket-sales"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric icon={ReceiptText} label={ui.transactions} value={`${supermarketFixture.metrics.transactions}`} /><Metric icon={CircleDollarSign} label={ui.revenue} value={money.format(supermarketFixture.metrics.sales)} tone="emerald" /><Metric icon={ShoppingBasket} label={ui.averageBasket} value={supermarketFixture.metrics.averageBasket.toFixed(2)} /><Metric icon={CreditCard} label={ui.vat} value={money.format(supermarketFixture.metrics.vat)} /></div><div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3 text-sm font-bold">{ui.salesHistory}</div>{supermarketFixture.sales.map((sale) => <div key={sale.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 text-xs last:border-0"><div><b className="block" dir="ltr">{sale.id}</b><span className="text-slate-500"><bdi>{sale.time} · {sale.items} {ui.items}</bdi></span></div><StatusPill label={sale.method === 'card' ? ui.card : ui.cash} tone="blue" /><b className="tabular-nums" dir="ltr">{sale.total.toFixed(2)}</b></div>)}</div></DemoShell>;
}

function RestaurantFloor() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  return <DemoShell screen="restaurant-floor"><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><b className="text-sm">{ui.floorPlan}</b><div className="flex gap-2 text-[10px]"><StatusPill label={ui.available} tone="green" /><StatusPill label={ui.seated} tone="blue" /><StatusPill label={ui.reserved} tone="amber" /></div></div><div className="relative mt-4 h-64 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">{restaurantFixture.tables.map((table) => <div key={table.id} className={`absolute flex h-16 w-20 flex-col items-center justify-center rounded-xl border-2 text-xs shadow-sm ${table.status === 'available' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : table.status === 'seated' ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`} style={{ insetInlineStart: `${table.x}%`, top: `${table.y}%` }}><Table2 className="h-4 w-4" /><b>{ui.table} {table.id.slice(1)}</b><span>{table.seats} {ui.guests}</span></div>)}</div></div></DemoShell>;
}

function RestaurantKds() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui;
  const columns = ['newOrders', 'preparing', 'ready'] as const;
  return <DemoShell screen="restaurant-kds"><div className="grid gap-3 md:grid-cols-3">{columns.map((column) => <section key={column} className="rounded-xl bg-slate-200/70 p-3"><div className="mb-3 flex items-center justify-between text-xs font-bold"><span>{ui[column]}</span><span className="rounded-full bg-white px-2 py-1">1</span></div>{restaurantFixture.tickets.filter((ticket) => ticket.status === column).map((ticket) => <article key={ticket.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-center justify-between"><b className="text-xs">{ticket.table}</b><span className={`text-xs font-bold ${ticket.elapsed >= 15 ? 'text-rose-700' : 'text-slate-500'}`} dir="ltr">{ticket.elapsed} {ui.minutes}</span></div><ul className="mt-3 space-y-2 text-xs">{ticket.items.map((item) => <li key={item}><bdi>{item}</bdi></li>)}</ul><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${column === 'ready' ? 'bg-emerald-500' : column === 'preparing' ? 'bg-sky-600' : 'bg-amber-500'}`} style={{ width: column === 'ready' ? '100%' : column === 'preparing' ? '66%' : '25%' }} /></div></article>)}</section>)}</div></DemoShell>;
}

function AutoRepairOrder() {
  const { locale } = useMarketingLanguage(); const ui = phase2Content[locale].demo.ui; const order = autoRepairFixture.order;
  return <DemoShell screen="auto-repair-order"><div className="grid gap-3 lg:grid-cols-[.8fr_1.2fr]"><aside className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><CarFront className="h-6 w-6 text-sky-800" /><StatusPill label={ui.inProgress} tone="blue" /></div><p className="mt-5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{ui.vehicle}</p><b className="mt-1 block text-sm"><bdi>{order.vehicle}</bdi></b><span className="text-xs text-slate-500" dir="ltr">{order.registration} · {money.format(order.mileage)} km</span><p className="mt-5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{ui.owner}</p><b className="mt-1 block text-sm"><bdi>{order.owner}</bdi></b><p className="mt-5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{ui.diagnosis}</p><p className="mt-1 text-xs leading-5 text-slate-700"><bdi>{order.diagnosis}</bdi></p></aside><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><b className="text-sm">{ui.workOrder}</b><p className="text-xs text-slate-500" dir="ltr">{order.id}</p></div><PackageSearch className="h-5 w-5 text-slate-400" /></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><b className="text-xs">{ui.labor}</b>{order.labor.map((line) => <div key={line.description} className="mt-2 flex justify-between border-b border-slate-100 pb-2 text-xs"><span><bdi>{line.description}</bdi></span><b dir="ltr">{line.amount}</b></div>)}</div><div><b className="text-xs">{ui.parts}</b>{order.parts.map((line) => <div key={line.description} className="mt-2 flex justify-between border-b border-slate-100 pb-2 text-xs"><span><bdi>{line.description}</bdi></span><b dir="ltr">{line.amount}</b></div>)}</div></div><div className="mt-5 flex justify-between rounded-lg bg-slate-950 px-4 py-3 text-white"><b>{ui.total}</b><b className="tabular-nums" dir="ltr">{money.format(order.total)}</b></div></div></div></DemoShell>;
}

export function ProductVisual({ screen }: { screen: DemoScreenId }) {
  switch (screen) {
    case 'travel-dashboard': return <TravelDashboard />;
    case 'travel-trips': return <TravelTrips />;
    case 'travel-payments': return <TravelPayments />;
    case 'travel-installments': return <TravelInstallments />;
    case 'travel-analytics': return <TravelAnalytics />;
    case 'supermarket-pos': return <SupermarketPos />;
    case 'supermarket-sales': return <SupermarketSales />;
    case 'restaurant-floor': return <RestaurantFloor />;
    case 'restaurant-kds': return <RestaurantKds />;
    case 'auto-repair-order': return <AutoRepairOrder />;
  }
}
