
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ideally we should check if we have a session, but let's assume the router protects this or the user landed here via magic link
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
        setError(t('notifications.passwordMismatch') || 'Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        setError(t('notifications.passwordLength') || 'Password must be at least 6 characters');
        return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;
      
      toast.success(t('notifications.passwordUpdated') || 'Password updated successfully');
      navigate('/');
    } catch (err: any) {
      setError(err.message || t('notifications.passwordUpdateError') || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
       <div className="w-full max-w-md p-8 bg-slate-950/50 backdrop-blur-xl border border-slate-800/60 rounded-3xl shadow-2xl animate-fadeIn">
        <div className="text-center mb-8">
            <div className="bg-sky-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border border-sky-500/20">
                <Lock className="w-8 h-8 text-sky-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Reset Password</h2>
            <p className="text-slate-400">Enter your new password below.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">
                    New Password
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-4 py-3.5 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    placeholder="••••••••"
                    required
                    minLength={6}
                />
            </div>
             <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">
                    Confirm Password
                </label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full px-4 py-3.5 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    placeholder="••••••••"
                    required
                     minLength={6}
                />
            </div>

            {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-400 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-sky-900/20 text-sm font-bold text-white 
                bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Password'}
            </button>
        </form>
      </div>
    </div>
  );
}
