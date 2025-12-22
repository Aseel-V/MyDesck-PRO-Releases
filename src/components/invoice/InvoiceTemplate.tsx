import { useEffect, useState } from 'react';
import { Trip } from '../../types/trip';
import { BusinessProfile } from '../../lib/supabase';

interface ExtendedProfile extends BusinessProfile {
    email?: string;
    phone_number?: string;
}

export default function InvoiceTemplate() {
    const [trip, setTrip] = useState<Trip | null>(null);
    const [profile, setProfile] = useState<ExtendedProfile | null>(null);
    const [userFullName, setUserFullName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const handleInvoiceData = (data: any) => {
            try {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                setTrip(parsed.trip);
                setProfile(parsed.profile);
                setUserFullName(parsed.userFullName || '');
                setLoading(false);
            } catch (e) {
                console.error('Failed to parse invoice data', e);
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
                 } catch (e) { }
             }
             setLoading(false);
        }

        return () => {
             if (window.electronAPI?.removeInvoiceDataListeners) {
                window.electronAPI.removeInvoiceDataListeners();
             }
        };
    }, []);

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
                             <p>{trip.room_type || 'לא צוין'}</p>
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