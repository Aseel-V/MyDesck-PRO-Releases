import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, BarChart3, Receipt, Trash2, Edit, FileText, Download, Printer, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from 'sonner';
import EditTransactionModal from './EditTransactionModal';
import ReceiptModal from './ReceiptModal';
import { ConfirmationModal } from '../ui/ConfirmationModal';
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

interface TransactionItem {
  id?: string;
  name?: string;
  quantity: number;
  price: number;
  weight?: number;
  product?: {
    nameHe: string;
    price: number;
    type: string;
  };
}

interface Transaction {
  id: string;
  receipt_number: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
  items: TransactionItem[];
  business_id: string;
  change_amount?: number;
  amount_paid?: number;
}

type ViewMode = 'daily' | 'monthly' | 'yearly';



export default function SalesAnalytics() {
  const { user, profile } = useAuth();
  const { t, direction, language, formatCurrency } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [selectedTransactionForReceipt, setSelectedTransactionForReceipt] = useState<Transaction | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);
  
  // Filters
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Calculated Stats
  const totalRevenue = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const totalCash = transactions.filter(t => t.payment_method === 'cash').reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const totalCard = transactions.filter(t => t.payment_method === 'card').reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const totalDigital = transactions.filter(t => t.payment_method === 'digital').reduce((sum, t) => sum + (t.total_amount || 0), 0);

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
      setTransactions(((data as unknown) as Transaction[]) || []);
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

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmationId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationId || !user) return;

    try {
      console.log('Deleting transaction:', deleteConfirmationId);

      // DEBUG: Check transaction ownership
      const { data: checkData } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('market_transactions' as any)
        .select('id, business_id')
        .eq('id', deleteConfirmationId)
        .single();
      
      if (checkData) {
        const tx = checkData as unknown as Transaction;
        if (tx.business_id !== user.id) {
           alert(`Permission Error: This transaction belongs to business ${tx.business_id}, but you are logged in as ${user.id}`);
           return;
        }
      } else {
         console.warn('Transaction not found during check');
      }
      
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('market_transactions' as any)
        .delete()
        .eq('id', deleteConfirmationId);

      if (error) {
        console.error('Supabase delete error:', error);
        throw error;
      }
      
      setTransactions(prev => prev.filter(t => t.id !== deleteConfirmationId));
      setDeleteConfirmationId(null);
      toast.success(t('market.sales.deleteTransactionSuccess'));
    } catch (error: unknown) {
      console.error('Error deleting transaction:', error);
      toast.error(t('market.saveError') + ': ' + ((error as Error)?.message || error));
    }
  };

  const handleEditClick = (transaction: Transaction, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTransaction(transaction);
  };



  const formatDateLabel = () => {
    const locale = language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-IL';
    let label = '';
    
    if (viewMode === 'daily') label = selectedDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    else if (viewMode === 'monthly') label = selectedDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    else label = selectedDate.getFullYear().toString();

    return label;
  };

  const generateReportPDF = async () => {
    const toastId = toast.loading(t('restaurantAnalytics.generatingReport', 'Generating Report...'));
    
    try {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');

        const title = `${t('market.sales.report', 'Sales Report')} - ${t(`market.sales.${viewMode}`)}`;
        const dateStr = formatDateLabel();
        const isRTL = direction === 'rtl';

        const container = document.createElement('div');
        container.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 210mm; background: white; color: black; font-family: sans-serif;';
        if (isRTL) container.style.direction = 'rtl';
        document.body.appendChild(container);

        const reportRows = transactions.map(t => {
            const date = new Date(t.created_at);
            const timeStr = date.toLocaleTimeString(['he-IL', 'en-US'], { hour: '2-digit', minute: '2-digit' });
            return `
                <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #1e293b;">
                    <td style="padding: 10px;">${timeStr}</td>
                    <td style="padding: 10px; font-family: monospace;">#${(t.receipt_number || '').split('-').pop()}</td>
                    <td style="padding: 10px;">${t.payment_method}</td>
                    <td style="padding: 10px; font-weight: bold;">${formatCurrency(t.total_amount)}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div style="padding: 40px; background: white; font-family: sans-serif;">
                <div style="margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0;">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px;">
                            ${profile?.logo_url ? `<img src="${profile.logo_url}" alt="Logo" style="height: 80px; object-fit: contain;">` : '<div style="width: 80px;"></div>'}
                        <div style="flex: 1; display: flex; justify-content: center;">
                            <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; border-bottom: 4px solid #10b981; padding-bottom: 4px; padding-left: 16px; padding-right: 16px; margin: 0;">${title}</h1>
                        </div>
                        <div style="width: 80px;"></div> 
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; flex-direction: ${isRTL ? 'row' : 'row-reverse'};">
                        <div style="flex: 1; text-align: ${isRTL ? 'right' : 'left'};">
                            <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin: 0 0 4px 0;">${profile?.business_name || 'MyDesck PRO'}</h2>
                            <p style="font-size: 14px; color: #475569; margin: 0;">${profile?.address || 'תיירות ונופש עראבה מיקוד 3081200'}</p>
                            <p style="font-size: 14px; color: #475569; margin: 0;">${t('common.phone', 'Tel')}: ${profile?.phone_number || ''}</p>
                            ${profile?.business_registration_number ? `<p style="font-size: 14px; color: #64748b; margin-top: 4px;">${t('business.regNumber', 'Reg. No')}: ${profile.business_registration_number}</p>` : ''}
                        </div>
                        <div style="text-align: ${isRTL ? 'left' : 'right'};">
                            <div>
                                <p style="font-size: 12px; color: #64748b; margin: 0;">${t('common.date', 'Date')}</p>
                                <p style="font-size: 16px; font-weight: bold; color: #334155; margin: 0;">${dateStr}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px;">
                    <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${t('market.sales.revenue')}</p>
                        <p style="font-size: 20px; font-weight: 800; color: #0f172a;">${formatCurrency(totalRevenue)}</p>
                    </div>
                    <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${t('market.sales.cash')}</p>
                        <p style="font-size: 20px; font-weight: 800; color: #059669;">${formatCurrency(totalCash)}</p>
                    </div>
                    <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                         <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${t('market.sales.credit')}</p>
                        <p style="font-size: 20px; font-weight: 800; color: #2563eb;">${formatCurrency(totalCard)}</p>
                    </div>
                     <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                         <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${t('market.sales.digital')}</p>
                        <p style="font-size: 20px; font-weight: 800; color: #7c3aed;">${formatCurrency(totalDigital)}</p>
                    </div>
                </div>

                <div style="margin-bottom: 24px;">
                    <table style="width: 100%; border-collapse: collapse; text-align: ${isRTL ? 'right' : 'left'};">
                        <thead>
                            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.time', 'Time')}</th>
                                <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.id', 'ID')}</th>
                                <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.payment', 'Payment')}</th>
                                <th style="padding: 12px 10px; font-size: 12px; color: #64748b; font-weight: 600;">${t('common.total', 'Total')}</th>
                            </tr>
                        </thead>
                        <tbody>${reportRows}</tbody>
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
                              <p style="font-weight: bold; color: #334155; font-size: 14px;">${t('common.signature', 'Signature')}</p>
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

        await new Promise(resolve => setTimeout(resolve, 500));
        const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        document.body.removeChild(container);

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = doc.internal.pageSize.getHeight();
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
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
        toast.success(t('restaurantAnalytics.reportSent', 'Report Ready'), { id: toastId });

    } catch (error) {
        console.error('PDF Generation Error:', error);
        toast.error(t('restaurantAnalytics.reportFailed', 'Failed to generate report'), { id: toastId });
    }
  };

  const handleDownloadPDF = () => {
    if (!previewPdfUrl) return;
    const link = document.createElement('a');
    link.href = previewPdfUrl;
    link.download = `report_${viewMode}_${new Date().toISOString().split('T')[0]}.pdf`;
    link.click();
    toast.success(t('common.reportDownloaded', 'Downloaded'));
  };

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

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] animate-fadeIn">
      {editingTransaction && (
        <EditTransactionModal 
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSuccess={() => {
            fetchSales(); // Refresh
            setEditingTransaction(null);
          }}
        />
      )}
      
      {selectedTransactionForReceipt && (
        <ReceiptModal
            transaction={{
                ...selectedTransactionForReceipt,
                id: selectedTransactionForReceipt.id,
                total: selectedTransactionForReceipt.total_amount,
                items: selectedTransactionForReceipt.items.map(i => ({
                    id: i.id || 'temp', 
                    product: i.product ? {
                        id: 'temp', 
                        name: i.product.nameHe, 
                        nameHe: i.product.nameHe, 
                        price: i.product.price, 
                        type: i.product.type as "unit" | "weight"
                    } : undefined,
                    name: i.name,
                    quantity: i.quantity,
                    price: i.price,
                    weight: i.weight
                })),
                change: selectedTransactionForReceipt.change_amount || 0,
                amountPaid: selectedTransactionForReceipt.amount_paid
            }}
            profile={{ business_name: null }} // or fetch relevant profile info if needed
            onClose={() => setSelectedTransactionForReceipt(null)}
            onSave={async (print) => {
                if (print) {
                    window.print();
                }
                setSelectedTransactionForReceipt(null);
            }}
            viewOnly={true}
        />
      )}

      <ConfirmationModal
        isOpen={!!deleteConfirmationId}
        onClose={() => setDeleteConfirmationId(null)}
        onConfirm={confirmDelete}
        title={t('market.sales.deleteTransactionConfirmTitle')}
        description={t('market.sales.deleteTransactionConfirmDesc')}
        confirmText={t('market.delete')}
        cancelText={t('market.cancel')}
        variant="danger"
      />

            {/* Header Phase - Sticky & Fixed */}
            <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 md:p-6 shrink-0 z-10 transition-colors">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <BarChart3 className="w-8 h-8 text-sky-500" />
                                {t('market.sales.title')}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('market.sales.subtitle')}</p>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto">
                            {/* View Mode Switcher */}
                            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-full sm:w-auto">
                                <button 
                                    onClick={() => setViewMode('daily')}
                                    className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'daily' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                >
                                    {t('market.sales.daily')}
                                </button>
                                <button 
                                    onClick={() => setViewMode('monthly')}
                                    className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'monthly' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                >
                                    {t('market.sales.monthly')}
                                </button>
                                <button 
                                    onClick={() => setViewMode('yearly')}
                                    className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'yearly' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                >
                                    {t('market.sales.yearly')}
                                </button>
                            </div>

                            {/* Date Navigator */}
                            <div className="flex items-center justify-between gap-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-4 py-2 rounded-lg w-full sm:w-auto">
                                <button onClick={handlePrevDate} className="p-1 hover:text-sky-500 transition-colors"><ChevronUp className={`w-5 h-5 ${language === 'en' ? '-rotate-90' : 'rotate-90'}`} /></button>
                                <span className="font-bold text-sm min-w-[140px] text-center">{formatDateLabel()}</span>
                                <button onClick={handleNextDate} className="p-1 hover:text-sky-500 transition-colors"><ChevronDown className={`w-5 h-5 ${language === 'en' ? '-rotate-90' : 'rotate-90'}`} /></button>
                            </div>
                            
                            <button 
                                onClick={generateReportPDF}
                                className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-all font-medium shadow-lg shadow-sky-500/20 whitespace-nowrap justify-center"
                            >
                                <Printer size={20} />
                                <span className="hidden sm:inline font-bold text-sm">{t('restaurantAnalytics.printReport', 'Print Report')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
                
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">{t('market.sales.revenue')}</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(totalRevenue)}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">{t('market.sales.cash')}</p>
                        <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalCash)}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">{t('market.sales.credit')}</p>
                        <p className="text-xl font-bold text-blue-600">{formatCurrency(totalCard)}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">{t('market.sales.digital')}</p>
                        <p className="text-xl font-bold text-purple-600">{formatCurrency(totalDigital)}</p>
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Left: Charts */}
                    <div className="lg:col-span-2 space-y-6 min-w-0">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <h3 className="font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-slate-400" />
                                {t(`market.sales.graph.${viewMode}`)}
                            </h3>
                              <div style={{ width: '100%', height: 350, minHeight: 350, minWidth: 200 }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
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
                                      contentStyle={{ 
                                        borderRadius: '12px', 
                                        border: 'none', 
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                        backgroundColor: '#1e293b', 
                                        color: '#f8fafc' 
                                      }}
                                      wrapperStyle={{ zIndex: 100 }}
                                      formatter={(value: number | string | Array<number | string> | undefined) => [formatCurrency(Number(value || 0)), t('market.sales.revenue')]}
                                    />
                                    <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32}>
                                      {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.total > 0 ? '#10b981' : '#e2e8f0'} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                        </div>
                    </div>

                    {/* Right: Transaction List */}
                    <div className="lg:col-span-1 min-w-0">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-full max-h-[600px]">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <h3 className="font-bold text-slate-800 dark:text-white">
                                    {t('market.sales.transactions')}
                                </h3>
                                <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 font-medium">
                                    {transactions.length} {t('market.sales.count')}
                                </span>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                {loading ? (
                                    <div className="text-center py-12 text-slate-500 animate-pulse">{t('market.sales.loading')}</div>
                                ) : transactions.length === 0 ? (
                                    <div className="text-center py-12 text-slate-500">
                                        <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>{t('market.sales.noData')}</p>
                                    </div>
                                ) : (
                                    transactions.map((tx) => (
                                    <div key={tx.id} className="group bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl hover:border-green-300 dark:hover:border-green-700 transition-all p-3">
                                        <div 
                                        className="flex items-center justify-between cursor-pointer"
                                        onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg
                                                    ${tx.payment_method === 'cash' ? 'bg-emerald-50 text-emerald-600' : 
                                                    tx.payment_method === 'card' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                                    {tx.payment_method === 'cash' ? '💵' : tx.payment_method === 'card' ? '💳' : '📱'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                        {formatCurrency(tx.total_amount)}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        {new Date(tx.created_at).toLocaleTimeString(language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-IL', { hour: '2-digit', minute: '2-digit' })} • #{tx.receipt_number.split('-').pop()}
                                                    </p>
                                                </div>
                                            </div>
                                        
                                            {expandedId === tx.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                        </div>

                                        {/* Expanded Details */}
                                        {expandedId === tx.id && (
                                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs animate-fadeIn">
                                            <div className="space-y-1.5">
                                            {tx.items && Array.isArray(tx.items) && tx.items.map((item: TransactionItem, idx: number) => (
                                                <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-400">
                                                <span>{item.name || item.product?.nameHe} × {item.quantity || (item.weight ? item.weight.toFixed(3) + ' ' + t('market.weightKg') : 1)}</span>
                                                <span>{formatCurrency((item.price || item.product?.price || 0) * (item.quantity || (item.product?.type === 'weight' ? item.weight || 0 : 1)))}</span>
                                                </div>
                                            ))}
                                            </div>
                                            
                                            {/* Actions */}
                                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedTransactionForReceipt(tx);
                                                    }}
                                                    className="flex-1 py-1.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg flex items-center justify-center gap-1 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition pdf-hide"
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                    {t('market.viewTrip') || t('market.receipt')} 
                                                </button>
                                                <button
                                                    onClick={(e) => handleEditClick(tx, e)} 
                                                    className="flex-1 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center gap-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition pdf-hide"
                                                >
                                                    <Edit className="w-3.5 h-3.5" />
                                                    {t('market.sales.editTransaction')}
                                                </button>
                                                <button 
                                                    onClick={(e) => handleDeleteClick(tx.id, e)}
                                                    className="flex-1 py-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition pdf-hide"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    {t('market.sales.deleteTransaction')}
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
                                    <h3 className="font-bold text-slate-900 dark:text-white">{t('restaurantAnalytics.previewReport', 'Preview Report')}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateLabel()}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDownloadPDF}
                                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl transition shadow-lg shadow-sky-500/20"
                                >
                                    <Download size={18} />
                                    <span className="font-bold text-sm hidden sm:inline">{t('common.download', 'Download')}</span>
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
