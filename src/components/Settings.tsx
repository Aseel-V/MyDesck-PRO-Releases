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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import RestaurantSettings from './restaurant/RestaurantSettings';
import { PostgrestError } from '@supabase/supabase-js';
import { resizeImage } from '../lib/imageUtils';
import { CurrencyService } from '../lib/currency';

type NoticeType = 'success' | 'error' | 'info';

export default function Settings() {
  const { profile, userProfile, updateProfile, user, refreshProfile, signOut } = useAuth();
  const { t, setLanguage } = useLanguage();
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
  const [activeTab, setActiveTab] = useState<'profile' | 'business' | 'security' | 'data' | 'restaurant'>('profile');
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<null | { type: NoticeType; message: string }>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshingRates, setRefreshingRates] = useState(false);
  const noticeTimeoutRef = useRef<number | null>(null);

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



  const handleCurrencyChange = (newCurrency: 'USD' | 'EUR' | 'ILS') => {
    setCurrency(newCurrency);
  };

  const handleSaveProfile = async () => {
    if (!user) {
      showNotice('error', 'User not found');
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
      showNotice('success', 'Profile saved successfully', 2500);
    } catch (error) {
      console.error('Failed to update profile:', error);
      showNotice('error', 'Failed to save profile');
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
        logo_url: logoUrl || null,
        preferred_currency: currency,
        preferred_language: language,
        business_registration_number: businessRegNumber || null,
        address: businessAddress || null,
        signature_url: signatureUrl || null,
      });

      setLanguage(language);
      setSuccess(true);
      showNotice('success', t('settings.saved'), 2500);
    } catch (error) {
      console.error('Failed to update settings:', error);
      showNotice('error', 'Failed to update business settings');
    } finally {
      setLoading(false);
    }
  };

  const handleResetBranding = async () => {
    if (!user) {
      showNotice('error', 'User not found');
      return;
    }

    if (confirm('Are you sure you want to reset to default branding?')) {
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
        showNotice('success', 'Branding reset to defaults', 2500);
      } catch (error) {
        console.error('Failed to reset branding:', error);
        showNotice('error', 'Failed to reset branding');
      }
    }
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSavePassword = async () => {
    if (newPassword.length < 6) {
      showNotice('error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotice('error', 'Passwords do not match');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showNotice('success', 'Password changed successfully');
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      showNotice('error', 'Failed to change password');
    }
  };

  const handleRefreshProfile = async () => {
    try {
      await refreshProfile();
      showNotice('success', 'Profile refreshed successfully! Role updated.', 3000);
    } catch (error) {
      console.error('Error refreshing profile:', error);
      showNotice('error', 'Failed to refresh profile');
    }
  };

  const handleRefreshRates = async () => {
    setRefreshingRates(true);
    try {
      await CurrencyService.refreshRates('USD');
      setLastUpdated(CurrencyService.getLastUpdated());
      showNotice('success', 'Exchange rates updated successfully', 2500);
    } catch (error) {
      console.error('Error refreshing rates:', error);
      showNotice('error', 'Failed to refresh exchange rates');
    } finally {
      setRefreshingRates(false);
    }
  };

  const handleExportData = async () => {
    if (!user) {
      showNotice('error', 'User not found');
      return;
    }

    try {
      const { data: trips, error } = await supabase.from('trips').select('*').eq('user_id', user.id);
      if (error) throw error;

      const exportData = {
        version: '1.0.0',
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

      showNotice('success', 'Data exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      showNotice('error', 'Failed to export data');
    }
  };

  const handleImportData = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      showNotice('error', 'User not found');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.trips || !Array.isArray(data.trips)) {
          showNotice('error', 'Invalid backup file');
          return;
        }

        if (confirm(`Import ${data.trips.length} trips? This will not delete existing data.`)) {
          for (const trip of data.trips) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...tripData } = trip;
            const { error } = await supabase.from('trips').insert([{ ...tripData, user_id: user.id }]);
            if (error) throw error;
          }

          showNotice('success', 'Data imported successfully');
          window.location.reload();
        }
      } catch (error) {
        console.error('Import failed:', error);
        showNotice('error', 'Failed to import data');
      }
    };
    reader.readAsText(file);
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      showNotice('error', 'User not found');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showNotice('error', 'File is too large. Max size is 2MB.');
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      showNotice('error', 'Unsupported file type. Use SVG, PNG, or JPG.');
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

      showNotice('success', 'Logo uploaded successfully');
    } catch (error) {
      console.error('Logo upload failed:', error);
      const message = error instanceof Error ? error.message : "Upload failed. Ensure bucket 'logos' exists";
      showNotice('error', message);
    } finally {
      setUploading(false);
    }
  };

  const handleSignatureUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      showNotice('error', 'User not found');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showNotice('error', 'File is too large. Max size is 2MB.');
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      showNotice('error', 'Unsupported file type. Use PNG or JPG.');
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

      showNotice('success', 'Signature uploaded successfully');
    } catch (error) {
      console.error('Signature upload failed:', error);
      const message = error instanceof Error ? error.message : "Upload failed. Ensure bucket 'logos' exists";
      showNotice('error', message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Toast / Notice */}
        {notice && (
          <div
            className={
              `rounded-xl border px-4 py-3 text-sm shadow-lg shadow-slate-950/60 ` +
              (notice.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-100'
                : notice.type === 'error'
                ? 'bg-rose-500/10 border-rose-400/40 text-rose-100'
                : 'bg-sky-500/10 border-sky-400/40 text-sky-100')
            }
          >
            {notice.message}
          </div>
        )}

        {/* Header card */}
        <div className="glass-panel bg-white/95 border border-slate-200 rounded-2xl shadow-xl p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4 dark:bg-slate-950/80 dark:border-slate-800/80 dark:shadow-slate-950/70">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-sky-600/80 mb-1.5 dark:text-sky-400/80">{t('settings.titlePreferences')}</p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-1 dark:text-slate-50">{t('settings.workspaceSettings')}</h1>
            <p className="text-sm text-slate-500 max-w-xl dark:text-slate-300">
              {t('settings.manageSubtitle')}
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2 text-xs">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/80">
              {logoUrl || profile?.logo_url ? (
                <img
                  src={logoUrl || profile?.logo_url || ''}
                  alt="Business Logo"
                  className="w-5 h-5 object-contain rounded-md"
                />
              ) : (
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              )}
              <span className="text-slate-700 dark:text-slate-300">{businessName || profile?.business_name || 'MyDesck PRO'}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/80">
              <span className="text-slate-500">{t('settings.signedInAs')}</span>
              <span className="text-sky-600 font-medium text-[11px] truncate max-w-[180px] dark:text-sky-300">{email}</span>
            </div>
          </div>
        </div>

        {/* Main settings panel with tabs */}
        <div className="glass-panel bg-white/95 border border-slate-200 rounded-2xl shadow-xl overflow-hidden dark:bg-slate-950/70 dark:border-slate-800/80 dark:shadow-slate-950/60">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-2 border-b border-slate-800/60 overflow-x-auto">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'profile'
                  ? 'bg-sky-500/15 text-sky-700 border border-sky-500/30 shadow-sm dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/60 dark:shadow-sky-900/60'
                  : 'text-slate-500 hover:bg-slate-100 border border-transparent dark:text-slate-300 dark:hover:bg-slate-900/70'
              }`}
            >
              <User className="w-4 h-4" />
              <span>{t('settings.tabs.profile')}</span>
            </button>

            <button
              onClick={() => setActiveTab('business')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'business'
                  ? 'bg-sky-500/15 text-sky-700 border border-sky-500/30 shadow-sm dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/60 dark:shadow-sky-900/60'
                  : 'text-slate-500 hover:bg-slate-100 border border-transparent dark:text-slate-300 dark:hover:bg-slate-900/70'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>{t('settings.tabs.business')}</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-sky-500/15 text-sky-700 border border-sky-500/30 shadow-sm dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/60 dark:shadow-sky-900/60'
                  : 'text-slate-500 hover:bg-slate-100 border border-transparent dark:text-slate-300 dark:hover:bg-slate-900/70'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>{t('settings.tabs.security')}</span>
            </button>

            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'data'
                  ? 'bg-sky-500/15 text-sky-700 border border-sky-500/30 shadow-sm dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/60 dark:shadow-sky-900/60'
                  : 'text-slate-500 hover:bg-slate-100 border border-transparent dark:text-slate-300 dark:hover:bg-slate-900/70'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('settings.tabs.data')}</span>
            </button>

            {/* Restaurant Tab - Only for Restaurant users */}
            {profile?.business_type === 'restaurant' && (
              <button
                onClick={() => setActiveTab('restaurant')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'restaurant'
                    ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 shadow-sm dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/60 dark:shadow-emerald-900/60'
                    : 'text-slate-500 hover:bg-slate-100 border border-transparent dark:text-slate-300 dark:hover:bg-slate-900/70'
                }`}
              >
                <UtensilsCrossed className="w-4 h-4" />
                <span>{t('Restaurant')}</span>
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-6 md:p-8 text-slate-900 dark:text-slate-100">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">{t('settings.profile.header')}</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.profile.fullName')}</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('settings.profile.fullNamePlaceholder')}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.profile.email')}</label>
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">{t('settings.profile.emailCannotChange')}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.profile.phone')}</label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={t('settings.profile.phonePlaceholder')}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                </div>

                {success && (
                  <div className="bg-emerald-500/10 border border-emerald-500/60 text-emerald-200 px-4 py-3 rounded-xl text-sm">
                    {t('settings.profile.success')}
                  </div>
                )}

                <button
                  onClick={handleSaveProfile}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white py-3 rounded-xl font-semibold hover:bg-sky-700 focus:ring-4 focus:ring-sky-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.01]"
                >
                  <Save className="w-5 h-5" />
                  <span>{loading ? t('settings.profile.saving') : t('settings.profile.save')}</span>
                </button>
              </div>
            )}

            {activeTab === 'business' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">{t('settings.business.header')}</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.businessName')}</label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
                      {t('settings.business.address')}
                    </label>
                    <input
                      type="text"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      placeholder={t('settings.business.addressPlaceholder')}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
                      {t('settings.business.regNumber')}
                    </label>
                    <input
                      type="text"
                      value={businessRegNumber}
                      onChange={(e) => setBusinessRegNumber(e.target.value)}
                      placeholder={t('settings.business.regNumberPlaceholder')}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>

                  {/* Signature Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
                      {t('settings.business.signatureLabel')}
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label
                          htmlFor="signature-upload"
                          className="w-full flex flex-col items-center justify-center px-4 py-6 rounded-xl border-2 border-dashed bg-slate-50 border-slate-300 text-slate-500 hover:border-sky-500 hover:text-sky-600 cursor-pointer transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-400 dark:hover:text-sky-300"
                        >
                          <Upload className="w-8 h-8 mb-2 opacity-50" />
                          <span className="text-sm font-semibold">{t('settings.business.uploadSignature')}</span>
                          <span className="text-xs text-slate-500 mt-1">{t('settings.business.signatureFormat')}</span>
                        </label>
                        <input
                          id="signature-upload"
                          type="file"
                          accept="image/png, image/jpeg"
                          onChange={handleSignatureUpload}
                          className="hidden"
                          disabled={uploading}
                        />
                      </div>
                      {signatureUrl && (
                        <div className="p-2 bg-white rounded-lg">
                          <img src={signatureUrl} alt={t('settings.business.signaturePreview')} className="h-12 object-contain" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Logo upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.logoUrl')}</label>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label
                          htmlFor="logo-upload"
                          className={`w-full flex flex-col items-center justify-center px-4 py-6 rounded-xl border-2 border-dashed transition-all ${
                            uploading
                              ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-500'
                              : 'bg-slate-50 border-slate-300 text-slate-500 hover:border-sky-500 hover:text-sky-600 cursor-pointer dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-400 dark:hover:text-sky-300'
                          }`}
                        >
                          <Upload className={`w-8 h-8 mb-2 ${uploading ? 'animate-pulse' : ''}`} />
                          <span className="text-sm font-semibold">{uploading ? t('settings.business.updating') : t('settings.business.logoUpload')}</span>
                          <span className="text-xs text-slate-500 mt-1">{t('settings.business.logoFormats')}</span>
                        </label>
                        <input
                          id="logo-upload"
                          type="file"
                          accept="image/png, image/jpeg, image/svg+xml"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={uploading}
                        />
                      </div>
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt={t('settings.business.logoPreview')}
                          className="h-12 w-12 object-contain rounded-lg border border-slate-800 bg-slate-900/60"
                        />
                      )}
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-medium text-slate-500 mb-1 dark:text-slate-400">{t('settings.business.logoUrlFallback')}</label>
                      <input
                        type="text"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder={t('auth.logoPlaceholder')}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:ring-1 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-200 dark:placeholder-slate-500"
                      />
                    </div>
                  </div>


                  {/* Subscription Status */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
                      {t('settings.business.statusLabel')}
                    </label>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/80 dark:border-slate-700">
                      <div className={`w-3 h-3 rounded-full ${
                        profile?.subscription_status === 'active' ? 'bg-emerald-500' : 
                        profile?.subscription_status === 'past_due' ? 'bg-rose-500' : 'bg-amber-400'
                      }`} />
                      <div className="flex-1">
                        <span className="font-medium text-slate-900 dark:text-slate-100 block">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {t(`settings.business.status.${profile?.subscription_status || 'trial'}` as any)}
                        </span>
                        {/* Show trial end date if in trial */}
                        {(profile?.subscription_status === 'trial' || !profile?.subscription_status) && (
                           <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                             {t('settings.business.trialEnds')}: {(() => {
                               const startDate = new Date(profile?.trial_start_date || profile?.created_at || Date.now());
                               const endDate = new Date(startDate);
                               endDate.setMonth(endDate.getMonth() + 3);
                               return endDate.toLocaleDateString();
                             })()}
                           </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.currency')}</label>
                    <select
                      value={currency}
                      onChange={(e) => handleCurrencyChange(e.target.value as 'USD' | 'EUR' | 'ILS')}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100"
                    >
                      <option value="USD">{t('currencies.USD')}</option>
                      <option value="EUR">{t('currencies.EUR')}</option>
                      <option value="ILS">{t('currencies.ILS')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.language')}</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguageState(e.target.value as 'en' | 'ar' | 'he')}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100"
                    >
                      <option value="en">{t('languages.en')}</option>
                      <option value="ar">{t('languages.ar')}</option>
                      <option value="he">{t('languages.he')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.business.darkMode')}</label>
                    <button
                      onClick={toggleTheme}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all w-full dark:bg-slate-900/80 dark:border-slate-700 dark:hover:bg-slate-800/80"
                    >
                      {theme === 'dark' ? <Moon className="w-5 h-5 text-sky-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                      <span className="font-medium text-slate-900 dark:text-slate-100">{theme === 'dark' ? t('settings.business.darkModeOn') : t('settings.business.lightModeOn')}</span>
                    </button>
                  </div>

                  {/* Exchange Rates Management */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">{t('settings.business.exchangeRates')}</label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 text-sm mb-1 dark:text-slate-100">{t('settings.business.liveConversion')}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t('settings.business.lastUpdated')}{' '}
                            {lastUpdated ? (
                              <span className="text-slate-300">{lastUpdated.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-500">{t('settings.business.never')}</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">{t('settings.business.autoRefresh')}</p>
                        </div>
                        <button
                          onClick={handleRefreshRates}
                          disabled={refreshingRates}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-4 h-4 ${refreshingRates ? 'animate-spin' : ''}`} />
                          <span>{refreshingRates ? t('settings.business.updating') : t('settings.business.refreshNow')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {success && (
                  <div className="bg-emerald-500/10 border border-emerald-500/60 text-emerald-200 px-4 py-3 rounded-xl text-sm">
                    {t('settings.saved')}
                  </div>
                )}

                <div className="flex flex-col md:flex-row gap-3">
                  <button
                    onClick={handleSaveBusiness}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 bg-sky-600 text-white py-3 rounded-xl font-semibold hover:bg-sky-700 focus:ring-4 focus:ring-sky-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.01]"
                  >
                    <Save className="w-5 h-5" />
                    <span>{loading ? t('settings.profile.saving') : t('settings.business.saveBusiness')}</span>
                  </button>

                  <button
                    onClick={handleResetBranding}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-3 rounded-xl font-semibold hover:bg-slate-200 transition-all dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span>{t('settings.business.resetBranding')}</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                  <div className={`flex flex-col gap-4 ${!showPasswordModal ? 'sm:flex-row sm:items-center sm:justify-between' : ''}`}>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.security.changePassword')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.security.changePasswordDesc')}</p>
                    </div>
                    {!showPasswordModal ? (
                      <button
                        onClick={() => setShowPasswordModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all"
                      >
                        <Key className="w-4 h-4" />
                        <span>{t('settings.security.change')}</span>
                      </button>
                    ) : (
                      <div className="w-full bg-slate-100 rounded-xl p-4 dark:bg-slate-900 animate-fadeIn">
                        <div className="space-y-3">
                          <input
                            type="password"
                            placeholder="New Password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                          <input
                            type="password"
                            placeholder="Confirm New Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setShowPasswordModal(false);
                                setNewPassword('');
                                setConfirmPassword('');
                              }}
                              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSavePassword}
                              className="px-3 py-1.5 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                            >
                              Save Password
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>


                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="w-full sm:w-auto">
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
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300 transition-all dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{t('settings.security.signOut')}</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="w-full sm:w-auto">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.security.refreshProfile')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.security.refreshProfileDesc')}</p>
                    </div>
                    <button
                      onClick={handleRefreshProfile}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{t('settings.security.refresh')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">{t('settings.data.header')}</h2>

                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="w-full sm:w-auto">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.data.export')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.data.exportDesc')}</p>
                      </div>
                      <button
                        onClick={handleExportData}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all"
                      >
                        <Download className="w-4 h-4" />
                        <span>{t('settings.data.exportBtn')}</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="w-full sm:w-auto">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('settings.data.import')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.data.importDesc')}</p>
                      </div>
                      <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>{t('settings.data.importBtn')}</span>
                        <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Restaurant Settings Tab */}
            {activeTab === 'restaurant' && profile?.business_type === 'restaurant' && (
              <RestaurantSettings />
            )}
          </div>
        </div>


      </div>
    </div>
  );
}
