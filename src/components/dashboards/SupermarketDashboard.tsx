// ============================================================================
// SUPERMARKET POS DASHBOARD - Point of Sale System
// Version: 1.0.0 | Full-Featured POS for Grocery/Supermarket
// ============================================================================

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  ShoppingCart,
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  X,
  Check,
  Receipt,
  Scale,
  Package,
  ChevronLeft,
  Edit2,
  ScanBarcode
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { supabase } from "../../lib/supabase";
import AddProductModal from "../market/AddProductModal";
import ReceiptModal from "../market/ReceiptModal";
import { ConfirmationModal } from '../ui/ConfirmationModal';
import useScanDetection from "../../hooks/useScanDetection";
import { playSuccess, playError } from "../../utils/audio";
import { Toaster, toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

type ProductType = "unit" | "weight";
type PaymentMethod = "cash" | "card" | "digital";

interface Product {
  id: string;
  barcode: string | null;
  name: string;
  nameHe: string;
  price: number;
  type: ProductType;
  category: string | null;
  image_url?: string | null;
}

interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  weight?: number; // For weight-based items (kg)
}

interface TransactionRecord {
  id: string;
  items: CartItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  change: number;
  timestamp: Date;
  receiptNumber: string;
}


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================



const VAT_RATE = 0.17; // 17% Israeli VAT

function calculatePriceFromVATInclusive(totalWithVAT: number) {
  const beforeVAT = totalWithVAT / (1 + VAT_RATE);
  const vatAmount = totalWithVAT - beforeVAT;
  return { beforeVAT, vatAmount };
}

function generateReceiptNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `INV-${dateStr}-${random}`;
}

// ============================================================================
// WEIGHT INPUT MODAL
// ============================================================================

interface WeightModalProps {
  product: Product;
  initialWeight?: number;
  onConfirm: (weight: number) => void;
  onCancel: () => void;
}

