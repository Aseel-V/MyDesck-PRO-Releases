// ============================================================================
// LANGUAGE TOGGLE - Trilingual Switch (English / Arabic / Hebrew)
// Version: 1.0.0 | Restaurant Mode Localization
// ============================================================================

import { useLanguage } from '../../contexts/LanguageContext';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', nativeLabel: 'English' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦', nativeLabel: 'العربية' },
  { code: 'he', label: 'Hebrew', flag: '🇮🇱', nativeLabel: 'עברית' },
] as const;

interface LanguageToggleProps {
  variant?: 'buttons' | 'dropdown' | 'compact';
  showLabel?: boolean;
  className?: string;
}

/**
 * LanguageToggle - A component for switching between English, Arabic, and Hebrew
 * 
 * Variants:
 * - 'buttons': Inline buttons showing all languages (default)
 * - 'dropdown': Click to show dropdown menu
 * - 'compact': Just flags, no text
 */
export function LanguageToggle({ 
  variant = 'buttons', 
  showLabel = true,
  className = '' 
}: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLang = LANGUAGES.find(lang => lang.code === language) || LANGUAGES[0];

  // Buttons variant - shows all languages inline
  if (variant === 'buttons') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {showLabel && (
          <Globe size={16} className="text-slate-400 mr-1" />
        )}
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`px-2 py-1 rounded-md text-sm font-medium transition-colors ${
              language === lang.code 
                ? 'bg-blue-500 text-white' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title={lang.label}
          >
            <span className="mr-1">{lang.flag}</span>
            {!showLabel && <span className="hidden sm:inline">{lang.nativeLabel}</span>}
          </button>
        ))}
      </div>
    );
  }

  // Compact variant - just flags
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`w-8 h-8 flex items-center justify-center rounded-full text-lg transition-all ${
              language === lang.code 
                ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900' 
                : 'opacity-60 hover:opacity-100'
            }`}
            title={lang.label}
          >
            {lang.flag}
          </button>
        ))}
      </div>
    );
  }

  // Dropdown variant
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <Globe size={16} className="text-slate-500" />
        <span className="text-lg">{currentLang.flag}</span>
        <span className="text-sm text-slate-600 dark:text-slate-300">{currentLang.nativeLabel}</span>
        <svg 
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[160px]">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                language === lang.code ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {lang.nativeLabel}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang.label}
                </div>
              </div>
              {language === lang.code && (
                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LanguageToggle;
