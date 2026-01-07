
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface ForgotPasswordProps {
  onBack: () => void;
}

export default function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const { t, direction } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Securely check if email exists using the RPC function
      // Note: You must run the SQL from supabase_functions.sql for this to work!
      const { data: exists, error: checkError } = await supabase
        .rpc('check_email_exists', { email_input: email });

      if (checkError) {
        console.error('RPC Error:', checkError);
        // Fallback: If RPC is missing/fails, we could either throw or proceed blindly.
        // For now, let's treat it as a technical error or throw "Email not found" if we want to be strict.
        // But if the user hasn't run the SQL, this will fail.
        // Let's assume the user will run the SQL.
        throw new Error('System configuration error: Verification function missing.');
      }

      if (!exists) {
        throw new Error(t('forgotPassword.emailNotFound'));
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Crucial for HashRouter: Must include the /#/ in the redirect URL
        redirectTo: window.location.origin + '/#/reset-password',
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-md p-8 bg-white dark:bg-slate-950/50 backdrop-blur-xl border border-slate-200 dark:border-slate-800/60 rounded-3xl shadow-2xl animate-fadeIn transition-colors duration-300">
        <div className="text-center">
          <div className="bg-emerald-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 shadow-lg shadow-emerald-900/20">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent mb-3">
            {t('forgotPassword.checkEmail.title')}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
            {t('forgotPassword.checkEmail.desc')} <span className="text-blue-600 dark:text-blue-400 font-medium">{email}</span>
          </p>
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-sm font-medium"
          >
            <ArrowLeft className={`w-4 h-4 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
            {t('forgotPassword.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8 bg-white dark:bg-slate-950/50 backdrop-blur-xl border border-slate-200 dark:border-slate-800/60 rounded-3xl shadow-2xl animate-fadeIn transition-colors duration-300">
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors text-sm mb-6 group"
        >
          <div className="p-1 rounded-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 group-hover:border-blue-500/30 transition-colors">
            <ArrowLeft className={`w-4 h-4 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
          </div>
          {t('forgotPassword.back')}
        </button>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-600 dark:from-blue-400 dark:via-blue-500 dark:to-cyan-400 bg-clip-text text-transparent mb-2">
          {t('forgotPassword.title')}
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          {t('forgotPassword.desc')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500 ml-1">
            {t('forgotPassword.emailLabel')}
          </label>
          <div className="relative group">
            <div className={`absolute inset-y-0 ${direction === 'rtl' ? 'right-0 pr-4' : 'left-0 pl-4'} flex items-center pointer-events-none`}>
              <Mail className="h-5 w-5 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400 transition-colors" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`block w-full ${direction === 'rtl' ? 'pr-12 pl-4' : 'pl-12 pr-4'} py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all duration-300`}
              placeholder={t('forgotPassword.emailPlaceholder')}
              required
              dir="ltr"
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-sm text-rose-600 dark:text-rose-400 flex items-start gap-3">
             <div className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-rose-500" />
             {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-900/20 text-sm font-bold text-white 
          bg-gradient-to-r from-blue-600 to-cyan-700 hover:from-blue-500 hover:to-cyan-600 dark:from-blue-500 dark:to-cyan-600 dark:hover:from-blue-400 dark:hover:to-cyan-500
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            t('forgotPassword.sendResetLink')
          )}
        </button>
      </form>
    </div>
  );
}
