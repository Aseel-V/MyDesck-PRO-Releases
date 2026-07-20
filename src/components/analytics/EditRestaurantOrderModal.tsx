import { useState, useEffect, useMemo } from 'react';
import { X, Save, Trash2, Plus, Minus, Search, Utensils } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from 'sonner';
import { RestaurantOrder, MenuItem, OrderItem } from '../../types/restaurant';

// Local interface for items being edited (might not have ID yet)
interface EditableOrderItem extends Partial<Omit<OrderItem, 'id'>> {
  id?: string;
  menu_item_id?: string; // used for creating new items
  quantity: number;
  price_at_time: number;
  menu_item?: MenuItem;
}

interface EditRestaurantOrderModalProps {
  order: RestaurantOrder;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditRestaurantOrderModal({ order, onClose, onSuccess }: EditRestaurantOrderModalProps) {
  const { user } = useAuth();
  const { t, direction, formatCurrency, language } = useLanguage();
  const [items, setItems] = useState<EditableOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // Add Item Logic
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingMenu, setLoadingMenu] = useState(false);

  const fetchMenu = async () => {
      try {
          if (menuItems.length > 0) return; // already fetched
          setLoadingMenu(true);
          const { data, error } = await supabase
            .from('restaurant_menu_items')
            .select('*')
            .eq('is_available', true)
            .order('name');
          
          if (error) throw error;
          setMenuItems(data as MenuItem[]);
      } catch (err) {
          console.error('Error fetching menu:', err);
      } finally {
          setLoadingMenu(false);
      }
  };

