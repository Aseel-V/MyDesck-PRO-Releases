import { useMemo, useState, type FormEvent } from 'react';
import { Mail, Send } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { MarketingCard, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { MarketingSEO } from '../seo/MarketingSEO';

const contactEmail = 'aseelshaheen621@gmail.com';
type ContactIntent = 'trial' | 'demo' | 'sales' | 'support';
const intents: ContactIntent[] = ['trial', 'demo', 'sales', 'support'];

export default function ContactPage() {
  const { copy, locale } = useMarketingLanguage();
  const [searchParams] = useSearchParams();
  const initialIntent = intents.includes(searchParams.get('intent') as ContactIntent) ? searchParams.get('intent') as ContactIntent : 'trial';
  const [intent, setIntent] = useState<ContactIntent>(initialIntent);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [business, setBusiness] = useState('');
  const [message, setMessage] = useState('');
  const subject = useMemo(() => `MyDesck PRO — ${copy.contact.intents[intent]}`, [copy.contact.intents, intent]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = [
      `${copy.contact.intentLabel}: ${copy.contact.intents[intent]}`,
      `${copy.contact.nameLabel}: ${name}`,
      `${copy.contact.emailLabel}: ${email}`,
      `${copy.contact.businessLabel}: ${business}`,
      `Language: ${locale}`,
      '',
      message,
    ].join('\n');
    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-700/20';
  return (
    <>
      <MarketingSEO path="/contact" />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-16 sm:pt-20"><MarketingContainer><SectionHeading eyebrow={copy.contact.eyebrow} title={copy.contact.title} description={copy.contact.intro} /></MarketingContainer></MarketingSection>
      <MarketingSection>
        <MarketingContainer className="grid gap-8 lg:grid-cols-[1fr_0.6fr]">
          <MarketingCard className="p-6 sm:p-8">
            <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-900 sm:col-span-2">{copy.contact.intentLabel}<select value={intent} onChange={(event) => setIntent(event.target.value as ContactIntent)} className={inputClass}>{intents.map((item) => <option key={item} value={item}>{copy.contact.intents[item]}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-900">{copy.contact.nameLabel}<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={inputClass} /></label>
              <label className="text-sm font-semibold text-slate-900">{copy.contact.emailLabel}<input required type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className={inputClass} /></label>
              <label className="text-sm font-semibold text-slate-900 sm:col-span-2">{copy.contact.businessLabel}<input required value={business} onChange={(event) => setBusiness(event.target.value)} autoComplete="organization" className={inputClass} /></label>
              <label className="text-sm font-semibold text-slate-900 sm:col-span-2">{copy.contact.messageLabel}<textarea required rows={6} value={message} onChange={(event) => setMessage(event.target.value)} className={`${inputClass} py-3`} /></label>
              <p className="text-sm leading-6 text-slate-600 sm:col-span-2">{copy.contact.truth}</p>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-800 px-5 text-sm font-bold text-white hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 sm:col-span-2 sm:justify-self-start"><Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />{copy.contact.send}</button>
            </form>
          </MarketingCard>
          <MarketingCard className="h-fit border-slate-800 bg-slate-950 p-7 text-white"><Mail className="h-7 w-7 text-sky-300" aria-hidden="true" /><h2 className="mt-6 text-xl font-semibold">{copy.contact.direct}</h2><a href={`mailto:${contactEmail}`} className="mt-4 inline-flex min-h-11 items-center break-all text-sm font-semibold text-sky-300 hover:text-sky-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" dir="ltr">{contactEmail}</a></MarketingCard>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}

