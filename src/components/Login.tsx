import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import {Eye, EyeOff, ShieldCheck, Sun, Moon, Globe, X, Check, BrainCircuit, Sparkles, ScanFace, Grip, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import ForgotPassword from './ForgotPassword';
import { getFriendlyAuthError, shouldAttemptStaffFallback } from '../lib/authNetwork';

// --- Neural Network Background Component ---
const NeuralBackground = ({ isDark }: { isDark: boolean }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        const particles: Particle[] = [];
        const particleCount = window.innerWidth < 768 ? 40 : 80;
        const connectionDistance = 150;
        const mouseDistance = 200;

        const mouse = { x: 0, y: 0 };

        const handleResize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        // Theme colors
        const color = isDark ? '14, 165, 233' : '59, 130, 246'; // Sky-500 (dark) vs Blue-500 (light)

        class Particle {
            x: number;
            y: number;
            vx: number;
            vy: number;
            size: number;

            constructor() {
                this.x = Math.random() * w;
                this.y = Math.random() * h;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.size = Math.random() * 2 + 1;
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                // Bounce
                if (this.x < 0 || this.x > w) this.vx *= -1;
                if (this.y < 0 || this.y > h) this.vy *= -1;

                // Mouse interaction
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < mouseDistance) {
                   const forceDirectionX = dx / distance;
                   const forceDirectionY = dy / distance;
                   const force = (mouseDistance - distance) / mouseDistance;
                   const direction = -1; 
                   this.vx += forceDirectionX * force * 0.05 * direction;
                   this.vy += forceDirectionY * force * 0.05 * direction;
                }
            }

            draw() {
                if (!ctx) return;
                ctx.fillStyle = `rgba(${color}, ${isDark ? 0.5 : 0.3})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }

        const animate = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, w, h);
            
            particles.forEach((a, index) => {
                a.update();
                a.draw();

                for (let j = index; j < particles.length; j++) {
                    const b = particles[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        ctx.strokeStyle = `rgba(${color}, ${1 - distance / connectionDistance})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            });
            requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [isDark]);

    return <canvas ref={canvasRef} className="absolute inset-0 z-0 bg-transparent" />;
};
// ----------------------------------------

