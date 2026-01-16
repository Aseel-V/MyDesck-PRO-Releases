// ============================================================================
// DIRECTION PROVIDER - RTL Support for Arabic and Hebrew
// Version: 1.0.0 | Provides automatic text direction based on language
// ============================================================================

import { ReactNode } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface DirectionProviderProps {
  children: ReactNode;
  className?: string;
}

/**
 * DirectionProvider wraps content with the correct text direction (LTR/RTL)
 * based on the current language setting.
 * 
 * Usage:
 * <DirectionProvider>
 *   <YourContent />
 * </DirectionProvider>
 */
export function DirectionProvider({ children, className = '' }: DirectionProviderProps) {
  const { language } = useLanguage();
  const isRTL = language === 'ar' || language === 'he';
  
  return (
    <div 
      dir={isRTL ? 'rtl' : 'ltr'} 
      className={`${isRTL ? 'font-rtl text-right' : ''} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * useDirection hook for components that need to know the direction
 */
export function useDirection() {
  const { language } = useLanguage();
  const isRTL = language === 'ar' || language === 'he';
  
  return {
    isRTL,
    dir: isRTL ? 'rtl' : 'ltr',
    textAlign: isRTL ? 'right' : 'left',
    flexDir: isRTL ? 'flex-row-reverse' : 'flex-row',
  };
}

export default DirectionProvider;
