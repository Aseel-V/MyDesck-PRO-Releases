import React from 'react';
import { RefreshCw, AlertTriangle, Download, Loader2, ExternalLink } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface UpdateModalProps {
  status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  progress: number;
  currentVersion: string;
  availableVersion?: string;
  error?: string;
  onDismiss?: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ status, progress, currentVersion, availableVersion, error, onDismiss }) => {
  const { t } = useLanguage();

  const handleRetry = () => void window.electronAPI?.checkForUpdates();
  const handleDownload = () => void window.electronAPI?.startDownload();

  const handleRestart = () => {
    void window.electronAPI?.restartApp();
  };

  const handleOpenRelease = () => {
    window.electronAPI?.openExternal('https://github.com/Aseel-V/MyDesck-PRO-Releases/releases');
  };

  const title = t(`updates.status.${status}.title`);

  const description = status === 'error'
    ? t(`updates.errors.${error === 'UPDATE_DOWNLOAD_FAILED' ? 'download' : error === 'INVALID_UPDATE_METADATA' ? 'metadata' : 'check'}`)
    : t(`updates.status.${status}.description`, { version: availableVersion || t('updates.newVersion') });

  return (
    <div className="pointer-events-none fixed end-4 top-4 z-[9999] w-[calc(100%_-_2rem)] max-w-md animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="pointer-events-auto w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        
        <div className="flex flex-col items-center space-y-5 text-center">
          
          {/* Icon State */}
          <div className="relative">
             <div className={`absolute inset-0 blur-2xl rounded-full opacity-20 ${
                status === 'error' ? 'bg-rose-500' : 
                status === 'downloaded' ? 'bg-emerald-500' : 'bg-sky-500'
             }`} />
             <div className="relative bg-slate-50 dark:bg-slate-900 p-5 rounded-full border border-slate-200 dark:border-slate-800 shadow-xl">
                {status === 'checking' && <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />}
                {status === 'available' && <Download className="w-10 h-10 text-sky-500" />}
                {status === 'downloading' && <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />}
                {status === 'downloaded' && <RefreshCw className="w-10 h-10 text-emerald-500" />}
                {status === 'error' && <AlertTriangle className="w-10 h-10 text-rose-500" />}
             </div>
          </div>

          {/* Texts */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {title}
            </h2>
            <div className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              <span>{description}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800">
                {t('updates.currentVersion', { version: currentVersion })}
              </span>
              {availableVersion && (
                <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900">
                  {t('updates.availableVersion', { version: availableVersion })}
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="w-full space-y-6">
            
            {(status === 'checking' || status === 'downloading') && (
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-medium px-1">
                  <span>{status === 'checking' ? t('updates.preparingCheck') : t('updates.downloadProgress')}</span>
                  <span>{status === 'checking' ? '...' : `${Math.round(progress)}%`}</span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 p-[1px]" role="progressbar" aria-label={t('updates.downloadProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
                  <div 
                    className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(14,165,233,0.35)]"
                    style={{ width: `${Math.max(status === 'checking' ? 12 : 5, progress)}%` }}
                  />
                </div>
              </div>
            )}

            {status === 'available' && (
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-3 rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                <Download className="h-5 w-5" />
                <span>{t('updates.download')}</span>
              </button>
            )}

            {status === 'downloaded' && (
              <button 
                onClick={handleRestart}
                className="w-full group relative flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-900/20 active:scale-[0.98]"
              >
                <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                <span>{t('updates.restartToInstall')}</span>
              </button>
            )}

            {status === 'error' && (
               <div className="space-y-4">
                 <button 
                    onClick={handleRetry}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all border border-slate-900 active:scale-[0.98] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>{t('updates.retry')}</span>
                  </button>
                  
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                     <p className="text-[11px] text-slate-500 mb-3 uppercase tracking-wider font-bold">{t('updates.manualRecovery')}</p>
                     <button 
                       onClick={handleOpenRelease}
                       className="text-xs text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 flex items-center justify-center gap-2 mx-auto transition-colors px-4 py-2 hover:bg-sky-500/10 rounded-lg"
                     >
                       <ExternalLink className="w-3 h-3" />
                       {t('updates.openReleases')}
                     </button>
                  </div>
                  
               </div>
            )}
          </div>

          {onDismiss && status !== 'downloading' && status !== 'checking' && (
            <button type="button" onClick={onDismiss} className="text-xs font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline dark:hover:text-slate-200">
              {status === 'available' || status === 'downloaded' ? t('updates.remindLater') : t('updates.closeMessage')}
            </button>
          )}

          <div className="text-[10px] text-slate-500 dark:text-slate-500 font-mono pt-2">
            {t('updates.officialOnly')}
          </div>

        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
