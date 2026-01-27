import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { ChevronDown, ChevronUp, BarChart3, Receipt, Eye, Edit, Trash2, Printer, TrendingUp, TrendingDown, X, Download } from 'lucide-react';

import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { RestaurantOrder } from '../../types/restaurant';
import RestaurantOrderModal from './RestaurantOrderModal';
import EditRestaurantOrderModal from './EditRestaurantOrderModal';
import { ConfirmationModal } from '../ui/ConfirmationModal';


type ViewMode = 'daily' | 'monthly' | 'yearly';

export default function RestaurantAnalytics() {
    const { t, language, formatCurrency, direction } = useLanguage();
    const { user, profile } = useAuth();
    
    // State
    const [viewMode, setViewMode] = useState<ViewMode>('daily');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [orders, setOrders] = useState<RestaurantOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedID, setExpandedID] = useState<string | null>(null);

    // Actions State
    const [viewingOrder, setViewingOrder] = useState<RestaurantOrder | null>(null);
    const [editingOrder, setEditingOrder] = useState<RestaurantOrder | null>(null);
    const [deletingOrder, setDeletingOrder] = useState<RestaurantOrder | null>(null);

    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);

    // Fetch Orders based on ViewMode & Date
    const fetchOrders = async () => {
        try {
            setLoading(true);
            const startDate = new Date(selectedDate);
            const endDate = new Date(selectedDate);

            // Determine date range
            if (viewMode === 'daily') {
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
            } else if (viewMode === 'monthly') {
                startDate.setDate(1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setMonth(endDate.getMonth() + 1);
                endDate.setDate(0); 
                endDate.setHours(23, 59, 59, 999);
            } else if (viewMode === 'yearly') {
                startDate.setMonth(0, 1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setFullYear(endDate.getFullYear() + 1);
                endDate.setMonth(0, 0); 
                endDate.setHours(23, 59, 59, 999);
            }

            const { data, error } = await supabase
                .from('restaurant_orders')
                .select(`
                    *,
                    items:restaurant_order_items(
                        *,
                        menu_item:restaurant_menu_items(*)
                    ),
                    table:restaurant_tables(*),
                    server:restaurant_staff(*)
                `)
                .eq('status', 'closed') // Only closed orders for analytics
                .gte('closed_at', startDate.toISOString())
                .lte('closed_at', endDate.toISOString())
                .order('closed_at', { ascending: false });

            if (error) throw error;
            setOrders(data as unknown as RestaurantOrder[] || []);
        } catch (error) {
            console.error('Error fetching orders:', error);
            toast.error(t('common.errorLoadingData') || 'Error loading data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchOrders();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, selectedDate, viewMode]);

    const handleDelete = async () => {
        if (!deletingOrder) return;
        try {
            // Usually we don't hard delete orders in analytics, maybe soft delete or change status?
            // But user asked for "delete". Let's assume hard delete or status=cancelled
            // "market" example did hard delete. 
            // Better practice: set status to 'cancelled'. But let's check what market did... market deleted from DB.
            // Let's hard delete to match user request "like in supermarket".

            // Warning: Referential integrity might block deletion if other tables reference this order.
            // Assuming cascade delete is ON or we perform manual cleanup.
            // It's safer to delete items first then order.

            const { error: itemsError } = await supabase
                .from('restaurant_order_items')
                .delete()
                .eq('order_id', deletingOrder.id);
            
            if (itemsError) throw itemsError;

            const { error } = await supabase
                .from('restaurant_orders')
                .delete()
                .eq('id', deletingOrder.id);
            
            if (error) throw error;

            toast.success(t('restaurantAnalytics.deleteSuccess') || 'Order deleted');
            setOrders(prev => prev.filter(o => o.id !== deletingOrder.id));
            setDeletingOrder(null);
        } catch (error: unknown) {
            console.error('Error deleting order:', error);
            toast.error(t('restaurantAnalytics.deleteError') || 'Error deleting order');
        }
    };


    // Derived Data for Charts & Stats
    const chartData = useMemo(() => {
        if (viewMode === 'daily') {
            // Group by Hour (00:00 - 23:00)
            const hours = Array.from({ length: 24 }, (_, i) => ({
                name: i.toString().padStart(2, '0') + ':00',
                sales: 0,
                // profit: 0, // Need cost data for profit
                hour: i
            }));
            
            orders.forEach(o => {
                if (!o.closed_at) return;
                const hour = new Date(o.closed_at).getHours();
                if (hours[hour]) {
                    hours[hour].sales += o.total_amount || 0;
                }
            });
            return hours;
        } else if (viewMode === 'monthly') {
            // Group by Day
            const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
            const days = Array.from({ length: daysInMonth }, (_, i) => ({
                name: (i + 1).toString(),
                sales: 0,
                day: i + 1
            }));

            orders.forEach(o => {
                 if (!o.closed_at) return;
                 const day = new Date(o.closed_at).getDate();
                 if (days[day - 1]) {
                     days[day - 1].sales += o.total_amount || 0;
                 }
            });
            return days;
        } else {
            // Yearly - Group by Month
            const locale = language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-IL';
            const months = Array.from({ length: 12 }, (_, i) => {
                const date = new Date(2000, i, 1);
                return {
                    name: date.toLocaleDateString(locale, { month: 'short' }),
                    sales: 0,
                    month: i
                };
            });

            orders.forEach(o => {
                if (!o.closed_at) return;
                const month = new Date(o.closed_at).getMonth();
                if (months[month]) {
                    months[month].sales += o.total_amount || 0;
                }
            });
            return months;
        }
    }, [orders, viewMode, selectedDate, language]);

    const kpis = useMemo(() => {
        const revenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const cost = orders.reduce((sum, o) => {
            const orderCost = o.items?.reduce((isum, item) => {
                const itemCost = item.menu_item?.cost_price || 0;
                return isum + (item.quantity * itemCost);
            }, 0) || 0;
            return sum + orderCost;
        }, 0);
        
        return {
            revenue,
            cost,
            profit: revenue - cost,
            margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
            cash: orders.filter(o => o.payment_method === 'cash').reduce((sum, o) => sum + (o.total_amount || 0), 0),
            card: orders.filter(o => o.payment_method === 'card').reduce((sum, o) => sum + (o.total_amount || 0), 0),
            tips: orders.reduce((sum, o) => sum + (o.tip_amount || 0), 0),
            count: orders.length
        };
    }, [orders]);

    const formatDateLabel = () => {
        if (viewMode === 'daily') return selectedDate.toLocaleDateString(language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        if (viewMode === 'monthly') return selectedDate.toLocaleDateString(language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-SA' : 'en-US', { month: 'long', year: 'numeric' });
        return selectedDate.getFullYear().toString();
    };

    const generateReportPDF = async () => {
        const toastId = toast.loading(t('restaurantAnalytics.generatingReport'));
        
        try {
            // Import html2canvas dynamically
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');

            // Header info
            const title = `${t('restaurantAnalytics.report')} - ${t(`restaurantAnalytics.${viewMode}`)}`;
            const dateStr = formatDateLabel();

            const isRTL = direction === 'rtl';

            // Create container
            const container = document.createElement('div');
            container.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 210mm; background: white; color: black; font-family: sans-serif;';
            if (isRTL) container.style.direction = 'rtl';
            document.body.appendChild(container);

            // Calculate aggregated data for the report HTML
            const reportRows = orders.map(o => {
                const orderDate = new Date(o.closed_at!);
                const timeStr = orderDate.toLocaleTimeString(['he-IL', 'en-US'], { hour: '2-digit', minute: '2-digit' });
                const itemCost = o.items?.reduce((sum, item) => sum + (item.quantity * (item.menu_item?.cost_price || 0)), 0) || 0;
                const profit = (o.total_amount || 0) - itemCost;
                const margin = (o.total_amount || 0) > 0 ? (profit / (o.total_amount || 0)) * 100 : 0;
                
                return `
                    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #1e293b;">
                        <td style="padding: 10px;">${timeStr}</td>
                        <td style="padding: 10px; font-family: monospace;">#${o.id.slice(0, 6)}</td>
                        <td style="padding: 10px;">${t(`paymentMethods.${o.payment_method}`) || o.payment_method}</td>
                        <td style="padding: 10px; font-weight: bold;">${formatCurrency(o.total_amount || 0)}</td>
                        <td style="padding: 10px;">${formatCurrency(itemCost)}</td>
                        <td style="padding: 10px; color: ${profit >= 0 ? '#059669' : '#e11d48'};">${formatCurrency(profit)}</td>
                        <td style="padding: 10px;">${margin.toFixed(1)}%</td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div style="padding: 40px; background: white; font-family: sans-serif;">
                    <!-- Header -->
                    <div style="margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; font-family: sans-serif;">
                        <!-- Top Row: Logo & Title -->
                        <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px;">
                             ${profile?.logo_url ? `<img src="${profile.logo_url}" alt="Logo" style="height: 80px; object-fit: contain;">` : '<div style="width: 80px;"></div>'}
                            <div style="flex: 1; display: flex; justify-content: center;">
                                <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; border-bottom: 4px solid #2563eb; padding-bottom: 4px; padding-left: 16px; padding-right: 16px; margin: 0;">${title}</h1>
                            </div>
                            <div style="width: 80px;"></div> 
                        </div>

                        <!-- Info Row -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; flex-direction: ${isRTL ? 'row' : 'row-reverse'};">
                            <div style="flex: 1; text-align: ${isRTL ? 'right' : 'left'};">
                                <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin: 0 0 4px 0;">${profile?.business_name || 'MyDesck PRO'}</h2>
                                <p style="font-size: 14px; color: #475569; margin: 0;">${profile?.address || 'תיירות ונופש עראבה מיקוד 3081200'}</p>
                                <p style="font-size: 14px; color: #475569; margin: 0;">${t('common.phone', 'Tel')}: ${profile?.phone_number || ''}</p>
                                ${profile?.business_registration_number ? `<p style="font-size: 14px; color: #64748b; margin-top: 4px;">${t('business.regNumber', 'Reg. No')}: ${profile.business_registration_number}</p>` : ''}
                            </div>
                            
                            <div style="text-align: ${isRTL ? 'left' : 'right'};">
                                <div style="margin-bottom: 12px;">
                                    <p style="font-size: 12px; color: #64748b; margin: 0;">${t('restaurantAnalytics.report')}</p>
                                    <p style="font-size: 14px; font-weight: bold; color: #334155; margin: 0;">${t(`restaurantAnalytics.${viewMode}`)}</p>
                                </div>
                                <div>
                                    <p style="font-size: 12px; color: #64748b; margin: 0;">${t('common.date')}</p>
                                    <p style="font-size: 16px; font-weight: bold; color: #334155; margin: 0;">${dateStr}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Summary Cards -->
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px;">
                        <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${t('restaurantAnalytics.totalSales')}</p>
                            <p style="font-size: 20px; font-weight: 800; color: #0f172a;">${formatCurrency(kpis.revenue)}</p>
                        </div>
                        <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${t('common.cost')}</p>
                            <p style="font-size: 20px; font-weight: 800; color: #334155;">${formatCurrency(kpis.cost)}</p>
                        </div>
                        <div style="background: ${kpis.profit >= 0 ? '#ecfdf5' : '#fff1f2'}; padding: 16px; border-radius: 12px; border: 1px solid ${kpis.profit >= 0 ? '#d1fae5' : '#ffe4e6'};">
                            <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${t('restaurantAnalytics.netProfit')}</p>
                            <p style="font-size: 20px; font-weight: 800; color: ${kpis.profit >= 0 ? '#059669' : '#e11d48'};">${formatCurrency(kpis.profit)}</p>
                        </div>
                        <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${t('restaurantAnalytics.margin')}</p>
                            <p style="font-size: 20px; font-weight: 800; color: #0f172a;">${kpis.margin.toFixed(1)}%</p>
                        </div>
                    </div>

                    <!-- Orders Table -->
                    <div style="margin-bottom: 24px;">
                        <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 16px;">${t('restaurantAnalytics.orders')} (${kpis.count})</h3>
                        <table style="width: 100%; border-collapse: collapse; text-align: ${isRTL ? 'right' : 'left'};">
                            <thead>
                                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                                    <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.time')}</th>
                                    <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.id')}</th>
                                    <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.payment')}</th>
                                    <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.total')}</th>
                                    <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.cost')}</th>
                                    <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('restaurantAnalytics.profit')}</th>
                                    <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${reportRows}
                            </tbody>
                        </table>
                    </div>

                     <!-- Signature -->
                     ${profile?.signature_url ? `
                        <div style="padding-top: 32px;">
                          <div style="text-align: center; width: 180px; margin-right: auto; margin-left: ${isRTL ? '0' : 'auto'};">
                            <div style="display: flex; justify-content: center; align-items: flex-end; height: 64px; margin-bottom: 8px;">
                              <img src="${profile.signature_url}" alt="Signature" style="height: 64px; object-fit: contain;">
                            </div>
                            <div style="border-top: 2px solid #cbd5e1; padding-top: 8px;">
                              <p style="font-weight: bold; color: #334155; font-size: 14px;">${t('common.signature')}</p>
                            </div>
                          </div>
                        </div>
                    ` : ''}

                    <!-- Footer -->
                    <div style="margin-top: 32px; padding-top: 20px; border-top: 2px solid #f1f5f9; text-align: center;">
                      <p style="font-size: 14px; font-weight: bold; color: #2563eb; margin-bottom: 4px;">MyDesck PRO</p>
                      <p style="font-size: 12px; color: #94a3b8;">Advanced Travel Agency Management System</p>
                      <p style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">Developed with ❤️ by Aseel Shaheen</p>
                    </div>
                </div>
            `;

            // Render to canvas
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for render
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            document.body.removeChild(container);

            // Create PDF
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = doc.internal.pageSize.getWidth();
            const pdfHeight = doc.internal.pageSize.getHeight();
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;
            
            // If image is taller than a page, we might need multiple pages, 
            // but for this report overview, scaling to fit or single page is a good start.
            // If deeper pagination is needed, we'd slice the image or use autoTable approach (but we want fonts).
            // For now, let's assume it fits or simple header/table flow.
            // If it's very long, we might need to handle page breaks manually, but html2canvas approach usually 
            // implies a "screenshot" of the report. 
            // We'll print across pages if needed or just one long page?
            // jsPDF addImage supports one page.
            // Let's stick to single page overview for now, or split if > height.
            
            let heightLeft = imgHeight;
            let position = 0;

            doc.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                doc.addPage();
                doc.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            const blobUrl = doc.output('bloburl').toString();
            setPreviewPdfUrl(blobUrl);
            setPreviewImgUrl(imgData);
            toast.success(t('restaurantAnalytics.reportSent'), { id: toastId });

        } catch (error) {
            console.error('PDF Generation Error:', error);
            toast.error(t('restaurantAnalytics.reportFailed'), { id: toastId });
        }
    };

    const handleDownloadPDF = () => {
        if (!previewPdfUrl) return;
        const link = document.createElement('a');
        link.href = previewPdfUrl;
        link.download = `report_${viewMode}_${new Date().toISOString().split('T')[0]}.pdf`;
        link.click();
        toast.success(t('common.reportDownloaded') || 'Report downloaded');
    };

    // Date Navigation helpers
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

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 animate-fadeIn" dir={direction}>
            {/* Header Phase - Sticky & Fixed */}
            <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 md:p-6 shrink-0 z-10 transition-colors">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <BarChart3 className="w-8 h-8 text-sky-500" />
                                {t('restaurantAnalytics.title')}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('restaurantAnalytics.subtitle')}</p>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto">
                            {/* View Mode Switcher */}
                            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-full sm:w-auto">
                                {(['daily', 'monthly', 'yearly'] as const).map((mode) => (
                                    <button 
                                        key={mode}
                                        onClick={() => setViewMode(mode)}
                                        className={`flex-1 sm:flex-none capitalize px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === mode ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                    >
                                        {t(`restaurantAnalytics.${mode}`) || mode}
                                    </button>
                                ))}
                            </div>

                            {/* Date Navigator */}
                             <div className="flex items-center justify-between gap-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-4 py-2 rounded-lg w-full sm:w-auto">
                                <button onClick={handlePrevDate} className="p-1 hover:text-sky-500 transition-colors"><ChevronUp className={`w-5 h-5 ${language === 'en' ? '-rotate-90' : 'rotate-90'}`} /></button>
                                <span className="font-bold text-sm min-w-[140px] text-center">{formatDateLabel()}</span>
                                <button onClick={handleNextDate} className="p-1 hover:text-sky-500 transition-colors"><ChevronDown className={`w-5 h-5 ${language === 'en' ? '-rotate-90' : 'rotate-90'}`} /></button>
                            </div>



                            <button 
                                onClick={generateReportPDF}
                                className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-all font-medium shadow-lg shadow-sky-500/20 pdf-hide"
                                title={t('restaurantAnalytics.printReport')}
                            >
                                <Printer size={20} />
                                <span className="hidden sm:inline font-bold text-sm">{t('common.print') || 'Print'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6" id="analytics-dashboard">
                
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">{t('restaurantAnalytics.totalSales')}</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(kpis.revenue)}</p>
                    </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">{t('restaurantAnalytics.cash')}</p>
                        <p className="text-xl font-bold text-emerald-600">{formatCurrency(kpis.cash)}</p>
                    </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">{t('restaurantAnalytics.card')}</p>
                        <p className="text-xl font-bold text-blue-600">{formatCurrency(kpis.card)}</p>
                    </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">{t('restaurantAnalytics.tips')}</p>
                        <p className="text-xl font-bold text-amber-500">{formatCurrency(kpis.tips)}</p>
                    </div>
                </div>

                {/* Profit KPI Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                         <div>
                             <p className="text-slate-500 text-xs font-medium uppercase mb-1">{t('common.cost')}</p>
                            <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{formatCurrency(kpis.cost)}</p>
                         </div>
                         <div className="bg-slate-100 dark:bg-slate-700 p-2 rounded-lg">
                            <TrendingDown className="w-6 h-6 text-slate-500" />
                         </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                         <div>
                            <p className="text-slate-500 text-xs font-medium uppercase mb-1">{t('restaurantAnalytics.netProfit') || 'Net Profit'}</p>
                            <p className={`text-2xl font-bold ${kpis.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(kpis.profit)}</p>
                         </div>
                         <div className={`p-2 rounded-lg ${kpis.profit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-rose-100 dark:bg-rose-900/30'}`}>
                            <TrendingUp className={`w-6 h-6 ${kpis.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
                         </div>
                    </div>
                     <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                         <div>
                            <p className="text-slate-500 text-xs font-medium uppercase mb-1">{t('restaurantAnalytics.margin') || 'Profit Margin'}</p>
                            <p className={`text-2xl font-bold ${kpis.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{kpis.margin.toFixed(1)}%</p>
                         </div>
                          <div className={`p-2 rounded-lg ${kpis.margin >= 20 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                            <BarChart3 className={`w-6 h-6 ${kpis.margin >= 20 ? 'text-emerald-600' : 'text-amber-600'}`} />
                         </div>
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Left: Charts */}
                    <div className="lg:col-span-2 space-y-6 min-w-0">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <h3 className="font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-slate-400" />
                                {t('restaurantAnalytics.dailySalesProfit')}
                            </h3>
                            <div style={{ width: '100%', height: 350, minHeight: 350, minWidth: 200 }}>
                                <ResponsiveContainer width="100%" height="100%" debounce={50} minWidth={100} minHeight={100}>
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                        <XAxis 
                                            dataKey="name" 
                                            fontSize={12} 
                                            tickLine={false} 
                                            axisLine={false} 
                                            tick={{ fill: '#94a3b8' }}
                                            dy={10}
                                        />
                                        <YAxis 
                                            fontSize={12} 
                                            tickLine={false} 
                                            axisLine={false} 
                                            tickFormatter={(value) => formatCurrency(value)} 
                                            tick={{ fill: '#94a3b8' }}
                                        />
                                        <Tooltip 
                                            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', backgroundColor: '#1e293b', color: '#f8fafc' }}
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            formatter={(value: any) => [formatCurrency(Number(value || 0)), t('restaurantAnalytics.totalSales')]}
                                        />
                                        <Bar dataKey="sales" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={32}>
                                                {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.sales > 0 ? '#0ea5e9' : '#e2e8f0'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Right: Order List */}
                    <div className="lg:col-span-1 min-w-0">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-full max-h-[600px]">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <h3 className="font-bold text-slate-800 dark:text-white">
                                    {t('restaurantAnalytics.tableOrders')}
                                </h3>
                                <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 font-medium">
                                    {t('restaurantAnalytics.ordersCount', { count: kpis.count })}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                    {loading ? (
                                    <div className="text-center py-12 text-slate-500 animate-pulse">{t('common.loading')}</div>
                                ) : orders.length === 0 ? (
                                    <div className="text-center py-12 text-slate-500">
                                        <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>{t('restaurantAnalytics.noData')}</p>
                                    </div>
                                ) : (
                                    orders.map((order) => (
                                        <div key={order.id} className="group bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl hover:border-sky-300 dark:hover:border-sky-700 transition-all p-3">
                                            <div 
                                                className="flex items-center justify-between cursor-pointer"
                                                onClick={() => setExpandedID(expandedID === order.id ? null : order.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg
                                                        ${order.payment_method === 'cash' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                                        {order.payment_method === 'cash' ? '💵' : '💳'}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                            {formatCurrency(order.total_amount)}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                                            {new Date(order.closed_at!).toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'})} • #{order.id.slice(0,6)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {expandedID === order.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                            </div>

                                            {/* Expanded Details */}
                                            {expandedID === order.id && (
                                                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs animate-fadeIn">
                                                    <div className="space-y-1.5">
                                                        {order.items?.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-400">
                                                                <span><span className="font-medium text-slate-900 dark:text-slate-200">{item.quantity}x</span> {item.menu_item?.name || 'Item'}</span>
                                                                <span>{formatCurrency(item.price_at_time * item.quantity)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {order.tip_amount && order.tip_amount > 0 && (
                                                        <div className="flex justify-between text-emerald-600 font-medium mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700">
                                                            <span>{t('restaurantAnalytics.tips')}</span>
                                                            <span>{formatCurrency(order.tip_amount)}</span>
                                                        </div>
                                                    )}
                                                    
                                                    {order.server && (
                                                        <div className="mt-2 text-[10px] text-slate-400 text-end">
                                                            {t('restaurantAnalytics.servedBy')} <span className="text-slate-600 dark:text-slate-300">{order.server.full_name || 'Staff'}</span>
                                                        </div>
                                                    )}

                                                    {/* Actions - View, Edit, Delete */}
                                                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                                                         <button 
                                                            onClick={(e) => { e.stopPropagation(); setViewingOrder(order); }}
                                                            className="flex-1 py-1.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg flex items-center justify-center gap-1 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition pdf-hide"
                                                         >
                                                             <Eye className="w-3.5 h-3.5" />
                                                             {t('restaurantAnalytics.viewOrder')}
                                                         </button>
                                                         <button 
                                                            onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                                                            className="flex-1 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center gap-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition pdf-hide"
                                                         >
                                                             <Edit className="w-3.5 h-3.5" />
                                                             {t('restaurantAnalytics.editOrder')}
                                                         </button>
                                                         <button 
                                                            onClick={(e) => { e.stopPropagation(); setDeletingOrder(order); }}
                                                            className="flex-1 py-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition pdf-hide"
                                                         >
                                                             <Trash2 className="w-3.5 h-3.5" />
                                                             {t('restaurantAnalytics.deleteOrder')}
                                                         </button>
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

            {/* Modals */}
            {viewingOrder && (
                <RestaurantOrderModal 
                    order={viewingOrder} 
                    onClose={() => setViewingOrder(null)} 
                />
            )}
            
            {editingOrder && (
                <EditRestaurantOrderModal 
                    order={editingOrder} 
                    onClose={() => setEditingOrder(null)} 
                    onSuccess={fetchOrders}
                />
            )}

            <ConfirmationModal
                isOpen={!!deletingOrder}
                onClose={() => setDeletingOrder(null)}
                onConfirm={handleDelete}
                title={t('Delete Order')}
                description={t('Are you sure you want to delete this order? This action cannot be undone.')}
                confirmText={t('Delete')}
                cancelText={t('Cancel')}
                variant="danger"
            />


            {previewPdfUrl && (
                <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/80 backdrop-blur-md">
                   {/* Glow effect */}
                   <div className="fixed inset-0 pointer-events-none">
                       <div className="absolute -top-32 -right-32 w-72 h-72 bg-sky-500/15 blur-3xl rounded-full" />
                       <div className="absolute -bottom-40 -left-32 w-80 h-80 bg-fuchsia-500/10 blur-3xl rounded-full" />
                   </div>

                    <div className="min-h-full flex items-center justify-center p-4">
                        <div className="relative bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-lg">
                                    <Printer size={20} />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-slate-900 dark:text-white">{t('restaurantAnalytics.previewReport') || 'Preview Report'}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateLabel()}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDownloadPDF}
                                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl transition shadow-lg shadow-sky-500/20"
                                >
                                    <Download size={18} />
                                    <span className="font-bold text-sm hidden sm:inline">{t('common.download') || 'Download'}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setPreviewPdfUrl(null);
                                        setPreviewImgUrl(null);
                                    }}
                                    className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body - Image View */}
                        <div className="bg-slate-100 dark:bg-slate-950/50 p-4 sm:p-8 flex justify-center">
                            <div className="w-full max-w-3xl bg-white shadow-xl rounded-sm overflow-hidden">
                                {previewImgUrl && (
                                    <img 
                                        src={previewImgUrl} 
                                        alt="Report Preview" 
                                        className="w-full h-auto"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}
