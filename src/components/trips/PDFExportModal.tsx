import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatDate } from '../../lib/utils';
import { X, Download, FileText } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Trip } from '../../types/trip';
import {
  generateSingleTripPDF,
  generateMultipleTripsPDF,
} from '../../lib/pdfGenerator';

export interface PDFExportModalProps {
  trips: Trip[];
  onClose: () => void;
  onExportComplete?: () => void;
}

const isPhoneValid = (v: string) => {
  const s = v.trim();
  if (!s) return false;
  // Basic phone validation: digits with optional +, spaces, dashes, parentheses
  return /^\+?[0-9\s\-()]{6,}$/.test(s);
};

export default function PDFExportModal({ trips, onClose, onExportComplete }: PDFExportModalProps) {
  const { language, t, direction } = useLanguage();
  const { profile, user, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Initialize state directly from context to avoid "pop-in" delay
  const [userFullName, setUserFullName] = useState(userProfile?.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(userProfile?.phone_number || '');

  const [exportType, setExportType] = useState<'single' | 'multiple'>('single');
  const [selectedTripId, setSelectedTripId] = useState(trips[0]?.id || '');
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  // Sync if context updates later (e.g. initial load finished)
  useEffect(() => {
    if (userProfile?.full_name && !userFullName) setUserFullName(userProfile.full_name);
    if (userProfile?.phone_number && !phoneNumber) setPhoneNumber(userProfile.phone_number);
  }, [userProfile, userFullName, phoneNumber]);

  const validate = useCallback(() => {
    const newErrors: { fullName?: string; phone?: string } = {};
    if (!userFullName.trim()) newErrors.fullName = t('trips.exportModal.requiredFullName');
    if (!phoneNumber.trim()) newErrors.phone = t('trips.exportModal.requiredPhone');
    else if (!isPhoneValid(phoneNumber)) newErrors.phone = t('trips.exportModal.invalidPhone');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [userFullName, phoneNumber, t]);

  const canExport = useMemo(() => {
    return !!userFullName.trim() && isPhoneValid(phoneNumber) && !loading;
  }, [userFullName, phoneNumber, loading]);

  const generatePreview = useCallback(async () => {
    if (!profile || !user || !validate()) return;
    setGeneratingPreview(true);
    try {
      let pdfBytes: Uint8Array;
      if (exportType === 'single') {
        const trip = trips.find((t: Trip) => t.id === selectedTripId);
        if (!trip) return;
        pdfBytes = await generateSingleTripPDF({
          profile,
          trips: [trip],
          userFullName,
          phoneNumber,
          language,
        });
      } else {
        pdfBytes = await generateMultipleTripsPDF({
          profile,
          trips,
          userFullName,
          phoneNumber,
          language,
        });
      }
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (error) {
      console.error('Preview generation error:', error);
    } finally {
      setGeneratingPreview(false);
    }
  }, [profile, user, validate, exportType, trips, selectedTripId, userFullName, phoneNumber, language]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (canExport) {
        generatePreview();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [canExport, generatePreview]);

  const handleExport = async () => {
    if (!profile || !user) return;
    setBannerError(null);
    if (!validate()) return;

    setLoading(true);

    try {
      let pdfBytes: Uint8Array;
      let filename: string;

      if (exportType === 'single') {
        const trip = trips.find((t: Trip) => t.id === selectedTripId);
        if (!trip) throw new Error('Trip not found');

        pdfBytes = await generateSingleTripPDF({
          profile,
          trips: [trip],
          userFullName,
          phoneNumber,
          language,
        });

        filename = `trip_${trip.destination
          .replace(/\s+/g, '_')
          .toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
      } else {
        pdfBytes = await generateMultipleTripsPDF({
          profile,
          trips,
          userFullName,
          phoneNumber,
          language,
        });

        filename = `trips_summary_${new Date()
          .toISOString()
          .split('T')[0]}.pdf`;
      }

      const blob = new Blob([pdfBytes as unknown as BlobPart], {
        type: 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      onExportComplete?.();
      onClose();
    } catch (error) {
      console.error('PDF generation error:', error);
      setBannerError(t('trips.exportModal.pdfError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      {/* Glow background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-sky-500/15 blur-3xl rounded-full" />
        <div className="absolute -bottom-40 -left-32 w-80 h-80 bg-fuchsia-500/10 blur-3xl rounded-full" />
      </div>

      <div className="relative w-full max-w-5xl animate-scaleIn">
        <div className="glass-panel bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden" dir={direction}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-sky-400" />
              <h2 className="text-xl font-bold text-slate-50">{t('trips.exportModal.title')}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800/80 text-slate-300 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col lg:flex-row">
            {/* Form Section */}
            <div className="flex-1 px-6 py-6 space-y-6">
              {bannerError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 px-4 py-3">
                  {bannerError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('trips.exportModal.fullName')} *
                </label>
                <input
                  type="text"
                  value={userFullName}
                  onChange={(e) => {
                    setUserFullName(e.target.value);
                    if (errors.fullName) validate();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canExport) {
                      e.preventDefault();
                      handleExport();
                    }
                  }}
                  autoFocus
                  className={`w-full px-4 py-3 rounded-lg bg-slate-900/70 border text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60 ${errors.fullName ? 'border-rose-500/60' : 'border-slate-800'
                    }`}
                  placeholder={t('trips.exportModal.fullName')}
                  required
                />
                {errors.fullName && (
                  <p className="mt-1 text-xs text-rose-400">{errors.fullName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('trips.exportModal.phoneNumber')} *
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    if (errors.phone) validate();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canExport) {
                      e.preventDefault();
                      handleExport();
                    }
                  }}
                  className={`w-full px-4 py-3 rounded-lg bg-slate-900/70 border text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60 ${errors.phone ? 'border-rose-500/60' : 'border-slate-800'
                    }`}
                  placeholder={t('trips.exportModal.phoneNumber')}
                  required
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-rose-400">{errors.phone}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  {t('trips.exportModal.exportType')} *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setExportType('single')}
                    className={`p-4 rounded-xl border transition-all text-left ${exportType === 'single'
                      ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_0_1px_rgba(14,165,233,0.3)]'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900/60'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className={`w-5 h-5 ${exportType === 'single' ? 'text-sky-400' : 'text-slate-400'}`} />
                      <span className="font-medium text-slate-100">{t('trips.exportModal.singleTrip')}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportType('multiple')}
                    className={`p-4 rounded-xl border transition-all text-left ${exportType === 'multiple'
                      ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_0_1px_rgba(14,165,233,0.3)]'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900/60'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className={`w-5 h-5 ${exportType === 'multiple' ? 'text-sky-400' : 'text-slate-400'}`} />
                      <span className="font-medium text-slate-100">{t('trips.exportModal.multipleTrips')}</span>
                    </div>
                  </button>
                </div>
              </div>

              {exportType === 'single' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {t('trips.exportModal.selectTrip')} *
                  </label>
                  <select
                    value={selectedTripId}
                    onChange={(e) => setSelectedTripId(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-slate-900/70 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                  >
                    {trips.map((trip: Trip) => (
                      <option key={trip.id} value={trip.id} className="bg-slate-900 text-slate-100">
                        {trip.destination} - {trip.client_name} ({formatDate(trip.start_date)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {exportType === 'multiple' && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
                  <p className="text-sm font-medium text-slate-300 mb-2">
                    {t('trips.exportModal.tripsToExport')}:
                  </p>
                  <ul className="space-y-1">
                    {trips.map((trip: Trip) => (
                      <li
                        key={trip.id}
                        className="text-sm text-slate-400 flex items-center gap-2"
                      >
                        <div className="w-2 h-2 bg-sky-500 rounded-full"></div>
                        <span>
                          {trip.destination} - {trip.client_name} ({formatDate(trip.start_date)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-800/50"
                >
                  {t('trips.exportModal.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!canExport}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg bg-sky-600 text-white hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Download className="w-5 h-5" />
                  <span>
                    {loading
                      ? t('trips.exportModal.exporting')
                      : t('trips.exportModal.export')}
                  </span>
                </button>
              </div>
            </div>

            {/* Preview Section */}
            <div className="hidden lg:block w-[45%] border-l border-slate-800/80 bg-slate-950/50 p-6">
              <div className="h-full flex flex-col">
                <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
                  {t('trips.exportModal.livePreview')}
                </h3>
                <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden relative">
                  {generatingPreview ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : previewUrl ? (
                    <iframe
                      src={previewUrl}
                      className="w-full h-full"
                      title="PDF Preview"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                      <FileText className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm">
                        {t('trips.exportModal.previewInstructions')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}