  useEffect(() => {
    if (order && order.items) {
      // Deep copy to avoid mutation
      setItems(JSON.parse(JSON.stringify(order.items)));
      setTotal(order.total_amount);
    }
    fetchMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // Recalculate total
  useEffect(() => {
    const newTotal = items.reduce((sum, item) => {
      return sum + (item.price_at_time * item.quantity);
    }, 0);
    setTotal(newTotal);
  }, [items]);

  const handleUpdateItem = (index: number, field: string, value: number) => {
    const newItems = [...items];
    if (field === 'quantity') {
      newItems[index].quantity = value;
    } else if (field === 'price') {
      newItems[index].price_at_time = value;
    }
    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

    const handleAddItem = (menuItem: MenuItem) => {
        const newItem: EditableOrderItem = {
            // New item doesn't have an ID yet, will be assigned by DB or ignored
            // We need a temporary structure that matches what we use in render
            id: undefined, // undefined ID means new item
            menu_item_id: menuItem.id,
            menu_item: menuItem, // for display name
            quantity: 1,
            price_at_time: menuItem.price,
            notes: '',
            status: 'pending' // 'served' is not a valid TicketItemStatus, using 'pending'
        };
        setItems([...items, newItem]);
        setShowAddMenu(false);
        setSearchQuery('');
        toast.success(t('Item added'));
    };

    const filteredMenuItems = useMemo(() => {
        if (!searchQuery) return menuItems;
        const lowerQ = searchQuery.toLowerCase();
        return menuItems.filter(item => 
            item.name.toLowerCase().includes(lowerQ) || 
            item.name_he?.toLowerCase().includes(lowerQ) ||
            item.name_ar?.toLowerCase().includes(lowerQ)
        );
    }, [menuItems, searchQuery]);

    const handleSave = async () => {
        if (!user) return;
        try {
        setLoading(true);

        const taxRate = 0.17;
        const subtotal = total / (1 + taxRate);
        const tax = total - subtotal;

        // A. Remove deleted items
        const originalIds = order.items?.map(i => i.id) || [];
        const currentIds = items.map(i => i.id).filter(Boolean); // Only keep items that have an ID (existing ones)
        const idsToDelete = originalIds.filter(id => !currentIds.includes(id));

        if (idsToDelete.length > 0) {
            await supabase.from('restaurant_order_items').delete().in('id', idsToDelete);
        }

        // B. Update/Upsert current items
        const upsertData = items.map(item => ({
            id: item.id, // undefined for new items
            order_id: order.id,
            item_id: item.menu_item_id || item.item_id, 
            quantity: item.quantity,
            price_at_time: item.price_at_time,
            notes: item.notes,
            status: item.status || 'pending'
        }));

        const { error: itemsError } = await supabase
            .from('restaurant_order_items')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert(upsertData as any); // Using any temporarily as upsert types can be tricky with partial IDs

        if (itemsError) throw itemsError;

        // C. Update Order Totals
        const { error: orderError } = await supabase
            .from('restaurant_orders')
            .update({
            total_amount: total,
            subtotal_amount: subtotal,
            tax_amount: tax,
            })
            .eq('id', order.id);

        if (orderError) throw orderError;

        toast.success(t('restaurantAnalytics.saveChanges'));
        onSuccess();
        onClose();
        } catch (error: unknown) {
        console.error('Error updating order:', error);
        toast.error(t('restaurantAnalytics.saveChanges') + ': ' + ((error as Error).message || error));
        } finally {
        setLoading(false);
        }
    };

    // Helper for item name
    const getItemName = (item: EditableOrderItem | OrderItem) => {
        if (item.menu_item) {
            return language === 'he' ? item.menu_item.name_he || item.menu_item.name : 
                   language === 'ar' ? item.menu_item.name_ar || item.menu_item.name : 
                   item.menu_item.name;
        }
        return 'Item';
    };

    const getMenuItemName = (item: MenuItem) => {
         return language === 'he' ? item.name_he || item.name : 
                language === 'ar' ? item.name_ar || item.name : 
                item.name;
    };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" dir={direction}>
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center text-white shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Save className="w-5 h-5" />
            {t('restaurantAnalytics.editOrder')} #{order.order_number || order.id.slice(0,6)}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
            
            {/* Add Item Section */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                {!showAddMenu ? (
                    <button 
                        onClick={() => setShowAddMenu(true)}
                        className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center gap-2 font-bold"
                    >
                        <Plus className="w-5 h-5" />
                        {t('restaurantAnalytics.addItem') || t('Add Item')} 
                    </button>
                ) : (
                    <div className="space-y-3 animate-fadeIn">
                        <div className="flex gap-2">
                             <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input 
                                    type="text"
                                    autoFocus
                                    placeholder={t('search') || 'Search...'}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                             </div>
                             <button 
                                onClick={() => setShowAddMenu(false)}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500"
                             >
                                <X className="w-5 h-5" />
                             </button>
                        </div>

                        <div className="max-h-[200px] overflow-y-auto space-y-1 custom-scrollbar">
                            {loadingMenu ? (
                                <div className="text-center p-4 text-slate-500">{t('common.loading')}</div>
                            ) : filteredMenuItems.length === 0 ? (
                                <div className="text-center p-4 text-slate-500">{t('noResults') || 'No items found'}</div>
                            ) : (
                                filteredMenuItems.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleAddItem(item)}
                                        className="w-full flex justify-between items-center p-2 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg group text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400">
                                                <Utensils className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{getMenuItemName(item)}</p>
                                                <p className="text-xs text-slate-500">{item.category_id}</p>
                                            </div>
                                        </div>
                                        <span className="font-bold text-blue-600">{formatCurrency(item.price)}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Items List */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="space-y-3">
                {items.map((item, index) => (
                    <div key={index} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4 items-center animate-fadeIn">
                        {/* Name & Price */}
                        <div className="flex-[2] w-full">
                            <p className="font-bold text-slate-800 dark:text-slate-200">
                                {getItemName(item)}
                                {!item.id && <span className="mx-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider">{t('New') || 'NEW'}</span>}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-slate-500">{t('restaurantAnalytics.price')}:</span>
                                <input 
                                    type="number"
                                    value={item.price_at_time}
                                    onChange={(e) => handleUpdateItem(index, 'price', parseFloat(e.target.value))}
                                    className="w-20 p-1 border rounded text-center bg-slate-50 dark:bg-slate-900 text-sm"
                                />
                            </div>
                        </div>

                        {/* Quantity */}
                        <div className="flex items-center gap-3">
                            <button 
                            onClick={() => handleUpdateItem(index, 'quantity', Math.max(1, item.quantity - 1))}
                            className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200"
                            >
                            <Minus className="w-4 h-4" />
                            </button>
                            <span className="font-bold w-6 text-center">{item.quantity}</span>
                            <button 
                            onClick={() => handleUpdateItem(index, 'quantity', item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200"
                            >
                            <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Total & Delete */}
                        <div className="flex items-center gap-4 min-w-[100px] justify-end">
                            <span className="font-bold text-slate-900 dark:text-white">
                                {formatCurrency(item.price_at_time * item.quantity)}
                            </span>
                            <button 
                                onClick={() => handleRemoveItem(index)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
                
                {items.length === 0 && (
                     <div className="text-center py-8 text-slate-400">
                        {t('restaurantAnalytics.noItems') || 'No items in order'}
                     </div>
                )}
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-lg z-10">
          <div className="text-end">
             <p className="text-sm text-slate-500">{t('restaurantAnalytics.total')}</p>
             <p className="text-2xl font-black text-blue-600">{formatCurrency(total)}</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-600 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              {t('restaurantAnalytics.cancel')}
            </button>
            <button 
              onClick={handleSave}
              disabled={loading}
              className="px-8 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? t('restaurantAnalytics.saving') : (
                <>
                  <Save className="w-5 h-5" />
                  {t('restaurantAnalytics.saveChanges')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
