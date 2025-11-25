import { useState, useEffect } from 'react';
import Logo from './Logo';

interface SplashScreenProps {
  onComplete?: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);

  // ⏱️ محاكاة التحميل التدريجي
  useEffect(() => {
    const timers = [
      setTimeout(() => setProgress(25), 200),
      setTimeout(() => setProgress(55), 650),
      setTimeout(() => setProgress(80), 1300),
      setTimeout(() => setProgress(100), 1900),
    ];

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  // 🔔 نستخدم onComplete فعليًا لما يوصل 100%
  useEffect(() => {
    if (progress === 100 && onComplete) {
      const doneTimer = setTimeout(() => {
        onComplete();
      }, 400); // مهلة صغيرة عشان الأنيميشن يكمل براحة
      return () => clearTimeout(doneTimer);
    }
  }, [progress, onComplete]);

  const statusText =
    progress < 40
      ? 'Initializing workspace...'
      : progress < 80
      ? 'Syncing your data...'
      : 'Almost ready ✨';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 overflow-hidden">
      {/* خلفية أنيقة / أوورا */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-sky-500/25 blur-3xl rounded-full animate-float" />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 bg-fuchsia-500/25 blur-3xl rounded-full animate-float"
          style={{ animationDelay: '0.6s' }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),transparent_60%)]" />
      </div>

      {/* بطاقة الـ Splash */}
      <div className="relative z-10 w-full max-w-lg px-6">
        <div className="glass-panel bg-slate-950/70 border border-slate-800/80 rounded-3xl shadow-2xl shadow-sky-900/40 px-6 py-8 md:px-10 md:py-10 animate-scaleIn flex flex-col items-center gap-6">
          {/* الشعار */}
          <div className="flex flex-col items-center gap-4">
            <Logo size="lg" />
            <div className="text-center space-y-1">
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-50 tracking-tight">
                MyDesck PRO
              </h1>
              <p className="text-xs md:text-sm text-slate-400">
                Preparing your workspace, layouts, and analytics dashboard...
              </p>
            </div>
          </div>

          {/* شريط التقدم + النسبة */}
          <div className="w-full mt-2 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{statusText}</span>
              <span className="font-semibold text-sky-300">{progress}%</span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-900/80 border border-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-fuchsia-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>Secure sync enabled</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span>Online</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
