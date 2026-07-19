import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Copy, ExternalLink, Heart, MessageCircle, RotateCcw, Save, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import i18n from '../../lib/i18n';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  WHATSAPP_MESSAGE_TYPES, containsSensitiveWhatsAppContent, createWhatsAppUrl, deleteWhatsAppTemplate,
  fetchWhatsAppTemplates, findUnknownWhatsappVariables, formatWhatsAppPhone, generateTripWhatsappMessage,
  markWhatsappTemplateUsed, maskWhatsAppPhone, normalizeWhatsAppPhone, saveWhatsAppTemplate,
  updateWhatsappTemplateState, type TripWhatsappTemplate, type WhatsappLanguage, type WhatsappMessageType,
} from '../../lib/tripWhatsapp';
import { loadTripWhatsappPreferences, saveTripWhatsappPreferences, type TripWhatsappPreferences } from '../../lib/tripWhatsappPreferences';
import { recommendWhatsappMessage } from '../../lib/tripWhatsappSuggestions';
import { supabase } from '../../lib/supabase';
import type { Trip } from '../../types/trip';
import { Button } from '../travel-ui/Button';
import { fetchTripPaymentPlan } from '../../lib/tripPayments';

interface Props { trip: Trip; onClose: () => void; initialType?: WhatsappMessageType }

const isLanguage = (value: string): value is WhatsappLanguage => value === 'en' || value === 'he' || value === 'ar';
const messageDirection = (language: WhatsappLanguage) => language === 'en' ? 'ltr' : 'rtl';

