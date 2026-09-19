import type { ElementType, ReactNode } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { localizePath } from '../routes/routeModel';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function MarketingContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classes('mx-auto w-full max-w-[80rem] px-5 sm:px-8 lg:px-10', className)}>{children}</div>;
}

export function MarketingSection({
  children,
  className,
  id,
  tone = 'light',
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: 'light' | 'soft' | 'dark';
}) {
  return (
    <section
      id={id}
      className={classes(
        'marketing-section py-16 sm:py-20 lg:py-24',
        tone === 'soft' && 'bg-[var(--marketing-surface-soft)]',
        tone === 'dark' && 'bg-[var(--marketing-ink)] text-white',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'start',
  inverse = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'start' | 'center';
  inverse?: boolean;
}) {
  return (
    <div className={classes('max-w-3xl', align === 'center' && 'mx-auto text-center')}>
      <p className={classes('text-sm font-bold tracking-[0.14em] uppercase', inverse ? 'text-sky-300' : 'text-[var(--marketing-accent)]')}>{eyebrow}</p>
      <h2 className={classes('mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]', inverse ? 'text-white' : 'text-[var(--marketing-ink)]')}>{title}</h2>
      {description && <p className={classes('mt-5 max-w-[46rem] text-base leading-7 sm:text-lg', inverse ? 'text-slate-300' : 'text-[var(--marketing-muted-text)]', align === 'center' && 'mx-auto')}>{description}</p>}
    </div>
  );
}

export function MarketingButton({
  children,
  to,
  variant = 'primary',
  className,
  onClick,
}: {
  children: ReactNode;
  to: string;
  variant?: 'primary' | 'secondary' | 'light' | 'text';
  className?: string;
  onClick?: () => void;
}) {
  const { locale } = useMarketingLanguage();
  const href = to.startsWith('/') ? localizePath(to, locale) : to;
  return (
    <Link
      to={href}
      onClick={onClick}
      className={classes(
        'marketing-button inline-flex min-h-12 items-center justify-center gap-2 rounded-[0.7rem] px-5 py-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-focus)] focus-visible:ring-offset-2',
        variant === 'primary' && 'bg-[var(--marketing-cta)] text-white shadow-[0_10px_30px_rgba(15,75,126,0.18)] hover:bg-[var(--marketing-cta-hover)]',
        variant === 'secondary' && 'border border-[var(--marketing-border-strong)] bg-white text-[var(--marketing-ink)] hover:bg-slate-50',
        variant === 'light' && 'bg-white text-[var(--marketing-ink)] hover:bg-slate-100',
        variant === 'text' && 'px-1 text-[var(--marketing-link)] hover:text-[var(--marketing-cta-hover)] hover:underline',
        className,
      )}
    >
      {children}
      {variant === 'text' && <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />}
    </Link>
  );
}

export function MarketingCard({ children, className, as: Component = 'div' }: { children: ReactNode; className?: string; as?: ElementType }) {
  return <Component className={classes('rounded-2xl border border-[var(--marketing-border)] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>{children}</Component>;
}

export function MarketingBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'available' | 'early' }) {
  return (
    <span className={classes(
      'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold',
      tone === 'neutral' && 'border-slate-200 bg-slate-50 text-slate-700',
      tone === 'available' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
      tone === 'early' && 'border-amber-200 bg-amber-50 text-amber-900',
    )}>
      {tone !== 'neutral' && <span className={classes('h-1.5 w-1.5 rounded-full', tone === 'available' ? 'bg-emerald-600' : 'bg-amber-600')} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function CheckList({ items, columns = 1 }: { items: string[]; columns?: 1 | 2 }) {
  return (
    <ul className={classes('mt-5 grid gap-3', columns === 2 && 'sm:grid-cols-2')}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[var(--marketing-body)]">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700" aria-hidden="true"><Check className="h-3.5 w-3.5" /></span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function IndustryBadge({ readiness, children }: { readiness: 'available' | 'early-access'; children: ReactNode }) {
  return <MarketingBadge tone={readiness === 'available' ? 'available' : 'early'}>{children}</MarketingBadge>;
}

export function FeatureGroup({ title, description, items, note, icon: Icon }: { title: string; description: string; items: string[]; note?: string; icon: ElementType }) {
  return (
    <MarketingCard className="h-full p-6 sm:p-7">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--marketing-icon-bg)] text-[var(--marketing-cta)]"><Icon className="h-5 w-5" aria-hidden="true" /></div>
      <h3 className="mt-5 text-xl font-semibold text-[var(--marketing-ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--marketing-muted-text)]">{description}</p>
      <CheckList items={items} />
      {note && <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">{note}</p>}
    </MarketingCard>
  );
}

export function FAQ({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="mx-auto mt-10 max-w-3xl divide-y divide-[var(--marketing-border)] border-y border-[var(--marketing-border)]">
      {items.map((item) => (
        <details key={item.question} className="marketing-faq group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 text-start font-semibold text-[var(--marketing-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-focus)]">
            <span>{item.question}</span>
            <span className="relative h-5 w-5 shrink-0" aria-hidden="true"><span className="absolute start-0 top-1/2 h-0.5 w-5 -translate-y-1/2 bg-current" /><span className="absolute start-1/2 top-0 h-5 w-0.5 -translate-x-1/2 bg-current transition-transform group-open:rotate-90" /></span>
          </summary>
          <p className="pb-6 pe-8 text-sm leading-7 text-[var(--marketing-muted-text)] sm:text-base">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function CTASection({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  const { copy } = useMarketingLanguage();
  return (
    <MarketingSection tone="dark" className="relative overflow-hidden">
      <div className="marketing-grid absolute inset-0 opacity-20" aria-hidden="true" />
      <MarketingContainer className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} inverse />
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <MarketingButton to="/contact?intent=trial" variant="light">{copy.common.requestAccess}</MarketingButton>
          <MarketingButton to="/contact?intent=sales" variant="secondary" className="border-slate-600 bg-transparent text-white hover:bg-slate-800">{copy.common.contactSales}</MarketingButton>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

