// ============================================================================
// MARKET LOGIC HOOK - Smart Scan Engine
// Handles barcode lookup, price-embedded parsing, and cart management
// ============================================================================

import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useMarketSounds } from './useMarketSounds';
import { toast } from 'sonner';
import type { MenuItem, BusinessSettings, MarketCartItem, PaymentMethod } from '../../../types/restaurant';

// ============================================================================
// TYPES
// ============================================================================

export interface UseMarketLogicOptions {
  settings: BusinessSettings | null;
  onPaymentComplete?: () => void;
  // The "Brain" injection point
  onProcessPayment?: (method: PaymentMethod, cart: MarketCartItem[]) => Promise<boolean>;
}

export interface UseMarketLogicReturn {
  // Cart State
  cart: MarketCartItem[];
  selectedIndex: number;
  total: number;
  subtotal: number;
  itemCount: number;
  totalProfit: number;
  
  // Actions
  handleScan: (code: string) => Promise<void>;
  addItem: (item: MenuItem, quantity?: number, weight?: number) => void;
  removeItem: (id: string) => void;
  incrementQuantity: () => void;
  decrementQuantity: () => void;
  voidSelected: () => void;
  clearCart: () => void;
  selectNext: () => void;
  selectPrevious: () => void;
  
  // Payment
  payCash: () => void;
  payCard: () => void;
  payBit: () => void;
  
  // Weight (Scale integration)
  setWeightForSelected: (weight: number) => void;
  
  // State
  isLoading: boolean;
  lastScannedId: string | null;
}

// ============================================================================
// HELPER: Parse price-embedded barcode
// Format: PP|IIIII|PPPPP|C (Prefix 2 | ItemID 5 | Price 5 | Checksum 1)
// ============================================================================

interface PriceEmbeddedBarcode {
  itemCode: string;
  embeddedPrice: number; // In cents or smallest currency unit
  isValid: boolean;
}

