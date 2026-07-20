import { AnimatePresence, motion } from 'framer-motion';
import { Download, ExternalLink, Monitor, RefreshCw, X } from 'lucide-react';
import {
  getVisibleReleaseVersion,
  getWindowsInstallerAsset,
  RELEASES_PAGE_URL,
  STABLE_WINDOWS_DOWNLOAD_URL,
  useGitHubRelease,
} from '../hooks/useGitHubRelease';
import { useLanguage } from '../contexts/LanguageContext';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal = ({ isOpen, onClose }: DownloadModalProps) => {
  const { data, loading, error, retry } = useGitHubRelease();
  const { t, direction, language } = useLanguage();

  if (!isOpen) return null;

  const installer = getWindowsInstallerAsset(data);
  const visibleVersion = installer ? getVisibleReleaseVersion(data) : null;
  const downloadUrl = installer?.browser_download_url
    ?? (loading || error ? STABLE_WINDOWS_DOWNLOAD_URL : null);
  const releaseNotesUrl = data?.html_url || RELEASES_PAGE_URL;
  const locale = language === 'ar' ? 'ar' : language === 'he' ? 'he' : 'en';
  const releaseDate = data?.published_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(data.published_at))
    : null;
  const fileSize = installer
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(installer.size / (1024 * 1024))
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 16 }}
          onClick={(event) => event.stopPropagation()}
          className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          dir={direction}
          role="dialog"
          aria-modal="true"
          aria-labelledby="download-dialog-title"
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-800/50">
            <div>
              <h3 id="download-dialog-title" className="text-xl font-bold text-slate-900 dark:text-white">
                {t('landing.download.dialogTitle')}
              </h3>
              {visibleVersion && (
                <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" dir="ltr">
                  {t('landing.download.latestVersion', { version: visibleVersion })}
                </span>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6" aria-live="polite">
            {loading && !data ? (
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/50" aria-label={t('landing.download.checkingVersion')} />
            ) : downloadUrl ? (
              <a
                href={downloadUrl}
                aria-label={t('landing.download.windowsAccessibleName')}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-500 hover:bg-blue-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-blue-500 dark:hover:bg-blue-900/10"
              >
                <div className="rounded-xl bg-slate-100 p-3 text-slate-600 transition-colors group-hover:bg-blue-500 group-hover:text-white dark:bg-slate-700 dark:text-slate-300">
                  <Monitor className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1 text-start">
                  <div className="font-bold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                    {t('landing.hero.download')}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                    {visibleVersion
                      ? t('landing.download.versionAndPlatform', { version: visibleVersion })
                      : t('landing.download.windows64')}
                    {fileSize ? ` · ${fileSize} MB` : ''}
                  </div>
                </div>
                <Download className="h-5 w-5 text-slate-400 group-hover:text-blue-500" />
              </a>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                {t('landing.download.downloadUnavailable')}
              </div>
            )}

            {error && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span>{t('landing.download.versionUnavailable')}</span>
                <button type="button" onClick={retry} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-950/40">
                  <RefreshCw className="h-4 w-4" />{t('landing.download.tryAgain')}
                </button>
              </div>
            )}

            {releaseDate && (
              <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('landing.download.releaseDate', { date: releaseDate })}
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950/50">
            <a href={releaseNotesUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-white">
              <span>{t('landing.download.viewReleaseNotes')}</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">{t('landing.download.opensExternal')}</span>
            </a>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
