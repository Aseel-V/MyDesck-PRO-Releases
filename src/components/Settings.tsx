import { useState, useEffect, ChangeEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  Save,
  AlertTriangle,
  User,
  Building2,
  Moon,
  Sun,
  Key,
  Download,
  Upload,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resizeImage } from '../lib/imageUtils';
import { CurrencyService } from '../lib/currency';

type NoticeType = 'success' | 'error' | 'info';

export default function Settings() {
  const { profile, userProfile, updateProfile, user, refreshProfile, signOut } = useAuth();
  const { t, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const [businessName, setBusinessName] = useState(profile?.business_name || '');
  const [businessRegNumber, setBusinessRegNumber] = useState(profile?.business_registration_number || '');
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
  const [showCurrencyWarning, setShowCurrencyWarning] = useState(false);
  const [pendingCurrency, setPendingCurrency] = useState<'USD' | 'EUR' | 'ILS'>('USD');
  const [activeTab, setActiveTab] = useState<'profile' | 'business' | 'security' | 'data' | 'payments'>('profile');
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<null | { type: NoticeType; message: string }>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshingRates, setRefreshingRates] = useState(false);

  // Simple toast helper
  const showNotice = (type: NoticeType, message: string, timeout = 3500) => {
    setNotice({ type, message });
    if (timeout > 0) {
      window.clearTimeout((showNotice as any)._t);
      (showNotice as any)._t = window.setTimeout(() => setNotice(null), timeout);
    }
  };

  // Sync dark mode + load profile details
  // useEffect removed - relying on AuthContext


  // Sync when profile changes
  useEffect(() => {
    if (!profile) return;
    setBusinessName(profile.business_name || '');
    setBusinessRegNumber(profile.business_registration_number || '');
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
    if (newCurrency !== currency) {
      setPendingCurrency(newCurrency);
      setShowCurrencyWarning(true);
    }
  };

  const confirmCurrencyChange = () => {
    setCurrency(pendingCurrency);
    setShowCurrencyWarning(false);
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

      if (selectError && (selectError as any).code !== 'PGRST116') throw selectError;

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

  const handleChangePassword = async () => {
    const newPassword = prompt('Enter new password:');
    if (newPassword && newPassword.length >= 6) {
      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        showNotice('success', 'Password changed successfully');
      } catch (error) {
        console.error('Error changing password:', error);
        showNotice('error', 'Failed to change password');
      }
    } else if (newPassword) {
      showNotice('error', 'Password must be at least 6 characters');
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
            const { id, user_id, created_at, updated_at, ...tripData } = trip;
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
    } catch (error: any) {
      console.error('Logo upload failed:', error);
      showNotice(
        'error',
        error?.message ||
          "Upload failed. Ensure bucket 'logos' exists + SQL policies are applied (Storage.objects)."
      );
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
    } catch (error: any) {
      console.error('Signature upload failed:', error);
      showNotice(
        'error',
        error?.message ||
          "Upload failed. Ensure bucket 'logos' exists + SQL policies are applied (Storage.objects)."
      );
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
        <div className="glass-panel bg-slate-950/80 border border-slate-800/80 rounded-2xl shadow-xl shadow-slate-950/70 p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-sky-400/80 mb-1.5">Settings & Preferences</p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-50 mb-1">Workspace settings</h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Manage your profile, branding, security and data tools from one organized place.
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2 text-xs">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="text-slate-300">{businessName || profile?.business_name || 'MyDesck PRO'}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2">
              <span className="text-slate-500">Signed in as</span>
              <span className="text-sky-300 font-medium text-[11px] truncate max-w-[180px]">{email}</span>
            </div>
          </div>
        </div>

        {/* Main settings panel with tabs */}
        <div className="glass-panel bg-slate-950/70 border border-slate-800/80 rounded-2xl shadow-xl shadow-slate-950/60 overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-2 border-b border-slate-800/60 overflow-x-auto">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'profile'
                  ? 'bg-sky-500/15 text-sky-200 border border-sky-500/60 shadow-sm shadow-sky-900/60'
                  : 'text-slate-300 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Profile</span>
            </button>

            <button
              onClick={() => setActiveTab('business')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'business'
                  ? 'bg-sky-500/15 text-sky-200 border border-sky-500/60 shadow-sm shadow-sky-900/60'
                  : 'text-slate-300 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Business</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-sky-500/15 text-sky-200 border border-sky-500/60 shadow-sm shadow-sky-900/60'
                  : 'text-slate-300 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>Security</span>
            </button>

            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'data'
                  ? 'bg-sky-500/15 text-sky-200 border border-sky-500/60 shadow-sm shadow-sky-900/60'
                  : 'text-slate-300 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Data</span>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 md:p-8 text-slate-100">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">User Profile</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">Full Name *</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">Email</label>
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-slate-500 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">Phone Number *</label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+1 234 567 8900"
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {success && (
                  <div className="bg-emerald-500/10 border border-emerald-500/60 text-emerald-200 px-4 py-3 rounded-xl text-sm">
                    Profile saved successfully
                  </div>
                )}

                <button
                  onClick={handleSaveProfile}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white py-3 rounded-xl font-semibold hover:bg-sky-700 focus:ring-4 focus:ring-sky-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.01]"
                >
                  <Save className="w-5 h-5" />
                  <span>{loading ? 'Saving...' : 'Save Profile'}</span>
                </button>
              </div>
            )}

            {activeTab === 'business' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">Business Settings</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">{t('settings.businessName')}</label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Business Registration Number / Tax ID (ח.פ / ע.מ)
                    </label>
                    <input
                      type="text"
                      value={businessRegNumber}
                      onChange={(e) => setBusinessRegNumber(e.target.value)}
                      placeholder="e.g. 512345678"
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Signature Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Digital Signature / Stamp (חתימה / חותמת)
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label
                          htmlFor="signature-upload"
                          className="w-full flex flex-col items-center justify-center px-4 py-6 rounded-xl border-2 border-dashed bg-slate-900/80 border-slate-700 text-slate-400 hover:border-sky-500 hover:text-sky-300 cursor-pointer transition-all"
                        >
                          <Upload className="w-8 h-8 mb-2 opacity-50" />
                          <span className="text-sm font-semibold">Upload Signature Image</span>
                          <span className="text-xs text-slate-500 mt-1">PNG (Transparent recommended)</span>
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
                          <img src={signatureUrl} alt="Signature preview" className="h-12 object-contain" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Logo upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">{t('settings.logoUrl')}</label>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label
                          htmlFor="logo-upload"
                          className={`w-full flex flex-col items-center justify-center px-4 py-6 rounded-xl border-2 border-dashed transition-all ${
                            uploading
                              ? 'bg-slate-900/60 border-slate-800 text-slate-500 cursor-not-allowed'
                              : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:border-sky-500 hover:text-sky-300 cursor-pointer'
                          }`}
                        >
                          <Upload className={`w-8 h-8 mb-2 ${uploading ? 'animate-pulse' : ''}`} />
                          <span className="text-sm font-semibold">{uploading ? 'Uploading...' : 'Click to upload or drag & drop'}</span>
                          <span className="text-xs text-slate-500 mt-1">SVG, PNG, JPG (max 2MB)</span>
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
                          alt="Logo preview"
                          className="h-12 w-12 object-contain rounded-lg border border-slate-800 bg-slate-900/60"
                        />
                      )}
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Or paste image URL (fallback)</label>
                      <input
                        type="text"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder={t('auth.logoPlaceholder')}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:ring-1 focus:ring-sky-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">{t('settings.currency')}</label>
                    <select
                      value={currency}
                      onChange={(e) => handleCurrencyChange(e.target.value as 'USD' | 'EUR' | 'ILS')}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    >
                      <option value="USD">{t('currencies.USD')}</option>
                      <option value="EUR">{t('currencies.EUR')}</option>
                      <option value="ILS">{t('currencies.ILS')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">{t('settings.language')}</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguageState(e.target.value as 'en' | 'ar' | 'he')}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    >
                      <option value="en">{t('languages.en')}</option>
                      <option value="ar">{t('languages.ar')}</option>
                      <option value="he">{t('languages.he')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">Dark Mode</label>
                    <button
                      onClick={toggleTheme}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 hover:bg-slate-800/80 transition-all w-full"
                    >
                      {theme === 'dark' ? <Moon className="w-5 h-5 text-sky-400" /> : <Sun className="w-5 h-5 text-amber-400" />}
                      <span className="font-medium">{theme === 'dark' ? 'Dark Mode On' : 'Light Mode On'}</span>
                    </button>
                  </div>

                  {/* Exchange Rates Management */}
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">Exchange Rates</label>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-100 text-sm mb-1">Live Currency Conversion</h3>
                          <p className="text-xs text-slate-400">
                            Last updated:{' '}
                            {lastUpdated ? (
                              <span className="text-slate-300">{lastUpdated.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-500">Never</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">Auto-refreshes every 12 hours</p>
                        </div>
                        <button
                          onClick={handleRefreshRates}
                          disabled={refreshingRates}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-4 h-4 ${refreshingRates ? 'animate-spin' : ''}`} />
                          <span>{refreshingRates ? 'Updating...' : 'Refresh Now'}</span>
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
                    <span>{loading ? 'Saving...' : 'Save Business Settings'}</span>
                  </button>

                  <button
                    onClick={handleResetBranding}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-slate-100 py-3 rounded-xl font-semibold hover:bg-slate-700 transition-all"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span>Reset Branding</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-2">Security</h2>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-100">Change Password</h3>
                      <p className="text-sm text-slate-400">Update your account password</p>
                    </div>
                    <button
                      onClick={handleChangePassword}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all"
                    >
                      <Key className="w-4 h-4" />
                      <span>Change</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-100">Sign Out</h3>
                      <p className="text-sm text-slate-400">Sign out and return to the login screen</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await signOut();
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-600 transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-100">Refresh Profile</h3>
                      <p className="text-sm text-slate-400">Force refresh user profile to get latest role updates</p>
                    </div>
                    <button
                      onClick={handleRefreshProfile}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">Data Management</h2>

                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-slate-100">Export Data</h3>
                        <p className="text-sm text-slate-400">Download all your trips as JSON</p>
                      </div>
                      <button
                        onClick={handleExportData}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all"
                      >
                        <Download className="w-4 h-4" />
                        <span>Export</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-slate-100">Import Data</h3>
                        <p className="text-sm text-slate-400">Restore from a backup file</p>
                      </div>
                      <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>Import</span>
                        <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Currency warning modal */}
        {showCurrencyWarning && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="glass-panel bg-slate-950/90 border border-amber-500/40 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleIn">
              <div className="flex items-center gap-3 text-amber-300">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-xl font-bold">{t('settings.currencyWarning')}</h3>
              </div>

              <p className="text-sm text-slate-200">{t('settings.currencyWarningMessage')}</p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCurrencyWarning(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800/80 transition-all text-sm font-medium"
                >
                  {t('settings.cancel')}
                </button>
                <button
                  onClick={confirmCurrencyChange}
                  className="flex-1 px-4 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-all text-sm font-semibold"
                >
                  {t('settings.understand')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
