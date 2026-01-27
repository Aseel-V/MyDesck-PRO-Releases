import { useEffect, useState } from 'react';
import { Trip, RoomConfiguration } from '../../types/trip';
import { BusinessProfile } from '../../lib/supabase';

interface ExtendedProfile extends BusinessProfile {
    email?: string;
}

// Helper to format RoomConfiguration JSONB object for display
const formatRoomType = (roomType: RoomConfiguration | undefined): string => {
  if (!roomType || typeof roomType !== 'object') return 'לא צוין';
  const parts = Object.entries(roomType)
    .filter(([, count]) => count && count > 0)
    .map(([type, count]) => `${type} x${count}`);
  return parts.length > 0 ? parts.join(', ') : 'לא צוין';
};

interface InvoiceData {
    trip: Trip;
    profile: ExtendedProfile;
    userFullName?: string;
}

interface InvoiceLayoutProps {
    trip: Trip;
    profile: ExtendedProfile;
    userFullName: string;
}

// Exportable layout component for use in PDF preview
export function InvoiceLayout({ trip, profile, userFullName }: InvoiceLayoutProps) {
    const currencySymbol = profile.preferred_currency === 'ILS' ? '₪' :
        profile.preferred_currency === 'EUR' ? '€' : '$';

    return (
        <div className="bg-white text-black p-8" dir="rtl" style={{ minWidth: '600px' }}>
            {/* Header Section - Vertical Stack */}
            <div className="mb-8 pb-6 border-b-2 border-slate-200">
                {/* Top Row: Logo on right, Title in center */}
                <div className="flex items-start justify-between mb-6">
                    {/* Logo - Right Side (first in RTL) */}
                    {profile.logo_url && (
                        <img src={profile.logo_url} alt="Logo" className="h-28 object-contain" />
                    )}
                    {/* Title - Center */}
                    <div className="flex-1 flex justify-center">
                        <h1 className="text-2xl font-extrabold text-slate-900 border-b-4 border-blue-600 pb-1 px-4">
                            קבלה
                        </h1>
                    </div>
                    {/* Empty spacer for balance */}
                    <div className="w-20"></div>
                </div>
                
                {/* Business Info and Document Info */}
                <div className="flex justify-between items-start gap-8">
                    {/* Right: Business Details */}
                    <div className="flex-1">
                        <h2 className="text-lg font-bold text-slate-800 mb-1">{userFullName}</h2>
                        <p className="text-sm text-slate-600">
                            תיירות ונופש עראבה מיקוד 3081200
                        </p>
                        <p className="text-sm text-slate-600">
                            טל. {profile.phone_number}
                        </p>
                        {profile.business_registration_number && (
                            <p className="text-sm text-slate-500 mt-1">
                                ע.מ. {profile.business_registration_number}
                            </p>
                        )}
                    </div>
                    
                    {/* Left: Document Meta */}
                    <div className="text-left">
                        <div className="mb-3">
                            <p className="text-xs text-slate-500">מספר מסמך</p>
                            <p className="text-lg font-mono font-bold text-slate-700">#{trip.id.slice(0, 8).toUpperCase()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">תאריך</p>
                            <p className="text-lg font-bold text-slate-700">{new Date().toLocaleDateString('he-IL')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Client Info Section */}
            <div className="mb-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
                <h3 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                    <span className="w-1 h-5 bg-blue-600 rounded-full"></span>
                    פרטי הלקוח
                </h3>
                
                {/* Info Cards Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Client Name */}
                    <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-xs font-semibold text-blue-600 mb-1">שם הלקוח</p>
                        <p className="font-bold text-lg text-slate-800">{trip.client_name}</p>
                    </div>
                    
                    {/* Destination */}
                    <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-xs font-semibold text-blue-600 mb-1">יעד</p>
                        <p className="font-bold text-lg text-slate-800">{trip.destination}</p>
                    </div>
                    
                    {/* Dates */}
                    <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-xs font-semibold text-blue-600 mb-1">תאריכים</p>
                        <p className="font-bold text-base text-slate-700">
                            {new Date(trip.start_date).toLocaleDateString('he-IL')} - {new Date(trip.end_date).toLocaleDateString('he-IL')}
                        </p>
                    </div>
                    
                    {/* Accommodation Details */}
                    <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-xs font-semibold text-blue-600 mb-1">פרטי אירוח</p>
                        <div className="font-bold text-base text-slate-700 space-y-0.5">
                            <p>{formatRoomType(trip.room_type)}</p>
                            {trip.board_basis && <p className="text-slate-600">{trip.board_basis}</p>}
                            <p className="text-blue-600">{trip.travelers_count} נוסעים</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Financials Section */}
            <div className="mb-6">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between">
                        <span className="font-bold text-base text-slate-700">תיאור</span>
                        <span className="font-bold text-base text-slate-700">סכום</span>
                    </div>
                    
                    {/* Content */}
                    <div className="px-5 py-4">
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                <p className="font-bold text-lg text-slate-800">חבילת נופש - {trip.destination}</p>
                                {trip.notes && (
                                    <p className="text-slate-500 mt-2 text-sm leading-relaxed">{trip.notes}</p>
                                )}
                            </div>
                            <span className="font-bold text-lg text-slate-800 mr-4">
                                {currencySymbol}{trip.sale_price.toLocaleString()}
                            </span>
                        </div>
                    </div>
                    
                    {/* Total */}
                    <div className="bg-blue-600 px-5 py-4 flex justify-between items-center">
                        <span className="font-bold text-white text-lg">סה"כ לתשלום</span>
                        <span className="font-extrabold text-2xl text-white">
                            {currencySymbol}{trip.sale_price.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>

            {/* Thank You Message */}
            <div className="text-center py-4 mb-4">
                <p className="text-lg font-bold text-slate-700">תודה רבה על בחירתכם בנו! ❤️</p>
                <p className="text-sm text-slate-500 mt-1">מאחלים לכם חופשה מהנה ונעימה</p>
            </div>

            {/* Signature Section - Box on left, image centered within */}
            <div className="pt-8">
                <div className="text-center w-56 mr-auto">
                    <div className="h-20 mb-2 flex items-end justify-center">
                        {profile.signature_url && (
                            <img 
                                src={profile.signature_url} 
                                alt="Signature" 
                                className="h-16 object-contain" 
                                style={{ mixBlendMode: 'multiply' }}
                            />
                        )}
                    </div> 
                    <div className="border-t-2 border-slate-300 pt-2">
                        <p className="font-bold text-slate-700 text-sm">חתימה דיגיטלית / חותמת</p>
                    </div>
                </div>
            </div>

            {/* Footer - Elegant Design */}
            <div className="mt-8 pt-5 border-t-2 border-slate-100">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200"></div>
                    <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-slate-50 rounded-full border border-slate-200">
                        <p className="text-sm font-bold text-blue-600">MyDesck PRO</p>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200"></div>
                </div>
                <p className="text-center text-xs text-slate-400">Advanced Travel Agency Management System</p>
                <p className="text-center text-xs text-slate-300 mt-1">Developed with ❤️ by Aseel Shaheen</p>
            </div>
        </div>
    );
}

