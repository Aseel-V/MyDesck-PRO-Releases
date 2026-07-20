// ============================================================================
// MARKET POS - High-Velocity Supermarket Interface
// Keyboard-centric design optimized for speed
// ============================================================================

import { useEffect, useCallback } from 'react';
import { useBusinessSettings } from '../../hooks/useRestaurant';
import { useGlobalScanner } from './hooks/useGlobalScanner';
import { useMarketLogic } from './hooks/useMarketLogic';
import { useMarketFiscal } from './hooks/useMarketFiscal';
import type { MarketCartItem, PaymentMethod } from '../../types/restaurant';
import { toast } from 'sonner';
import { 
  ShoppingCart, 
  CreditCard, 
  Banknote,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMarketSounds } from './hooks/useMarketSounds';

// ============================================================================
// KEY HINTS BAR
// ============================================================================

function KeyHintsBar() {
  return (
    <div className="bg-gray-800 px-4 py-2 flex items-center justify-between text-sm text-gray-400">
      <div className="flex items-center gap-6">
        <span className="flex items-center gap-1">
          <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">Space</kbd>
          <span>Cash</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">F12</kbd>
          <span>Card</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">+/-</kbd>
          <span>Qty</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">Del</kbd>
          <span>Void</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">↑↓</kbd>
          <span>Select</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">F8</kbd>
          <span>Weight</span>
        </span>
      </div>
      <div className="text-gray-500">
        Scan barcode to add items
      </div>
    </div>
  );
}

// ============================================================================
// RECEIPT PANEL (Left Side)
// ============================================================================

interface ReceiptPanelProps {
  cart: ReturnType<typeof useMarketLogic>['cart'];
  selectedIndex: number;
  lastScannedId: string | null;
  formatCurrency: (amount: number) => string;
}

