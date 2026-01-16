import { ShieldAlert, Mail } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function SuspendedView() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200 dark:bg-slate-900 dark:border-slate-800 animate-scaleIn">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 dark:bg-rose-900/20 dark:text-rose-400">
          <ShieldAlert size={32} />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-900 mb-2 dark:text-white">
          Account Suspended
        </h1>
        
        <p className="text-slate-600 mb-6 dark:text-slate-300">
          Your account has been suspended by the administrator. You cannot access the dashboard at this time.
        </p>

        <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">
            Please contact support:
          </p>
          <div className="flex items-center justify-center gap-2 text-sky-600 font-semibold dark:text-sky-400">
            <Mail size={16} />
            <a href="mailto:support@mydesck.pro" className="hover:underline">
              support@mydesck.pro
            </a>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
