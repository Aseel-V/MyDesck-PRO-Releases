import { useState, useEffect, ChangeEvent, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  Save,
  User,
  Building2,
  Moon,
  Sun,
  Key,
  Download,
  Upload,
  RotateCcw,
  RefreshCw,
  UtensilsCrossed,
  Palette,
  Info,
  CheckCircle2,
  AlertCircle,
  Database,
  LogOut,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import RestaurantSettings from './restaurant/RestaurantSettings';
import { PostgrestError } from '@supabase/supabase-js';
import { resizeImage } from '../lib/imageUtils';
import { CurrencyService } from '../lib/currency';
import { safeImageSrc } from '../lib/safeUrl';

type NoticeType = 'success' | 'error' | 'info';
type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error';

export default function Settings() {
  const { profile, userProfile, updateProfile, user, refreshProfile, signOut } = useAuth();
  const { t, setLanguage, direction } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const [businessName, setBusinessName] = useState(profile?.business_name || '');
  const [businessRegNumber, setBusinessRegNumber] = useState(profile?.business_registration_number || '');
  const [businessAddress, setBusinessAddress] = useState(profile?.address || '');
  const [logoUrl, setLogoUrl] = useState(profile?.logo_url || '');
  const [signatureUrl, setSignatureUrl] = useState(profile?.signature_url || '');
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'ILS'>(
    (profile?.preferred_currency as 'USD' | 'EUR' | 'ILS') || 'USD'
  );
  const [language, setLanguageState] = useState<'en' | 'ar' | 'he'>(
    (profile?.preferred_language as 'en' | 'ar' | 'he') || 'en'
  );

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const email = user?.email || '';

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'business' | 'preferences' | 'security' | 'data' | 'restaurant' | 'about'>('profile');
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<null | { type: NoticeType; message: string }>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [appVersion, setAppVersion] = useState(__APP_VERSION__);
  const [updateState, setUpdateState] = useState<{
    status: UpdateStatus;
    availableVersion?: string | null;
    progress: number;
    error?: string | null;
  }>({ status: 'idle', availableVersion: null, progress: 0, error: null });
  const noticeTimeoutRef = useRef<number | null>(null);
  const previewLogoUrl = safeImageSrc(logoUrl || profile?.logo_url);
  const previewSignatureUrl = safeImageSrc(signatureUrl);

  // Simple toast helper
  const showNotice = (type: NoticeType, message: string, timeout = 3500) => {
    setNotice({ type, message });
    if (timeout > 0) {
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), timeout);
    }
  };

  // Sync dark mode + load profile details
  // useEffect removed - relying on AuthContext


  // Sync when profile changes
  useEffect(() => {
    if (!profile) return;
    setBusinessName(profile.business_name || '');
    setBusinessRegNumber(profile.business_registration_number || '');
    setBusinessAddress(profile.address || '');
    setLogoUrl(profile.logo_url || '');
    setSignatureUrl(profile.signature_url || '');
    setCurrency((profile.preferred_currency as 'USD' | 'EUR' | 'ILS') || 'USD');
    setLanguageState((profile.preferred_language as 'en' | 'ar' | 'he') || 'en');
  }, [profile]);

  // Sync user details when userProfile changes
  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.full_name || '');
      setPhoneNumber(userProfile.phone_number || '');
    }
  }, [userProfile]);

  // Clear inline success when switching tabs
  useEffect(() => {
    setSuccess(false);
  }, [activeTab]);

  // Load last updated currency rates timestamp
  useEffect(() => {
    const updated = CurrencyService.getLastUpdated();
    setLastUpdated(updated);
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    void api.getUpdateState().then((state) => {
      setAppVersion(state.currentVersion || __APP_VERSION__);
      setUpdateState(state);
    });

    const unsubscribe = api.onUpdateState((state) => {
      setAppVersion(state.currentVersion || __APP_VERSION__);
      setUpdateState(state);
    });

    return unsubscribe;
  }, []);

  const handleCheckForUpdates = () => void window.electronAPI?.checkForUpdates();
  const handleDownloadUpdate = () => void window.electronAPI?.startDownload();
  const handleInstallUpdate = () => void window.electronAPI?.restartApp();

  const updateStatusKey: Record<UpdateStatus, string> = {
    idle: 'updates.status.idle.title',
    checking: 'updates.status.checking.title',
    'up-to-date': 'updates.status.up-to-date.title',
    available: 'updates.status.available.title',
    downloading: 'updates.status.downloading.title',
    downloaded: 'updates.status.downloaded.title',
    error: 'updates.status.error.title',
  };



  const handleCurrencyChange = (newCurrency: 'USD' | 'EUR' | 'ILS') => {
    setCurrency(newCurrency);
  };

  const handleSaveProfile = async () => {
    if (!user) {
      showNotice('error', t('settings.messages.userNotFound'));
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      const { data: existingProfile, error: selectError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (selectError && (selectError as PostgrestError).code !== 'PGRST116') throw selectError;

      if (existingProfile) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            full_name: fullName,
            phone_number: phoneNumber,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('user_profiles').insert([
          { user_id: user.id, full_name: fullName, phone_number: phoneNumber },
        ]);
        if (insertError) throw insertError;
      }

      await refreshProfile();
      setSuccess(true);
      showNotice('success', t('settings.profile.success'), 2500);
    } catch (error) {
      console.error('Failed to update profile:', error);
      showNotice('error', t('settings.messages.profileSaveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBusiness = async () => {
    setLoading(true);
    setSuccess(false);

    try {
      await updateProfile({
        business_name: businessName,
        logo_url: safeImageSrc(logoUrl),
        preferred_currency: currency,
        preferred_language: language,
        business_registration_number: businessRegNumber || null,
        address: businessAddress || null,
        signature_url: safeImageSrc(signatureUrl),
      });

      setLanguage(language);
      setSuccess(true);
      showNotice('success', t('settings.saved'), 2500);
    } catch (error) {
      console.error('Failed to update settings:', error);
      showNotice('error', t('settings.messages.businessSaveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetBranding = async () => {
    if (!user) {
      showNotice('error', t('settings.messages.userNotFound'));
      return;
    }

    if (confirm(t('settings.messages.confirmResetBranding'))) {
      setBusinessName('MyDesck PRO');
      setLogoUrl('');

      try {
        const { error } = await supabase
          .from('business_profiles')
          .update({
            business_name: 'MyDesck PRO',
            logo_url: null,
            preferred_currency: currency,
            preferred_language: language,
          })
          .eq('user_id', user.id);

        if (error) throw error;
        showNotice('success', t('settings.messages.brandingReset'), 2500);
      } catch (error) {
        console.error('Failed to reset branding:', error);
        showNotice('error', t('settings.messages.brandingResetFailed'));
      }
    }
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSavePassword = async () => {
    if (newPassword.length < 6) {
      showNotice('error', t('settings.messages.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotice('error', t('settings.messages.passwordMismatch'));
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showNotice('success', t('settings.messages.passwordChanged'));
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      showNotice('error', t('settings.messages.passwordChangeFailed'));
    }
  };

  const handleRefreshProfile = async () => {
    try {
      await refreshProfile();
      showNotice('success', t('settings.messages.profileRefreshed'), 3000);
    } catch (error) {
      console.error('Error refreshing profile:', error);
      showNotice('error', t('settings.messages.profileRefreshFailed'));
    }
  };

  const handleRefreshRates = async () => {
    setRefreshingRates(true);
    try {
      await CurrencyService.refreshRates('USD');
      setLastUpdated(CurrencyService.getLastUpdated());
      showNotice('success', t('settings.messages.ratesUpdated'), 2500);
    } catch (error) {
      console.error('Error refreshing rates:', error);
      showNotice('error', t('settings.messages.ratesUpdateFailed'));
    } finally {
      setRefreshingRates(false);
    }
  };

  const handleExportData = async () => {
    if (!user) {
      showNotice('error', t('settings.messages.userNotFound'));
      return;
    }

    try {
      const { data: trips, error } = await supabase.from('trips').select('*').eq('user_id', user.id);
      if (error) throw error;

      const exportData = {
        backupSchemaVersion: '1.0.0',
        appVersion,
        exportDate: new Date().toISOString(),
        profile,
        userProfile: { full_name: fullName, phone_number: phoneNumber },
        trips,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mydesckpro-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showNotice('success', t('settings.messages.dataExported'));
    } catch (error) {
      console.error('Export failed:', error);
      showNotice('error', t('settings.messages.dataExportFailed'));
    }
  };

  const handleImportData = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      showNotice('error', t('settings.messages.userNotFound'));
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.trips || !Array.isArray(data.trips)) {
          showNotice('error', t('settings.messages.invalidBackup'));
          return;
        }

        if (confirm(t('settings.messages.confirmImport', { count: data.trips.length }))) {
          for (const trip of data.trips) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...tripData } = trip;
            const { error } = await supabase.from('trips').insert([{ ...tripData, user_id: user.id }]);
            if (error) throw error;
          }

          showNotice('success', t('settings.messages.dataImported'));
          window.location.reload();
        }
      } catch (error) {
        console.error('Import failed:', error);
        showNotice('error', t('settings.messages.dataImportFailed'));
      }
    };
    reader.readAsText(file);
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      showNotice('error', t('settings.messages.userNotFound'));
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showNotice('error', t('settings.messages.fileTooLarge'));
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      showNotice('error', t('settings.messages.unsupportedLogoType'));
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `business-logos/${fileName}`;

      const resizedBlob = await resizeImage(file, 500, 500);
      const resizedFile = new File([resizedBlob], fileName, { type: file.type });

      const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, resizedFile, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type || 'image/*',
      });

      if (uploadError) {
        // لو bucket/policy غلط، هذه الرسالة تكون أوضح للمستخدم
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(filePath);
      const newLogoUrl = publicUrlData?.publicUrl;

      if (!newLogoUrl) throw new Error('Could not get public URL for the uploaded logo.');

      setLogoUrl(newLogoUrl);

      await updateProfile({ logo_url: newLogoUrl });
      await refreshProfile();

      showNotice('success', t('settings.messages.logoUploaded'));
    } catch (error) {
      console.error('Logo upload failed:', error);
      showNotice('error', t('settings.messages.signatureUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleSignatureUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      showNotice('error', t('settings.messages.userNotFound'));
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showNotice('error', t('settings.messages.fileTooLarge'));
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      showNotice('error', t('settings.messages.unsupportedSignatureType'));
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `sig-${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `business-signatures/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type,
      });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(filePath);
      const newSigUrl = publicUrlData?.publicUrl;
      if (!newSigUrl) throw new Error('Could not get public URL');

      setSignatureUrl(newSigUrl);

      await updateProfile({ signature_url: newSigUrl });
      await refreshProfile();
      showNotice('success', t('settings.messages.signatureUploaded'));
    } catch (error) {
      console.error('Signature upload failed:', error);
      showNotice('error', t('settings.messages.logoUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const fieldClass = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-900/60 dark:disabled:text-slate-500';
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200';
  const secondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
  const primaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:ring-offset-slate-950';

  const navItems = [
    { id: 'profile' as const, icon: User, title: t('settings.tabs.profile'), description: t('settings.navigation.profile') },
    { id: 'business' as const, icon: Building2, title: t('settings.tabs.business'), description: t('settings.navigation.business') },
    { id: 'preferences' as const, icon: Palette, title: t('settings.tabs.preferences'), description: t('settings.navigation.preferences') },
    { id: 'security' as const, icon: Key, title: t('settings.tabs.security'), description: t('settings.navigation.security') },
    { id: 'data' as const, icon: Database, title: t('settings.tabs.data'), description: t('settings.navigation.data') },
    ...(profile?.business_type === 'restaurant'
      ? [{ id: 'restaurant' as const, icon: UtensilsCrossed, title: t('settings.tabs.restaurant'), description: t('settings.navigation.restaurant') }]
      : []),
    { id: 'about' as const, icon: Info, title: t('settings.tabs.about'), description: t('settings.navigation.about') },
  ];
  const activeItem = navItems.find((item) => item.id === activeTab) || navItems[0];

  const getLocale = () => language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-IL' : 'en-US';

  return (
    <div className="mx-auto w-full max-w-[1400px] animate-fadeIn" dir={direction}>
      <div className="space-y-4">
        {/* Toast / Notice */}
        {notice && (
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
            className={
              `flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ` +
              (notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                : notice.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200')
            }
          >
            {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{notice.message}</span>
          </div>
        )}

        <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{t('settings.workspaceSettings')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              {t('settings.manageSubtitle')}
          </p>
        </header>

        <div className="lg:hidden">
          <label htmlFor="settings-category" className={labelClass}>{t('settings.mobileCategory')}</label>
          <select
            id="settings-category"
            value={activeTab}
            onChange={(event) => setActiveTab(event.target.value as typeof activeTab)}
            className={fieldClass}
          >
            {navItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden border-e border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40 lg:block">
            <nav aria-label={t('settings.navigationLabel')} className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
              <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-start transition focus:outline-none focus:ring-2 focus:ring-sky-500/30 ${active ? 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100' : 'border-transparent text-slate-700 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900'}`}
              >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">{item.description}</span>
                    </span>
              </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0">
            <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
              <div className="flex items-start gap-3">
                <activeItem.icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{activeItem.title}</h2>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{activeItem.description}</p>
                </div>
              </div>
            </div>

            <div className="p-4 text-slate-900 dark:text-slate-100 sm:p-6">
            {activeTab === 'profile' && (
              <section aria-labelledby="profile-settings" className="space-y-5">
                <h3 id="profile-settings" className="sr-only">{t('settings.profile.header')}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="settings-full-name" className={labelClass}>{t('settings.profile.fullName')}</label>
                    <input
                      id="settings-full-name"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('settings.profile.fullNamePlaceholder')}
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="settings-email" className={labelClass}>{t('settings.profile.email')}</label>
                    <input
                      id="settings-email"
                      type="email"
                      dir="ltr"
                      autoComplete="email"
                      value={email}
                      disabled
                      className={fieldClass}
                    />
                    <p className="mt-1 text-xs text-slate-500">{t('settings.profile.emailCannotChange')}</p>
                  </div>

                  <div>
                    <label htmlFor="settings-phone" className={labelClass}>{t('settings.profile.phone')}</label>
                    <input
                      id="settings-phone"
                      type="tel"
                      dir="ltr"
                      autoComplete="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={t('settings.profile.phonePlaceholder')}
                      className={fieldClass}
                    />
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'business' && (
              <section aria-labelledby="business-settings" className="space-y-6">
                <h3 id="business-settings" className="sr-only">{t('settings.business.header')}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="business-name" className={labelClass}>{t('settings.businessName')}</label>
                    <input
                      id="business-name"
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="business-address" className={labelClass}>{t('settings.business.address')}</label>
                    <input
                      id="business-address"
                      type="text"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      placeholder={t('settings.business.addressPlaceholder')}
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="business-number" className={labelClass}>{t('settings.business.regNumber')}</label>
                    <input
                      id="business-number"
                      type="text"
                      dir="ltr"
                      value={businessRegNumber}
                      onChange={(e) => setBusinessRegNumber(e.target.value)}
                      placeholder={t('settings.business.regNumberPlaceholder')}
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <span className={labelClass}>{t('settings.business.statusLabel')}</span>
                    <div className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${profile?.subscription_status === 'active' ? 'bg-emerald-500' : profile?.subscription_status === 'past_due' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                      <span className="text-sm font-medium">{t(`settings.business.status.${profile?.subscription_status || 'trial'}`)}</span>
                      {(profile?.subscription_status === 'trial' || !profile?.subscription_status) && (
                        <span className="ms-auto text-xs text-slate-500">
                          {t('settings.business.trialEnds')}: <span dir="ltr">{(() => { const start = new Date(profile?.trial_start_date || profile?.created_at || Date.now()); const end = new Date(start); end.setMonth(end.getMonth() + 3); return end.toLocaleDateString(getLocale()); })()}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{t('settings.logoUrl')}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{t('settings.business.logoFormats')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {previewLogoUrl && <img src={previewLogoUrl} alt={t('settings.business.logoPreview')} className="h-10 w-10 rounded-md border border-slate-200 bg-white object-contain dark:border-slate-700" />}
                        <label
                          htmlFor="logo-upload"
                          className={`${secondaryButtonClass} ${uploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        >
                          <Upload className={`h-4 w-4 ${uploading ? 'animate-pulse' : ''}`} />
                          <span className="text-sm font-semibold">{uploading ? t('settings.business.updating') : t('settings.business.logoUpload')}</span>
                        </label>
                      <input id="logo-upload" type="file" accept="image/png, image/jpeg, image/svg+xml" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{t('settings.business.signatureLabel')}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{t('settings.business.signatureFormat')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {previewSignatureUrl && <img src={previewSignatureUrl} alt={t('settings.business.signaturePreview')} className="h-10 max-w-24 rounded-md border border-slate-200 bg-white object-contain p-1 dark:border-slate-700" />}
                      <label htmlFor="signature-upload" className={`${secondaryButtonClass} cursor-pointer`}>
                        <Upload className="h-4 w-4" />
                        <span>{t('settings.business.uploadSignature')}</span>
                      </label>
                      <input id="signature-upload" type="file" accept="image/png, image/jpeg" onChange={handleSignatureUpload} className="hidden" disabled={uploading} />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="logo-url" className={labelClass}>{t('settings.business.logoUrlFallback')}</label>
                  <input id="logo-url" type="url" dir="ltr" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder={t('auth.logoPlaceholder')} className={fieldClass} />
                </div>
              </section>
            )}

            {activeTab === 'preferences' && (
              <section aria-labelledby="preference-settings" className="space-y-6">
                <h3 id="preference-settings" className="sr-only">{t('settings.tabs.preferences')}</h3>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-medium">{t('settings.business.darkMode')}</p><p className="mt-0.5 text-xs text-slate-500">{t('settings.descriptions.theme')}</p></div>
                    <button type="button" onClick={toggleTheme} aria-pressed={theme === 'dark'} className={secondaryButtonClass}>
                      {theme === 'dark' ? <Moon className="h-4 w-4 text-sky-500" /> : <Sun className="h-4 w-4 text-amber-500" />}
                      <span>{theme === 'dark' ? t('settings.business.darkModeOn') : t('settings.business.lightModeOn')}</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><label htmlFor="settings-language" className="text-sm font-medium">{t('settings.language')}</label><p className="mt-0.5 text-xs text-slate-500">{t('settings.descriptions.language')}</p></div>
                    <select id="settings-language" value={language} onChange={(e) => setLanguageState(e.target.value as 'en' | 'ar' | 'he')} className={`${fieldClass} sm:w-52`}>
                      <option value="en">{t('languages.en')}</option><option value="ar">{t('languages.ar')}</option><option value="he">{t('languages.he')}</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><label htmlFor="settings-currency" className="text-sm font-medium">{t('settings.currency')}</label><p className="mt-0.5 text-xs text-slate-500">{t('settings.descriptions.currency')}</p></div>
                    <select id="settings-currency" dir="ltr" value={currency} onChange={(e) => handleCurrencyChange(e.target.value as 'USD' | 'EUR' | 'ILS')} className={`${fieldClass} sm:w-52`}>
                      <option value="USD">{t('currencies.USD')}</option><option value="EUR">{t('currencies.EUR')}</option><option value="ILS">{t('currencies.ILS')}</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-medium">{t('settings.business.liveConversion')}</p><p className="mt-0.5 text-xs text-slate-500">{t('settings.business.autoRefresh')}</p><p className="mt-1 text-xs text-slate-500">{t('settings.business.lastUpdated')} <span dir="ltr">{lastUpdated ? lastUpdated.toLocaleString(getLocale()) : t('settings.business.never')}</span></p></div>
                    <button type="button" onClick={handleRefreshRates} disabled={refreshingRates} className={secondaryButtonClass}><RefreshCw className={`h-4 w-4 ${refreshingRates ? 'animate-spin' : ''}`} /><span>{refreshingRates ? t('settings.business.updating') : t('settings.business.refreshNow')}</span></button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'security' && (
              <section aria-labelledby="security-settings" className="space-y-4">
                <h3 id="security-settings" className="sr-only">{t('settings.tabs.security')}</h3>
                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <div className={`flex flex-col gap-4 ${!showPasswordModal ? 'sm:flex-row sm:items-center sm:justify-between' : ''}`}>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.security.changePassword')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.security.changePasswordDesc')}</p>
                    </div>
                    {!showPasswordModal ? (
                      <button type="button" onClick={() => setShowPasswordModal(true)} className={secondaryButtonClass}>
                        <Key className="h-4 w-4" />
                        <span>{t('settings.security.change')}</span>
                      </button>
                    ) : (
                      <div className="w-full rounded-lg bg-slate-50 p-4 dark:bg-slate-900/60">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div><label htmlFor="new-password" className={labelClass}>{t('settings.security.newPassword')}</label><input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={fieldClass} /></div>
                          <div><label htmlFor="confirm-password" className={labelClass}>{t('settings.security.confirmPassword')}</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={fieldClass} /></div>
                          <div className="flex justify-end gap-2 sm:col-span-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowPasswordModal(false);
                                setNewPassword('');
                                setConfirmPassword('');
                              }}
                              className={secondaryButtonClass}
                            >
                              {t('settings.cancel')}
                            </button>
                            <button type="button" onClick={handleSavePassword} className={primaryButtonClass}>{t('settings.security.savePassword')}</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>


                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.security.signOut')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.security.signOutDesc')}</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await signOut();
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className={secondaryButtonClass}
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{t('settings.security.signOut')}</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.security.refreshProfile')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.security.refreshProfileDesc')}</p>
                    </div>
                    <button type="button" onClick={handleRefreshProfile} className={secondaryButtonClass}>
                      <RotateCcw className="h-4 w-4" />
                      <span>{t('settings.security.refresh')}</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'data' && (
              <section aria-labelledby="data-settings">
                <h3 id="data-settings" className="sr-only">{t('settings.data.header')}</h3>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.data.export')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.data.exportDesc')}</p>
                      </div>
                      <button type="button" onClick={handleExportData} className={secondaryButtonClass}>
                        <Download className="h-4 w-4" />
                        <span>{t('settings.data.exportBtn')}</span>
                      </button>
                  </div>

                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.data.import')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.data.importDesc')}</p>
                      </div>
                      <label className={`${secondaryButtonClass} cursor-pointer`}>
                        <Upload className="h-4 w-4" />
                        <span>{t('settings.data.importBtn')}</span>
                        <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                      </label>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'restaurant' && profile?.business_type === 'restaurant' && (
              <RestaurantSettings />
            )}

            {activeTab === 'about' && (
              <section aria-labelledby="about-settings">
                <h3 id="about-settings" className="sr-only">{t('settings.tabs.about')}</h3>
                <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"><dt className="text-sm font-medium">{t('settings.about.application')}</dt><dd className="text-sm text-slate-600 dark:text-slate-400">MyDesck PRO</dd></div>
                  <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"><dt className="text-sm font-medium">{t('settings.about.version')}</dt><dd dir="ltr" className="font-mono text-sm tabular-nums text-slate-600 dark:text-slate-400">v{appVersion}</dd></div>
                  <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"><dt className="text-sm font-medium">{t('settings.signedInAs')}</dt><dd dir="ltr" className="max-w-full truncate text-sm text-slate-600 dark:text-slate-400">{email}</dd></div>
                </dl>
                {window.electronAPI && (
                  <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800" aria-live="polite">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100">{t('updates.heading')}</h4>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {t(updateStatusKey[updateState.status])}
                          {updateState.availableVersion && (
                            <span dir="ltr" className="ms-1 font-mono tabular-nums">v{updateState.availableVersion}</span>
                          )}
                        </p>
                        {updateState.status === 'downloading' && (
                          <div className="mt-3 h-2 max-w-sm overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-label={t('updates.downloadProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(updateState.progress)}>
                            <div className="h-full bg-sky-600 transition-[width]" style={{ width: `${Math.round(updateState.progress)}%` }} />
                          </div>
                        )}
                        {updateState.status === 'error' && (
                          <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                            {t(`updates.errors.${updateState.error === 'UPDATE_DOWNLOAD_FAILED' ? 'download' : updateState.error === 'INVALID_UPDATE_METADATA' ? 'metadata' : 'check'}`)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {updateState.status === 'available' && (
                          <button type="button" onClick={handleDownloadUpdate} className={primaryButtonClass}>
                            <Download className="h-4 w-4" />{t('updates.download')}
                          </button>
                        )}
                        {updateState.status === 'downloaded' && (
                          <button type="button" onClick={handleInstallUpdate} className={primaryButtonClass}>
                            <RefreshCw className="h-4 w-4" />{t('updates.restartToInstall')}
                          </button>
                        )}
                        {!['available', 'downloaded', 'downloading', 'checking'].includes(updateState.status) && (
                          <button type="button" onClick={handleCheckForUpdates} className={secondaryButtonClass}>
                            <RefreshCw className="h-4 w-4" />{t('updates.checkNow')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
            </div>

            {(activeTab === 'profile' || activeTab === 'business' || activeTab === 'preferences') && (
              <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95 sm:px-6">
                <div className="min-h-5 text-xs text-slate-500" aria-live="polite">
                  {loading ? t('settings.profile.saving') : success ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{t('settings.saved')}</span> : t('settings.explicitSaveHint')}
                </div>
                <div className="flex items-center gap-2">
                  {activeTab === 'business' && <button type="button" onClick={handleResetBranding} className={secondaryButtonClass}><RotateCcw className="h-4 w-4" />{t('settings.business.resetBranding')}</button>}
                  <button type="button" onClick={activeTab === 'profile' ? handleSaveProfile : handleSaveBusiness} disabled={loading} className={primaryButtonClass}><Save className="h-4 w-4" /><span>{loading ? t('settings.profile.saving') : activeTab === 'profile' ? t('settings.profile.save') : t('settings.business.saveBusiness')}</span></button>
                </div>
              </div>
            )}
          </main>
        </div>

      </div>
    </div>
  );
}
