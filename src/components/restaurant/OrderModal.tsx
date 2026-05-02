import { useState, useMemo, useEffect, useRef } from 'react';
import { RestaurantTable, MenuItem, RestaurantOrder, OrderItem} from '../../types/restaurant';
import { useRestaurant } from '../../hooks/useRestaurant';
import { X, Plus, Minus, Printer, CreditCard, ChefHat, Sparkles, Trash2, Percent, Clock } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { safeImageSrc } from '../../lib/safeUrl';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import BusinessLunchModal from './BusinessLunchModal';
import { PinPadModal, PinPadModalHandle } from './PinPadModal';
import { DiscountModal } from './DiscountModal';
import OrderModificationModal from './OrderModificationModal';
import { Ban } from 'lucide-react';
import RestaurantPaymentModal from './RestaurantPaymentModal';
import RestaurantReceiptModal from './RestaurantReceiptModal';

// Course Definitions
const COURSES = [
  { id: 1, labelKey: 'orderModal.courses.starters', color: 'bg-blue-100 text-blue-700' },
  { id: 2, labelKey: 'orderModal.courses.mains', color: 'bg-orange-100 text-orange-700' },
  { id: 3, labelKey: 'orderModal.courses.desserts', color: 'bg-purple-100 text-purple-700' },
  { id: 4, labelKey: 'orderModal.courses.drinks', color: 'bg-slate-100 text-slate-700' }
];

interface OrderModalProps {
    table: RestaurantTable;
    isOpen: boolean;
    onClose: () => void;
    onToggleNavbar?: (show: boolean) => void;
}

