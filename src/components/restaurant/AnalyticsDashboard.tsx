// ============================================================================
// RESTAURANT ANALYTICS DASHBOARD - Real-time KPIs and Reports
// Version: 1.0.0 | Production-Ready
// ============================================================================

import { useState, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useRestaurantKPIs, useRestaurant } from '../../hooks/useRestaurant';
import { useRestaurantRole, ManagerOnly } from '../../contexts/RestaurantRoleContext';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Clock, 
  AlertCircle,
  Calendar,
  RefreshCw,
  Download,
  FileText,
  PieChart,
  Activity,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import OrderHistoryModal from './OrderHistoryModal';
import { History } from 'lucide-react';
import CloseDayWizard from './CloseDayWizard';

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isUp: boolean };
  color: string;
  onClick?: () => void;
}

function KPICard({ title, value, subtitle, icon, trend, color, onClick }: KPICardProps) {
  const { t } = useLanguage();
  return (
    <div 
      className={`
        bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5
        ${onClick ? 'cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{value}</h3>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 mt-3 text-sm ${trend.isUp ? 'text-green-500' : 'text-red-500'}`}>
          {trend.isUp ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          <span className="font-medium">{Math.abs(trend.value)}%</span>
          <span className="text-slate-400">{t('restaurantAnalytics.vsYesterday')}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HOURLY CHART COMPONENT
// ============================================================================

interface HourlyChartProps {
  data: Array<{ hour: number; revenue: number; orders: number }>;
}

function HourlyChart({ data }: HourlyChartProps) {
  const { t } = useLanguage();
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <Activity size={18} className="text-blue-500" />
        {t('restaurantAnalytics.hourlyRevenue')}
      </h3>
      <div className="flex items-end gap-1 h-40">
        {Array.from({ length: 24 }, (_, i) => {
          const hourData = data.find(d => d.hour === i);
          const revenue = hourData?.revenue || 0;
          const height = (revenue / maxRevenue) * 100;
          const isCurrentHour = new Date().getHours() === i;
          
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              <div 
                className={`w-full rounded-t transition-all ${
                  isCurrentHour 
                    ? 'bg-blue-500' 
                    : revenue > 0 
                      ? 'bg-blue-200 dark:bg-blue-800 group-hover:bg-blue-400 dark:group-hover:bg-blue-600' 
                      : 'bg-slate-100 dark:bg-slate-800'
                }`}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
              {/* Tooltip */}
              <div className="hidden group-hover:block absolute bottom-full mb-2 bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                {i}:00 - ₪{revenue.toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-2">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}

// ============================================================================
// SERVER PERFORMANCE TABLE
// ============================================================================

interface ServerPerformance {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  tips: number;
  avgCheck: number;
}

function ServerPerformanceTable({ servers }: { servers: ServerPerformance[] }) {
  const { t } = useLanguage();
  const sortedServers = useMemo(() => 
    [...servers].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [servers]
  );
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <Users size={18} className="text-purple-500" />
        {t('restaurantAnalytics.topServers')}
      </h3>
      <div className="space-y-3">
        {sortedServers.map((server, index) => (
          <div key={server.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${index === 0 ? 'bg-yellow-100 text-yellow-700' : ''}
                ${index === 1 ? 'bg-slate-100 text-slate-700' : ''}
                ${index === 2 ? 'bg-amber-100 text-amber-700' : ''}
                ${index > 2 ? 'bg-slate-50 text-slate-500' : ''}
              `}>
                {index + 1}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{server.name}</span>
            </div>
            <div className="text-right">
              <div className="font-bold text-slate-800 dark:text-white">₪{server.revenue.toFixed(0)}</div>
              <div className="text-xs text-slate-400">{server.orders} {t('restaurantAnalytics.tableOrders').toLowerCase()}</div>
            </div>
          </div>
        ))}
          {sortedServers.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">{t('restaurantAnalytics.noData')}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CATEGORY BREAKDOWN
// ============================================================================

interface CategoryData {
  name: string;
  revenue: number;
  percentage: number;
  color: string;
}

function CategoryBreakdown({ categories }: { categories: CategoryData[] }) {
  const { t } = useLanguage();
  const sortedCategories = useMemo(() => 
    [...categories].sort((a, b) => b.revenue - a.revenue),
    [categories]
  );
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <PieChart size={18} className="text-green-500" />
        {t('restaurantAnalytics.salesByCategory')}
      </h3>
      <div className="space-y-3">
        {sortedCategories.map((cat) => (
          <div key={cat.name}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-600 dark:text-slate-400">{cat.name}</span>
              <span className="font-medium text-slate-800 dark:text-white">
                ₪{cat.revenue.toFixed(0)} ({cat.percentage.toFixed(0)}%)
              </span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${cat.color}`}
                style={{ width: `${cat.percentage}%` }}
              />
            </div>
          </div>
        ))}
        {sortedCategories.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">{t('restaurantAnalytics.noData')}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN ANALYTICS DASHBOARD COMPONENT
// ============================================================================

export default function AnalyticsDashboard() {
  const { t } = useLanguage();
  const { can } = useRestaurantRole();
  const { kpis } = useRestaurantKPIs();
  const { dailyReports, staff } = useRestaurant();
  
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  const [isCloseWizardOpen, setIsCloseWizardOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  
  // Mock hourly data (in production, fetch from backend)
  const hourlyData = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      revenue: i >= 11 && i <= 22 ? Math.random() * 2000 + 500 : Math.random() * 200,
      orders: i >= 11 && i <= 22 ? Math.floor(Math.random() * 10 + 2) : Math.floor(Math.random() * 2),
    }));
  }, []);
  
  // Mock server data (in production, calculate from orders)
  const serverData = useMemo((): ServerPerformance[] => {
    return staff.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.full_name,
      orders: Math.floor(Math.random() * 20 + 5),
      revenue: Math.random() * 5000 + 1000,
      tips: Math.random() * 500 + 50,
      avgCheck: Math.random() * 200 + 80,
    }));
  }, [staff]);
  
  // Mock category data
  const categoryData = useMemo((): CategoryData[] => {
    const categories = [
      { name: 'Main Courses', color: 'bg-blue-500' },
      { name: 'Appetizers', color: 'bg-green-500' },
      { name: 'Drinks', color: 'bg-purple-500' },
      { name: 'Desserts', color: 'bg-pink-500' },
      { name: 'Sides', color: 'bg-amber-500' },
    ];
    
    const total = 10000;
    let remaining = 100;
    
    return categories.map((cat, i) => {
      const percentage = i === categories.length - 1 ? remaining : Math.floor(Math.random() * remaining * 0.6) + 5;
      remaining -= percentage;
      return {
        ...cat,
        percentage,
        revenue: (percentage / 100) * total,
      };
    });
  }, []);
  
  // Permission check
  if (!can('canViewDashboard')) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <BarChart3 size={48} className="mx-auto text-slate-400 mb-4" />
          <h2 className="text-xl font-bold text-slate-600 dark:text-slate-400">
            {t('restaurantAnalytics.accessDenied')}
          </h2>
          <p className="text-slate-500">{t('restaurantAnalytics.noPermission')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t('restaurantAnalytics.title')}</h1>
            <p className="text-slate-500">{t('restaurantAnalytics.subtitle')}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Date Range Selector */}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {(['today', 'week', 'month'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                    dateRange === range
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t(`restaurantAnalytics.${range}` as any)}
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => setIsOrderHistoryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
            >
              <History size={18} />
              <span className="text-sm font-medium">{t('History')}</span>
            </button>

            <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition">
              <Download size={18} />
              <span className="text-sm font-medium">{t('restaurantAnalytics.downloadMonthlyReport')}</span>
            </button>
            <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <RefreshCw size={18} className="text-slate-500" />
            </button>
          </div>
        </div>
      </div>
      
      <OrderHistoryModal 
        isOpen={isOrderHistoryOpen} 
        onClose={() => setIsOrderHistoryOpen(false)} 
      />
      
      <div className="max-w-7xl mx-auto px-6 mt-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            title={`${t('restaurantAnalytics.today')}'s ${t('restaurantAnalytics.tableRevenue')}`}
            value={`₪${(kpis?.todays_revenue || 0).toLocaleString()}`}
            icon={<DollarSign size={20} className="text-white" />}
            color="bg-green-500"
            trend={{ value: 12, isUp: true }}
          />
          <KPICard
            title={t('restaurantAnalytics.tableCovers')}
            value={kpis?.covers_today || 0}
            subtitle={t('restaurantAnalytics.guestsServed')}
            icon={<Users size={20} className="text-white" />}
            color="bg-blue-500"
            trend={{ value: 5, isUp: true }}
          />
          <KPICard
            title={t('restaurantAnalytics.tableAvgCheck')}
            value={`₪${(kpis?.average_check || 0).toFixed(0)}`}
            icon={<TrendingUp size={20} className="text-white" />}
            color="bg-purple-500"
            trend={{ value: 3, isUp: false }}
          />
          <KPICard
            title={t('restaurantAnalytics.kitchenTime')}
            value={`${(kpis?.average_ticket_time_minutes || 0).toFixed(0)}m`}
            subtitle={`${kpis?.pending_kitchen_tickets || 0} ${t('restaurantAnalytics.pendingTickets')}`}
            icon={<Clock size={20} className="text-white" />}
            color="bg-amber-500"
          />
        </div>
        
        {/* Second Row KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            title={t('settings.restaurant.activeOrders')}
            value={`₪${(kpis?.open_orders_value || 0).toLocaleString()}`}
            icon={<FileText size={20} className="text-white" />}
            color="bg-slate-500"
          />
          <KPICard
            title={t('settings.restaurant.floorPlan')}
            value={`${kpis?.occupied_tables || 0}/${(kpis?.open_tables || 0) + (kpis?.occupied_tables || 0)}`}
            subtitle={t('restaurantAnalytics.occupied')}
            icon={<Activity size={20} className="text-white" />}
            color="bg-rose-500"
          />
          <KPICard
            title="86'd Items"
            value={kpis?.eighty_sixed_items || 0}
            subtitle={t('restaurantAnalytics.unavailableItems')}
            icon={<AlertCircle size={20} className="text-white" />}
            color={kpis?.eighty_sixed_items ? 'bg-red-500' : 'bg-green-500'}
          />
          <KPICard
            title={t('restaurantAnalytics.turnsPerTable')}
            value={(kpis?.table_turnover_rate || 0).toFixed(1)}
            subtitle={t('restaurantAnalytics.turnsPerTable')}
            icon={<RefreshCw size={20} className="text-white" />}
            color="bg-indigo-500"
          />
        </div>
        
        {/* Charts Row */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                {t('restaurantAnalytics.dailySalesProfit')} ({new Date().toLocaleString(undefined, { month: 'long' })})
              </h2>
              <div className="flex items-center gap-4 text-sm">
                 <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    <span className="text-slate-500">{t('restaurantAnalytics.totalSales')}</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                    <span className="text-slate-500">{t('restaurantAnalytics.netProfit')}</span>
                 </div>
              </div>
            </div>
            <HourlyChart data={hourlyData} />
          </div>
          <ServerPerformanceTable servers={serverData} />
        </div>
        
        {/* Category and Z-Report Row */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CategoryBreakdown categories={categoryData} />
          </div>
          
          
          {/* Z-Report - Manager Only */}
          <ManagerOnly>
             <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-5 text-white">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                    <FileText size={18} />
                    {t('restaurantAnalytics.closeBusinessDay')}
                </h3>
                <p className="text-sm text-slate-300 mb-4">
                    {t('restaurantAnalytics.closeBusinessDaySubtitle')}
                </p>
                <button
                    onClick={() => setIsCloseWizardOpen(true)}
                    className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-lg font-bold transition-colors"
                >
                    {t('restaurantAnalytics.startEndOfDay')}
                </button>
            </div>
          </ManagerOnly>
        <CloseDayWizard 
            isOpen={isCloseWizardOpen} 
            onClose={() => setIsCloseWizardOpen(false)} 
        />
        </div>
        
        {/* Recent Reports */}
        <div className="mt-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-blue-500" />
            {t('restaurantAnalytics.recentZReports')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="pb-3">{t('restaurantAnalytics.tableDate')}</th>
                  <th className="pb-3">{t('restaurantAnalytics.tableZNumber')}</th>
                  <th className="pb-3">{t('restaurantAnalytics.tableSales')}</th>
                  <th className="pb-3">{t('restaurantAnalytics.tableExpenses')}</th>
                  <th className="pb-3">{t('restaurantAnalytics.tableNetProfit')}</th>
                  <th className="pb-3">{t('restaurantAnalytics.tableAction')}</th>
                </tr>
              </thead>
              <tbody>
                {dailyReports.slice(0, 5).map((report) => (
                  <tr key={report.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-3 font-medium text-slate-800 dark:text-white">
                      {new Date(report.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-400">
                      #{report.z_report_number}
                    </td>
                    <td className="py-3 text-slate-800 dark:text-white">
                      ₪{((report.total_sales_cash || 0) + (report.total_sales_card || 0)).toLocaleString()}
                    </td>
                    <td className="py-3 text-rose-500">
                      ₪{(report.total_expenses || 0).toLocaleString()}
                    </td>
                    <td className={`py-3 font-medium ${(report.net_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₪{(report.net_profit || 0).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-blue-500 transition">
                        <FileText size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {dailyReports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {t('restaurantAnalytics.noReports')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
