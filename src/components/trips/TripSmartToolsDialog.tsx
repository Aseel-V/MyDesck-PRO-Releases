import { useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, ListChecks, Route, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { buildTripSummary, checkTripCompleteness, generateInitialItinerary, generatePackingList, suggestPrice } from '../../lib/tripSmartTools';
import type { Json } from '../../types/database';
import type { Trip } from '../../types/trip';
import { Button } from '../travel-ui/Button';

interface Props { trip: Trip; onClose: () => void; onUpdated?: () => void }
type Tool = 'itinerary' | 'packing' | 'summary' | 'review' | 'pricing';

export function TripSmartToolsDialog({ trip, onClose, onUpdated }: Props) {
  const { user } = useAuth();
  const { t, direction } = useLanguage();
  const [tool, setTool] = useState<Tool>('review');
  const [categories, setCategories] = useState<string[]>(['culture']);
  const [weather, setWeather] = useState<'warm' | 'cold' | 'rainy'>('warm');
  const [targetMarkup, setTargetMarkup] = useState(20);
  const itinerary = useMemo(() => generateInitialItinerary({ startDate: trip.start_date, endDate: trip.end_date, categories, freeDay: true }), [categories, trip.end_date, trip.start_date]);
  const packing = useMemo(() => generatePackingList({ days: Math.max(1, itinerary.length), weather, activities: categories }), [categories, itinerary.length, weather]);
  const summary = useMemo(() => buildTripSummary(trip, true), [trip]);
  const findings = useMemo(() => checkTripCompleteness(trip), [trip]);
  const price = useMemo(() => suggestPrice({ wholesaleCost: trip.wholesale_cost, targetMarkup, minimumProfit: 0 }), [targetMarkup, trip.wholesale_cost]);
  const copy = async (value: unknown) => { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); toast.success(t('trips.smartTools.copied')); };
  const applyItinerary = async () => {
    if (!window.confirm(t('trips.smartTools.confirmItinerary'))) return;
    const { error } = await supabase.from('trips').update({ itinerary: itinerary as unknown as Json, updated_at: new Date().toISOString() }).eq('id', trip.id);
    if (error) { toast.error(t('trips.smartTools.saveFailed')); return; }
    toast.success(t('trips.smartTools.itinerarySaved')); onUpdated?.();
  };
  const savePacking = async () => {
    if (!user) return;
    const items = Object.entries(packing).flatMap(([category, values]) => values.map((label) => ({ category, label, checked: false })));
    const { error } = await supabase.from('trip_packing_lists').insert({ user_id: user.id, trip_id: trip.id, name: `${trip.destination} ${trip.start_date}`, items: items as unknown as Json });
    if (error) toast.error(t('trips.smartTools.saveFailed')); else toast.success(t('trips.smartTools.packingSaved'));
  };
  const tools: Array<{ id: Tool; icon: typeof Route }> = [
    { id: 'review', icon: CheckCircle2 }, { id: 'itinerary', icon: Route }, { id: 'packing', icon: ListChecks },
    { id: 'summary', icon: Clipboard }, { id: 'pricing', icon: Sparkles },
  ];
  return <div className="fixed inset-0 z-[112] overflow-y-auto bg-slate-950/75 p-4" dir={direction} role="dialog" aria-modal="true" aria-labelledby="smart-tools-title"><div className="mx-auto my-4 w-full max-w-4xl rounded-lg bg-white shadow-2xl dark:bg-slate-900"><header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800"><h2 id="smart-tools-title" className="font-bold">{t('trips.smartTools.title')}</h2><Button size="icon" variant="ghost" onClick={onClose} aria-label={t('trips.close')}><X/></Button></header><nav className="flex overflow-x-auto border-b border-slate-200 p-2 dark:border-slate-800">{tools.map(({ id, icon: Icon }) => <Button key={id} variant={tool === id ? 'primary' : 'ghost'} onClick={() => setTool(id)}><Icon className="h-4 w-4"/>{t(`trips.smartTools.${id}`)}</Button>)}</nav><main className="min-h-[360px] p-4">
    {tool === 'review' && <div className="space-y-2">{findings.length ? findings.map((finding) => <div key={finding.code} className={`border-s-4 p-3 text-sm ${finding.level === 'error' ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/10' : finding.level === 'warning' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'}`}><strong>{t(`trips.smartTools.level.${finding.level}`)}</strong><span className="ms-2">{t(`trips.smartTools.findings.${finding.code}`)}</span></div>) : <p className="text-emerald-600">{t('trips.smartTools.complete')}</p>}</div>}
    {tool === 'itinerary' && <div><div className="mb-4 flex flex-wrap gap-2">{['culture','shopping','local','rest'].map((value) => <label key={value} className="flex items-center gap-2 rounded border px-3 py-2 text-sm"><input type="checkbox" checked={categories.includes(value)} onChange={(e) => setCategories((current) => e.target.checked ? [...current,value] : current.filter((item) => item !== value))}/>{t(`trips.smartTools.categories.${value}`)}</label>)}</div><div className="space-y-2">{itinerary.map((item) => <div key={item.day} className="border-s-2 border-cyan-500 bg-slate-50 p-3 dark:bg-slate-800"><strong>{t('trips.smartTools.day', { day: item.day })} · {item.date}</strong><p className="text-sm text-slate-500">{t(`trips.smartTools.generated.${item.title}`)} · {t(`trips.smartTools.generated.${item.description}`)}</p></div>)}</div><div className="mt-4 flex gap-2"><Button variant="primary" onClick={() => void applyItinerary()}>{t('trips.smartTools.apply')}</Button><Button onClick={() => void copy(itinerary)}>{t('trips.smartTools.copy')}</Button></div></div>}
    {tool === 'packing' && <div><select value={weather} onChange={(e) => setWeather(e.target.value as typeof weather)} className="mb-4 h-10 rounded-lg border bg-transparent px-3"><option value="warm">{t('trips.smartTools.weather.warm')}</option><option value="cold">{t('trips.smartTools.weather.cold')}</option><option value="rainy">{t('trips.smartTools.weather.rainy')}</option></select><div className="grid gap-3 sm:grid-cols-2">{Object.entries(packing).map(([category,items]) => <section key={category} className="border-s-2 border-sky-500 bg-slate-50 p-3 dark:bg-slate-800"><h3 className="font-semibold">{t(`trips.smartTools.packingCategories.${category}`)}</h3>{items.map((item) => <label key={item} className="mt-2 flex gap-2 text-sm"><input type="checkbox"/>{t(`trips.smartTools.packingItems.${item.split(':')[0]}`, { count: item.split(':')[1] })}</label>)}</section>)}</div><div className="mt-4 flex gap-2"><Button variant="primary" onClick={() => void savePacking()}>{t('trips.smartTools.savePacking')}</Button><Button onClick={() => void copy(packing)}>{t('trips.smartTools.copy')}</Button></div></div>}
    {tool === 'summary' && <div><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-950">{JSON.stringify(summary, null, 2)}</pre><Button className="mt-3" onClick={() => void copy(summary)}>{t('trips.smartTools.copy')}</Button></div>}
    {tool === 'pricing' && <div className="max-w-lg space-y-4"><label className="block text-sm">{t('trips.smartTools.targetMarkup')}<input type="number" min="0" step="0.1" value={targetMarkup} onChange={(e) => setTargetMarkup(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3"/></label><div className="grid grid-cols-2 gap-3"><div className="bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">{t('trips.wholesaleCost')}</span><strong className="block">{trip.wholesale_cost} {trip.currency}</strong></div><div className="bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">{t('trips.smartTools.suggestedPrice')}</span><strong className="block">{price.suggestedSalePrice.toFixed(2)} {trip.currency}</strong></div><div className="bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">{t('trips.profit')}</span><strong className="block">{price.expectedProfit.toFixed(2)} {trip.currency}</strong></div></div><p className="text-xs text-slate-500">{t('trips.smartTools.pricingExplanation', { markup: targetMarkup })}</p></div>}
  </main></div></div>;
}
