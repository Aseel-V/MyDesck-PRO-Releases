
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon, Globe, Shield } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const FloatingHeader = () => {
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  // Local translations for header only
  const translations = {
    en: { safetySupport: "Safety & Support", login: "Login" },
    he: { safetySupport: "בטיחות ותמיכה", login: "התחברות" },
    ar: { safetySupport: "الأمان والدعم", login: "تسجيل الدخول" }
  };

  const t = translations[language as keyof typeof translations] || translations.en;

  return (
    <motion.nav 
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4 md:pt-6"
    >
      <div className="w-full max-w-5xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl md:rounded-full shadow-2xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-white/50 dark:border-slate-700/50 ring-1 ring-black/5">
        <div className="px-4 py-3 md:px-6 flex justify-between items-center">
          
          {/* Logo Area */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
             <div className="relative">
               <div className="absolute inset-0 bg-blue-500 blur-lg opacity-20 dark:opacity-40 animate-pulse"></div>
               <img src="/favicon.ico" alt="MyDesck PRO" className="relative w-8 h-8 md:w-9 md:h-9 rounded-xl shadow-sm bg-white p-0.5" />
             </div>
             <span className="text-lg md:text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent tracking-tight">
               MyDesck PRO
             </span>
          </div>
          
          {/* Actions Area */}
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => navigate('/safety-support')} 
              className="flex items-center gap-2 px-2 md:px-4 py-2 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t.safetySupport}
            >
              <Shield className="w-5 h-5 md:hidden" />
              <span className="hidden md:inline">{t.safetySupport}</span>
            </button>

            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1 hidden md:block"></div>

            <div className="flex items-center gap-2">
               <button onClick={() => navigate('/login')} className="px-5 py-2 rounded-full text-sm font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:scale-105 active:scale-95 transition-all shadow-lg hover:shadow-xl">
                  {t.login}
               </button>
               
               <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-700 ml-2">
                  <button onClick={toggleTheme} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors">
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                  
                  <div className="relative">
                    <button
                      onClick={() => setIsLanguageOpen(!isLanguageOpen)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Globe className="w-4 h-4" />
                      <span className="text-xs font-bold">{language.toUpperCase()}</span>
                    </button>
                    <AnimatePresence>
                      {isLanguageOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute top-full mt-2 right-0 min-w-[140px] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden z-[60]"
                        >
                          <div className="p-1 flex flex-col gap-0.5">
                            {(['en', 'he', 'ar'] as const).map((lang) => (
                              <button key={lang} onClick={() => { setLanguage(lang); setIsLanguageOpen(false); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full ${language === lang ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                <span className="w-4 text-center">{lang === 'en' ? '🇺🇸' : lang === 'he' ? '🇮🇱' : '🇸🇦'}</span>
                                <span>{lang === 'en' ? 'English' : lang === 'he' ? 'עברית' : 'العربية'}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
               </div>
            </div>
          </div>

        </div>
      </div>
    </motion.nav>
  );
};

export default FloatingHeader;
