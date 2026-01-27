
import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Laptop, FileArchive, Download, ExternalLink } from 'lucide-react';
import { useGitHubRelease } from '../hooks/useGitHubRelease';
import { useLanguage } from '../contexts/LanguageContext';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal = ({ isOpen, onClose }: DownloadModalProps) => {
  const { data, loading, error } = useGitHubRelease();
  const { t, direction } = useLanguage();

  if (!isOpen) return null;

  const formatSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getAssetIcon = (name: string) => {
    if (name.endsWith('.exe')) return Monitor;
    if (name.endsWith('.dmg') || name.endsWith('.pkg')) return Laptop;
    return FileArchive;
  };

  const getAssetLabel = (name: string) => {
    if (name.endsWith('.exe')) return { title: 'Windows Installer', sub: '64-bit' };
    if (name.includes('arm64')) return { title: 'macOS (Apple Silicon)', sub: 'M1/M2/M3' };
    if (name.includes('x64')) return { title: 'macOS (Intel)', sub: 'Intel' };
    if (name.endsWith('.dmg')) return { title: 'macOS Univ.', sub: 'Standard' };
    return { title: 'Archive / Other', sub: name.split('.').pop()?.toUpperCase() };
  };

  // Filter relevant assets only
  const relevantAssets = data?.assets.filter(a => 
    !a.name.endsWith('.blockmap') && 
    !a.name.endsWith('.yml')
  ) || [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className={`
            w-full max-w-lg bg-white dark:bg-slate-900 
            rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 
            overflow-hidden relative
            ${direction === 'rtl' ? 'rtl' : 'ltr'}
          `}
          dir={direction}
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
             <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                   {t('common.download') || 'Download'} MyDesck PRO
                </h3>
                {data && (
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                    {data.tag_name}
                  </span>
                )}
             </div>
             <button 
               onClick={onClose}
               className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500"
             >
               <X className="w-5 h-5" />
             </button>
          </div>

          {/* Body */}
          <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
             {loading ? (
                <div className="flex flex-col gap-4">
                  {[1,2].map(i => (
                    <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800/50 rounded-2xl animate-pulse" />
                  ))}
                </div>
             ) : error ? (
                <div className="text-center py-8 text-red-500">
                   Failed to load releases. <a href="https://github.com/Aseel-V/MyDesck-PRO-Releases/releases" target="_blank" className="underline">View on GitHub</a>
                </div>
             ) : (
               <div className="flex flex-col gap-3">
                  {relevantAssets.map((asset) => {
                     const Icon = getAssetIcon(asset.name);
                     const info = getAssetLabel(asset.name);
                     return (
                       <a 
                         key={asset.id} 
                         href={asset.browser_download_url}
                         className="group flex items-center gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all shadow-sm hover:shadow-md"
                       >
                          <div className={`p-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 group-hover:bg-blue-500 group-hover:text-white transition-colors`}>
                             <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex-1 text-start">
                             <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {info.title}
                             </div>
                             <div className="text-xs text-slate-500 dark:text-slate-400">
                                {info.sub} • {formatSize(asset.size)}
                             </div>
                          </div>
                          <Download className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                       </a>
                     );
                  })}
               </div>
             )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 text-center">
             <a 
               href="https://github.com/Aseel-V/MyDesck-PRO-Releases/releases" 
               target="_blank"
               className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
             >
               <span>View all releases on GitHub</span>
               <ExternalLink className="w-3 h-3" />
             </a>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
