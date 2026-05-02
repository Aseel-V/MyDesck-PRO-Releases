import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBranding } from '../hooks/useBranding';
import {
  Settings,
  LogOut,
  Home,
  MapPin,
  BarChart3,
  Menu,
  Shield,
  Moon,
  Sun,
  Search,
  LucideIcon,
  CarFront,
  Wrench,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { twMerge } from 'tailwind-merge';

interface NavbarProps {
  onNavigate: (page: 'home' | 'trips' | 'analytics' | 'settings' | 'admin' | 'parts') => void;
  currentPage: 'home' | 'trips' | 'analytics' | 'settings' | 'admin' | 'parts';
  onOpenSearch: () => void;
}

export default function Navbar({ onNavigate, currentPage, onOpenSearch }: NavbarProps) {
  const { isAdmin } = useAuth();
  const { t, direction } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { displayLogoUrl, displayName } = useBranding();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const handleNavigate = (page: NavbarProps['currentPage']) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  // Nav Items Configuration
  const { profile } = useAuth(); // Destructure profile
  
  const navItems = [
    { id: 'home', icon: Home, label: t('dashboard.home') },
    { 
      id: 'trips', 
      icon: (profile?.business_type === 'auto_repair') ? CarFront : MapPin, 
      label: (profile?.business_type === 'auto_repair') ? t('navbar.cars') : t('dashboard.trips'), 
      hidden: isAdmin || (profile?.business_type && profile.business_type !== 'tourism' && profile.business_type !== 'auto_repair') 
    },
    { id: 'analytics', icon: BarChart3, label: t('dashboard.analytics') },
    { 
      id: 'parts', 
      icon: Wrench, 
      label: t('navbar.parts'), 
      hidden: profile?.business_type !== 'auto_repair'
    },
    { id: 'settings', icon: Settings, label: t('dashboard.settings') },
    { id: 'admin', icon: Shield, label: t('navbar.admin'), hidden: !isAdmin },
  ].filter(item => !item.hidden) as { id: NavbarProps['currentPage']; icon: LucideIcon; label: string }[];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center pointer-events-none" dir={direction}>
      
      {/* === DESKTOP FLOATING DOCK === */}
      <div className="hidden lg:flex mt-6 pointer-events-auto">
        <motion.div 
          initial={{ y: -50, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative flex items-center gap-2 p-2 rounded-full border border-white/20 bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] ring-1 ring-white/20 dark:ring-white/10"
        >
          {/* Logo Section */}
          <div className="flex items-center gap-3 pl-3 pr-2">
            <motion.div 
              whileHover={{ rotate: 10, scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative h-9 w-9 rounded-full overflow-hidden bg-white shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10 p-0.5 cursor-pointer"
              onClick={() => handleNavigate('home')}
            >
               <img
                  src={displayLogoUrl || "/favicon.ico"}
                  alt="Logo"
                  className="h-full w-full object-contain rounded-full"
                  onError={(e) => { e.currentTarget.src = "/favicon.ico"; }}
                />
            </motion.div>
             <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-sky-800 to-slate-700 dark:from-white dark:to-slate-300 hidden lg:block tracking-tight">
               {displayName || 'MyDesck'}
             </span>
             <div className="h-5 w-px bg-slate-200/60 dark:bg-slate-700/60 mx-1" />
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className={twMerge(
                    "relative px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-300 z-10 flex items-center gap-2.5 outline-none focus:ring-2 focus:ring-sky-500/20",
                    isActive ? "text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white dark:bg-slate-800 rounded-full -z-10 shadow-sm ring-1 ring-black/5 dark:ring-white/5"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  {/* Hover effect for non-active items */}
                  {!isActive && (
                    <div className="absolute inset-0 rounded-full bg-slate-100/50 dark:bg-slate-800/50 opacity-0 hover:opacity-100 transition-opacity -z-10" />
                  )}
                  
                  <item.icon className={twMerge("w-4 h-4 transition-transform duration-300", isActive ? "scale-110 stroke-[2.5px]" : "stroke-2")} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="h-5 w-px bg-slate-200/60 dark:bg-slate-700/60 mx-2" />

          {/* Utilities Section */}
          <div className="flex items-center gap-1.5 pr-1.5">
             {/* Search Trigger */}
             <motion.button
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               onClick={onOpenSearch}
               className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 hover:text-sky-600 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-400 relative group"
               title="Search (Ctrl+K)"
             >
               <Search className="w-4 h-4 text-inherit" />
             </motion.button>

             {/* Theme Toggle */}
             <motion.button
               whileHover={{ scale: 1.05, rotate: 15 }}
               whileTap={{ scale: 0.95, rotate: -15 }}
               onClick={toggleTheme}
               className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 hover:text-amber-500 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-amber-400"
             >
               {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
             </motion.button>

             {/* Electron Close */}
             {isElectron && (
                <motion.button
                   whileHover={{ scale: 1.05 }}
                   whileTap={{ scale: 0.95 }}
                   onClick={() => window.electronAPI?.quitApp()}
                   className="ml-1 p-2.5 rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                   title={t('navbar.closeApp')}
                >
                   <LogOut className="w-4 h-4" />
                </motion.button>
             )}
          </div>

        </motion.div>
      </div>

      {/* === MOBILE TOP BAR (Glassmorphism) === */}
      <div className="lg:hidden w-full pointer-events-auto">
        <div className="bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 px-4 h-16 pt-[env(safe-area-inset-top)] flex items-center justify-between shadow-sm sticky top-0 z-50">
           
           {/* Logo */}
           <div className="flex items-center gap-2.5">
              <img
                src={displayLogoUrl || "/favicon.ico"}
                alt="Logo"
                className="h-8 w-8 object-contain"
                onError={(e) => { e.currentTarget.src = "/favicon.ico"; }}
              />
              <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 truncate max-w-[150px]">
                {displayName || 'MyDesck'}
              </span>
           </div>

           {/* Mobile Actions */}
           <div className="flex items-center gap-3">
             <motion.button
               whileTap={{ scale: 0.9 }}
               onClick={onOpenSearch}
               className="p-2.5 rounded-xl bg-slate-100/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 backdrop-blur-md"
             >
               <Search className="w-5 h-5" />
             </motion.button>
             <motion.button
               whileTap={{ scale: 0.9 }}
               onClick={() => setMobileMenuOpen(true)}
               className="p-2.5 rounded-xl bg-slate-100/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 backdrop-blur-md"
             >
               <Menu className="w-5 h-5" />
             </motion.button>
           </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileMenuOpen(false)}
                className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] z-40"
              />
              
              {/* Drawer */}
              <motion.div
                 initial={{ y: -20, opacity: 0, scale: 0.95 }}
                 animate={{ y: 0, opacity: 1, scale: 1 }}
                 exit={{ y: -20, opacity: 0, scale: 0.95 }}
                 transition={{ type: "spring", bounce: 0.3 }}
                 className="absolute top-20 left-4 right-4 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10 overflow-hidden"
              >
                 <div className="p-3 space-y-1.5">
                    {navItems.map((item) => (
                       <motion.button
                         key={item.id}
                         whileTap={{ scale: 0.98 }}
                         onClick={() => handleNavigate(item.id)}
                         className={twMerge(
                           "flex items-center gap-3.5 w-full p-3.5 rounded-2xl text-[15px] font-medium transition-all",
                           currentPage === item.id 
                             ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 shadow-sm" 
                             : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50"
                         )}
                       >
                         <item.icon className={twMerge("w-5 h-5", currentPage === item.id && "stroke-[2.5px]")} />
                         {item.label}
                       </motion.button>
                    ))}
                    
                    <div className="h-px bg-slate-200/50 dark:bg-slate-700/50 my-2 mx-4" />
                    
                    <motion.button
                       whileTap={{ scale: 0.98 }}
                       onClick={toggleTheme}
                       className="flex items-center gap-3.5 w-full p-3.5 rounded-2xl text-[15px] font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50"
                    >
                       {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                       {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </motion.button>

                    {isElectron && (
                       <motion.button
                         whileTap={{ scale: 0.98 }}
                         onClick={() => { window.electronAPI?.quitApp(); }}
                         className="flex items-center gap-3.5 w-full p-3.5 rounded-2xl text-[15px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                       >
                         <LogOut className="w-5 h-5" />
                         {t('navbar.closeApp')}
                       </motion.button>
                    )}
                 </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

    </nav>
  );
}

