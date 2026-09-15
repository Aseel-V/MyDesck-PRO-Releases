import { forwardRef, useImperativeHandle, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { getBackend } from '../../data/backend';
import type { ApprovalCredential } from '../../data/domain/restaurant';
import { PinPadModal, type PinPadModalHandle } from './PinPadModal';

interface ManagerApprovalPadProps {
  title?: string;
  description?: string;
  onClose: () => void;
  onSuccess: (credential: ApprovalCredential) => void;
  isProcessing?: boolean;
}

/**
 * Manager approval for a restaurant action.
 *
 * The Supabase backend approves with a staff PIN (PinPadModal, unchanged). The Firebase backend never
 * stores or verifies a PIN: the owner or an active manager signs in with their own Firebase account, and
 * the approved action runs under that identity, so the Rules check the approver rather than a staff id
 * the client could name.
 */
export const ManagerApprovalPad = forwardRef<PinPadModalHandle, ManagerApprovalPadProps>(
  ({ title, description, onClose, onSuccess, isProcessing = false }, ref) => {
    const { t, direction } = useLanguage();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useImperativeHandle(ref, () => ({
      triggerFailure: () => {
        setPassword('');
        setError(t('orderModal.authFailed') || 'Authorization failed');
      },
    }));

    if (getBackend().restaurant.approvalCredential === 'pin') {
      return (
        <PinPadModal
          ref={ref}
          title={title}
          description={description}
          onClose={onClose}
          onSuccess={(pin) => onSuccess({ pin })}
          isProcessing={isProcessing}
        />
      );
    }

    const submit = () => {
      if (!email.trim() || !password) {
        setError(t('orderModal.authFailed') || 'Authorization failed');
        return;
      }
      setError('');
      onSuccess({ email: email.trim(), password });
    };

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm" dir={direction}>
        <form
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800"
          onSubmit={(event) => { event.preventDefault(); submit(); }}
        >
          <div className="p-6 text-center border-b border-slate-100 dark:border-slate-800">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={28} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              {title || t('orderModal.pinPadModal.defaultTitle')}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('managerApproval.accountDescription')}</p>
          </div>
          <div className="px-6 py-5 space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('auth.email')}
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setError(''); }}
                className="mt-1 w-full px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('auth.password')}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => { setPassword(event.target.value); setError(''); }}
                className="mt-1 w-full px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
              />
            </label>
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
          <div className="px-6 pb-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose} className="py-3 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold">
              {t('orderModal.pinPadModal.cancel')}
            </button>
            <button type="submit" disabled={isProcessing} className="py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50">
              {isProcessing ? t('orderModal.pinPadModal.verifying') : t('orderModal.pinPadModal.authorize')}
            </button>
          </div>
        </form>
      </div>
    );
  },
);
ManagerApprovalPad.displayName = 'ManagerApprovalPad';
