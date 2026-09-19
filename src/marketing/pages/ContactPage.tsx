import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Mail, Send, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useMarketingAnalytics } from '../analytics/analytics';
import { MarketingButton, MarketingCard, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { phase2Content } from '../content/phase2Content';
import { MailtoLeadSubmissionAdapter, MYDESCK_CONTACT_EMAIL } from '../leads/MailtoLeadSubmissionAdapter';
import { leadBusinessTypes, leadIntents, leadTeamSizes, type LeadBusinessType, type LeadField, type LeadIntent, type LeadSubmission, type LeadValidationErrors } from '../leads/leadModel';
import { validateLeadSubmission } from '../leads/leadValidation';
import { MarketingSEO } from '../seo/MarketingSEO';

const businessTypeAliases: Record<string, LeadBusinessType> = { travel: 'travel-agency', 'travel-agencies': 'travel-agency', supermarket: 'supermarket', restaurants: 'restaurant', restaurant: 'restaurant', 'auto-repair': 'auto-repair' };

export default function ContactPage() {
  const { copy, locale } = useMarketingLanguage();
  const p2 = phase2Content[locale];
  const analytics = useMarketingAnalytics();
  const [searchParams] = useSearchParams();
  const queryIntent = searchParams.get('intent');
  const initialIntent: LeadIntent = leadIntents.includes(queryIntent as LeadIntent) ? queryIntent as LeadIntent : 'trial';
  const queryBusinessType = searchParams.get('businessType') || '';
  const initialBusinessType = leadBusinessTypes.includes(queryBusinessType as LeadBusinessType) ? queryBusinessType as LeadBusinessType : businessTypeAliases[queryBusinessType] || 'travel-agency';
  const adapter = useMemo(() => new MailtoLeadSubmissionAdapter(), []);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'handed-off' | 'error'>('idle');
  const [errors, setErrors] = useState<LeadValidationErrors>({});
  const [lead, setLead] = useState<LeadSubmission>({ name: '', businessName: '', email: '', phone: '', country: '', businessType: initialBusinessType, teamSize: '2-5', intent: initialIntent, message: '', locale });

  const update = <Key extends keyof LeadSubmission>(field: Key, value: LeadSubmission[Key]) => {
    setLead((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const focusStep = () => window.requestAnimationFrame(() => headingRef.current?.focus());
  const goBack = () => { setStep((current) => Math.max(0, current - 1)); focusStep(); };
  const validate = () => validateLeadSubmission({ ...lead, locale }, p2.lead.required, p2.lead.invalidEmail);
  const continueFlow = () => {
    if (step === 0) { void analytics.track({ name: 'request_access_start', intent: lead.intent, locale }); setStep(1); focusStep(); return; }
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setStep(2); focusStep();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setStep(1); focusStep(); return; }
    setStatus('submitting');
    try {
      const receipt = await adapter.submit({ ...lead, locale });
      setStatus('handed-off');
      void analytics.track({ name: 'request_access_complete', intent: lead.intent, locale, delivery: receipt.delivery, stored: receipt.stored });
    } catch { setStatus('error'); }
  };

  const inputClass = (field: LeadField) => `mt-2 min-h-12 w-full rounded-xl border bg-white px-4 text-base text-slate-950 outline-none focus:ring-2 ${errors[field] ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-200' : 'border-slate-300 focus:border-sky-700 focus:ring-sky-700/20'}`;
  const fieldError = (field: LeadField) => errors[field] ? <span id={`${field}-error`} className="mt-1.5 block text-xs font-semibold text-rose-700">{errors[field]}</span> : null;
  const hasErrors = Object.values(errors).some(Boolean);

  if (status === 'handed-off') {
    return <><MarketingSEO path="/contact" /><MarketingSection className="min-h-[70vh] bg-[var(--marketing-hero)]"><MarketingContainer className="max-w-3xl"><MarketingCard className="p-7 sm:p-10"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-6 w-6" aria-hidden="true" /></span><h1 className="mt-6 text-3xl font-semibold text-slate-950">{p2.lead.successTitle}</h1><p className="mt-4 text-base leading-7 text-slate-600">{p2.lead.successDescription}</p><ol className="mt-6 space-y-3">{p2.lead.successNext.map((item, index) => <li key={item} className="flex items-start gap-3 text-sm text-slate-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">{index + 1}</span>{item}</li>)}</ol><p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">{p2.lead.notStored}</p><div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={() => { setStatus('idle'); setStep(1); }} className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 hover:bg-slate-50">{p2.lead.edit}</button><MarketingButton to="/">{copy.common.backHome}</MarketingButton></div></MarketingCard></MarketingContainer></MarketingSection></>;
  }

  const currentTitle = step === 0 ? p2.lead.businessStepTitle : step === 1 ? p2.lead.detailsStepTitle : p2.lead.confirmStepTitle;
  const currentDescription = step === 0 ? p2.lead.businessStepDescription : step === 1 ? p2.lead.detailsStepDescription : p2.lead.confirmStepDescription;
  return (
    <>
      <MarketingSEO path="/contact" />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-16 sm:pt-20"><MarketingContainer><SectionHeading level={1} eyebrow={copy.contact.eyebrow} title={copy.contact.title} description={copy.contact.intro} /></MarketingContainer></MarketingSection>
      <MarketingSection><MarketingContainer className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <MarketingCard className="p-5 sm:p-8">
          <ol className="mb-8 grid grid-cols-3 gap-2" aria-label={p2.lead.review}>{p2.lead.steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={`rounded-xl border px-2 py-3 text-center text-xs font-bold ${step === index ? 'border-sky-700 bg-sky-50 text-sky-900' : index < step ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-500'}`}><span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">{index < step ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>
          <form onSubmit={submit} noValidate>
            <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-slate-950 focus:outline-none">{currentTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{currentDescription}</p>
            {hasErrors && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{p2.lead.correctErrors}</div>}
            {step === 0 && <div className="mt-6 grid gap-5">
              <fieldset><legend className="text-sm font-bold text-slate-900">{p2.lead.businessType}</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{leadBusinessTypes.map((item) => <label key={item} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm font-semibold ${lead.businessType === item ? 'border-sky-700 bg-sky-50 text-sky-950' : 'border-slate-200 hover:bg-slate-50'}`}><input type="radio" name="businessType" value={item} checked={lead.businessType === item} onChange={() => update('businessType', item)} className="h-4 w-4 accent-sky-700" />{p2.lead.businessTypes[item]}</label>)}</div></fieldset>
              <fieldset><legend className="text-sm font-bold text-slate-900">{p2.lead.intent}</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{leadIntents.map((item) => <label key={item} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm font-semibold ${lead.intent === item ? 'border-sky-700 bg-sky-50 text-sky-950' : 'border-slate-200 hover:bg-slate-50'}`}><input type="radio" name="intent" value={item} checked={lead.intent === item} onChange={() => { update('intent', item); void analytics.track({ name: 'contact_intent', intent: item, locale }); }} className="h-4 w-4 accent-sky-700" />{p2.lead.intents[item]}</label>)}</div></fieldset>
            </div>}
            {step === 1 && <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-900">{p2.lead.name}<input value={lead.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} className={inputClass('name')} />{fieldError('name')}</label>
              <label className="text-sm font-semibold text-slate-900">{p2.lead.businessName}<input value={lead.businessName} onChange={(event) => update('businessName', event.target.value)} autoComplete="organization" aria-invalid={Boolean(errors.businessName)} aria-describedby={errors.businessName ? 'businessName-error' : undefined} className={inputClass('businessName')} />{fieldError('businessName')}</label>
              <label className="text-sm font-semibold text-slate-900">{p2.lead.email}<input type="email" dir="ltr" value={lead.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} className={inputClass('email')} />{fieldError('email')}</label>
              <label className="text-sm font-semibold text-slate-900">{p2.lead.phone} <span className="font-normal text-slate-500">({p2.lead.phoneOptional})</span><input type="tel" dir="ltr" value={lead.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" className={inputClass('phone')} /></label>
              <label className="text-sm font-semibold text-slate-900">{p2.lead.country}<input value={lead.country} onChange={(event) => update('country', event.target.value)} autoComplete="country-name" aria-invalid={Boolean(errors.country)} aria-describedby={errors.country ? 'country-error' : undefined} className={inputClass('country')} />{fieldError('country')}</label>
              <label className="text-sm font-semibold text-slate-900">{p2.lead.teamSize}<select value={lead.teamSize} onChange={(event) => update('teamSize', event.target.value as LeadSubmission['teamSize'])} className={inputClass('teamSize')}>{leadTeamSizes.map((item) => <option key={item} value={item}>{p2.lead.teamSizes[item]}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-900 sm:col-span-2">{p2.lead.message} <span className="font-normal text-slate-500">({p2.lead.messageOptional})</span><textarea rows={5} value={lead.message} onChange={(event) => update('message', event.target.value)} className={`${inputClass('message')} py-3`} /></label>
            </div>}
            {step === 2 && <div className="mt-6"><dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">{[[p2.lead.intent, p2.lead.intents[lead.intent]], [p2.lead.businessType, p2.lead.businessTypes[lead.businessType]], [p2.lead.name, lead.name], [p2.lead.businessName, lead.businessName], [p2.lead.email, lead.email], [p2.lead.phone, lead.phone || p2.lead.phoneOptional], [p2.lead.country, lead.country], [p2.lead.teamSize, p2.lead.teamSizes[lead.teamSize]]].map(([label, value]) => <div key={label} className="rounded-lg bg-white p-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900"><bdi>{value}</bdi></dd></div>)}</dl><p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{p2.lead.truthfulDelivery}</p></div>}
            <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{p2.lead.privacyNote}</p>
            {status === 'error' && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{p2.lead.notStored}</p>}
            <div className="mt-7 flex flex-wrap gap-3">{step > 0 && <button type="button" onClick={goBack} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />{p2.lead.back}</button>}{step < 2 ? <button key="continue" type="button" onClick={(event) => { event.preventDefault(); continueFlow(); }} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-800 px-5 text-sm font-bold text-white hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">{step === 1 ? p2.lead.review : p2.lead.continue}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" /></button> : <button key="submit" type="submit" disabled={status === 'submitting'} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-800 px-5 text-sm font-bold text-white hover:bg-sky-900 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"><Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />{status === 'submitting' ? p2.lead.sending : p2.lead.send}</button>}</div>
          </form>
        </MarketingCard>
        <div className="space-y-4"><MarketingCard className="border-slate-800 bg-slate-950 p-7 text-white"><Mail className="h-7 w-7 text-sky-300" aria-hidden="true" /><h2 className="mt-6 text-xl font-semibold">{copy.contact.direct}</h2><a href={`mailto:${MYDESCK_CONTACT_EMAIL}`} className="mt-4 inline-flex min-h-11 items-center break-all text-sm font-semibold text-sky-300 hover:text-sky-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" dir="ltr">{MYDESCK_CONTACT_EMAIL}</a></MarketingCard><p className="px-2 text-xs leading-5 text-slate-500">{p2.lead.truthfulDelivery}</p></div>
      </MarketingContainer></MarketingSection>
    </>
  );
}
