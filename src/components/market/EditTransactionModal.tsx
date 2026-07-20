
import { useState, useEffect } from 'react';
import { X, Save, Trash2, Plus, Minus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from 'sonner';

interface EditTransactionModalProps {
  transaction: MarketTransaction; // Define local or import if available. I'll define local interface below.
  onClose: () => void;
  onSuccess: () => void;
}

interface MarketTransaction {
    id: string;
    receipt_number: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[]; // Making items safer would require defining CartItem which has nested Product
    total_amount: number;
    subtotal?: number;
    vat_amount?: number;
}

export default function EditTransactionModal({ transaction, onClose, onSuccess }: EditTransactionModalProps) {
  const { user } = useAuth();
  const { t, direction, formatCurrency } = useLanguage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (transaction) {
      // Deep copy items to avoid mutating original state directly
      setItems(JSON.parse(JSON.stringify(transaction.items || [])));
      setTotal(transaction.total_amount);
    }
  }, [transaction]);

  // Recalculate total whenever items change
  useEffect(() => {
    const newTotal = items.reduce((sum, item) => {
      const price = parseFloat(item.product?.price || item.price || 0);
      const qty = item.product?.type === 'weight' ? (item.weight || 0) : (item.quantity || 1);
      return sum + (price * qty);
    }, 0);
    setTotal(newTotal);
  }, [items]);

  const handleUpdateItem = (index: number, field: string, value: number) => {
    const newItems = [...items];
    if (field === 'quantity') {
      newItems[index].quantity = value;
    } else if (field === 'weight') {
      newItems[index].weight = value;
    } else if (field === 'price') {
       // Update the underlying product price for this transaction record
       if (newItems[index].product) {
         newItems[index].product.price = value;
       } else {
         newItems[index].price = value;
       }
    }
    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Calculate new totals
      const subtotal = total / 1.17; // Assuming 17% VAT
      const vat = total - subtotal;

      console.log('Updating transaction:', transaction.id, { total, items });

      // 2. Update transaction in DB
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('market_transactions' as any)
        .update({
          items: items,
          total_amount: total,
          subtotal: subtotal,
          vat_amount: vat
        })
        .eq('id', transaction.id);

      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }

      onSuccess();
      onClose();
      onSuccess();
      onClose();
      toast.success(t('market.saveSuccess'));
    } catch (error: unknown) {
      console.error('Error updating transaction:', error);
      toast.error(t('market.saveError') + ': ' + ((error as Error).message || error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" dir={direction}>
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center text-white shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Save className="w-5 h-5" />
            {t('market.sales.editTransactionTitle')} #{transaction.receipt_number.split('-').pop()}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-bold text-slate-700 dark:text-slate-300">{t('market.sales.itemsInTransaction')}</h3>
               <span className="text-sm text-slate-500">{items.length} {t('market.sales.count')}</span>
            </div>
            
            <div className="space-y-3">
              {items.map((item, index) => {
                const isWeight = item.product?.type === 'weight';
                const price = item.product?.price || item.price || 0;
                
                return (
                  <div key={index} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4 items-center">
                    {/* Product Name */}
                    <div className="flex-[2] text-right w-full">
                      <p className="font-bold text-slate-800 dark:text-slate-200">{item.product?.nameHe || item.name}</p>
                      <p className="text-xs text-slate-500">
                         {t('market.sales.unitPrice')}: 
                         <input 
                           type="number"
                           step="0.1"
                           value={price}
                           onChange={(e) => handleUpdateItem(index, 'price', parseFloat(e.target.value))}
                           className="w-20 mx-2 p-1 border rounded text-center bg-slate-50 dark:bg-slate-900"
                         />
                         {/* Currency symbol removed as it depends on formatCurrency but input is numeric */}
                      </p>
                    </div>

                    {/* Quantity/Weight Control */}
                    <div className="flex-1 flex items-center justify-center gap-2">
                      {isWeight ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.001"
                            value={item.weight || 0}
                            onChange={(e) => handleUpdateItem(index, 'weight', parseFloat(e.target.value))}
                            className="w-20 p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-center bg-slate-50 dark:bg-slate-900"
                          />
                          <span className="text-sm text-slate-500">{t('market.weightKg')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                           <button 
                             onClick={() => handleUpdateItem(index, 'quantity', Math.max(1, (item.quantity || 1) - 1))}
                             className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"
                           >
                             <Minus className="w-4 h-4" />
                           </button>
                           <span className="w-8 text-center font-bold">{item.quantity || 1}</span>
                           <button 
                             onClick={() => handleUpdateItem(index, 'quantity', (item.quantity || 1) + 1)}
                             className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"
                           >
                             <Plus className="w-4 h-4" />
                           </button>
                        </div>
                      )}
                    </div>

                    {/* Total & Delete */}
                    <div className="flex-1 flex items-center justify-end gap-4 min-w-[120px]">
                      <p className="font-bold text-lg text-slate-800 dark:text-white">
                        {formatCurrency(price * (isWeight ? (item.weight || 0) : (item.quantity || 1)))}
                      </p>
                      <button 
                        onClick={() => handleRemoveItem(index)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="text-right">
             <p className="text-sm text-slate-500">{t('market.sales.updatedTotal')}</p>
             <p className="text-2xl font-black text-blue-600">{formatCurrency(total)}</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-600 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {t('market.cancel')}
            </button>
            <button 
              onClick={handleSave}
              disabled={loading}
              className="px-8 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>{t('market.sales.saving')}</>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {t('market.sales.saveChanges')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
