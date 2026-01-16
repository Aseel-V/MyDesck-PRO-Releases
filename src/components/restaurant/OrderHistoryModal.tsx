import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { RestaurantOrder } from '../../types/restaurant';
import { X, Search, Calendar, CheckCircle2, XCircle, RefreshCcw, CreditCard, ChevronRight, ChevronLeft, Filter } from 'lucide-react';
import RefundModal from './RefundModal';
import { toast } from 'sonner';

interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderHistoryModal({ isOpen, onClose }: OrderHistoryModalProps) {
  const { t, formatCurrency } = useLanguage();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<RestaurantOrder | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const pageSize = 10;

  // Use raw supabase query for order history as it's not in standard hooks
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['order_history', page, search],
    queryFn: async () => {
      let query = supabase
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
        .in('status', ['closed', 'cancelled'])
        .order('closed_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (search) {
        query = query.or(`order_number.eq.${search},id.eq.${search}`);
      }

      const { data, error } = await query;
      if (error) {
          console.error(error);
          toast.error('Failed to load history');
          return [];
      }
      return data as unknown as RestaurantOrder[];
    },
    enabled: isOpen
  });

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex overflow-hidden border border-slate-200 dark:border-slate-800">
          
          {/* LEFT: List */}
          <div className="w-1/3 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-950/50">
             <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <h2 className="font-bold text-lg mb-2 dark:text-white">{t('orderHistory.title')}</h2>
                <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     placeholder={t('orderHistory.searchPlaceholder')}
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                   />
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {isLoading ? (
                   <div className="text-center p-4 text-slate-500">{t('common.loading')}</div>
                ) : orders.length === 0 ? (
                   <div className="text-center p-8 text-slate-400">
                      <Filter className="mx-auto mb-2 opacity-50" />
                      {t('orderHistory.noOrders')}
                   </div>
                ) : (
                   orders.map(order => (
                      <button
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                           selectedOrder?.id === order.id 
                             ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 shadow-sm' 
                             : 'bg-white border-transparent hover:bg-white hover:border-slate-200 dark:bg-transparent dark:hover:bg-slate-800'
                        }`}
                      >
                         <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-slate-900 dark:text-white">#{order.order_number || order.id.slice(0,4)}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                               order.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                               {order.status}
                            </span>
                         </div>
                         <div className="flex justify-between items-center text-sm text-slate-500">
                             <div className="flex items-center gap-1">
                                <Calendar size={12} />
                                {new Date(order.closed_at || order.created_at).toLocaleDateString()}
                             </div>
                             <div className="font-semibold text-slate-700 dark:text-slate-300">
                                {formatCurrency(order.total_amount)}
                             </div>
                         </div>
                      </button>
                   ))
                )}
             </div>

             {/* Pagination */}
             <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
                <button 
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50"
                >
                   <ChevronLeft size={20} />
                </button>
                <span className="text-sm font-medium">{t('Page')} {page + 1}</span>
                <button 
                  disabled={orders.length < pageSize}
                  onClick={() => setPage(p => p + 1)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50"
                >
                   <ChevronRight size={20} />
                </button>
             </div>
          </div>

          {/* RIGHT: Details */}
          <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col min-w-0">
             <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <h2 className="font-bold text-lg">{t('Order Details')}</h2>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                   <X size={20} />
                </button>
             </div>

             {selectedOrder ? (
               <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6">
                     <div className="flex items-center justify-between mb-6">
                        <div>
                           <h1 className="text-2xl font-bold mb-1">
                              {t('Order')} #{selectedOrder.order_number || selectedOrder.id.slice(0,6)}
                           </h1>
                           <p className="text-slate-500 flex items-center gap-2">
                              {new Date(selectedOrder.closed_at || selectedOrder.created_at).toLocaleString()}
                              <span>•</span>
                              {selectedOrder.server?.full_name || t('Unknown Server')}
                           </p>
                        </div>
                        <div className="text-right">
                           {selectedOrder.status === 'closed' ? (
                              <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                                 <CheckCircle2 size={18} />
                                 <span className="font-bold">{t('Paid')}</span>
                              </div>
                           ) : (
                              <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
                                 <XCircle size={18} />
                                 <span className="font-bold">{t('Cancelled')}</span>
                              </div>
                           )}
                        </div>
                     </div>
                     
                     {/* Items */}
                     <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden mb-6">
                        <table className="w-full text-sm">
                           <thead className="bg-slate-100 dark:bg-slate-800">
                              <tr>
                                 <th className="text-left p-3 font-medium text-slate-500">{t('Item')}</th>
                                 <th className="text-center p-3 font-medium text-slate-500">{t('Qty')}</th>
                                 <th className="text-right p-3 font-medium text-slate-500">{t('Price')}</th>
                                 <th className="text-right p-3 font-medium text-slate-500">{t('Total')}</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {selectedOrder.items?.map(item => (
                                 <tr key={item.id}>
                                    <td className="p-3">
                                       <div className="font-medium">{item.menu_item?.name || 'Unknown'}</div>
                                       {item.notes && <div className="text-xs text-slate-500 italic">{item.notes}</div>}
                                       {item.voided && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">{t('Voided')}</span>}
                                    </td>
                                    <td className="p-3 text-center">{item.quantity}</td>
                                    <td className="p-3 text-right">{formatCurrency(item.price_at_time)}</td>
                                    <td className="p-3 text-right font-medium">{formatCurrency(item.price_at_time * item.quantity)}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>

                     {/* Payment Info */}
                     <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                           <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">{t('Payment')}</h3>
                           <div className="flex justify-between mb-2">
                              <span>{t('Subtotal')}</span>
                              <span className="font-medium">{formatCurrency(selectedOrder.subtotal_amount || 0)}</span>
                           </div>
                           <div className="flex justify-between mb-2">
                              <span>{t('Tax')}</span>
                              <span className="font-medium">{formatCurrency(selectedOrder.tax_amount || 0)}</span>
                           </div>
                           <div className="flex justify-between mb-2 text-green-600">
                              <span>{t('Discount')}</span>
                              <span>-{formatCurrency(selectedOrder.discount_amount || 0)}</span>
                           </div>
                           <div className="border-t border-slate-200 dark:border-slate-800 my-2 pt-2 flex justify-between text-lg font-bold">
                              <span>{t('Total')}</span>
                              <span>{formatCurrency(selectedOrder.total_amount)}</span>
                           </div>
                        </div>
                        
                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                           <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">{t('Meta')}</h3>
                           <div className="flex items-center gap-2 mb-2">
                              <CreditCard size={16} className="text-slate-400" />
                              <span>{t('Method')}: <span className="font-medium capitalize">{selectedOrder.payment_method || '-'}</span></span>
                           </div>
                           <div className="flex items-center gap-2">
                              <Calendar size={16} className="text-slate-400" />
                              <span>{t('Closed')}: <span className="font-medium">{new Date(selectedOrder.closed_at || new Date()).toLocaleTimeString()}</span></span>
                           </div>
                           
                           {selectedOrder.payment_status === 'refunded' && (
                              <div className="mt-4 p-2 bg-red-100 text-red-700 rounded-lg text-sm text-center font-bold">
                                 {t('Order Refunded')}
                              </div>
                           )}
                        </div>
                     </div>
                  </div>

                  <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end gap-3">
                     <button 
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-medium hover:bg-slate-50 transition"
                     >
                        {t('Print Receipt')}
                     </button>
                     {selectedOrder.status === 'closed' && selectedOrder.payment_status !== 'refunded' && (
                        <button 
                           onClick={() => setIsRefundModalOpen(true)}
                           className="px-4 py-2 bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-200 transition flex items-center gap-2"
                        >
                           <RefreshCcw size={18} />
                           {t('Refund Order')}
                        </button>
                     )}
                  </div>
               </div>
             ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                   <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                      <Search size={24} />
                   </div>
                   <p>{t('Select an order to view details')}</p>
                </div>
             )}
          </div>
        </div>
      </div>

      {selectedOrder && (
        <RefundModal
          isOpen={isRefundModalOpen}
          onClose={() => {
              setIsRefundModalOpen(false);
              // Refresh order logic? Query will auto refresh if we invalidate
          }}
          order={selectedOrder}
        />
      )}
    </>
  );
}