export default function InvoiceTemplate() {
    const [trip, setTrip] = useState<Trip | null>(null);
    const [profile, setProfile] = useState<ExtendedProfile | null>(null);
    const [userFullName, setUserFullName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const handleInvoiceData = (data: unknown) => {
            try {
                const parsed = (typeof data === 'string' ? JSON.parse(data) : data) as InvoiceData;
                setTrip(parsed.trip);
                setProfile(parsed.profile);
                setUserFullName(parsed.userFullName || '');
                setLoading(false);
                setLoading(false);
            } catch {
                console.error('Failed to parse invoice data');
                setLoading(false);
            }
        };

        if (window.electronAPI?.onInvoiceData) {
             window.electronAPI.onInvoiceData(handleInvoiceData);
        } else {
             // Fallback for dev/browser testing
             const params = new URLSearchParams(window.location.search);
             const dataStr = params.get('data');
             if (dataStr) {
                 try {
                     const decoded = JSON.parse(decodeURIComponent(dataStr));
                     setTrip(decoded.trip);
                     setProfile(decoded.profile);
                     setUserFullName(decoded.userFullName || '');
                     setUserFullName(decoded.userFullName || '');
                 } catch { 
                    // Ignore parse errors
                 }
             }
             setLoading(false);
        }

        return () => {
             if (window.electronAPI?.removeInvoiceDataListeners) {
                window.electronAPI.removeInvoiceDataListeners();
             }
        };
    }, []);

    useEffect(() => {
        if (!loading && trip && profile) {
            // Signal to Electron that we are ready to print
            // We use a small timeout to ensure the DOM has fully painted the new state
            setTimeout(() => {
                window.electronAPI?.invoiceReady?.();
            }, 500);
        }
    }, [loading, trip, profile]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );
    
    if (!trip || !profile) return <div>Error Loading Invoice</div>;

    const currencySymbol = profile.preferred_currency === 'ILS' ? '₪' :
        profile.preferred_currency === 'EUR' ? '€' : '$';

    return (
        <div className="min-h-screen bg-white text-black p-12 rtl" dir="rtl">
            
            {/* Header Section */}
            <div className="flex justify-between items-start mb-12 border-b-2 border-slate-100 pb-8">
                
                {/* Right Side (Start): Logo & User Details */}
                <div className="flex flex-col items-start w-1/3">
                    {profile.logo_url && (
                        <img src={profile.logo_url} alt="Logo" className="h-40 mb-4 object-contain" />
                    )}
                    {/* User Name */}
                    <h2 className="text-xl font-bold text-slate-800">{userFullName}</h2>
                    {/* Specific Address/Phone Text */}
                    <p className="text-sm text-slate-600 mt-1 font-medium">
                        תיירות ונופש עראבה מיקוד 3081200 טל. {profile.phone_number}
                    </p>
                    {profile.business_registration_number && (
                        <p className="text-sm text-slate-500 mt-0.5">
                            ע.מ. {profile.business_registration_number}
                        </p>
                    )}
                </div>

                {/* Center: Title */}
                <div className="flex items-center justify-center w-1/3 pt-8">
                    <h1 className="text-3xl font-extrabold text-slate-900 border-b-4 border-blue-600 pb-2">
                        קבלה
                    </h1>
                </div>

                {/* Left Side (End): Meta Data */}
                <div className="flex flex-col items-end w-1/3 pt-2">
                    <div className="flex flex-col items-end">
                         <p className="text-sm text-slate-500 mb-1">מספר מסמך</p>
                         <p className="text-xl font-mono font-bold text-slate-700">#{trip.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <div className="mt-4 flex flex-col items-end">
                         <p className="text-sm text-slate-500 mb-1">תאריך</p>
                         <p className="font-medium text-slate-700">{new Date().toLocaleDateString('he-IL')}</p>
                    </div>
                </div>
            </div>

            {/* Client Info Grid */}
            <div className="mb-12 bg-slate-50 p-8 rounded-2xl border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
                    פרטי הלקוח
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">שם הלקוח</p>
                        <p className="font-bold text-lg text-slate-800">{trip.client_name}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">יעד</p>
                        <p className="font-semibold text-lg text-slate-800">{trip.destination}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">תאריכים</p>
                        <p className="font-medium text-slate-700 text-sm">
                            מתאריך {new Date(trip.start_date).toLocaleDateString('he-IL')} <br/>
                            עד תאריך {new Date(trip.end_date).toLocaleDateString('he-IL')}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">הרכב חדרים ואירוח</p>
                        <div className="font-medium text-slate-700">
                             <p>{formatRoomType(trip.room_type)}</p>
                             {trip.board_basis && (
                                <p className="text-sm text-slate-500 mt-1 font-semibold">{trip.board_basis}</p>
                             )}
                             <span className="text-slate-400 text-xs block mt-1">
                                ({trip.travelers_count} נוסעים)
                             </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Financials Table */}
            <div className="mb-12">
                <table className="w-full">
                    <thead>
                        <tr className="border-b-2 border-slate-100">
                            <th className="py-4 text-right font-bold text-slate-400 text-sm uppercase tracking-wider w-3/4">
                                תיאור
                            </th>
                            <th className="py-4 text-left font-bold text-slate-400 text-sm uppercase tracking-wider w-1/4 pl-4">
                                סכום
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-slate-50">
                            <td className="py-6 pr-4 align-top">
                                <p className="font-bold text-lg text-slate-800 mb-2">
                                    חבילת נופש - {trip.destination}
                                </p>
                                {/* Description / Notes Area */}
                                {trip.notes && (
                                    <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed mt-2 p-2">
                                        {trip.notes}
                                    </p>
                                )}
                            </td>
                            <td className="py-6 pl-4 text-left align-top">
                                <span className="font-bold text-xl text-slate-800">
                                    {currencySymbol}{trip.sale_price.toLocaleString()}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr>
                            <td className="pt-6 pr-4 text-right font-bold text-lg text-slate-800">
                                סה"כ לתשלום
                            </td>
                            <td className="pt-6 pl-4 text-left font-extrabold text-2xl text-blue-600">
                                {currencySymbol}{trip.sale_price.toLocaleString()}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Signature Section */}
            <div className="mt-auto pt-16 pb-8 flex justify-end">
                <div className="text-center w-64 relative">
                    <div className="h-16 mb-2 flex items-end justify-center">
                        {profile.signature_url && (
                            <img 
                                src={profile.signature_url} 
                                alt="Signature" 
                                className="h-20 object-contain -mb-4 opacity-90" 
                                style={{ mixBlendMode: 'multiply' }}
                            />
                        )}
                    </div> 
                    <div className="border-t-2 border-slate-300 pt-2">
                        <p className="font-bold text-slate-700">חתימה</p>
                    </div>
                </div>
            </div>

            {/* Footer - Absolute Bottom Right */}
            <div className="absolute bottom-8 right-12 text-right text-slate-400 text-xs">
                <p className="font-semibold">Generated by MyDesck PRO App</p>
                <p>Advanced Travel Agency Management System</p>
                <p className="mt-1 text-slate-300">Build by Aseel Shaheen</p>
            </div>
        </div>
    );
}