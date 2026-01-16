import { useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { FileText, Calendar, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useRestaurant } from '../../hooks/useRestaurant';
import { useAuth } from '../../contexts/AuthContext';

export default function RestaurantAnalytics() {
    const { t } = useLanguage();
    const { profile } = useAuth();
    const { dailyReports } = useRestaurant();
    
    // In real implementation, this would come from `restaurant_daily_reports` table via hook
    // const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    // const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const selectedYear = new Date().getFullYear();
    const selectedMonth = new Date().getMonth();

    const chartData = useMemo(() => {
        // Reverse needed if data comes desc, charts usually explicitly want asc or we assume sorted by date
        return [...dailyReports].reverse().map(r => {
            const date = new Date(r.date);
            return {
                day: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
                sales: r.total_sales_cash + r.total_sales_card, // Total Sales
                profit: r.net_profit
            };
        });
    }, [dailyReports]);

    const handleDownloadReport = async () => {
        if (!profile) return;
        toast.info(t('Generating Accountant Report...'));
        try {
            const payload = {
                type: 'report',
                periodLabel: `${selectedMonth + 1}/${selectedYear}`,
                reports: dailyReports,
                profile: profile,
                userFullName: profile.business_name || 'Restaurant' // Fallback
            };
             await window.electronAPI?.printToPDF(payload);
            
            console.log('Report generation requested for:', `${selectedMonth + 1}/${selectedYear}`);
            toast.success('Report Sent to Printer/PDF');
        } catch (e) {
            console.error(e);
            toast.error('Failed to generate report');
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                     <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-sky-800 to-slate-700 dark:from-slate-50 dark:via-sky-100 dark:to-slate-200">
                        {t('restaurantAnalytics.title')}
                     </h2>
                     <p className="text-slate-500 dark:text-slate-400">{t('restaurantAnalytics.subtitle')}</p>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={handleDownloadReport}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-700 transition"
                    >
                        <FileText size={18} />
                        {t('restaurantAnalytics.downloadMonthlyReport')}
                    </button>
                </div>
            </div>

            {/* Mock Chart */}
            <div className="glass-panel p-6 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm h-[400px]">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Calendar size={18} className="text-sky-500" />
                    {t('restaurantAnalytics.dailySalesProfit')} ({new Date().toLocaleString(undefined, { month: 'long' })})
                </h3>
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis 
                            dataKey="day" 
                            stroke="#94a3b8" 
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis 
                            stroke="#94a3b8" 
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `₪${value}`}
                        />
                        <Tooltip 
                            cursor={{ fill: '#f1f5f9' }}
                            contentStyle={{ 
                                backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                                borderRadius: '8px', 
                                border: 'none', 
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' 
                            }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        <Bar 
                            dataKey="sales" 
                            fill="#3b82f6" 
                            name={t('restaurantAnalytics.totalSales')} 
                            radius={[4, 4, 0, 0]} 
                            barSize={30}
                        />
                        <Bar 
                            dataKey="profit" 
                            fill="#10b981" 
                            name={t('restaurantAnalytics.netProfit')} 
                            radius={[4, 4, 0, 0]} 
                            barSize={30}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Recent Reports List */}
            <div className="glass-panel p-6 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-lg font-bold mb-4">{t('restaurantAnalytics.recentZReports')}</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse rtl:text-right">
                        <thead>
                            <tr className="text-slate-500 text-sm border-b border-slate-200 dark:border-slate-800">
                                <th className="py-3 px-4">{t('restaurantAnalytics.tableDate')}</th>
                                <th className="py-3 px-4">{t('restaurantAnalytics.tableZNumber')}</th>
                                <th className="py-3 px-4 text-right rtl:text-left">{t('restaurantAnalytics.tableSales')}</th>
                                <th className="py-3 px-4 text-right rtl:text-left">{t('restaurantAnalytics.tableExpenses')}</th>
                                <th className="py-3 px-4 text-right rtl:text-left">{t('restaurantAnalytics.tableNetProfit')}</th>
                                <th className="py-3 px-4 text-center">{t('restaurantAnalytics.tableAction')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyReports.map((r, i) => (
                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900 transition border-b border-slate-100 dark:border-slate-800 last:border-0">
                                    <td className="py-3 px-4">{new Date(r.date).toLocaleDateString()}</td>
                                    <td className="py-3 px-4 font-mono text-slate-500">#{r.z_report_number}</td>
                                    <td className="py-3 px-4 text-right rtl:text-left font-medium">₪{(r.total_sales_cash + r.total_sales_card).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right rtl:text-left text-rose-500">-₪{r.total_expenses.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right rtl:text-left font-bold text-emerald-600">₪{r.net_profit.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center">
                                        <button className="p-2 text-slate-400 hover:text-sky-500"><Download size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                            {dailyReports.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center text-slate-400">
                                        {t('restaurantAnalytics.noReports')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
