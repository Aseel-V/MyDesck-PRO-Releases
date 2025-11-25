import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function useBranding() {
  const { profile } = useAuth();
  const { t, language } = useLanguage();

  return useMemo(() => {
    let displayLogoUrl = profile?.logo_url || '/vite.svg';
    // Add a cache-busting query based on updated_at so new uploads show immediately
    if (profile?.logo_url && profile?.updated_at) {
      const sep = profile.logo_url.includes('?') ? '&' : '?';
      const v = new Date(profile.updated_at).getTime();
      displayLogoUrl = `${profile.logo_url}${sep}v=${v}`;
    }
    const displayName = profile?.business_name || t('appName');

    return {
      displayLogoUrl,
      displayName,
      hasCustomBranding: !!(profile?.logo_url || profile?.business_name),
    };
  }, [profile, language]); // <— FIXED
}