export function TripWhatsappDialog({ trip, onClose, initialType }: Props) {
  const { t, direction, language: appLanguage } = useLanguage();
  const { user, profile, userProfile } = useAuth();
  const client = useQueryClient();
  const openingControl = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const defaultLanguage: WhatsappLanguage = isLanguage(appLanguage) ? appLanguage : 'en';
  const initialPreferences = useMemo(() => loadTripWhatsappPreferences(user?.id || 'anonymous', defaultLanguage), [defaultLanguage, user?.id]);
  const [preferences, setPreferences] = useState<TripWhatsappPreferences>(initialPreferences);
  const [selectedLanguage, setSelectedLanguage] = useState<WhatsappLanguage>(initialPreferences.language);
  const [messageType, setMessageType] = useState<WhatsappMessageType>(initialType || initialPreferences.lastMessageType);
  const [body, setBody] = useState('');
  const [generatedBody, setGeneratedBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editNumber, setEditNumber] = useState(!normalizeWhatsAppPhone(trip.client_phone || ''));
  const [phone, setPhone] = useState(trip.client_phone || '');
  const [updatePhone, setUpdatePhone] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TripWhatsappTemplate | null>(null);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const templates = useQuery({ queryKey: ['trip-whatsapp-templates'], queryFn: fetchWhatsAppTemplates, retry: false });
  const paymentPlan = useQuery({ queryKey: ['trip-payment-plan', trip.id], queryFn: () => fetchTripPaymentPlan(trip.id), retry: false });
  const payment = useMemo(() => paymentPlan.data || { plan: null, installments: [] }, [paymentPlan.data]);
  const recommended = useMemo(() => recommendWhatsappMessage(trip, payment), [payment, trip]);
  const translated = useCallback((key: string, values?: Record<string, unknown>) => i18n.t(key, { ...values, lng: selectedLanguage }), [selectedLanguage]);
  const generated = useMemo(() => generateTripWhatsappMessage(
    messageType, trip, selectedLanguage, translated,
    { businessName: preferences.businessDisplayName || profile?.business_name, businessPhone: preferences.businessContactNumber || profile?.phone_number, agentName: userProfile?.full_name },
    payment, preferences.includeSignature,
  ), [messageType, payment, preferences.businessContactNumber, preferences.businessDisplayName, preferences.includeSignature, profile?.business_name, profile?.phone_number, selectedLanguage, translated, trip, userProfile?.full_name]);

  useEffect(() => {
    let next = generated.message;
    if (preferences.greetingStyle === 'formal' && generated.variables.client_name) {
      next = next.replace(/^[^\n]+/, translated('trips.whatsapp.preferences.formalGreeting', { clientName: generated.variables.client_name }));
    }
    if (!preferences.includeEmojis) next = next.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/ +\n/g, '\n');
    if (preferences.closingText.trim()) next = `${next}\n\n${preferences.closingText.trim()}`;
    setGeneratedBody(next);
    if (!dirty && !selectedTemplate) setBody(next);
  }, [dirty, generated.message, generated.variables.client_name, preferences.closingText, preferences.greetingStyle, preferences.includeEmojis, selectedTemplate, translated]);

  useEffect(() => {
    const control = openingControl.current;
    dialog.current?.querySelector<HTMLButtonElement>('[data-whatsapp-close]')?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); control?.focus(); };
  }, [onClose]);

  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const sensitive = containsSensitiveWhatsAppContent(body);
  const unknownVariables = findUnknownWhatsappVariables(body);
  const url = createWhatsAppUrl(phone, body);
  const canOpen = Boolean(url) && (!preferences.confirmBeforeOpen || confirmed);

  const persistPreferences = (next: TripWhatsappPreferences) => {
    setPreferences(next);
    if (user) saveTripWhatsappPreferences(user.id, next);
  };
  const chooseType = (type: WhatsappMessageType) => {
    setMessageType(type); setDirty(false); setSelectedTemplate(null); setConfirmed(false);
    if (user && preferences.rememberLastType) persistPreferences({ ...preferences, lastMessageType: type, language: selectedLanguage });
  };
  const chooseTemplate = (template: TripWhatsappTemplate) => {
    setSelectedTemplate(template); setSelectedLanguage(template.language); setMessageType('custom'); setBody(template.body); setDirty(true); setConfirmed(false);
  };
  const refreshTemplates = () => client.invalidateQueries({ queryKey: ['trip-whatsapp-templates'] });
  const saveMutation = useMutation({
    mutationFn: () => saveWhatsAppTemplate(user!.id, { name: templateName, body, language: selectedLanguage, category: messageType }),
    onSuccess: () => { void refreshTemplates(); setShowTemplateSave(false); setTemplateName(''); toast.success(t('trips.whatsapp.saved')); },
    onError: () => toast.error(t('trips.whatsapp.templateSaveFailed')),
  });
  const deleteMutation = useMutation({ mutationFn: deleteWhatsAppTemplate, onSuccess: () => void refreshTemplates() });
  const stateMutation = useMutation({ mutationFn: ({ id, values }: { id: string; values: { is_favorite?: boolean; is_archived?: boolean } }) => updateWhatsappTemplateState(id, values), onSuccess: () => void refreshTemplates() });
  const duplicateMutation = useMutation({ mutationFn: (template: TripWhatsappTemplate) => saveWhatsAppTemplate(user!.id, { name: `${template.name} ${t('trips.whatsapp.copySuffix')}`, body: template.body, language: template.language, category: template.category }), onSuccess: () => void refreshTemplates() });

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    toast.success(t('trips.whatsapp.copied'));
  };
  const openWhatsapp = async () => {
    if (!url || !canOpen) return;
    if (updatePhone && normalizedPhone && normalizedPhone !== normalizeWhatsAppPhone(trip.client_phone || '')) {
      const { error } = await supabase.from('trips').update({ client_phone: normalizedPhone }).eq('id', trip.id);
      if (error) { toast.error(t('trips.whatsapp.phoneUpdateFailed')); return; }
    }
    const metadata = { action: 'whatsapp_opened', category: messageType, language: selectedLanguage, phone_suffix: maskWhatsAppPhone(phone) };
    const { error } = await supabase.rpc('log_trip_activity', { p_trip_id: trip.id, p_activity_type: 'whatsapp_prepared', p_metadata: metadata });
    if (error) console.warn('[Travel WhatsApp] Activity logging failed', { code: error.code });
    if (selectedTemplate) void markWhatsappTemplateUsed(selectedTemplate.id, selectedTemplate.usage_count);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-2 sm:p-4" dir={direction} role="dialog" aria-modal="true" aria-labelledby="whatsapp-title">
    <div ref={dialog} className="my-auto max-h-[96dvh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-2xl dark:bg-slate-900">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0"><h2 id="whatsapp-title" className="flex items-center gap-2 text-lg font-bold"><MessageCircle className="h-5 w-5 text-emerald-600"/>{t('trips.whatsapp.title')}</h2><p className="truncate text-sm text-slate-500">{trip.client_name} · {trip.destination}</p></div>
        <div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => setShowPreferences((value) => !value)} aria-label={t('trips.whatsapp.preferences.title')}><Settings2/></Button><Button data-whatsapp-close size="icon" variant="ghost" onClick={onClose} aria-label={t('trips.close')}><X/></Button></div>
      </header>

      <div className="grid grid-cols-3 border-b border-slate-200 text-center text-xs font-semibold dark:border-slate-800">{(['selectType','previewStep','openStep'] as const).map((key, index) => <div key={key} className="border-b-2 border-emerald-500 p-2"><span className="me-1 text-emerald-600">{index + 1}</span>{t(`trips.whatsapp.steps.${key}`)}</div>)}</div>

      <main className="space-y-5 p-4 sm:p-5">
        <section className="grid gap-3 border-s-2 border-emerald-500 bg-slate-50 p-3 sm:grid-cols-3 dark:bg-slate-800/60" aria-label={t('trips.whatsapp.recipient')}>
          <div><span className="text-xs text-slate-500">{t('trips.whatsapp.recipient')}</span><strong className="block">{trip.client_name}</strong></div>
          <div><span className="text-xs text-slate-500">{t('trips.whatsapp.savedPhone')}</span><strong className="block font-mono" dir="ltr">{normalizedPhone ? formatWhatsAppPhone(phone) : t('trips.whatsapp.invalidPhone')}</strong></div>
          <Button size="sm" variant="ghost" className="self-center justify-self-start" onClick={() => setEditNumber((value) => !value)}>{t('trips.whatsapp.changeNumber')}</Button>
          {editNumber && <div className="col-span-full grid gap-2 sm:grid-cols-[1fr_auto]"><label className="text-sm">{t('trips.whatsapp.phoneLabel')}<input value={phone} onChange={(event) => { setPhone(event.target.value); setConfirmed(false); }} className={`mt-1 h-10 w-full rounded border bg-white px-3 font-mono dark:bg-slate-950 ${phone && !normalizedPhone ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'}`} dir="ltr" aria-invalid={Boolean(phone && !normalizedPhone)}/></label><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={updatePhone} onChange={(event) => setUpdatePhone(event.target.checked)}/>{t('trips.whatsapp.updateClientPhone')}</label>{phone && !normalizedPhone && <p className="col-span-full text-sm text-rose-600" role="alert">{t('trips.whatsapp.invalidPhone')}</p>}</div>}
        </section>

        {showPreferences && <section className="grid gap-3 border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-700"><h3 className="col-span-full font-semibold">{t('trips.whatsapp.preferences.title')}</h3>{(['includeEmojis','includeSignature','rememberLastType','confirmBeforeOpen'] as const).map((key) => <label key={key} className="flex items-center justify-between gap-3 text-sm"><span>{t(`trips.whatsapp.preferences.${key}`)}</span><input type="checkbox" checked={preferences[key]} onChange={(event) => persistPreferences({ ...preferences, [key]: event.target.checked })}/></label>)}<label className="text-sm">{t('trips.whatsapp.preferences.greetingStyle')}<select value={preferences.greetingStyle} onChange={(event) => persistPreferences({ ...preferences, greetingStyle: event.target.value as 'friendly' | 'formal' })} className="mt-1 h-10 w-full rounded border bg-transparent px-3"><option value="friendly">{t('trips.whatsapp.preferences.friendly')}</option><option value="formal">{t('trips.whatsapp.preferences.formal')}</option></select></label><label className="text-sm">{t('trips.whatsapp.preferences.businessName')}<input value={preferences.businessDisplayName} onChange={(event) => persistPreferences({ ...preferences, businessDisplayName: event.target.value })} className="mt-1 h-10 w-full rounded border bg-transparent px-3"/></label><label className="text-sm">{t('trips.whatsapp.preferences.businessPhone')}<input value={preferences.businessContactNumber} onChange={(event) => persistPreferences({ ...preferences, businessContactNumber: event.target.value })} className="mt-1 h-10 w-full rounded border bg-transparent px-3" dir="ltr"/></label><label className="col-span-full text-sm">{t('trips.whatsapp.preferences.closingText')}<input value={preferences.closingText} onChange={(event) => persistPreferences({ ...preferences, closingText: event.target.value })} className="mt-1 h-10 w-full rounded border bg-transparent px-3"/></label></section>}

        <section><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t('trips.whatsapp.messageType')}</h3><label className="text-sm">{t('trips.whatsapp.language')}<select value={selectedLanguage} onChange={(event) => { const next = event.target.value as WhatsappLanguage; setSelectedLanguage(next); setDirty(false); setSelectedTemplate(null); setConfirmed(false); if (user) persistPreferences({ ...preferences, language: next }); }} className="ms-2 h-9 rounded border bg-transparent px-2"><option value="he">{t('languages.he')}</option><option value="ar">{t('languages.ar')}</option><option value="en">{t('languages.en')}</option></select></label></div><p className="mb-2 text-sm text-emerald-700 dark:text-emerald-300">{t('trips.whatsapp.recommended')}: {t(`trips.whatsapp.types.${recommended}`)}</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{WHATSAPP_MESSAGE_TYPES.map((type) => <Button key={type} size="sm" variant={messageType === type && !selectedTemplate ? 'primary' : 'secondary'} onClick={() => chooseType(type)}>{t(`trips.whatsapp.types.${type}`)}</Button>)}</div></section>

        {generated.missing.length > 0 && <div className="border-s-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="status"><strong>{t('trips.whatsapp.missingData')}</strong><span className="ms-2">{generated.missing.map((key) => t(`trips.whatsapp.missing.${key}`)).join(', ')}</span></div>}

        <section><div className="flex items-center justify-between"><label htmlFor="whatsapp-message" className="font-semibold">{t('trips.whatsapp.preview')}</label><span className="text-xs text-slate-500">{body.length}/2000</span></div><textarea id="whatsapp-message" value={body} maxLength={2000} onChange={(event) => { setBody(event.target.value); setDirty(true); setConfirmed(false); }} rows={12} className={`mt-2 w-full resize-y rounded border bg-slate-50 p-3 leading-6 dark:bg-slate-950 ${sensitive || unknownVariables.length ? 'border-amber-500' : 'border-slate-300 dark:border-slate-700'}`} dir={messageDirection(selectedLanguage)}/><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => { setBody(generatedBody); setDirty(false); setSelectedTemplate(null); setConfirmed(false); }}><RotateCcw className="h-4 w-4"/>{t('trips.whatsapp.reset')}</Button><Button size="sm" variant="ghost" disabled={!body.trim()} onClick={() => void copy()}><Copy className="h-4 w-4"/>{t('trips.whatsapp.copy')}</Button><Button size="sm" variant="ghost" onClick={() => setShowTemplateSave((value) => !value)}><Save className="h-4 w-4"/>{t('trips.whatsapp.saveTemplate')}</Button></div></section>

        {sensitive && <p className="border-s-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="alert">{t('trips.whatsapp.sensitiveWarning')}</p>}
        {unknownVariables.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300" role="alert">{t('trips.whatsapp.unknownVariables', { variables: unknownVariables.join(', ') })}</p>}
        {showTemplateSave && <section className="grid gap-2 border border-slate-200 p-3 sm:grid-cols-[1fr_auto] dark:border-slate-700"><label className="text-sm">{t('trips.whatsapp.templateName')}<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="mt-1 h-10 w-full rounded border bg-transparent px-3"/></label><Button className="self-end" disabled={!templateName.trim() || !body.trim() || unknownVariables.length > 0 || saveMutation.isPending} onClick={() => saveMutation.mutate()}>{t('trips.save')}</Button></section>}

        {templates.data && templates.data.length > 0 && <section className="border-t border-slate-200 pt-4 dark:border-slate-700"><h3 className="font-semibold">{t('trips.whatsapp.savedTemplates')}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{templates.data.map((template) => <article key={template.id} className="flex min-w-0 items-center gap-2 border border-slate-200 p-2 dark:border-slate-700"><button className="min-w-0 flex-1 text-start" onClick={() => chooseTemplate(template)}><strong className="block truncate">{template.name}</strong><span className="text-xs text-slate-500">{t(`trips.whatsapp.types.${template.category}`, { defaultValue: template.category })} · {template.language} · {t('trips.templates.used', { count: template.usage_count })}</span></button><Button size="icon" variant="ghost" disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate(template)} aria-label={t('trips.whatsapp.duplicateTemplate')}><Copy className="h-4 w-4"/></Button><Button size="icon" variant="ghost" onClick={() => stateMutation.mutate({ id: template.id, values: { is_favorite: !template.is_favorite } })} aria-label={t('trips.whatsapp.favorite')}><Heart className={`h-4 w-4 ${template.is_favorite ? 'fill-current text-rose-500' : ''}`}/></Button><Button size="icon" variant="ghost" onClick={() => stateMutation.mutate({ id: template.id, values: { is_archived: true } })} aria-label={t('trips.whatsapp.archiveTemplate')}><Archive className="h-4 w-4"/></Button><Button size="icon" variant="danger" onClick={() => { if (window.confirm(t('trips.whatsapp.confirmDelete'))) deleteMutation.mutate(template.id); }} aria-label={t('trips.delete')}><Trash2 className="h-4 w-4"/></Button></article>)}</div></section>}
      </main>

      <footer className="sticky bottom-0 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{preferences.confirmBeforeOpen ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/>{t('trips.whatsapp.confirmReview')}</label> : <span/>}<Button variant="primary" disabled={!canOpen} onClick={() => void openWhatsapp()}><ExternalLink className="h-4 w-4"/>{t('trips.whatsapp.open')}</Button></div>{!normalizedPhone && <p className="mt-2 text-sm text-rose-600" role="alert">{t('trips.whatsapp.invalidPhone')}</p>}</footer>
    </div>
  </div>;
}