function ReceiptPanel({ cart, selectedIndex, lastScannedId, formatCurrency }: ReceiptPanelProps) {
  return (
    <div className="flex-1 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2 text-white">
          <ShoppingCart className="w-5 h-5" />
          <span className="font-semibold">Receipt</span>
        </div>
        <span className="text-gray-400 text-sm">
          {cart.length} item{cart.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {cart.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">Ready to scan</p>
              <p className="text-sm mt-1">Scan barcode or press F1 for help</p>
            </div>
          </div>
        ) : (
          cart.map((item, index) => {
            const isSelected = index === selectedIndex;
            const isLastScanned = item.id === lastScannedId;
            const timeSinceScan = Date.now() - item.scannedAt;
            const isHighlighted = isLastScanned && timeSinceScan < 2000;

            return (
              <div
                key={item.id}
                className={`
                  rounded-lg p-3 transition-all duration-200
                  ${isSelected ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-800'}
                  ${isHighlighted && !isSelected ? 'bg-green-700 animate-pulse' : ''}
                `}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-lg truncate ${isSelected ? 'text-white' : 'text-gray-100'}`}>
                      {item.menuItem.name}
                    </p>
                    <p className={`text-sm ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                      {item.isWeighed ? (
                        <span>{item.weight?.toFixed(3)} kg × {formatCurrency(item.unitPrice)}/kg</span>
                      ) : (
                        <span>{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                      )}
                    </p>
                  </div>
                  <div className={`text-xl font-bold ${isSelected ? 'text-white' : 'text-green-400'}`}>
                    {formatCurrency(item.lineTotal)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TOTAL PANEL (Right Side)
// ============================================================================

interface TotalPanelProps {
  subtotal: number;
  total: number;
  itemCount: number;
  totalProfit: number;
  formatCurrency: (amount: number) => string;
  onPayCash: () => void;
  onPayCard: () => void;
  onPayBit: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

function TotalPanel({ 
  subtotal, 
  total, 
  itemCount, 
  totalProfit,
  formatCurrency, 
  onPayCash, 
  onPayCard,
  onPayBit,
  isMuted,
  onToggleMute,
}: TotalPanelProps) {
  // Task 2: Remove hidden profit state, always show it
  // const [showProfit, setShowProfit] = useState(false);
  
  return (
    <div className="w-96 bg-gray-850 flex flex-col border-l border-gray-700" style={{ backgroundColor: '#1a1a2e' }}>
      {/* Total Display */}
      <div 
        className="flex-1 flex flex-col items-center justify-center p-6"
      >
        <p className="text-gray-400 text-lg mb-2">TOTAL DUE</p>
        <p className="text-7xl font-bold text-white tracking-tight">
          {formatCurrency(total)}
        </p>
        <p className="text-gray-500 mt-4">
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </p>
        
        {/* Task 2: Always Visible Profit (The "Smart" part) */}
        <div className="mt-6 p-2 bg-green-900/20 rounded border border-green-900/30 text-green-500 font-mono text-sm">
           Est. Profit: {formatCurrency(totalProfit)}
        </div>
      </div>

      {/* Subtotal */}
      <div className="px-6 py-4 border-t border-gray-700">
        <div className="flex justify-between text-gray-400">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
      </div>

      {/* Payment Buttons */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <button
          onClick={onPayCash}
          className="py-4 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-lg flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Banknote className="w-6 h-6" />
            <span>CASH</span>
          </div>
          <kbd className="bg-green-700 px-2 py-0.5 rounded text-xs opacity-75">Space</kbd>
        </button>

        <button
          onClick={onPayCard}
          className="py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg rounded-lg flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <div className="flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            <span>CARD</span>
          </div>
          <kbd className="bg-blue-700 px-2 py-0.5 rounded text-xs opacity-75">F12</kbd>
        </button>

        <button
          onClick={onPayBit}
          className="py-4 bg-teal-600 hover:bg-teal-500 text-white font-bold text-lg rounded-lg flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-extrabold italic">bit</span>
          </div>
          <kbd className="bg-teal-700 px-2 py-0.5 rounded text-xs opacity-75">F10</kbd>
        </button>
      </div>

      {/* Sound Toggle */}
      <div className="px-4 pb-4">
        <button
          onClick={onToggleMute}
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          <span>{isMuted ? 'Sound Off' : 'Sound On'}</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN MARKET POS COMPONENT
// ============================================================================

export default function MarketPOS() {
  const { settings, isLoading: settingsLoading } = useBusinessSettings();
  const { isMuted, toggleMute } = useMarketSounds();
  
  // Task 1: Initialize Fiscal Service (The Brain)
  const fiscal = useMarketFiscal();

  // Task 1: Fiscal Payment Handler
  const handleProcessPayment = useCallback(async (method: PaymentMethod, cart: MarketCartItem[]) => {
      // Map 'card' to 'credit_card' for fiscal service
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fiscalMethod = (method === 'card' ? 'credit_card' : method) as any;
      
      // 1. Process Sale via Fiscal Service
      const result = await fiscal.processSale(cart, fiscalMethod, {
          printReceipt: true, // Auto-print
      });

      if (!result.success) {
          toast.error(result.error || 'Sale failed');
          return false;
      }
      
      // Success handled by hook (returns true)
      return true;
  }, [fiscal]);

  const marketLogic = useMarketLogic({
    settings,
    onProcessPayment: handleProcessPayment, // Injecting the Brain
  });

  const {
    cart,
    selectedIndex,
    total,
    subtotal,
    itemCount,
    handleScan,
    incrementQuantity,
    decrementQuantity,
    voidSelected,
    selectNext,
    selectPrevious,
    payCash,
    payCard,
    payBit,
    totalProfit,
    lastScannedId,
  } = marketLogic;

  // Global scanner hook
  useGlobalScanner({
    onScan: handleScan,
    enabled: true,
    pauseOnInput: true,
  });

  // Currency formatting
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
    }).format(amount);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          payCash();
          break;
        case 'F12':
          e.preventDefault();
          payCard();
          break;
        case 'F10':
          e.preventDefault();
          payBit();
          break;
        case '+':
        case '=':
          e.preventDefault();
          incrementQuantity();
          break;
        case '-':
        case '_':
          e.preventDefault();
          decrementQuantity();
          break;
        case 'Delete':
        case 'Backspace':
          if (e.key === 'Delete' || e.ctrlKey) {
            e.preventDefault();
            voidSelected();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          selectPrevious();
          break;
        case 'ArrowDown':
          e.preventDefault();
          selectNext();
          break;
        case 'Escape':
          e.preventDefault();
          // Could show confirmation modal before clearing
          break;
        case 'F8':
          e.preventDefault();
          // Scale weight - would integrate with Electron IPC
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    payCash,
    payCard,
    payBit,
    incrementQuantity,
    decrementQuantity,
    voidSelected,
    selectNext,
    selectPrevious,
  ]);

  if (settingsLoading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading Market POS...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Receipt */}
        <ReceiptPanel
          cart={cart}
          selectedIndex={selectedIndex}
          lastScannedId={lastScannedId}
          formatCurrency={formatCurrency}
        />

        {/* Right: Total Panel */}
        <TotalPanel
          subtotal={subtotal}
          total={total}
          itemCount={itemCount}
          formatCurrency={formatCurrency}
          onPayCash={payCash}
          onPayCard={payCard}
          onPayBit={payBit}
          totalProfit={totalProfit}
          isMuted={isMuted}
          onToggleMute={toggleMute}
        />
      </div>

      {/* Bottom: Key Hints */}
      <KeyHintsBar />
    </div>
  );
}