export default function Login() {
  const { signIn, signInStaff } = useAuth();
  const { t, language, setLanguage, direction } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'login' | 'forgot-password'>('login');
  const [isLangOpen, setIsLangOpen] = useState(false);
  
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const isRTL = direction === 'rtl';
  const isDark = theme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      try {
        await signIn(email, password);
      } catch (signInError) {
        if (!shouldAttemptStaffFallback(signInError)) {
          throw signInError;
        }

        console.log('Primary auth was rejected, trying staff auth...');

        try {
          await signInStaff(email, password);
        } catch (staffError) {
          throw new Error(getFriendlyAuthError(staffError));
        }
      }
    } catch (err: unknown) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // Modern "Tech" input styles matching app colors
  const inputClasses = 
    "w-full bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-5 py-4 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-all font-sans text-sm tracking-wide shadow-sm hover:bg-white/80 dark:hover:bg-slate-900/80";

  // Matches Navbar utility buttons
  const navButtonBase = "relative flex items-center justify-center rounded-full transition-all duration-200 font-medium";
  const navButtonDefault = "text-slate-500 hover:bg-slate-100 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-400";
  const navButtonExit = "text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-900/20 dark:hover:text-rose-300";

  if (view === 'forgot-password') {
    return (
      <div className="min-h-screen relative flex items-center justify-center bg-slate-50 dark:bg-[#0b1121] transition-colors duration-500" dir={direction}>
         <div className="absolute inset-0 z-0 opacity-40"><NeuralBackground isDark={isDark} /></div>
         <div className="absolute top-6 right-6 z-50">
            <button onClick={() => setView('login')} className="bg-white/80 dark:bg-slate-800/80 p-2 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm">
                <X className="w-5 h-5" />
            </button>
         </div>
         <div className="relative z-10 w-full max-w-md p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-2xl dark:shadow-[0_0_50px_rgba(2,6,23,0.5)] overflow-hidden"
            >
                <ForgotPassword onBack={() => setView('login')} />
            </motion.div>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0b1121] text-slate-900 dark:text-white overflow-hidden font-sans transition-colors duration-500" dir={direction}>
      
      {/* Neural Background */}
      <NeuralBackground isDark={isDark} />
      
      {/* Subtle Grid Overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[linear-gradient(rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.1)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)]"></div>

      <div className="absolute top-0 left-0 right-0 z-50 px-6 py-6 flex justify-between items-center" dir="ltr">
          <div className="hidden md:flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-[0.2em] uppercase">System Status</span>
              <div className="flex items-center gap-2 mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-500 font-mono font-medium tracking-tight">ONLINE // SECURE</span>
              </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {/* Theme Toggle */}
            <button 
                onClick={toggleTheme}
                className={`${navButtonBase} ${navButtonDefault} p-2.5`}
                title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Language Toggle */}
            <div className="relative">
                <button 
                    onClick={() => setIsLangOpen(!isLangOpen)}
                    className={`${navButtonBase} ${navButtonDefault} gap-2 px-4 py-2.5 min-w-[100px]`}
                >
                    <Globe className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">{language}</span>
                </button>

                <AnimatePresence>
                    {isLangOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute top-full mt-3 right-0 min-w-[170px] bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/50 border border-slate-100 dark:border-slate-700/60 overflow-hidden z-[60]"
                    >
                        <div className="p-1.5 space-y-1">
                        {(['en', 'he', 'ar'] as const).map((lang) => (
                            <button 
                                key={lang} 
                                onClick={() => { setLanguage(lang); setIsLangOpen(false); }} 
                                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${language === lang ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                            >
                                <span>{lang === 'en' ? 'English' : lang === 'he' ? 'Hebrew' : 'Arabic'}</span>
                                {language === lang && <Check className="w-3 h-3" />}
                            </button>
                        ))}
                        </div>
                    </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Close Button */}
            {isElectron && (
                <button
                    onClick={() => window.electronAPI?.quitApp()}
                    className={`${navButtonBase} ${navButtonExit} gap-2 px-5 py-2.5 group`}
                >
                    <span className="text-xs font-bold uppercase tracking-wide">{t('common.close', 'EXIT')}</span>
                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                </button>
            )}
          </div>
      </div>

      {/* Main Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[440px] px-4"
      >
        {/* Holographic Card */}
        <div className="relative group">
            {/* Glowing borders - Adjusted for Theme */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500 rounded-[32px] opacity-30 dark:opacity-40 group-hover:opacity-60 blur-lg transition duration-1000 group-hover:duration-200"></div>
            
            <div className="relative bg-white/70 dark:bg-slate-900/80 backdrop-blur-2xl rounded-[30px] border border-white/50 dark:border-slate-700/50 p-8 md:p-10 shadow-2xl dark:shadow-[0_0_60px_rgba(2,6,23,0.5)]">
                
                {/* Scanner Effect */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-sky-500 to-transparent opacity-0 animate-[scan_4s_ease-in-out_infinite] mix-blend-overlay"></div>

                {/* Header */}
                <div className="text-center mb-10 relative">
                    <div className="relative inline-flex mb-5">
                       <div className="absolute inset-0 bg-sky-500 blur-[30px] opacity-20 dark:opacity-30 animate-pulse"></div>
                       <div className="relative bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl shadow-lg">
                          <BrainCircuit className="w-10 h-10 text-sky-600 dark:text-sky-400" />
                       </div>
                       
                       {/* Floating particles around logo */}
                       <motion.div 
                         animate={{ rotate: 360 }}
                         transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                         className="absolute -inset-4 border border-dashed border-sky-200 dark:border-sky-800/40 rounded-full"
                       />
                    </div>

                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight font-sans">
                        {t('auth.welcomeBack', 'AI PORTAL')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold tracking-[0.2em] mt-2 uppercase">
                        Secure Neural Access
                    </p>
                </div>

                {/* Error Box */}
                <AnimatePresence>
                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0, scale: 0.9 }} 
                            animate={{ opacity: 1, height: 'auto', scale: 1 }} 
                            exit={{ opacity: 0, height: 0, scale: 0.9 }}
                            className="mb-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 text-rose-600 dark:text-rose-300 px-4 py-3 text-xs font-bold flex gap-3 items-center rounded-xl"
                        >
                            <ScanFace className="w-4 h-4 text-rose-500 animate-pulse" />
                            <span>{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 dark:text-slate-400 ml-1">{t('auth.email')}</label>
                        <div className="relative group/input">
                           <Grip className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within/input:text-sky-500 transition-colors ${isRTL ? "right-4" : "left-4"}`} />
                           <input 
                               type="email" 
                               value={email}
                               onChange={(e) => setEmail(e.target.value)}
                               className={`${inputClasses} ${isRTL ? "pr-12 pl-4" : "pl-12 pr-4"}`}
                               placeholder="user@mydesck.pro"
                               required
                           />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 dark:text-slate-400">{t('auth.password')}</label>
                            <button type="button" onClick={() => setView('forgot-password')} className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors hover:underline">
                                {t('auth.forgotPassword', 'RECOVER KEY?')}
                            </button>
                        </div>
                        <div className="relative group/input">
                            <ShieldCheck className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within/input:text-sky-500 transition-colors ${isRTL ? "right-4" : "left-4"}`} />
                            <input 
                                type={showPassword ? "text" : "password"} 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={`${inputClasses} ${isRTL ? "pr-12 pl-12" : "pl-12 pr-12"}`}
                                placeholder="••••••••"
                                required
                            />
                            <button 
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "left-3" : "right-3"} p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors`}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full relative group py-4 rounded-xl font-bold text-sm tracking-widest uppercase overflow-hidden mt-4 shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:shadow-[0_0_25px_rgba(14,165,233,0.5)] transition-all bg-sky-600 hover:bg-sky-500 text-white"
                    >
                        <div className="relative flex items-center justify-center gap-2">
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>{t('auth.signIn')}</span>
                                    <Sparkles className="w-4 h-4 animate-pulse opacity-50" />
                                </>
                            )}
                        </div>
                    </button>
                </form>

                {/* Footer */}
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
                    <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        <Activity className="w-3 h-3" />
                        <span>ENCRYPTED CONNECTION ESTABLISHED</span>
                    </div>
                </div>
            </div>
        </div>
      </motion.div>

      {/* CSS for Scan Animation */}
      <style>{`
        @keyframes scan {
            0%, 100% { transform: translateY(0); opacity: 0; }
            50% { opacity: 0.5; }
            0% { transform: translateY(20px); }
            100% { transform: translateY(400px); }
        }
      `}</style>
    </div>
  );
}
