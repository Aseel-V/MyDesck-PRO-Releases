import React, { useEffect } from 'react';
import { RefreshCw, AlertTriangle, ShieldCheck, Loader2, ExternalLink } from 'lucide-react';

interface UpdateModalProps {
  status: 'downloading' | 'downloaded' | 'error';
  progress: number;
  version?: string;
  error?: string;
  onSkip?: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ status, progress, version, error, onSkip }) => {
  
  useEffect(() => {
    // Strict Input Lockdown
    const handleKeydown = (e: KeyboardEvent) => {
      // Allow DevTools in dev mode if needed, but for mandatory update we block everything
      // We can check e.ctrlKey && e.shiftKey && e.key === 'I' if we wanted to allow it.
      e.preventDefault();
      e.stopPropagation();
    };
    
    // Capture phase to ensure we get it first
    window.addEventListener('keydown', handleKeydown, true);
    
    return () => {
      window.removeEventListener('keydown', handleKeydown, true);
    };
  }, []);

  const handleRetry = () => {
    window.electronAPI?.retryUpdate();
  };

  const handleRestart = () => {
    window.electronAPI?.restartApp();
  };

  const handleOpenRelease = () => {
    window.electronAPI?.openExternal('https://github.com/Aseel-V/MyDesck-PRO/releases');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xl select-none animate-in fade-in duration-300">
      <div className="w-full max-w-md p-8 bg-gray-900/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md">
        
        <div className="flex flex-col items-center text-center space-y-8">
          
          {/* Icon State */}
          <div className="relative">
             <div className={`absolute inset-0 blur-2xl rounded-full opacity-40 ${
                status === 'error' ? 'bg-red-500' : 
                status === 'downloaded' ? 'bg-green-500' : 'bg-blue-500'
             }`} />
             <div className="relative bg-gray-950 p-5 rounded-full border border-white/10 shadow-xl">
                {status === 'downloading' && <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />}
                {status === 'downloaded' && <ShieldCheck className="w-10 h-10 text-green-400" />}
                {status === 'error' && <AlertTriangle className="w-10 h-10 text-red-400" />}
             </div>
          </div>

          {/* Texts */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {status === 'downloading' && 'Critical Update in Progress'}
              {status === 'downloaded' && 'Update Ready to Install'}
              {status === 'error' && 'Update Interrupted'}
            </h2>
            <div className="text-gray-400 text-sm font-medium">
              {status === 'downloading' && (
                  <span>Installing security updates and improvements...</span>
              )}
              {status === 'downloaded' && (
                  <span>Version {version} is downloaded and ready.</span>
              )}
              {status === 'error' && (
                  <span className="text-red-300/80">{error || 'Connection lost. Retrying automatically...'}</span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="w-full space-y-6">
            
            {status === 'downloading' && (
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-gray-400 font-medium px-1">
                  <span>Downloading...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden border border-white/5 p-[1px]">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: `${Math.max(5, progress)}%` }} // min width so it's visible
                  />
                </div>
              </div>
            )}

            {status === 'downloaded' && (
              <button 
                onClick={handleRestart}
                className="w-full group relative flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-green-900/20 active:scale-[0.98] ring-1 ring-white/20"
              >
                <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                <span>Restart Application</span>
              </button>
            )}

            {status === 'error' && (
               <div className="space-y-4">
                 <button 
                    onClick={handleRetry}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-all border border-white/10 active:scale-[0.98]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Generic Retry</span>
                  </button>
                  
                  <div className="pt-4 border-t border-white/5">
                     <p className="text-[11px] text-gray-500 mb-3 uppercase tracking-wider font-bold">Try Manual Recovery</p>
                     <button 
                       onClick={handleOpenRelease}
                       className="text-xs text-blue-400 hover:text-blue-300 flex items-center justify-center gap-2 mx-auto transition-colors px-4 py-2 hover:bg-blue-500/10 rounded-lg"
                     >
                       <ExternalLink className="w-3 h-3" />
                       View Releases on GitHub
                     </button>
                  </div>
                  
                  {/* Emergency Skip */}
                  <div className="pt-2 text-center">
                    <button 
                       onClick={onSkip}
                       className="text-[10px] text-gray-500 hover:text-gray-300 underline transition-colors"
                     >
                       Skip Update (Emergency Access)
                     </button>
                  </div>
               </div>
            )}
          </div>

          <div className="text-[10px] text-gray-600 font-mono pt-4">
            Security Enforced &bull; App Locked
          </div>

        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
