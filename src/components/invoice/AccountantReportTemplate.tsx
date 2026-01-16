import { DailyReport } from '../../types/restaurant';
import { BusinessProfile } from '../../lib/supabase';

interface AccountantReportTemplateProps {
  reports: DailyReport[];
  profile: BusinessProfile;
  userFullName?: string;
  periodLabel: string; // e.g., "01/2026"
}

export default function AccountantReportTemplate({ reports, profile, userFullName, periodLabel }: AccountantReportTemplateProps) {
  const currencySymbol = profile.preferred_currency === 'ILS' ? '₪' :
    profile.preferred_currency === 'EUR' ? '€' : '$';

  // Calculate totals
  const totalSales = reports.reduce((acc, r) => acc + (Number(r.total_sales_cash) + Number(r.total_sales_card)), 0);
  const totalTax = reports.reduce((acc, r) => acc + Number(r.total_tax), 0);
  const totalExpenses = reports.reduce((acc, r) => acc + Number(r.total_expenses), 0);
  const netIncome = reports.reduce((acc, r) => acc + Number(r.net_profit), 0);

  return (
    <div className="min-h-screen bg-white text-black p-12 rtl" dir="rtl">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8 border-b-2 border-slate-800 pb-4">
         <div>
            <h1 className="text-2xl font-bold">דוח תקופתי לרואה חשבון</h1>
            <p className="text-lg text-slate-600 font-semibold">{periodLabel}</p>
         </div>
         <div className="text-left">
            <h2 className="text-xl font-bold">{userFullName}</h2>
            <p className="text-sm">ע.מ: {profile.business_registration_number}</p>
         </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-50 p-4 border rounded">
            <p className="text-sm text-slate-500">סה"כ מכירות</p>
            <p className="text-xl font-bold">{currencySymbol}{totalSales.toLocaleString()}</p>
        </div>
        <div className="bg-slate-50 p-4 border rounded">
            <p className="text-sm text-slate-500">מע"מ שנגבה</p>
            <p className="text-xl font-bold">{currencySymbol}{totalTax.toLocaleString()}</p>
        </div>
        <div className="bg-slate-50 p-4 border rounded">
            <p className="text-sm text-slate-500">הוצאות ושכר</p>
            <p className="text-xl font-bold">{currencySymbol}{totalExpenses.toLocaleString()}</p>
        </div>
        <div className="bg-slate-50 p-4 border rounded">
            <p className="text-sm text-slate-500">רווח נקי</p>
            <p className="text-xl font-bold text-green-700">{currencySymbol}{netIncome.toLocaleString()}</p>
        </div>
      </div>

      {/* Main Table */}
      <table className="w-full border-collapse text-sm">
        <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">דוח Z #</th>
                <th className="p-2 text-left">מזומן</th>
                <th className="p-2 text-left">אשראי</th>
                <th className="p-2 text-left">סה"כ מכירות</th>
                <th className="p-2 text-left">מע"מ</th>
                <th className="p-2 text-left">הוצאות</th>
                <th className="p-2 text-left font-bold">רווח</th>
            </tr>
        </thead>
        <tbody>
            {reports.map((report) => (
                <tr key={report.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2">{new Date(report.date).toLocaleDateString('he-IL')}</td>
                    <td className="p-2">{report.z_report_number}</td>
                    <td className="p-2 text-left">{Number(report.total_sales_cash).toFixed(2)}</td>
                    <td className="p-2 text-left">{Number(report.total_sales_card).toFixed(2)}</td>
                    <td className="p-2 text-left font-semibold">{(Number(report.total_sales_cash) + Number(report.total_sales_card)).toFixed(2)}</td>
                    <td className="p-2 text-left">{Number(report.total_tax).toFixed(2)}</td>
                    <td className="p-2 text-left">{Number(report.total_expenses).toFixed(2)}</td>
                    <td className="p-2 text-left font-bold text-green-700">{Number(report.net_profit).toFixed(2)}</td>
                </tr>
            ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className="mt-auto pt-8 text-center text-xs text-slate-400">
        <p>הופק על ידי מערכת MyDesck PRO</p>
      </div>

    </div>
  );
}
