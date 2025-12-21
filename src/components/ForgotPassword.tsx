
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react';

interface ForgotPasswordProps {
  onBack: () => void;
}

export default function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-md p-8 bg-slate-950/50 backdrop-blur-xl border border-slate-800/60 rounded-3xl shadow-2xl animate-fadeIn">
        <div className="text-center">
          <div className="bg-emerald-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 shadow-lg shadow-emerald-900/20">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent mb-3">
            Check your email
          </h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            We sent a password reset link to <span className="text-sky-400 font-medium">{email}</span>
          </p>
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8 bg-slate-950/50 backdrop-blur-xl border border-slate-800/60 rounded-3xl shadow-2xl animate-fadeIn">
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-sky-400 transition-colors text-sm mb-6 group"
        >
          <div className="p-1 rounded-full bg-slate-900/50 border border-slate-800 group-hover:border-sky-500/30 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </div>
          Back
        </button>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-sky-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
          Forgot Password?
        </h2>
        <p className="text-slate-400">
          Enter your email and we'll send you reset instructions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">
            Email Address
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-slate-500 group-focus-within:text-sky-400 transition-colors" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 
              focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500/50 transition-all duration-300"
              placeholder="name@example.com"
              required
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-400 flex items-start gap-3">
             <div className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-rose-500" />
             {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-sky-900/20 text-sm font-bold text-white 
          bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            'Send Reset Link'
          )}
        </button>
      </form>
    </div>
  );
}