function parsePriceEmbeddedBarcode(code: string, prefix: string): PriceEmbeddedBarcode | null {
  // Check if barcode starts with expected prefix
  if (!code.startsWith(prefix)) {
    return null;
  }

  // Standard EAN-13 price-embedded format
  if (code.length !== 13) {
    return null;
  }

  try {
    // Extract components
    // Format: PP (prefix) | IIIII (item code) | PPPPP (price) | C (checksum)
    const itemCode = code.substring(prefix.length, prefix.length + 5);
    const priceStr = code.substring(prefix.length + 5, prefix.length + 10);
    
    const embeddedPrice = parseInt(priceStr, 10);

    if (isNaN(embeddedPrice)) {
      return null;
    }

    return {
      itemCode,
      embeddedPrice, // Price is in cents (e.g., 01234 = $12.34)
      isValid: true,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useMarketLogic(options: UseMarketLogicOptions): UseMarketLogicReturn {
  const { settings, onPaymentComplete, onProcessPayment } = options;
  const { user } = useAuth();
  const { playSuccess, playError } = useMarketSounds();

  // State
  const [cart, setCart] = useState<MarketCartItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);

  // Computed values
  const subtotal = useMemo(() => 
    cart.reduce((sum, item) => sum + item.lineTotal, 0), 
    [cart]
  );

  const total = useMemo(() => {
    // Add tax if needed (simplified - assumes tax included)
    return subtotal;
  }, [subtotal]);

  const itemCount = useMemo(() => 
    cart.reduce((sum, item) => sum + item.quantity, 0), 
    [cart]
  );

  const totalProfit = useMemo(() => {
    return cart.reduce((sum, item) => {
      const cost = item.menuItem.cost_price || 0;
      const profitPerUnit = item.unitPrice - cost;
      
      // Calculate based on quantity or weight
      const itemProfit = item.isWeighed 
        ? profitPerUnit * (item.weight || 0)
        : profitPerUnit * item.quantity;
        
      return sum + itemProfit;
    }, 0);
  }, [cart]);

  // ============================================================================
  // LOOKUP: Find item by barcode
  // ============================================================================

  const lookupByBarcode = useCallback(async (barcode: string): Promise<MenuItem | null> => {
    if (!user?.id) return null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('restaurant_menu_items')
        .select('*, category:restaurant_menu_categories(name)')
        .eq('barcode', barcode)
        .maybeSingle();

      if (error) {
        console.error('Barcode lookup error:', error);
        return null;
      }

      return data as MenuItem | null;
    } catch (e) {
      console.error('Barcode lookup failed:', e);
      return null;
    }
  }, [user?.id]);

  const lookupByItemCode = useCallback(async (itemCode: string): Promise<MenuItem | null> => {
    if (!user?.id) return null;

    try {
      // Try to find by partial barcode match or ID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('restaurant_menu_items')
        .select('*, category:restaurant_menu_categories(name)')
        .ilike('barcode', `%${itemCode}%`)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Item code lookup error:', error);
        return null;
      }

      return data as MenuItem | null;
    } catch (e) {
      console.error('Item code lookup failed:', e);
      return null;
    }
  }, [user?.id]);

  // ============================================================================
  // CART ACTIONS
  // ============================================================================

  const addItem = useCallback((
    menuItem: MenuItem, 
    quantity: number = 1, 
    weight?: number
  ) => {
    const isWeighed = weight !== undefined && weight > 0;
    const unitPrice = menuItem.price;
    const lineTotal = isWeighed 
      ? Math.round(unitPrice * weight * 100) / 100 
      : unitPrice * quantity;

    const newItem: MarketCartItem = {
      id: `${menuItem.id}-${Date.now()}`,
      menuItem,
      quantity: isWeighed ? 1 : quantity,
      weight: isWeighed ? weight : undefined,
      unitPrice,
      lineTotal,
      isWeighed,
      scannedAt: Date.now(),
    };

    setCart(prev => {
      // For non-weighed items, check if same item already in cart
      if (!isWeighed) {
        const existingIndex = prev.findIndex(
          item => item.menuItem.id === menuItem.id && !item.isWeighed
        );

        if (existingIndex !== -1) {
          // Update existing item quantity
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + quantity,
            lineTotal: (updated[existingIndex].quantity + quantity) * unitPrice,
            scannedAt: Date.now(),
          };
          setSelectedIndex(existingIndex);
          setLastScannedId(updated[existingIndex].id);
          return updated;
        }
      }

      // Add new item
      const newCart = [...prev, newItem];
      setSelectedIndex(newCart.length - 1);
      setLastScannedId(newItem.id);
      return newCart;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart(prev => {
      const newCart = prev.filter(item => item.id !== id);
      setSelectedIndex(i => Math.min(i, newCart.length - 1));
      return newCart;
    });
  }, []);

  const incrementQuantity = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= cart.length) return;
    
    setCart(prev => {
      const updated = [...prev];
      const item = updated[selectedIndex];
      
      if (item.isWeighed) return prev; // Can't increment weighed items
      
      updated[selectedIndex] = {
        ...item,
        quantity: item.quantity + 1,
        lineTotal: (item.quantity + 1) * item.unitPrice,
      };
      return updated;
    });
  }, [selectedIndex, cart.length]);

  const decrementQuantity = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= cart.length) return;
    
    setCart(prev => {
      const updated = [...prev];
      const item = updated[selectedIndex];
      
      if (item.isWeighed) return prev; // Can't decrement weighed items
      
      if (item.quantity <= 1) {
        // Remove item if quantity would be 0
        const newCart = updated.filter((_, i) => i !== selectedIndex);
        setSelectedIndex(i => Math.min(i, newCart.length - 1));
        return newCart;
      }
      
      updated[selectedIndex] = {
        ...item,
        quantity: item.quantity - 1,
        lineTotal: (item.quantity - 1) * item.unitPrice,
      };
      return updated;
    });
  }, [selectedIndex, cart.length]);

  const voidSelected = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= cart.length) return;
    
    const item = cart[selectedIndex];
    removeItem(item.id);
    toast.info(`Voided: ${item.menuItem.name}`);
  }, [selectedIndex, cart, removeItem]);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedIndex(-1);
    setLastScannedId(null);
  }, []);

  const selectNext = useCallback(() => {
    setSelectedIndex(prev => Math.min(prev + 1, cart.length - 1));
  }, [cart.length]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex(prev => Math.max(prev - 1, 0));
  }, []);

  // ============================================================================
  // SMART SCAN HANDLER
  // ============================================================================

  const handleScan = useCallback(async (code: string) => {
    if (!code || code.length < 3) return;

    setIsLoading(true);

    try {
      const scalePrefix = settings?.market_scale_prefix || '20';

      // Scenario B: Check for price-embedded barcode
      const priceEmbedded = parsePriceEmbeddedBarcode(code, scalePrefix);

      if (priceEmbedded) {
        // It's a scale/deli barcode
        const item = await lookupByItemCode(priceEmbedded.itemCode);

        if (item) {
          // Calculate weight from embedded price
          const embeddedPriceInUnits = priceEmbedded.embeddedPrice / 100;
          const weight = item.price > 0 ? embeddedPriceInUnits / item.price : 0;

          addItem(item, 1, weight);
          playSuccess();
          toast.success(`${item.name} - ${weight.toFixed(3)}kg`);
        } else {
          playError();
          toast.error(`Product not found: ${priceEmbedded.itemCode}`);
        }
        return;
      }

      // Scenario A: Standard barcode lookup
      const item = await lookupByBarcode(code);

      if (item) {
        addItem(item);
        playSuccess();
        // Don't show toast for every scan - the cart update is feedback enough
      } else {
        // Scenario C: Not found
        playError();
        toast.error(`Product not found: ${code}`);
      }
    } catch (error) {
      console.error('Scan error:', error);
      playError();
      toast.error('Scan failed');
    } finally {
      setIsLoading(false);
    }
  }, [settings, lookupByBarcode, lookupByItemCode, addItem, playSuccess, playError]);

  // ============================================================================
  // WEIGHT (Scale Integration)
  // ============================================================================

  const setWeightForSelected = useCallback((weight: number) => {
    if (selectedIndex < 0 || selectedIndex >= cart.length) {
      toast.warning('No item selected');
      return;
    }

    setCart(prev => {
      const updated = [...prev];
      const item = updated[selectedIndex];
      
      updated[selectedIndex] = {
        ...item,
        weight,
        isWeighed: true,
        lineTotal: Math.round(item.unitPrice * weight * 100) / 100,
      };
      return updated;
    });
  }, [selectedIndex, cart.length]);

  // ============================================================================
  // PAYMENT - Manual Recording (Smart Ledger Logic)
  // ============================================================================

  const recordTransaction = useCallback(async (method: PaymentMethod) => {
    if (cart.length === 0) {
      toast.warning('Cart is empty');
      return;
    }

    setIsLoading(true);

    try {
      // 1. If external processor provided (The "Brain" Transplant), use it
      if (onProcessPayment) {
        const success = await onProcessPayment(method, cart);
        if (success) {
          playSuccess();
          // Toast handled by processor usually, but we can do it here too
          // toast.success(`Paid ${method.toUpperCase()}`);
          clearCart();
          onPaymentComplete?.();
        } else {
             playError();
        }
        return;
      }

      // 2. Fallback to old simple recording (Legacy)
      if (!user?.id) return;
      
      const { error } = await supabase
        .from('restaurant_orders')
        .insert({
           business_id: user.id,
           // ... (rest of old logic)
           order_type: 'takeaway',
           status: 'closed',
           subtotal_amount: subtotal,
           total_amount: total,
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           payment_method: method as any,
           payment_status: 'paid',
           currency: 'ILS',
           created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to record transaction:', error);
        toast.error('Failed to save record');
        return; 
      }

      playSuccess();
      toast.success(`Recorded: ${method.toUpperCase()} - ₪${total.toFixed(2)}`);
      clearCart();
      onPaymentComplete?.();

    } catch (e) {
      console.error('Transaction error:', e);
      toast.error('Error recording transaction');
    } finally {
      setIsLoading(false);
    }
  }, [cart, subtotal, total, playSuccess, clearCart, onPaymentComplete, onProcessPayment, user?.id, playError]);

  const payCash = useCallback(() => recordTransaction('cash'), [recordTransaction]);
  const payCard = useCallback(() => recordTransaction('card'), [recordTransaction]);
  const payBit = useCallback(() => recordTransaction('bit'), [recordTransaction]);

  return {
    // Cart State
    cart,
    selectedIndex,
    total,
    subtotal,
    itemCount,
    totalProfit,
    
    // Actions
    handleScan,
    addItem,
    removeItem,
    incrementQuantity,
    decrementQuantity,
    voidSelected,
    clearCart,
    selectNext,
    selectPrevious,
    
    // Payment
    payCash,
    payCard,
    payBit,
    
    // Weight
    setWeightForSelected,
    
    // State
    isLoading,
    lastScannedId,
  };
}