function WeightModal({ product, initialWeight, onConfirm, onCancel }: WeightModalProps) {
  const { t, direction, language } = useLanguage();
  const [weight, setWeight] = useState(initialWeight ? initialWeight.toString() : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const w = parseFloat(weight);
    if (w > 0) {
      onConfirm(w);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl" dir={direction}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <Scale className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
              {language === 'he' ? product.nameHe : (product.name || product.nameHe)}
            </h3>
            <p className="text-sm text-slate-500">₪{product.price.toFixed(2)} {t('market.weightKg')}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {t('market.modal.weight') || 'Weight'} (Kg)
          </label>
          <input
            ref={inputRef}
            type="number"
            step="0.001"
            min="0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full px-4 py-3 text-2xl text-center border-2 border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-green-500 focus:ring-2 focus:ring-green-200"
            placeholder="0.000"
          />
        </div>

        {weight && parseFloat(weight) > 0 && (
          <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-3 mb-4 text-center">
            <span className="text-lg font-bold text-green-600 dark:text-green-400">
              {t('market.orderModal.total') || 'Total'}: ₪{(parseFloat(weight) * product.price).toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 border-2 border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {t('market.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!weight || parseFloat(weight) <= 0}
            className="flex-1 py-3 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('market.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAYMENT MODAL
// ============================================================================

interface PaymentModalProps {
  total: number;
  onComplete: (method: PaymentMethod, amountPaid: number) => void;
  onCancel: () => void;
}

function PaymentModal({ total, onComplete, onCancel }: PaymentModalProps) {
  const { t, direction } = useLanguage();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const cashInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (method === "cash") {
      cashInputRef.current?.focus();
    }
  }, [method]);

  const change = method === "cash" && cashAmount ? parseFloat(cashAmount) - total : 0;

  const handleComplete = () => {
    if (method === "cash") {
      const paid = parseFloat(cashAmount) || 0;
      if (paid >= total) {
        onComplete(method, paid);
      }
    } else if (method) {
      onComplete(method, total);
    }
  };

  const quickCashAmounts = [50, 100, 200, 500];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" dir={direction}>
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 p-6 text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{t('market.payment')}</h2>
            <button onClick={onCancel} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-4 text-center">
            <p className="text-green-100 text-sm">{t('market.totalToPay')}</p>
            <p className="text-4xl font-bold">₪{total.toFixed(2)}</p>
          </div>
        </div>

        <div className="p-6">
          {/* Payment Method Selection */}
          {!method && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">{t('market.payment')}:</p>
              
              <button
                onClick={() => setMethod("cash")}
                className="w-full flex items-center gap-4 p-4 border-2 border-slate-200 dark:border-slate-600 rounded-xl hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
              >
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <Banknote className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 dark:text-white">{t('market.cash')}</p>
                  <p className="text-sm text-slate-500">{t('market.cash')}</p>
                </div>
              </button>

              <button
                onClick={() => setMethod("card")}
                className="w-full flex items-center gap-4 p-4 border-2 border-slate-200 dark:border-slate-600 rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
              >
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 dark:text-white">{t('market.creditCard')}</p>
                  <p className="text-sm text-slate-500">Visa / Mastercard / Amex</p>
                </div>
              </button>

              <button
                onClick={() => setMethod("digital")}
                className="w-full flex items-center gap-4 p-4 border-2 border-slate-200 dark:border-slate-600 rounded-xl hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
              >
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 dark:text-white">{t('market.digitalWallet')}</p>
                  <p className="text-sm text-slate-500">Bit / PayBox / Apple Pay</p>
                </div>
              </button>
            </div>
          )}

          {/* Cash Payment */}
          {method === "cash" && (
            <div className="space-y-4">
              <button
                onClick={() => setMethod(null)}
                className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t('admin.table.back') || 'Back'}</span>
              </button>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('market.payment')}
                </label>
                <input
                  ref={cashInputRef}
                  type="number"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full px-4 py-4 text-2xl text-center border-2 border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-green-500 focus:ring-2 focus:ring-green-200"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                {quickCashAmounts.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setCashAmount(amount.toString())}
                    className="py-2 px-3 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    ₪{amount}
                  </button>
                ))}
              </div>

              {parseFloat(cashAmount) >= total && (
                <div className="bg-green-100 dark:bg-green-900/30 rounded-xl p-4 text-center">
                  <p className="text-sm text-green-700 dark:text-green-300">{t('market.change')}</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    ₪{change.toFixed(2)}
                  </p>
                </div>
              )}

              <button
                onClick={handleComplete}
                disabled={!cashAmount || parseFloat(cashAmount) < total}
                className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                {t('market.makePayment')}
              </button>
            </div>
          )}

          {/* Card/Digital Payment */}
          {(method === "card" || method === "digital") && (
            <div className="space-y-4">
              <button
                onClick={() => setMethod(null)}
                className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t('admin.table.back') || 'Back'}</span>
              </button>

              <div className="bg-slate-100 dark:bg-slate-700 rounded-xl p-6 text-center">
                {method === "card" ? (
                  <CreditCard className="w-16 h-16 mx-auto text-blue-500 mb-4" />
                ) : (
                  <Smartphone className="w-16 h-16 mx-auto text-purple-500 mb-4" />
                )}
                <p className="text-lg text-slate-700 dark:text-slate-300">
                  {method === "card" ? t('market.creditCard') : t('market.digitalWallet')}
                </p>
              </div>

              <button
                onClick={handleComplete}
                className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                {t('market.confirm')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RECEIPT MODAL
// ============================================================================





// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Defines interfaces for data structures
interface Category {
  id: string;
  name: string;
  name_he?: string | null;
  sort_order?: number;
  business_id?: string;
}

interface MenuItemResponse {
  id: string;
  barcode: string | null;
  name: string;
  name_he: string | null;
  price: number;
  type: string;
  category_id: string | null;
  image_url?: string | null;
  business_id: string;
  is_available: boolean;
}

export default function SupermarketDashboard() {
  const { profile, user } = useAuth();
  const { formatCurrency, t, language, direction } = useLanguage();

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [categories, setCategories] = useState<Category[]>([{ id: 'all', name_he: t('market.categories.all'), name: 'All' }]);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteProductConfirmationId, setDeleteProductConfirmationId] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [weightModalProduct, setWeightModalProduct] = useState<Product | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<TransactionRecord | null>(null);
  const [showScanOverlay, setShowScanOverlay] = useState(false); // Dedicated Scan Mode Overlay
  const [initialBarcode, setInitialBarcode] = useState(""); // For adding product from scan

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Fetch products & Categories
  const fetchData = useCallback(async () => {
    try {
      if (!user) return;
      setLoadingProducts(true);
      
      const [productsRes, categoriesRes] = await Promise.all([
        supabase
          .from('restaurant_menu_items')
          .select('*')
          .eq('business_id', user.id)
          .eq('is_available', true),
        supabase
          .from('restaurant_menu_categories')
          .select('*')
          .eq('business_id', user.id)
          .order('sort_order', { ascending: true })
      ]);

      if (productsRes.error) throw productsRes.error;
      
      // Update Categories
      if (categoriesRes.data && categoriesRes.data.length > 0) {
        // Deduplicate categories by name_he
        const uniqueCategories = [
          ...new Map(categoriesRes.data.map((item: Category) => [item.name_he || item.name, item])).values() // Fallback to name if name_he is missing, though duplicates might still exist if mixed
        ].filter(item => item.name_he || item.name); // Ensure valid items

        // Double check against 'General' if we want to handle it (but we commented it out)
        
        setCategories([
          { id: 'all', name_he: t('market.categories.all'), name: 'All' }, 
          ...uniqueCategories
        ]);
      } else {
        // Fallback if no categories yet (should be seeded by AddModal, but just in case)
        setCategories([{ id: 'all', name_he: t('market.categories.all'), name: 'All' }]);
      }

      // Map DB items to Product interface
      const productsData: Product[] = ((productsRes.data as unknown) as MenuItemResponse[] || []).map(item => ({
        id: item.id,
        barcode: item.barcode,
        name: item.name,
        nameHe: item.name_he || item.name, // Use name_he column if available, else name
        price: item.price,
        type: item.type === 'weight' ? 'weight' : 'unit',
        category: item.category_id || 'general',
        image_url: item.image_url
      }));

      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoadingProducts(false);
    }
  }, [user, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Global Scan Handler
  const handleGlobalScan = (scannedCode: string) => {
    // 1. Try to find exact match (Unit items)
    let product = products.find((p) => p.barcode === scannedCode);
    let weight = 0;

    // 2. If not found, check for Smart Barcode (Weight embedded)
    // Format: 21 PPPPP WWWWW C (EAN-13)
    if (!product && scannedCode.length === 13 && scannedCode.startsWith("21")) {
      const plu = scannedCode.substring(2, 7); // Digits 2-6 (5 digits)
      const weightRaw = scannedCode.substring(7, 12); // Digits 7-11 (5 digits)
      
      // Find product by PLU (assuming PLU is stored in barcode field)
      // Note: In real world, PLU might be separate field. Here we check if barcode ends with PLU or equals PLU
      product = products.find((p) => p.barcode === plu || p.barcode?.endsWith(plu));
      
      if (product && product.type === 'weight') {
        weight = parseInt(weightRaw, 10) / 1000; // Convert to Kg
      }
    }

    if (product) {
      playSuccess(); // BEEP
      addToCart(product, weight > 0 ? weight : undefined);
      setBarcodeInput(""); // Clear manual input if focused
      toast.success(t('market.productAdded') || "Product added");
    } else {
      playError(); // ERROR BEEP
      console.warn("Product not found:", scannedCode);
      toast.error(t('market.productNotFound') || "Product not found", {
        action: {
          label: t('market.addProduct') || 'Add Product',
          onClick: () => {
             setInitialBarcode(scannedCode);
             setEditingProduct(null);
             setShowAddProduct(true);
             setShowScanOverlay(false);
          }
        },
        duration: 5000,
      });
      // Keep scanning state active
    }
  };

  // Initialize Scan Detection
  useScanDetection({
    onScan: handleGlobalScan,
    minLength: 3,
    ignoreIfFocusOn: ['INPUT', 'TEXTAREA'] // Ignore if input is focused (let the manual input handler handle it)
  });

  // Focus barcode input on mount (Manual entry fallback)
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory; 
      const matchesSearch =
        searchQuery === "" ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.nameHe.includes(searchQuery) ||
        (product.barcode && product.barcode.includes(searchQuery));
      return matchesCategory && matchesSearch; // Relaxing category filter for now until we map categories properly
    });
  }, [selectedCategory, searchQuery, products]);

  // Cart calculations
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      if (item.product.type === "weight") {
        return sum + (item.weight || 0) * item.product.price;
      }
      return sum + item.quantity * item.product.price;
    }, 0);
  }, [cart]);

  const { beforeVAT, vatAmount } = calculatePriceFromVATInclusive(cartTotal);

  // Add product to cart
  const addToCart = (product: Product, weight?: number) => {
    setCart((prev) => {
      if (product.type === "weight" && weight) {
        // Weight-based items always add as new entry
        return [
          ...prev,
          {
            id: `${product.id}-${Date.now()}`,
            product,
            quantity: 1,
            weight,
          },
        ];
      }

      // Unit-based: check if exists
      const existing = prev.find((item) => item.product.id === product.id && item.product.type === "unit");
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...prev, { id: `${product.id}-${Date.now()}`, product, quantity: 1 }];
    });
  };

  // Handle product click
  const handleProductClick = (product: Product) => {
    if (product.type === "weight") {
      setWeightModalProduct(product);
    } else {
      addToCart(product);
    }
  };

  // Handle barcode scan (Manual Input)
  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && barcodeInput.trim()) {
      handleGlobalScan(barcodeInput.trim());
    }
  };

  // Update cart item quantity
  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : item;
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  // Remove from cart
  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
  };

  // Update Item Weight
  const updateItemWeight = (itemId: string, newWeight: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, weight: newWeight } : item
      )
    );
  };

  // Complete payment
  const handlePaymentComplete = (method: PaymentMethod, amountPaid: number) => {
    const transaction: TransactionRecord = {
      id: crypto.randomUUID(),
      items: [...cart],
      subtotal: beforeVAT,
      vatAmount,
      total: cartTotal,
      paymentMethod: method,
      amountPaid,
      change: method === "cash" ? amountPaid - cartTotal : 0,
      timestamp: new Date(),
      receiptNumber: generateReceiptNumber(),
    };

    setCompletedTransaction(transaction);
    setShowPaymentModal(false);
    clearCart();
  };

  const handleEditProductClick = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProduct(product);
    setShowAddProduct(true);
  };

  const handleDeleteProductClick = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteProductConfirmationId(productId);
  };

  const confirmDeleteProduct = async () => {
    if (!deleteProductConfirmationId) return;
    try {
      const { error } = await supabase
        .from('restaurant_menu_items')
        .delete()
        .eq('id', deleteProductConfirmationId);
        
      if (error) throw error;
      
      setProducts(prev => prev.filter(p => p.id !== deleteProductConfirmationId));
      setDeleteProductConfirmationId(null);
      setDeleteProductConfirmationId(null);
      toast.success(t('market.deleteSuccess'));
    } catch (error: unknown) {
      console.error('Error deleting product:', error);
      toast.error(t('market.saveError') + ': ' + ((error as Error)?.message || t('auth.error')));
    }
  };

  const handleSaveTransaction = async (print: boolean) => {
    if (!completedTransaction || !user) return;

    try {
      // Insert into market_transactions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('market_transactions' as any).insert({
        business_id: user.id,
        receipt_number: completedTransaction.receiptNumber,
        items: completedTransaction.items,
        subtotal: completedTransaction.subtotal,
        vat_amount: completedTransaction.vatAmount,
        total_amount: completedTransaction.total,
        payment_method: completedTransaction.paymentMethod,
        amount_paid: completedTransaction.amountPaid,
        change_amount: completedTransaction.change,
        created_at: completedTransaction.timestamp.toISOString()
      });

      if (error) throw error;

      if (print) {
        window.print();
      }

      setCompletedTransaction(null); // Close modal
      toast.success('העסקה נשמרה בהצלחה');
    } catch (error: unknown) {
      console.error('Error saving transaction:', error);
      toast.error('שגיאה בשמירת העסקה: ' + ((error as Error).message || 'שגיאה לא ידועה'));
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-slate-100 dark:bg-slate-900 overflow-hidden relative" dir={direction}>
      <Toaster position="top-center" richColors />
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-slate-900/0 to-slate-900/0 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-500/5 via-slate-900/0 to-slate-900/0 pointer-events-none" />

      {/* Weight Modal */}
      {(weightModalProduct || editingCartItem) && (
        <WeightModal
          product={weightModalProduct || editingCartItem!.product}
          initialWeight={editingCartItem?.weight}
          onConfirm={(weight) => {
            if (editingCartItem) {
               updateItemWeight(editingCartItem.id, weight);
               setEditingCartItem(null);
            } else if (weightModalProduct) {
              addToCart(weightModalProduct, weight);
              setWeightModalProduct(null);
            }
          }}
          onCancel={() => {
            setWeightModalProduct(null);
            setEditingCartItem(null);
          }}
        />
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          total={cartTotal}
          onComplete={handlePaymentComplete}
          onCancel={() => setShowPaymentModal(false)}
        />
      )}

      {/* Receipt Modal */}
      {completedTransaction && (
        <ReceiptModal
          transaction={completedTransaction}
          profile={profile}
          onClose={() => setCompletedTransaction(null)} // Save nothing, just close
          onSave={handleSaveTransaction}
        />
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <AddProductModal 
          onClose={() => {
            setShowAddProduct(false);
            setEditingProduct(null);
            setInitialBarcode("");
          }}
          onSuccess={() => {
            fetchData();
            setEditingProduct(null);
            setShowAddProduct(false);
            setInitialBarcode("");
          }}
          product={editingProduct ? { 
            ...editingProduct, 
            category_id: editingProduct.category || '', 
            name_he: editingProduct.nameHe,
            description: '',
            is_available: true,
            tax_rate: 0,
            prep_time_minutes: 0,
            station: 'general',
            allergen_codes: [],
            sort_order: 0,
            is_popular: false,
            is_new: false,
            created_at: new Date().toISOString()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any : null} 
          initialBarcode={initialBarcode}
        />
      )}
      
      <ConfirmationModal 
        isOpen={!!deleteProductConfirmationId}
        onClose={() => setDeleteProductConfirmationId(null)}
        onConfirm={confirmDeleteProduct}
        title={t('market.deleteConfirmTitle')}
        description={t('market.deleteConfirmDesc')}
        variant="danger"
        confirmText={t('market.delete')}
        cancelText={t('market.cancel')}
      />

      {/* MAIN CONTENT AREA - GRID & SIDEBAR */}
      <div className="flex w-full h-full p-3 gap-3 relative z-10">
        
        {/* LEFT ISLAND: STORE & PRODUCTS */}
        <div className="flex-1 flex flex-col bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-[2rem] shadow-2xl overflow-hidden relative group/store">
          
          {/* Header Section */}
          <div className="p-5 border-b border-slate-200/50 dark:border-white/5 space-y-4">
            <div className="flex flex-col lg:flex-row gap-4">
              
              {/* Scan Button & Input */}
              <div className="flex-[2] flex relative">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={handleBarcodeScan}
                    autoFocus
                    className="opacity-0 absolute top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none"
                  />
                  
                 <button
                   type="button"
                   onClick={() => setShowScanOverlay(true)}
                   className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 group/scan"
                 >
                   <ScanBarcode className="w-6 h-6 group-hover/scan:animate-pulse" />
                   <span>{t('market.scan') || 'Scan Product'}</span>
                 </button>
              </div>

              {/* Search Bar */}
              <div className="flex-[3] relative group/search">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within/search:text-emerald-500 transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('market.searchPlaceholder')}
                  className="w-full h-12 pr-12 pl-6 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-transparent focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-emerald-500/10 transition-all text-slate-900 dark:text-white placeholder-slate-400 font-medium"
                />
              </div>

              {/* Admin Actions */}
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`h-12 w-12 flex items-center justify-center rounded-2xl transition-all ${isEditMode ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                  title={t('market.editMode')}
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                
                <button
                  onClick={() => {
                    setEditingProduct(null);
                    setShowAddProduct(true);
                  }}
                  className="h-12 w-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/40 hover:scale-110 active:scale-90"
                  title={t('market.addProduct')}
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-300 ${
                    selectedCategory === cat.id
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-500/50 ring-offset-2 dark:ring-offset-slate-900 scale-105"
                      : "bg-white dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200/50 dark:border-white/5"
                  }`}
                >
                  {(() => {
                    if (cat.id === 'all') return t('market.categories.all');
                    const normalizedName = (cat.name || '').toLowerCase().trim();
                    const categoryMap: Record<string, string> = {
                      'general': 'general', 'dairy': 'dairy', 'dairy products': 'dairy', 'bakery': 'bakery',
                      'baked goods': 'bakery', 'produce': 'produce', 'vegetables and fruits': 'fruitVeg',
                      'fruit & veg': 'fruitVeg', 'meat': 'meat', 'beverages': 'beverages',
                      'pantry': 'pantry', 'dry food': 'pantry', 'cleaning': 'cleaning', 'cleaning products': 'cleaning'
                    };
                    const key = categoryMap[normalizedName];
                    return key ? t(`market.categories.${key}`) : (language === 'he' ? (cat.name_he || cat.name) : (cat.name || cat.name_he));
                  })()}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            {loadingProducts ? (
               <div className="flex flex-col items-center justify-center h-full text-slate-400">
                 <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-emerald-500 animate-spin" />
                    <Package className="absolute inset-0 m-auto w-6 h-6 text-slate-400" />
                 </div>
                 <p className="mt-4 font-medium animate-pulse">{t('market.loading')}</p>
               </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={(e) => isEditMode ? handleEditProductClick(product, e) : handleProductClick(product)}
                  className={`
                    group relative flex flex-col items-center p-3 rounded-[1.5rem] transition-all duration-300 cursor-pointer overflow-hidden
                    bg-white dark:bg-slate-800/50 border border-slate-100 dark:border-white/5
                    hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1 hover:border-emerald-500/30 dark:hover:border-emerald-500/30
                    ${isEditMode ? 'ring-4 ring-amber-400/50 scale-95 animate-pulse' : ''}
                  `}
                >
                   {/* Selection Ring effect on click could go here */}
                  
                  {isEditMode && (
                    <button 
                      onClick={(e) => handleDeleteProductClick(product.id, e)}
                      className="absolute top-2 right-2 z-20 p-2 bg-rose-500 text-white rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform hover:bg-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  
                  {/* Product Image Container */}
                  <div className="w-full aspect-square bg-slate-50 dark:bg-slate-900/50 rounded-2xl mb-3 relative overflow-hidden flex items-center justify-center group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition-colors">
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={product.name} 
                        className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" 
                      />
                    ) : (
                        product.type === "weight" ? 
                        <Scale className="w-12 h-12 text-emerald-500/30 group-hover:text-emerald-500 group-hover:scale-110 transition-all duration-500" /> : 
                        <Package className="w-12 h-12 text-blue-500/30 group-hover:text-blue-500 group-hover:scale-110 transition-all duration-500" />
                    )}
                    
                    {/* Floating Price Tag */}
                    <div className="absolute bottom-2 right-2 bg-emerald-600/90 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-lg shadow-lg transform translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                      ₪{product.price.toFixed(2)}
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="w-full text-center space-y-1">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight line-clamp-2 min-h-[2.5em]">
                      {language === 'he' ? product.nameHe : (product.name || product.nameHe)}
                    </h3>
                    
                    <div className="flex items-center justify-center gap-1">
                       <p className="text-emerald-600 dark:text-emerald-400 font-extrabold text-lg">
                         ₪{product.price.toFixed(2)}
                       </p>
                       {product.type === "weight" && (
                         <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
                           {t('market.weightKg')}
                         </span>
                       )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
            
            {/* Visual Scan Overlay */}
            {showScanOverlay && (
              <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-fadeIn" onClick={() => setShowScanOverlay(false)}>
                <div 
                  className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center relative overflow-hidden border border-white/10" 
                  onClick={e => e.stopPropagation()}
                >
                   {/* Fancy Animation and UI same as before but cleaner */}
                   <button onClick={() => setShowScanOverlay(false)} className="absolute top-6 right-6 p-2 bg-slate-100 dark:bg-slate-700/50 rounded-full hover:bg-slate-200 transition-colors">
                     <X className="w-6 h-6 text-slate-500" />
                   </button>
                   <div className="mb-6 relative mx-auto w-64 h-40 bg-slate-950 rounded-2xl flex items-center justify-center border-2 border-slate-800 overflow-hidden shadow-inner">
                      <Barcode className="w-40 h-40 text-slate-800 opacity-50" />
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500 shadow-[0_0_30px_rgb(239,68,68)] animate-[scan_2s_ease-in-out_infinite]" />
                   </div>
                   <h2 className="text-2xl font-bold text-white mb-2">{t('market.readyToScan')}</h2>
                   <p className="text-slate-400 mb-6">{t('market.scanInstructions') || "Point scanner at product"}</p>
                   
                   <input
                        autoFocus
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter' && barcodeInput.trim()) handleGlobalScan(barcodeInput.trim());
                           if (e.key === 'Escape') setShowScanOverlay(false);
                        }}
                        placeholder={t('market.barcodePlaceholder')}
                        className="w-full py-3 px-4 rounded-xl bg-slate-900 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-center text-white font-mono transition-all"
                   />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT ISLAND: CART SIDEBAR */}
        <div className={`w-96 flex flex-col bg-slate-900/90 dark:bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden shrink-0 transition-all duration-300 ${cart.length === 0 ? 'opacity-90' : 'opacity-100'}`}>
          
          {/* Header */}
          <div className="p-5 flex items-center justify-between border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-white leading-none">{t('market.cart')}</h2>
                <span className="text-xs text-slate-400">{cart.length} items</span>
              </div>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-white/40 hover:text-rose-400 transition-colors p-2 hover:bg-white/5 rounded-lg tooltip"
                title={t('common.void')}
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {cart.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 opacity-50">
                 <ShoppingCart className="w-20 h-20 stroke-1" />
                 <p>{t('market.cartEmpty')}</p>
               </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-2xl p-3 flex items-center gap-3 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-200 text-sm truncate">
                      {language === 'he' ? item.product.nameHe : (item.product.name || item.product.nameHe)}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-slate-500 font-mono">
                        ₪{item.product.price.toFixed(2)}
                      </p>
                      {item.product.type === "weight" && (
                         <button 
                           onClick={() => setEditingCartItem(item)}
                           className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 text-[10px] rounded hover:bg-sky-500/30 transition-colors flex items-center gap-1"
                         >
                           <Edit2 className="w-2.5 h-2.5" />
                           {item.weight}kg
                         </button>
                      )}
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  {item.product.type === "unit" ? (
                    <div className="flex items-center bg-slate-950/50 rounded-lg p-0.5 border border-white/5">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-white font-mono">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="px-2 py-1 bg-slate-950/50 rounded-lg border border-white/5 text-slate-400 text-xs font-mono">
                       {(item.weight || 0).toFixed(3)}kg
                    </div>
                  )}

                  {/* Price */}
                  <div className="text-right min-w-[3.5rem]">
                    <p className="font-bold text-emerald-400 text-sm">
                      {formatCurrency(
                        item.product.type === "weight"
                          ? (item.weight || 0) * item.product.price
                          : item.quantity * item.product.price
                      )}
                    </p>
                  </div>
                  
                  {/* Delete (Hover only) */}
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer / Total */}
          <div className="p-5 bg-gradient-to-t from-slate-900/90 to-slate-900/0 pt-10 mt-auto space-y-4">
             {cart.length > 0 && (
               <>
                 <div className="space-y-1 py-3 border-t border-white/10">
                   <div className="flex justify-between text-xs text-slate-500">
                     <span>{t('market.beforeVat')}</span>
                     <span>₪{beforeVAT.toFixed(2)}</span>
                   </div>
                   <div className="flex justify-between text-xs text-slate-500">
                     <span>{t('market.vat')} (17%)</span>
                     <span>₪{vatAmount.toFixed(2)}</span>
                   </div>
                 </div>

                 <div className="flex items-end justify-between mb-2">
                   <span className="text-slate-300 font-medium">{t('market.totalToPay')}</span>
                   <span className="text-3xl font-black text-white tracking-tight">
                     <span className="text-lg text-emerald-500 align-top mr-1">₪</span>
                     {cartTotal.toFixed(2)}
                   </span>
                 </div>

                 <button
                   onClick={() => setShowPaymentModal(true)}
                   className="group w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-2xl font-bold text-xl transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-1 active:translate-y-0 flex items-center justify-center gap-3 overflow-hidden relative"
                 >
                   <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 skew-y-12" />
                   <Receipt className="w-6 h-6 relative z-10" />
                   <span className="relative z-10">{t('market.payment')}</span>
                 </button>
               </>
             )}
          </div>

        </div>
      </div>
    </div>
  );
}
