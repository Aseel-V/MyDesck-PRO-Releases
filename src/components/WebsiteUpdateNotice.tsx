import { useState } from 'react';
import { Download, Info, RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { WebsiteVersionMetadata } from '../lib/websiteRelease';
import { Button } from './travel-ui/Button';
import { WebsiteReleaseNotesDialog } from './WebsiteReleaseNotesDialog';

interface Props {
  metadata: WebsiteVersionMetadata;
  onLater: () => void;
  onUpdate: () => Promise<void>;
}

export function WebsiteUpdateNotice({ metadata, onLater, onUpdate }: Props) {
  const { direction, t } = useLanguage();
  const [showNotes, setShowNotes] = useState(false);
  const [updating, setUpdating] = useState(false);
  const update = async () => { setUpdating(true); await onUpdate(); };

  return <><aside className="fixed inset-x-4 top-4 z-[190] mx-auto w-auto max-w-md rounded-lg border border-sky-300 bg-white p-4 shadow-xl dark:border-sky-900 dark:bg-slate-950" dir={direction} role="status" aria-labelledby="website-update-title"><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Download className="h-5 w-5" aria-hidden="true"/></div><div className="min-w-0"><h2 id="website-update-title" className="font-semibold">{t('websiteUpdate.availableTitle')}</h2><p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{t('websiteUpdate.availableDescription', { version: metadata.version })}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setShowNotes(true)}><Info className="h-4 w-4" aria-hidden="true"/>{t('websiteUpdate.whatsNew')}</Button><Button size="sm" variant="primary" disabled={updating} onClick={() => void update()}>{updating ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true"/> : <Download className="h-4 w-4" aria-hidden="true"/>}{t('websiteUpdate.updateNow')}</Button><Button size="sm" variant="ghost" onClick={onLater}>{t('websiteUpdate.later')}</Button></div></aside>{showNotes && <WebsiteReleaseNotesDialog onClose={() => setShowNotes(false)} onUpdate={() => void update()}/>}</>;
}
