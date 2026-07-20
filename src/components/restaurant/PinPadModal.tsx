import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Delete, ShieldAlert, Lock } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

// ============================================================================
// PIN SECURITY CONSTANTS
// ============================================================================
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60000; // 60 seconds

interface PinPadModalProps {
  title?: string;
  description?: string;
  onClose: () => void;
  onSuccess: (pin: string) => void;
  onFailure?: () => void; // Called when PIN is wrong, parent should call this
  requiredRole?: string;
  isProcessing?: boolean;
}

export interface PinPadModalHandle {
  triggerFailure: () => void;
}

export const PinPadModal = forwardRef<PinPadModalHandle, PinPadModalProps>(({ 
  title, 
  description,
  onClose, 
  onSuccess,
  onFailure,
  isProcessing = false
}, ref) => {
  const { t, direction } = useLanguage();
  
  const displayTitle = title || t('orderModal.pinPadModal.defaultTitle');
  const displayDescription = description || t('orderModal.pinPadModal.defaultDescription');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  
  // Brute-force protection state
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  
  
  const isLockedOut = lockedUntil !== null && Date.now() < lockedUntil;

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedUntil) return;
    
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockoutRemaining(remaining);
      
      if (remaining <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        setError('');
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [lockedUntil]);
  
  // Handle failed PIN attempt (call this from parent when PIN is wrong)
  const handleFailedAttempt = useCallback(() => {
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setPin('');
    
    if (newAttempts >= MAX_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCKOUT_DURATION_MS);
      setError(t('orderModal.pinPadModal.lockedOut') || 'Too many attempts. Please wait.');
    } else {
      const remaining = MAX_ATTEMPTS - newAttempts;
      setError(`${t('orderModal.pinPadModal.invalidPin') || 'Invalid PIN'}. ${remaining} ${t('orderModal.pinPadModal.attemptsRemaining') || 'attempts remaining'}`);
    }
    
    onFailure?.();
  }, [attempts, t, onFailure]);

  useImperativeHandle(ref, () => ({
    triggerFailure: handleFailedAttempt
  }));

  const handleNumberClick = (num: number) => {
    if (isLockedOut || pin.length >= 6) return;
    setPin(prev => prev + num);
    setError('');
  };

  const handleBackspace = () => {
    if (isLockedOut) return;
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleSubmit = () => {
    if (isLockedOut) {
      setError(`${t('orderModal.pinPadModal.waitSeconds') || 'Please wait'} ${lockoutRemaining}s`);
      return;
    }
    
    if (pin.length < 4) {
      setError(t('orderModal.pinPadModal.pinLengthError'));
      return;
    }
    
    // Pass the PIN up - parent component should call handleFailedAttempt if wrong
    onSuccess(pin);
  };
  
  // Auto-submit if length is 4 or 6? Let's stick to explicit submit for safety or standard 4.
  // Actually, many POS auto-submit on 4. Let's wait for Enter or Click.
  // We'll trust the user to click Confirm.

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm" dir={direction}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 text-center border-b border-slate-100 dark:border-slate-800">
          <div className={`w-12 h-12 ${isLockedOut ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'} rounded-full flex items-center justify-center mx-auto mb-4`}>
            {isLockedOut ? <Lock size={28} /> : <ShieldAlert size={28} />}
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
            {isLockedOut ? (t('orderModal.pinPadModal.lockedTitle') || 'Locked Out') : displayTitle}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isLockedOut 
              ? `${t('orderModal.pinPadModal.tryAgainIn') || 'Try again in'} ${lockoutRemaining}s`
              : displayDescription
            }
          </p>
        </div>

        {/* PIN Display */}
        <div className="px-8 py-6">
          <div className="flex justify-center gap-3 mb-2">
            {[0, 1, 2, 3].map((i) => (
              <div 
                key={i} 
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  pin.length > i 
                    ? 'bg-slate-800 dark:bg-white border-slate-800 dark:border-white' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              />
            ))}
          </div>
          {error && (
            <p className="text-red-500 text-xs text-center mt-2 font-medium animate-pulse">{error}</p>
          )}
        </div>

        {/* Keypad */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              disabled={isProcessing}
              className="h-14 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-xl font-bold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
            >
              {num}
            </button>
          ))}
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="h-14 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
          >
            {t('pinPadModal.cancel')}
          </button>
          <button
            onClick={() => handleNumberClick(0)}
            disabled={isProcessing}
            className="h-14 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-xl font-bold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={isProcessing}
            className="h-14 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
          >
            <Delete size={20} />
          </button>
        </div>

        <div className="p-4">
           <button
             onClick={handleSubmit}
             disabled={isProcessing || pin.length < 4}
             className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
           >
             {isProcessing ? t('pinPadModal.verifying') : t('pinPadModal.authorize')}
           </button>
        </div>
      </div>
    </div>
  );
});
