import { useLanguage } from '../contexts/LanguageContext';

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
