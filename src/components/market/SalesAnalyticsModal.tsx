import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Receipt, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface SalesAnalyticsModalProps {
  onClose: () => void;
}

interface Transaction {
  id: string;
  receipt_number: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[];
}

type ViewMode = 'daily' | 'monthly' | 'yearly';



export default function SalesAnalyticsModal({ onClose }: SalesAnalyticsModalProps) {
  const { user } = useAuth();
  const { t, direction, language, formatCurrency } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Filters
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const fetchSales = useCallback(async () => {
    try {
      setLoading(true);
      
      const startDate = new Date(selectedDate);
      const endDate = new Date(selectedDate);

      // Determine date range based on ViewMode
      if (viewMode === 'daily') {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (viewMode === 'monthly') {
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0); // Last day of previous month
        endDate.setHours(23, 59, 59, 999);
      } else if (viewMode === 'yearly') {
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        
        endDate.setFullYear(endDate.getFullYear() + 1);
        endDate.setMonth(0, 0); 
        endDate.setHours(23, 59, 59, 999);
      }

      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('market_transactions' as any)
        .select('*')
        .eq('business_id', user!.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTransactions((data as any[]) || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate, viewMode]);

  useEffect(() => {
    if (user) {
      fetchSales();
    }
  }, [user, fetchSales]);



  // Aggregation for Charts
  const chartData = useMemo(() => {
    if (viewMode === 'daily') {
      // Group by Hour (00:00 - 23:00)
      const hours = Array.from({ length: 24 }, (_, i) => ({
        name: i.toString().padStart(2, '0') + ':00',
        total: 0,
        hour: i
      }));
      
      transactions.forEach(t => {
        const hour = new Date(t.created_at).getHours();
        if (hours[hour]) {
          hours[hour].total += t.total_amount;
        }
      });
      return hours;
    } else if (viewMode === 'monthly') {
      // Group by Day (1 - 31)
      const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
      const days = Array.from({ length: daysInMonth }, (_, i) => ({
        name: (i + 1).toString(),
        total: 0,
        day: i + 1
      }));

      transactions.forEach(t => {
        const day = new Date(t.created_at).getDate();
        if (days[day - 1]) {
          days[day - 1].total += t.total_amount;
        }
      });
      return days;
    } else {
      // Group by Month (Jan - Dec)
      const locale = language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-IL';
      const months = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(2000, i, 1);
        return {
          name: date.toLocaleDateString(locale, { month: 'short' }),
          total: 0,
          month: i
        };
      });

      transactions.forEach(t => {
        const month = new Date(t.created_at).getMonth();
        if (months[month]) {
          months[month].total += t.total_amount;
        }
      });
      return months;
    }
  }, [transactions, viewMode, selectedDate, language]);



  const totalRevenue = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const totalCash = transactions.filter(t => t.payment_method === 'cash').reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const totalCard = transactions.filter(t => t.payment_method === 'card').reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const totalDigital = transactions.filter(t => t.payment_method === 'digital').reduce((sum, t) => sum + (t.total_amount || 0), 0);

  // Date controls
  const handlePrevDate = () => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'daily') newDate.setDate(selectedDate.getDate() - 1);
    else if (viewMode === 'monthly') newDate.setMonth(selectedDate.getMonth() - 1);
    else newDate.setFullYear(selectedDate.getFullYear() - 1);
    setSelectedDate(newDate);
  };

  const handleNextDate = () => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'daily') newDate.setDate(selectedDate.getDate() + 1);
    else if (viewMode === 'monthly') newDate.setMonth(selectedDate.getMonth() + 1);
    else newDate.setFullYear(selectedDate.getFullYear() + 1);
    setSelectedDate(newDate);
  };

  const formatDateLabel = () => {
    const locale = language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-IL';
    let label = '';
    
    if (viewMode === 'daily') label = selectedDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    else if (viewMode === 'monthly') label = selectedDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    else label = selectedDate.getFullYear().toString();

    return label;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn" dir={direction}>
        
        {/* Header */}
        <div className="bg-slate-900 p-6 text-white shrink-0">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <BarChart3 className="w-8 h-8 text-green-400" />
                {t('market.sales.title')}
              </h2>
              <p className="text-slate-400 text-sm mt-1">{t('market.sales.subtitle')}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Controls */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-800/50 p-2 rounded-xl">
            {/* View Mode Switcher */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button 
                onClick={() => setViewMode('daily')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'daily' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                {t('market.sales.daily')}
              </button>
              <button 
                onClick={() => setViewMode('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'monthly' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                {t('market.sales.monthly')}
              </button>
              <button 
                onClick={() => setViewMode('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'yearly' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                {t('market.sales.yearly')}
              </button>
            </div>

            {/* Date Navigator */}
            <div className="flex items-center gap-4 bg-slate-800 px-4 py-2 rounded-lg">
              <button onClick={handlePrevDate} className="p-1 hover:text-green-400 transition-colors"><ChevronUp className="w-6 h-6 rotate-90" /></button>
              <span className="font-bold min-w-[200px] text-center">{formatDateLabel()}</span>
              <button onClick={handleNextDate} className="p-1 hover:text-green-400 transition-colors"><ChevronDown className="w-6 h-6 rotate-90" /></button>
            </div>
          </div>
        </div>

        {/* Content - Two Columns */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Left: Charts & Stats */}
          <div className="flex-[2] flex flex-col border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 overflow-y-auto">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 text-xs mb-1">{t('market.sales.revenue')}</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(totalRevenue)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 text-xs mb-1">{t('market.sales.cash')}</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(totalCash)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 text-xs mb-1">{t('market.sales.credit')}</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(totalCard)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 text-xs mb-1">{t('market.sales.digital')}</p>
                <p className="text-xl font-bold text-purple-600">{formatCurrency(totalDigital)}</p>
              </div>
            </div>

            {/* Chart */}
            <div className="flex-1 p-4 min-h-[300px]">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 h-full flex flex-col">
                <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  {t(`market.sales.graph.${viewMode}`)}
                </h3>
                  <div style={{ width: '100%', height: 300, minHeight: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(value)} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                            backgroundColor: '#1e293b', // slate-800
                            color: '#f8fafc' // slate-50
                          }}
                          itemStyle={{ color: '#f8fafc' }}
                          labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => [formatCurrency(Number(value || 0)), t('market.sales.revenue')]}
                        />
                        <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.total > 0 ? '#10b981' : '#e2e8f0'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
              </div>
            </div>
          </div>

          {/* Right: Transaction List */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-700 dark:text-white flex items-center justify-between">
                <span>{t('market.sales.transactions')}</span>
                <span className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-full text-slate-600 dark:text-slate-300">{transactions.length} {t('market.sales.count')}</span>
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="text-center py-12 text-slate-500 animate-pulse">{t('market.sales.loading')}</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>{t('market.sales.noData')}</p>
                </div>
              ) : (
                transactions.map((t) => (
                  <div key={t.id} className="group bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl hover:border-green-200 dark:hover:border-green-900 transition-all shadow-sm hover:shadow-md">
                    <div 
                      className="p-3 flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center
                          ${t.payment_method === 'cash' ? 'bg-green-100 text-green-600' : 
                            t.payment_method === 'card' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {t.payment_method === 'cash' ? '₪' : t.payment_method === 'card' ? '💳' : '📱'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">#{t.receipt_number.split('-').pop()}</p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(t.created_at).toLocaleTimeString(language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-IL', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      

                      
                      <div className="text-left">
                        <p className="font-bold text-slate-900 dark:text-white">{formatCurrency(t.total_amount)}</p>
                        {expandedId === t.id ? <ChevronUp className="w-4 h-4 text-slate-300 mx-auto" /> : <ChevronDown className="w-4 h-4 text-slate-300 mx-auto" />}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedId === t.id && (
                      <div className="bg-slate-50 dark:bg-slate-900/30 p-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                        <div className="space-y-1">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {t.items && Array.isArray(t.items) && t.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-400">
                              <span>{item.name || item.product?.nameHe} × {item.quantity || 1}</span>
                              <span>{formatCurrency((item.price || item.product?.price || 0) * (item.quantity || 1))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
