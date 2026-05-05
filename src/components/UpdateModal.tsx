import React from 'react';
import { RefreshCw, AlertTriangle, Download, Loader2, ExternalLink } from 'lucide-react';

interface UpdateModalProps {
  status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  progress: number;
  currentVersion: string;
  availableVersion?: string;
  error?: string;
  onDismiss?: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ status, progress, currentVersion, availableVersion, error, onDismiss }) => {
  const handleRetry = () => {
    window.electronAPI?.retryUpdate();
  };

  const handleRestart = () => {
    window.electronAPI?.restartApp();
  };

  const handleOpenRelease = () => {
    window.electronAPI?.openExternal('https://github.com/Aseel-V/MyDesck-PRO-Releases/releases');
  };

  const title = {
    checking: 'Checking for updates',
    available: 'Update available',
    downloading: 'Downloading update',
    downloaded: 'Update ready',
    error: 'Update failed',
  }[status];

  const description = {
    checking: 'Looking for a newer official release from GitHub.',
    available: `Version ${availableVersion || 'new'} is available and the download will start automatically.`,
    downloading: `Downloading version ${availableVersion || 'new'} now.`,
    downloaded: `Version ${availableVersion || 'new'} has been downloaded and is ready to install.`,
    error: error || 'The app could not download the latest release. You can retry or open the release page.',
  }[status];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md p-7 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl">
        
        <div className="flex flex-col items-center text-center space-y-8">
          
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
                Current version: {currentVersion}
              </span>
              {availableVersion && (
                <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900">
                  Available version: {availableVersion}
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="w-full space-y-6">
            
            {(status === 'checking' || status === 'available' || status === 'downloading') && (
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-medium px-1">
                  <span>{status === 'checking' ? 'Preparing update check...' : 'Download progress'}</span>
                  <span>{status === 'checking' ? '...' : `${Math.round(progress)}%`}</span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 p-[1px]">
                  <div 
                    className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(14,165,233,0.35)]"
                    style={{ width: `${Math.max(status === 'checking' ? 12 : 5, progress)}%` }}
                  />
                </div>
              </div>
            )}

            {status === 'downloaded' && (
              <button 
                onClick={handleRestart}
                className="w-full group relative flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-900/20 active:scale-[0.98]"
              >
                <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                <span>Restart to update</span>
              </button>
            )}

            {status === 'error' && (
               <div className="space-y-4">
                 <button 
                    onClick={handleRetry}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all border border-slate-900 active:scale-[0.98] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Retry update</span>
                  </button>
                  
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                     <p className="text-[11px] text-slate-500 mb-3 uppercase tracking-wider font-bold">Manual recovery</p>
                     <button 
                       onClick={handleOpenRelease}
                       className="text-xs text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 flex items-center justify-center gap-2 mx-auto transition-colors px-4 py-2 hover:bg-sky-500/10 rounded-lg"
                     >
                       <ExternalLink className="w-3 h-3" />
                       Open GitHub Releases
                     </button>
                  </div>
                  
                  {onDismiss && (
                  <div className="pt-2 text-center">
                    <button 
                       onClick={onDismiss}
                       className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline transition-colors"
                     >
                       Close this message
                     </button>
                  </div>
                  )}
               </div>
            )}
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-500 font-mono pt-2">
            Official releases only
          </div>

        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
