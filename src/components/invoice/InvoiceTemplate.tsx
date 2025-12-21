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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Listen for data from Electron via IPC
        // We need to define the interface for window.ipcRenderer if it's not globally available, 
        // but typically it's exposed via preload.
        // Assuming window.electron or window.ipcRenderer is available.
        // Based on electron.js preload, we likely have contextIsolation.
        // Let's check if there is a global declaration or just try to use it safely.
        
        const handleInvoiceData = (data: any) => {
            try {
                // If data is passed directly (object) or stringified
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                setTrip(parsed.trip);
                setProfile(parsed.profile);
                setLoading(false);
            } catch (e) {
                console.error('Failed to parse invoice data from IPC', e);
                setLoading(false);
            }
        };

        if (window.electronAPI?.onInvoiceData) {
             window.electronAPI.onInvoiceData(handleInvoiceData);
        } else {
             // Fallback for dev/browser testing if needed, or maybe the preload exposes it differently?
             // Checking URL just in case for dev mode fallback
             const params = new URLSearchParams(window.location.search);
             const dataStr = params.get('data');
             if (dataStr) {
                 try {
                     const decoded = JSON.parse(decodeURIComponent(dataStr));
                     setTrip(decoded.trip);
                     setProfile(decoded.profile);
                 } catch (e) { console.error(e); }
             }
             setLoading(false);
        }

        return () => {
             if (window.electronAPI?.removeInvoiceDataListeners) {
                window.electronAPI.removeInvoiceDataListeners();
             }
        };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white text-slate-800">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-4 w-32 bg-slate-200 rounded mb-4"></div>
                    <div className="text-sm">Preparing Invoice...</div>
                </div>
            </div>
        );
    }

    if (!trip || !profile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white text-red-600">
                <div className="text-center">
                    <h2 className="text-xl font-bold mb-2">Error Loading Invoice</h2>
                    <p className="text-sm text-slate-600">Could not retrieve invoice data.</p>
                </div>
            </div>
        );
    }

    const isRtl = true; // For Arabic/Hebrew, we can detect or pass this preference

    const currencySymbol = profile.preferred_currency === 'ILS' ? '₪' :
        profile.preferred_currency === 'EUR' ? '€' : '$';

    return (
        <div className={`min-h-screen bg-white text-black p-8 ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-blue-600 pb-6 mb-8">
                <div>
                    <h1 className="text-4xl font-bold text-blue-800 mb-2">
                        {isRtl ? 'חשבונית / קבלה' : 'INVOICE'}
                    </h1>
                    <p className="text-gray-600">
                        #{trip.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="text-gray-600">
                        {new Date().toLocaleDateString()}
                    </p>
                </div>

                <div className="text-right">
                    {profile.logo_url && (
                        <img src={profile.logo_url} alt="Logo" className="h-20 mb-2 object-contain ml-auto" />
                    )}
                    <h2 className="text-xl font-bold">{profile.business_name}</h2>
                    <p>{profile.phone_number}</p>
                    <p>{profile.email}</p>
                </div>
            </div>

            {/* Client Info */}
            <div className="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">
                    {isRtl ? 'פרטי הלקוח' : 'Client Details'}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-gray-500">{isRtl ? 'שם הלקוח' : 'Client Name'}</p>
                        <p className="font-semibold text-lg">{trip.client_name}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">{isRtl ? 'יעד' : 'Destination'}</p>
                        <p className="font-semibold text-lg">{trip.destination}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">{isRtl ? 'תאריכים' : 'Dates'}</p>
                        <p className="font-semibold">
                            {new Date(trip.start_date).toLocaleDateString()} - {new Date(trip.end_date).toLocaleDateString()}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">{isRtl ? 'נוסעים' : 'Travelers'}</p>
                        <p className="font-semibold">{trip.travelers_count}</p>
                    </div>
                </div>
            </div>

            {/* Financials */}
            <div className="mb-8">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-blue-600 text-white">
                            <th className="p-3 text-start">{isRtl ? 'תיאור' : 'Description'}</th>
                            <th className="p-3 text-end">{isRtl ? 'סכום' : 'Amount'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b">
                            <td className="p-3">
                                {isRtl ? 'חבילת נופש - ' : 'Vacation Package - '} {trip.destination}
                            </td>
                            <td className="p-3 text-end font-bold">
                                {currencySymbol}{trip.sale_price.toFixed(2)}
                            </td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr className="bg-gray-100">
                            <td className="p-3 font-bold">{isRtl ? 'סה"כ לתשלום' : 'Total'}</td>
                            <td className="p-3 text-end font-bold text-xl">
                                {currencySymbol}{trip.sale_price.toFixed(2)}
                            </td>
                        </tr>
                        <tr>
                            <td className="p-3 font-bold text-green-700">{isRtl ? 'שולם' : 'Paid'}</td>
                            <td className="p-3 text-end font-bold text-green-700">
                                {currencySymbol}{trip.amount_paid.toFixed(2)}
                            </td>
                        </tr>
                        <tr>
                            <td className="p-3 font-bold text-red-700">{isRtl ? 'יתרה לתשלום' : 'Balance Due'}</td>
                            <td className="p-3 text-end font-bold text-red-700">
                                {currencySymbol}{(trip.sale_price - trip.amount_paid).toFixed(2)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Notes */}
            {trip.notes && (
                <div className="mb-12">
                    <h3 className="text-lg font-bold text-gray-700 mb-2">{isRtl ? 'הערות' : 'Notes'}</h3>
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-gray-700 whitespace-pre-wrap">
                        {trip.notes}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="text-center text-gray-500 text-sm mt-auto pt-8 border-t">
                <p>{isRtl ? 'תודה שבחרתם בנו!' : 'Thank you for your business!'}</p>
                <p className="mt-1">Generated by MyDesck PRO</p>
            </div>
        </div>
    );
}
