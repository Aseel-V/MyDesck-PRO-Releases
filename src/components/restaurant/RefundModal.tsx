import { useState, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { RestaurantOrder } from '../../types/restaurant';
import { PinPadModal, PinPadModalHandle } from './PinPadModal';
import { X, RefreshCcw, CheckSquare, Square } from 'lucide-react';
import { useRestaurant } from '../../hooks/useRestaurant';
import { toast } from 'sonner';

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: RestaurantOrder;
}

export default function RefundModal({ isOpen, onClose, order }: RefundModalProps) {
  const { t, formatCurrency } = useLanguage();
  const { refundOrder, authorizeStaffAction } = useRestaurant(); // Need to implement refundOrder
  
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [refundReason, setRefundReason] = useState('');
  const [isPinPadOpen, setIsPinPadOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pinPadRef = useRef<PinPadModalHandle>(null);

  const activeItems = order.items?.filter(i => i.status !== 'cancelled' && !i.voided) || [];
  const maxRefundAmount = order.total_amount; // Simplified
  
  const calculateRefundTotal = () => {
    if (selectedItems.size === activeItems.length) return maxRefundAmount;
    // Calculate partial
    return activeItems
      .filter(i => selectedItems.has(i.id))
      .reduce((sum, i) => sum + (i.price_at_time * i.quantity), 0);
  };

  const refundTotal = calculateRefundTotal();
  const isFullRefund = selectedItems.size === activeItems.length;

  const toggleItem = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItems(newSet);
  };

  const toggleAll = () => {
    if (selectedItems.size === activeItems.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(activeItems.map(i => i.id)));
  };

  const handleRefundRequest = () => {
    if (refundTotal <= 0) return toast.error(t('refund.selectItems'));
    if (!refundReason) return toast.error(t('refund.reasonPlaceholder'));
    setIsPinPadOpen(true);
  };

  const handlePinSuccess = async (pin: string) => {
    setIsProcessing(true);
    try {
      const auth = await authorizeStaffAction.mutateAsync({ 
          pin, 
          requiredRole: 'manager' 
      });

      await refundOrder.mutateAsync({
        orderId: order.id,
        itemIds: Array.from(selectedItems),
        amount: refundTotal,
        reason: refundReason,
        authStaffId: auth.staff_id!
      });

      toast.success(t('refund.success'));
      setIsPinPadOpen(false);
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Refund Failed');
      pinPadRef.current?.triggerFailure();
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
          
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
            <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
               <RefreshCcw size={20} /> {t('refund.processRefund')} #{order.id.slice(0,4)}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[60vh]">
            
            <div className="flex justify-between items-center mb-4">
               <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-bold text-blue-500 hover:underline">
                 {isFullRefund ? <CheckSquare size={16} /> : <Square size={16} />}
                 {t('refund.selectAll')}
               </button>
               <div className="text-sm text-slate-500">
                 {t('refund.originalTotal')}: {formatCurrency(order.total_amount)}
               </div>
            </div>

            <div className="space-y-2 mb-6">
              {activeItems.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => toggleItem(item.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedItems.has(item.id) 
                      ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' 
                      : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`text-blue-500`}>
                      {selectedItems.has(item.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                    </div>
                    <div>
                      <div className="font-medium dark:text-white">{item.menu_item?.name || 'Unknown Item'}</div>
                      <div className="text-xs text-slate-500">{item.quantity}x @ {formatCurrency(item.price_at_time)}</div>
                    </div>
                  </div>
                  <div className="font-bold dark:text-white">
                    {formatCurrency(item.price_at_time * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('refund.reason')}
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder={t('refund.reasonPlaceholder')}
                rows={2}
              />
            </div>

          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center">
             <div>
               <div className="text-sm text-slate-500">{t('refund.amountToRefund')}</div>
               <div className="text-2xl font-bold text-slate-800 dark:text-white">{formatCurrency(refundTotal)}</div>
             </div>
             
             <button
               onClick={handleRefundRequest}
               className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition shadow-lg shadow-red-200 dark:shadow-none"
             >
               {t('refund.authorize')}
             </button>
          </div>

        </div>
      </div>

      {isPinPadOpen && (
        <PinPadModal
            ref={pinPadRef}
            title={t('refund.authorize')}
            description={t('refund.enterPinToRefund')}
            onClose={() => setIsPinPadOpen(false)}
            onSuccess={handlePinSuccess}
            isProcessing={isProcessing}
        />
      )}
    </>
  );
}
