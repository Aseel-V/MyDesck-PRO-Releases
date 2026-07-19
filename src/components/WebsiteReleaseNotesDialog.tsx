import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchReleaseNotes, type ReleaseNotes } from '../lib/websiteRelease';
import { Button } from './travel-ui/Button';

interface Props {
  onClose: () => void;
  onUpdate?: () => void;
}

export function WebsiteReleaseNotesDialog({ onClose, onUpdate }: Props) {
  const { language, direction, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const [notes, setNotes] = useState<ReleaseNotes | null>(null);

  useEffect(() => {
    const trigger = triggerRef.current;
    void fetchReleaseNotes().then(setNotes);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); trigger?.focus(); };
  }, [onClose]);

  const localizedLanguage = language === 'he' || language === 'ar' ? language : 'en';
  const date = notes ? new Intl.DateTimeFormat(localizedLanguage === 'he' ? 'he-IL' : localizedLanguage === 'ar' ? 'ar-IL' : 'en-US', { dateStyle: 'long' }).format(new Date(notes.releasedAt)) : '';

  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4" dir={direction} role="dialog" aria-modal="true" aria-labelledby="release-notes-title" aria-describedby="release-notes-description">
    <div ref={dialogRef} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-2xl dark:bg-slate-900">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800"><div><h2 id="release-notes-title" className="text-lg font-bold">{notes?.title[localizedLanguage] || t('websiteUpdate.whatsNew')}</h2>{notes && <p className="mt-1 text-sm text-slate-500"><span dir="ltr">v{notes.version}</span> · {date}</p>}</div><Button size="icon" variant="ghost" onClick={onClose} aria-label={t('websiteUpdate.close')}><X/></Button></header>
      <main id="release-notes-description" className="space-y-4 p-4">{notes ? <ul className="space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">{notes.changes[localizedLanguage].map((change) => <li key={change} className="border-s-2 border-sky-500 ps-3">{change}</li>)}</ul> : <p className="text-sm text-slate-500">{t('websiteUpdate.releaseNotesUnavailable')}</p>}</main>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><Button variant="secondary" onClick={onClose}>{t('websiteUpdate.close')}</Button>{onUpdate && <Button variant="primary" onClick={onUpdate}>{t('websiteUpdate.updateNow')}</Button>}</footer>
    </div>
  </div>;
}
