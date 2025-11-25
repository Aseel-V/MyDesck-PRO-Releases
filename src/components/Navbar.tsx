import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useBranding } from '../hooks/useBranding';
import LogoPng from '../../logo.png';
import {
  Settings,
  LogOut,
  Home,
  MapPin,
  BarChart3,
  Menu,
  X,
  Shield,
} from 'lucide-react';

interface NavbarProps {
  onNavigate: (page: 'home' | 'trips' | 'analytics' | 'settings' | 'admin') => void;
  currentPage: 'home' | 'trips' | 'analytics' | 'settings' | 'admin';
}

export default function Navbar({ onNavigate, currentPage }: NavbarProps) {
  const { isAdmin } = useAuth();
  const { t, direction } = useLanguage();
  const { displayLogoUrl, displayName } = useBranding();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isElectron =
    typeof window !== 'undefined' && !!window.electronAPI;

  const handleNavigate = (page: NavbarProps['currentPage']) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  const isActive = (page: NavbarProps['currentPage']) => currentPage === page;

  // Desktop buttons: مباشرة على البار بدون كرت خلفي
  const baseNavBtn =
    'inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition-all border-b-2';
  const activeNavBtn =
    'border-sky-400 text-slate-50 bg-slate-900/80 shadow-[0_4px_14px_rgba(15,23,42,0.8)]';
  const inactiveNavBtn =
    'border-transparent text-slate-300 hover:text-slate-50 hover:bg-slate-900/50 hover:border-slate-500/80';

  // Mobile buttons (نفس الروح لكن داخل قائمة)
  const mobileBaseBtn =
    'w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border';
  const mobileActiveNavBtn =
    'bg-slate-900/95 border-sky-400 text-slate-50 shadow-sm shadow-sky-900/70';
  const mobileInactiveNavBtn =
    'bg-slate-900/80 border-slate-700 text-slate-100 hover:border-sky-400/70 hover:bg-slate-900';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50" dir={direction}>
      {/* Top nav bar */}
      <div className="bg-slate-950/85 backdrop-blur-xl border-b border-slate-900/70 shadow-lg shadow-slate-950/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-3 rounded-xl bg-slate-950/95 border border-slate-800/90 px-3 py-1 shadow-md shadow-sky-900/50">
              {/* Logo badge */}
              <div className="relative flex h-10 w-10 md:h-11 md:w-11 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-sky-400 via-fuchsia-500 to-sky-300 opacity-85 blur-[0.5px]" />
                <div className="relative h-8 w-8 md:h-9 md:w-9 rounded-full bg-slate-950 border border-slate-700/85 shadow-md shadow-sky-900/70 flex items-center justify-center overflow-hidden">
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-t from-slate-950 via-slate-900/35 to-white/18 opacity-90" />
                  <img
                    src={displayLogoUrl || (LogoPng as unknown as string)}
                    alt="Logo"
                    className="relative z-10 h-5 w-5 md:h-6 md:w-6 object-contain"
                    onError={(e) => {
                      e.currentTarget.src = LogoPng as unknown as string;
                    }}
                  />
                </div>
              </div>

              {/* Business name */}
              <div className="flex flex-col min-w-0">
                <span className="text-[9px] md:text-[10px] font-semibold tracking-[0.22em] uppercase text-sky-300/85">
                  MyDesk Pro
                </span>
                <span
                  className="text-[1rem] md:text-[1.15rem] font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-50 via-sky-100 to-slate-200 drop-shadow-[0_0_6px_rgba(15,23,42,0.9)] truncate max-w-[210px] sm:max-w-[260px]"
                  title={displayName}
                >
                  {displayName}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop nav – buttons مباشرة على البار */}
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleNavigate('home')}
                className={`${baseNavBtn} ${isActive('home') ? activeNavBtn : inactiveNavBtn
                  }`}
              >
                <Home className="w-4 h-4" />
                <span>{t('dashboard.home')}</span>
              </button>

              {!isAdmin && (
                <button
                  type="button"
                  onClick={() => handleNavigate('trips')}
                  className={`${baseNavBtn} ${isActive('trips') ? activeNavBtn : inactiveNavBtn
                    }`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>{t('dashboard.trips')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleNavigate('analytics')}
                className={`${baseNavBtn} ${isActive('analytics') ? activeNavBtn : inactiveNavBtn
                  }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>{t('dashboard.analytics')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleNavigate('settings')}
                className={`${baseNavBtn} ${isActive('settings') ? activeNavBtn : inactiveNavBtn
                  }`}
              >
                <Settings className="w-4 h-4" />
                <span>{t('dashboard.settings')}</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleNavigate('admin')}
                  className={`${baseNavBtn} ${isActive('admin') ? activeNavBtn : inactiveNavBtn
                    }`}
                >
                  <Shield className="w-4 h-4 text-sky-200" />
                  <span>{t('navbar.admin')}</span>
                </button>
              )}
            </div>

            {/* Electron close button */}
            {isElectron && (
              <>
                <div className="h-6 w-px bg-slate-800/80" />
                <button
                  type="button"
                  onClick={() => window.electronAPI?.quitApp()}
                  className="group flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[11px] font-medium text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 border border-red-500/70 transition-all shadow-md shadow-red-900/50"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-700/85 group-hover:bg-red-600/95">
                    <LogOut className="w-3 h-3" />
                  </span>
                  <span className="flex flex-col leading-tight text-left">
                    <span className="text-[10px] font-semibold">{t('navbar.close')}</span>
                    <span className="text-[9px] text-red-100/85">
                      {t('navbar.exitSafely')}
                    </span>
                  </span>
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className="p-2 rounded-xl border border-slate-800/80 bg-slate-900/80 hover:bg-slate-900/95 text-slate-100 transition-all"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Gradient line under navbar */}
        <div className="h-[2px] bg-gradient-to-r from-sky-500/60 via-fuchsia-500/45 to-sky-400/60 opacity-80" />
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-950/98 backdrop-blur-xl border-b border-slate-900/85">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3">
            <div className="glass-panel rounded-2xl p-2 space-y-1 border border-slate-800/80 bg-slate-950/80">
              <button
                type="button"
                onClick={() => handleNavigate('home')}
                className={`${mobileBaseBtn} ${isActive('home') ? mobileActiveNavBtn : mobileInactiveNavBtn
                  }`}
              >
                <Home className="w-4 h-4" />
                <span>{t('dashboard.home')}</span>
              </button>

              {!isAdmin && (
                <button
                  type="button"
                  onClick={() => handleNavigate('trips')}
                  className={`${mobileBaseBtn} ${isActive('trips') ? mobileActiveNavBtn : mobileInactiveNavBtn
                    }`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>{t('dashboard.trips')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleNavigate('analytics')}
                className={`${mobileBaseBtn} ${isActive('analytics')
                  ? mobileActiveNavBtn
                  : mobileInactiveNavBtn
                  }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>{t('dashboard.analytics')}</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleNavigate('admin')}
                  className={`${mobileBaseBtn} ${isActive('admin') ? mobileActiveNavBtn : mobileInactiveNavBtn
                    }`}
                >
                  <Shield className="w-4 h-4 text-sky-200" />
                  <span>{t('navbar.admin')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleNavigate('settings')}
                className={`${mobileBaseBtn} ${isActive('settings')
                  ? mobileActiveNavBtn
                  : mobileInactiveNavBtn
                  }`}
              >
                <Settings className="w-4 h-4" />
                <span>{t('dashboard.settings')}</span>
              </button>

              {isElectron && (
                <div className="pt-2 border-t border-slate-800/80 mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      window.electronAPI?.quitApp();
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 border border-red-500/70 shadow-md shadow-red-900/40"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-700/90">
                      <LogOut className="w-4 h-4" />
                    </span>
                    <span className="flex flex-col leading-tight text-center">
                      <span className="text-[11px] font-semibold">
                        {t('navbar.closeApp')}
                      </span>
                      <span className="text-[10px] text-red-100/85">
                        {t('navbar.exitSafely')}
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