export default function OrderModal({ table, isOpen, onClose, onToggleNavbar }: OrderModalProps) {
    const { t, language, formatCurrency } = useLanguage(); // Get language and formatCurrency

    // Toggle navbar visibility
    useEffect(() => {
        if (isOpen && onToggleNavbar) {
            onToggleNavbar(false);
            return () => onToggleNavbar(true);
        }
    }, [isOpen, onToggleNavbar]);
    const { 
        categories, 
        activeOrders, 
        createOrder, 
        loadingMenu, 
        updateTableStatus,
        voidOrderItem,
        authorizeStaffAction,
        applyDiscount,
        endSession,
        updateOrderItem,
        sendToKitchen
    } = useRestaurant();
    const { profile } = useAuth();
    
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [cartItems, setCartItems] = useState<Partial<OrderItem>[]>([]);
    const [currentOrder, setCurrentOrder] = useState<RestaurantOrder | null>(null);
    const [isBusinessLunchOpen, setIsBusinessLunchOpen] = useState(false);
    
    // Void / Pin Pad State
    const [itemToVoid, setItemToVoid] = useState<{ index: number; item: Partial<OrderItem> } | null>(null);
    const [isPinPadOpen, setIsPinPadOpen] = useState(false);
    const [isVoiding, setIsVoiding] = useState(false);
    const pinPadRef = useRef<PinPadModalHandle>(null);
    
    // Discount State
    const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
    const [pendingDiscount, setPendingDiscount] = useState<{ type: 'percent' | 'amount'; value: number; reason: string } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Order Modification State
    const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
    const [pendingCancelOrder, setPendingCancelOrder] = useState<boolean>(false);

    // New Payment States
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [showBillPreview, setShowBillPreview] = useState(false);
    const [paymentResult, setPaymentResult] = useState<{
        method: 'cash' | 'card' | 'bit';
        amountPaid: number;
        change: number;
    } | null>(null);
    
    // Helper to update local cart
    const updateCartItemLocal = (index: number, updates: Partial<OrderItem>) => {
         setCartItems(prev => {
            const newCart = [...prev];
            newCart[index] = { ...newCart[index], ...updates };
            return newCart;
        });
    };

    const handleModUpdate = async ({ quantity, notes }: { quantity?: number; notes?: string }) => {
        if (editingItemIndex === null) return;
        const item = cartItems[editingItemIndex];

        // If Saved Item
        if (item.id) {
             try {
                updateCartItemLocal(editingItemIndex, { quantity, notes });
                await updateOrderItem.mutateAsync({
                    id: item.id,
                    quantity: quantity,
                    notes: notes
                });
                toast.success(t('orderModal.itemUpdated') || 'Item updated');
             } catch(e) {
                 console.error(e);
                 toast.error(t('orderModal.itemUpdateFailed') || 'Failed to update item');
             }
        } else {
            updateCartItemLocal(editingItemIndex, { quantity, notes });
        }
    };

    // Initialize category
    useEffect(() => {
        if (categories.length > 0 && !activeCategory) {
            setActiveCategory(categories[0].id);
        }
    }, [categories, activeCategory]);

    // Check for existing order
    useEffect(() => {
        const existingOrder = activeOrders.find(o => o.table_id === table.id && o.status !== 'closed');
        if (existingOrder) {
            setCurrentOrder(existingOrder);
            // Transform existing order items to cart format
            const items = existingOrder.items?.filter((i: OrderItem) => i.status !== 'cancelled').map((item: OrderItem) => ({
                id: item.id,
                item_id: item.item_id,
                quantity: item.quantity,
                price_at_time: item.price_at_time,
                notes: item.notes,
                menu_item: item.menu_item
            })) || [];
            setCartItems(items);
        } else {
            setCurrentOrder(null);
            setCartItems([]);
        }
    }, [table.id, activeOrders]);

    const filteredItems = useMemo(() => {
        let items: MenuItem[] = [];
        if (searchQuery) {
            // Search across all categories
            items = categories.flatMap(c => c.items || []).filter(i => i.is_available);
            const query = searchQuery.toLowerCase();
            return items.filter(i => 
                i.name.toLowerCase().includes(query) || 
                i.name_he?.toLowerCase().includes(query) || 
                i.name_ar?.toLowerCase().includes(query) ||
                i.description?.toLowerCase().includes(query)
            );
        }

        if (!activeCategory) return [];
        const cat = categories.find(c => c.id === activeCategory);
        return cat?.items?.filter(i => i.is_available) || [];
    }, [activeCategory, categories, searchQuery]);

    const getItemName = (item: MenuItem) => {
        // useLanguage removed from here
        if (language === 'he' && item.name_he) return item.name_he;
        if (language === 'ar' && item.name_ar) return item.name_ar;
        return item.name;
    };

    const addToCart = (item: MenuItem) => {
        setCartItems(prev => {
            // Check if we have a "new" (unsaved) item of same type without notes
            const existingIndex = prev.findIndex(i => i.item_id === item.id && !i.notes && !i.id);
            if (existingIndex >= 0) {
                const newCart = [...prev];
                newCart[existingIndex] = {
                    ...newCart[existingIndex],
                    quantity: (newCart[existingIndex].quantity || 0) + 1
                };
                return newCart;
            }
            return [...prev, {
                item_id: item.id,
                quantity: 1,
                price_at_time: item.price,
                menu_item: item,
                course_number: 1, // Default to Starters
                is_fired: true    // Default to Fire Immediately
            } as Partial<OrderItem>];
        });
    };

    const addBusinessLunch = (selections: { starter?: MenuItem, main?: MenuItem, drink?: MenuItem }, price: number) => {
        const mainItem = selections.main || selections.starter || selections.drink;
        if (!mainItem) return;

        const description = [
            selections.starter ? `${t('orderModal.businessLunchDetails.starter')}: ${selections.starter.name}` : '',
            selections.main ? `${t('orderModal.businessLunchDetails.main')}: ${selections.main.name}` : '',
            selections.drink ? `${t('orderModal.businessLunchDetails.drink')}: ${selections.drink.name}` : ''
        ].filter(Boolean).join(', ');

        setCartItems(prev => [...prev, {
            item_id: mainItem.id, 
            quantity: 1,
            price_at_time: price,
            notes: `BUSINESS LUNCH: ${description}`,
            menu_item: { ...mainItem, name: `${t('orderModal.businessLunch')} (${mainItem.name})` }
        } as Partial<OrderItem>]);
    };

    const handleRemoveRequest = (index: number) => {
        const item = cartItems[index];

        // 1. If item has an ID, it's saved in DB. Require Auth to void.
        if (item.id) {
            setItemToVoid({ index, item });
            // Close any other modal?
            setIsPinPadOpen(true);
            return;
        }

        // 2. If item is new (no ID), allow normal remove/decrement
        removeFromCartLocal(index);
    };

    const removeFromCartLocal = (index: number) => {
        setCartItems(prev => {
            const item = prev[index];
            if ((item.quantity || 0) > 1) {
                const newCart = [...prev];
                newCart[index] = { ...item, quantity: (item.quantity || 0) - 1 };
                return newCart;
            }
            return prev.filter((_, i) => i !== index);
        });
    };

    const calculateTotal = () => {
        // Base total calculation
        const subtotal = cartItems.reduce((sum, item) => sum + ((item.price_at_time || 0) * (item.quantity || 0)), 0);
        
        // If there's an active discount on the order, apply it to display correct total
        // This is strictly for display; the DB holds the truth.
        if (currentOrder?.discount_amount) {
            return Math.max(0, subtotal - currentOrder.discount_amount);
        }
        return subtotal;
    };
    
    // Raw subtotal for discount calc
    const calculateSubtotal = () => {
        return cartItems.reduce((sum, item) => sum + ((item.price_at_time || 0) * (item.quantity || 0)), 0);
    };

    const handleSaveOrder = async (shouldFire: boolean = true) => {
        try {
            let orderId = currentOrder?.id;
            
            // 1. Create order header if needed
            if (!orderId) {
                const newOrder = await createOrder.mutateAsync({
                    table_id: table.id,
                    status: 'pending',
                    total_amount: calculateSubtotal(), // Initial creation uses subtotal
                    tax_amount: calculateSubtotal() * (0.17 / 1.17), // VAT Inclusive
                });
                orderId = newOrder.id;
            } else {
                // Update total
                 await supabase.from('restaurant_orders').update({
                    total_amount: calculateTotal(), // Updates with potential discount? Check logic. 
                    // VAT Inclusive Calc: Tax = Total * (Rate / (1 + Rate))
                    tax_amount: calculateTotal() * (0.17 / 1.17)
                 }).eq('id', orderId);
            }

            // 2. Sync Items
            const ops = cartItems.map(item => {
                // Only upsert if it's new or changed. 
                // Currently simplified to always upsert active items.
                return supabase.from('restaurant_order_items').upsert({
                    id: item.id, // Only present if existing
                    order_id: orderId,
                    item_id: item.item_id,
                    quantity: item.quantity,
                    price_at_time: item.price_at_time,
                    notes: item.notes,
                    course_number: item.course_number || 1,
                    is_fired: shouldFire // Set based on button click
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);
            });
            
            
            await Promise.all(ops);
            
            // 3. Fire to Kitchen if requested
            if (shouldFire && orderId) {
                await sendToKitchen.mutateAsync({ orderId: orderId });
            }

            // Update table status
            if (table.status === 'free') {
                updateTableStatus.mutate({ id: table.id, status: 'occupied' });
            }

            toast.success(shouldFire ? (t('orderModal.orderFired') || 'Order fired to kitchen') : (t('orderModal.orderHeld') || 'Order held'));
            onClose();
        } catch (error) {
            console.error(error);
            toast.error(t('orderModal.orderSaveFailed') || 'Failed to save order');
        }
    };

    const handlePrintBill = async () => {
        if (!currentOrder || !profile) return;
        setShowBillPreview(true);
        await updateTableStatus.mutateAsync({ id: table.id, status: 'billed' });
    };

    const handlePayAndCloseRequest = () => {
        if (!currentOrder) return;
        setIsPaymentModalOpen(true);
    };

    const handlePaymentComplete = async (method: 'cash' | 'card' | 'bit', amountPaid: number) => {
        if (!currentOrder) return;

        try {
            const finalTotal = calculateTotal();
            const change = amountPaid - finalTotal;

            // 1. Close Order In DB
            await supabase.from('restaurant_orders').update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                payment_method: method as any,
                total_amount: finalTotal,
                tax_amount: finalTotal * (0.17 / 1.17)
            }).eq('id', currentOrder.id);

            // 2. Close Session
            if (currentOrder.session_id) {
                await endSession.mutateAsync(currentOrder.session_id);
            }

            // 3. Free Table
            await updateTableStatus.mutateAsync({ id: table.id, status: 'free' });

            // 4. Show Receipt Modal with results
            setPaymentResult({
                method,
                amountPaid,
                change
            });
            setIsPaymentModalOpen(false);
            
            toast.success(t('orderModal.orderClosed'));
        } catch (e) {
            console.error(e);
            toast.error(t('orderModal.orderCloseFailed'));
        }
    };

    const handlePinSuccess = async (pin: string) => {
        setIsVoiding(true);
        try {
            // 1. Authorize
            const auth = await authorizeStaffAction.mutateAsync({ 
                pin, 
                requiredRole: 'manager' 
            });

            // 2. Perform Action based on context
            if (itemToVoid) {
                await voidOrderItem.mutateAsync({
                itemId: itemToVoid.item.id!,
                reason: 'Manager Void from POS',
                authStaffId: auth.staff_id!
            });
                toast.success(t('orderModal.itemVoided'));
                setItemToVoid(null);
                setCartItems(prev => prev.filter(i => i.id !== itemToVoid.item.id));
            } 
            else if (pendingDiscount && currentOrder) {
                await applyDiscount.mutateAsync({
                    orderId: currentOrder.id,
                    discountAmount: pendingDiscount.type === 'amount' ? pendingDiscount.value : undefined,
                    discountPercentage: pendingDiscount.type === 'percent' ? pendingDiscount.value : undefined,
                    reason: pendingDiscount.reason,
                    authStaffId: auth.staff_id!
                });
                toast.success(t('orderModal.discountApplied'));
                setPendingDiscount(null);
            }
            else if (pendingCancelOrder && currentOrder) {
                 // Cancel Order Logic
                 await supabase.from('restaurant_orders').update({
                     status: 'cancelled',
                     notes: `Cancelled by Manager (ID: ${auth.staff_id})`
                 }).eq('id', currentOrder.id);
                 
                 // Cancel all items
                 await supabase.from('restaurant_order_items').update({
                     status: 'cancelled',
                     voided: true,
                     void_reason: 'Full Order Cancelled'
                 }).eq('order_id', currentOrder.id);

                  // And release table
                  if (table.status !== 'free') {
                     await updateTableStatus.mutateAsync({ id: table.id, status: 'free' });
                  }
                  
                  toast.success(t('orderModal.orderCancelled') || 'Order Cancelled');
                  setPendingCancelOrder(false);
                  onClose();
            }

            setIsPinPadOpen(false);

        } catch (err: unknown) {
            console.error(err);
            toast.error((err as Error)?.message || t('orderModal.authFailed') || 'Authorization failed');
            pinPadRef.current?.triggerFailure();
            // Do NOT close modal, let them try again
        } finally {
            setIsVoiding(false);
        }
    };

    const handleDiscountRequest = (type: 'percent' | 'amount', value: number, reason: string) => {
        setPendingDiscount({ type, value, reason });
        setIsDiscountModalOpen(false);
        setIsPinPadOpen(true); // Trigger Auth
    };


    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
                <div className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex overflow-hidden border border-slate-200 dark:border-slate-800">
                    
                    {/* LEFT: Menu Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950/50">
                        {/* Header */}
                        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold dark:text-white">{t('orderModal.table')}: {table.name}</h2>
                                <p className="text-sm text-slate-500">{t('orderModal.selectItems')}</p>
                            </div>
                             <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full dark:hover:bg-slate-800"><X /></button>
                        </div>

                        {/* Categories Tabs */}
                        <div className="flex overflow-x-auto p-2 gap-2 bg-white dark:bg-slate-900 shadow-sm border-b border-slate-200 dark:border-slate-800 scrollbar-hide">
                             <button 
                                onClick={() => setIsBusinessLunchOpen(true)}
                                className="px-6 py-3 rounded-xl whitespace-nowrap font-bold transition-all bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg flex items-center gap-2 hover:scale-105"
                             >
                                <Sparkles size={16} fill="white" /> {t('orderModal.businessLunch')}
                             </button>
                            {loadingMenu ? <div className="p-4">{t('auth.loading')}</div> : categories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategory(cat.id)}
                                    className={`
                                        px-6 py-3 rounded-xl whitespace-nowrap font-medium transition-all
                                        ${activeCategory === cat.id 
                                            ? 'bg-slate-900 text-white shadow-lg scale-105' 
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}
                                    `}
                                >
                                        {cat.name}
                                </button>
                            ))}
                        </div>

                        {/* Items Area */}
                        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950/50">
                            {/* Search Bar */}
                            <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                                <div className="relative group">
                                    <input 
                                        type="text"
                                        placeholder={t('orderModal.searchItems')}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-transparent focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-emerald-500 rounded-xl transition-all outline-none"
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                    </div>
                                    {searchQuery && (
                                        <button 
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Items Grid */}
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {filteredItems.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => addToCart(item)}
                                            className="group relative flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-emerald-500/50 dark:hover:border-emerald-500/30 transition-all duration-300 overflow-hidden text-start"
                                        >
                                            {/* Image placeholder or actual image */}
                                            <div className="aspect-video w-full bg-slate-100 dark:bg-slate-900 overflow-hidden relative">
                                                {safeImageSrc(item.image_url) ? (
                                                    <img src={safeImageSrc(item.image_url) || ''} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-700">
                                                        <Sparkles size={32} />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>

                                            <div className="p-3 flex flex-col flex-1">
                                                <div className="font-bold text-slate-800 dark:text-slate-100 mb-1 line-clamp-2 min-h-[2.5rem] leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                                    {getItemName(item)}
                                                </div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 flex-1 line-clamp-2 leading-relaxed">
                                                    {item.description}
                                                </div>
                                                <div className="flex items-center justify-between mt-auto">
                                                    <div className="font-black text-emerald-600 dark:text-emerald-400 text-lg">
                                                        {formatCurrency(item.price)}
                                                    </div>
                                                    <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center scale-75 group-hover:scale-100 transition-transform shadow-sm">
                                                        <Plus size={18} />
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                    
                                    {filteredItems.length === 0 && (
                                        <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400">
                                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                                <X size={24} />
                                            </div>
                                            <p className="font-medium">{t('orderModal.noItemsFound')}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Cart Area */}
                    <div className="w-[400px] flex flex-col bg-white dark:bg-slate-900 border-s border-slate-200 dark:border-slate-800 h-full">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                 {t('orderModal.currentOrder')}
                                 {currentOrder && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">#{currentOrder.id.slice(0,4)}</span>}
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {cartItems.length === 0 ? (
                                <div className="text-center text-slate-400 py-10 flex flex-col items-center">
                                    <div className="p-4 bg-slate-100 rounded-full mb-3 dark:bg-slate-800"><UtensilsCrossedIcon size={24}/></div>
                                    {t('orderModal.noItems')}
                                </div>
                            ) : (
                                cartItems.map((item, idx) => (
                                    <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${item.id ? 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700' : 'bg-slate-50 border-slate-100 dark:bg-slate-950 dark:border-slate-800'}`}>
                                        <div className="flex-1">
                                            <div className="font-medium dark:text-white flex items-center gap-2">
                                                {(item.menu_item ? getItemName(item.menu_item as MenuItem) : t('orderModal.unknownItem'))}
                                                {item.id && <span className="text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded">{t('orderModal.saved')}</span>}
                                                <button 
                                                    onClick={() => setEditingItemIndex(idx)}
                                                    className="ml-2 text-[10px] text-blue-500 hover:underline"
                                                >
                                                    {t('common.edit')}
                                                </button>
                                            </div>
                                            
                                            {/* Course Selector */}
                                            <div className="flex gap-1 my-1">
                                                {COURSES.map(c => (
                                                    <button
                                                        key={c.id}
                                                        onClick={() => {
                                                            const newCart = [...cartItems];
                                                            newCart[idx] = { ...item, course_number: c.id };
                                                            setCartItems(newCart);
                                                        }}
                                                        className={`text-xs px-3 py-1.5 rounded-md border transition-colors font-medium ${
                                                            (item.course_number || 1) === c.id
                                                                ? c.color + ' border-transparent'
                                                                : 'bg-transparent text-slate-400 border-slate-200'
                                                        }`}
                                                    >
                                                        {(t(c.labelKey) as string)[0]}
                                                    </button>
                                                ))}
                                            </div>

                                            {item.notes && <div className="text-[10px] text-amber-600 font-medium leading-tight my-1">{item.notes}</div>}
                                            <div className="text-xs text-slate-500">{formatCurrency(item.price_at_time || 0)}</div>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => handleRemoveRequest(idx)}
                                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                            >
                                                {item.id ? <Trash2 size={14} className="text-red-500" /> : <Minus size={14} />}
                                            </button>
                                            
                                            <span className="font-bold w-6 text-center">{item.quantity}</span>
                                            
                                            <button 
                                                onClick={() => {
                                                    const newCart = [...cartItems];
                                                    // Only allow increment, not decrement below 1 here
                                                    newCart[idx] = { ...item, quantity: (item.quantity || 0) + 1 };
                                                    setCartItems(newCart);
                                                }}
                                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        <div className="w-16 text-end font-bold">
                                            {formatCurrency((item.price_at_time || 0) * (item.quantity || 0))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Totals & Actions */}
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shadow-xl z-10 bg-white dark:bg-slate-900">
                             {/* New: Discount Display if exists */}
                            {currentOrder?.discount_amount && currentOrder.discount_amount > 0 && (
                                <div className="flex justify-between items-center mb-2 text-sm text-red-500">
                                    <span>{t('orderModal.discount')} {currentOrder.discount_percentage ? `(${currentOrder.discount_percentage}%)` : ''}</span>
                                    <span>-{formatCurrency(currentOrder.discount_amount)}</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center mb-4 text-xl font-bold">
                                <span>{t('orderModal.total')}</span>
                                <span>{formatCurrency(calculateTotal())}</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => handleSaveOrder(true)}
                                    className="col-span-2 py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition flex items-center justify-center gap-2"
                                >
                                    <ChefHat size={20} />
                                    <ChefHat size={20} />
                                    {t('orderModal.fireOrder')}
                                </button>

                                <button 
                                    onClick={() => handleSaveOrder(false)}
                                    className="col-span-2 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition flex items-center justify-center gap-2 border border-slate-300"
                                >
                                    <Clock size={20} />
                                    {t('orderModal.holdOrder')}
                                </button>
                                
                                <button 
                                    onClick={() => currentOrder ? setIsDiscountModalOpen(true) : toast.error(t('orderModal.saveOrderFirst'))}
                                    disabled={!currentOrder}
                                    className="py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-semibold hover:bg-blue-100 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Percent size={18} />
                                    {t('orderModal.discount')}
                                </button>

                                <button 
                                    onClick={handlePrintBill}
                                    disabled={!currentOrder}
                                    className="py-3 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-semibold hover:bg-emerald-200 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Printer size={18} />
                                    {t('orderModal.bill')}
                                </button>
                                <button 
                                    onClick={handlePayAndCloseRequest}
                                    disabled={!currentOrder}
                                    className="col-span-2 py-3 bg-blue-600 text-white border border-blue-700 rounded-xl font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <CreditCard size={18} />
                                    {t('orderModal.payAndClose')}
                                </button>

                                <button 
                                    onClick={() => {
                                        if (!currentOrder) return;
                                        setPendingCancelOrder(true);
                                        setIsPinPadOpen(true);
                                    }}
                                    disabled={!currentOrder}
                                    className="col-span-2 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-semibold hover:bg-red-100 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Ban size={18} />
                                    {t('common.cancelOrder')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub-Modals */}
                <BusinessLunchModal 
                    isOpen={isBusinessLunchOpen} 
                    onClose={() => setIsBusinessLunchOpen(false)}
                    categories={categories}
                    onConfirm={addBusinessLunch}
                />
            </div>

            {/* Security Modals */}
            {isPinPadOpen && (
                <PinPadModal
                    ref={pinPadRef}
                    title={t('orderModal.approvalRequired')}
                    description={
                        pendingDiscount ? t('orderModal.pinToAuthorizeDiscount') : 
                        pendingCancelOrder ? t('orderModal.pinToCancelOrder') : 
                        t('orderModal.pinToVoidItem')
                    }
                    onClose={() => {
                        setIsPinPadOpen(false);
                        setItemToVoid(null);
                        setPendingDiscount(null);
                        setPendingCancelOrder(false);
                    }}
                    onSuccess={handlePinSuccess}
                    isProcessing={isVoiding}
                />
            )}

            {isDiscountModalOpen && (
                <DiscountModal 
                    currentTotal={calculateSubtotal()}
                    onClose={() => setIsDiscountModalOpen(false)}
                    onConfirm={handleDiscountRequest}
                />
            )}

            <OrderModificationModal
                isOpen={editingItemIndex !== null}
                onClose={() => setEditingItemIndex(null)}
                item={editingItemIndex !== null ? cartItems[editingItemIndex] : null}
                onUpdate={handleModUpdate}
                onVoid={() => {
                    const idx = editingItemIndex;
                    setEditingItemIndex(null);
                    if (idx !== null) handleRemoveRequest(idx);
                }}
            />

            {isPaymentModalOpen && (
                <RestaurantPaymentModal 
                    isOpen={isPaymentModalOpen}
                    total={calculateTotal()}
                    onClose={() => setIsPaymentModalOpen(false)}
                    onComplete={handlePaymentComplete}
                />
            )}

            {paymentResult && currentOrder && (
                <RestaurantReceiptModal 
                    order={{...currentOrder, items: cartItems as OrderItem[]}}
                    profile={profile}
                    onClose={() => {
                        setPaymentResult(null);
                        onClose();
                    }}
                    paymentMethod={paymentResult.method}
                    amountPaid={paymentResult.amountPaid}
                    change={paymentResult.change}
                />
            )}

            {showBillPreview && currentOrder && (
                <RestaurantReceiptModal 
                    order={{...currentOrder, items: cartItems as OrderItem[]}}
                    profile={profile}
                    onClose={() => setShowBillPreview(false)}
                    viewOnly={true}
                />
            )}
        </>
    );
}

function UtensilsCrossedIcon({ size }: { size: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8" />
            <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2 0L19 10l-6-6" />
            <path d="m2.2 21.8 3.7-5" />
            <path d="m22 22-5-10-5 10" />
        </svg>
    );
}
