/**
 * Market Fiscal Integration Hook
 * 
 * Integrates the fiscal document system with the MarketPOS.
 * Handles:
 * - Creating fiscal documents from sales
 * - Receipt printing
 * - Payment processing
 * - Cash shift management
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import type { MarketCartItem } from '../../../types/restaurant';

import type { 
  FiscalDocument, 
  FiscalDocumentType, 
  PaymentMethod,
  CustomerDetails,
  CashShift,
  BusinessDetails,
} from '../../../types/fiscal';
import { toAgorot, formatNIS } from '../../../types/fiscal';
import { createFiscalDocumentService, FiscalDocumentService } from '../../../lib/fiscal/fiscalDocumentService';
import { getPaymentService, PaymentResult } from '../../../lib/payment/paymentService';
import { 
  openCashShift, 
  getCurrentShift, 
  recordShiftTransaction,
  closeShiftWithZReport,
} from '../../../lib/reports/zReportService';
import { createESCPOSBuilder, reverseHebrew } from '../../../lib/hardware/escposBuilder';

// ============================================================================
// TYPES
// ============================================================================

export interface SaleResult {
  success: boolean;
  document?: FiscalDocument;
  paymentResult?: PaymentResult;
  error?: string;
}

export interface FiscalState {
  currentShift: CashShift | null;
  isProcessing: boolean;
  lastDocument: FiscalDocument | null;
  lastError: string | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useMarketFiscal() {
  const { user, profile } = useAuth();
  
  const [state, setState] = useState<FiscalState>({
    currentShift: null,
    isProcessing: false,
    lastDocument: null,
    lastError: null,
  });

  const [fiscalService, setFiscalService] = useState<FiscalDocumentService | null>(null);

  /**
   * Load current open shift
   */
  const loadCurrentShift = useCallback(async () => {
    if (!user?.id) return;

    const shift = await getCurrentShift(user.id);
    setState(prev => ({ ...prev, currentShift: shift }));
  }, [user?.id]);

  // Initialize service when user/profile are available
  useEffect(() => {
    if (user?.id && profile) {
      const businessDetails: BusinessDetails = {
        id: user.id,
        name: profile.business_name || 'עסק',
        registrationNumber: '', // Will be set from business_settings if needed
        address: '', // Will be set from business_settings if needed
        city: '',
        phone: profile.phone_number || '',
        email: user.email || undefined,
      };

      setFiscalService(createFiscalDocumentService(user.id, businessDetails));
    }
  }, [user?.id, profile, user?.email]);

  // Load current shift on mount
  useEffect(() => {
    if (user?.id) {
      loadCurrentShift();
    }
  }, [user?.id, loadCurrentShift]);



  /**
   * Open a new cash shift
   */
  const startShift = useCallback(async (openingCash: number, staffName: string) => {
    if (!user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    const result = await openCashShift(
      user.id,
      toAgorot(openingCash),
      staffName
    );

    if (result.success && result.shift) {
      setState(prev => ({ ...prev, currentShift: result.shift! }));
    }

    return result;
  }, [user?.id]);

  /**
   * Close shift and generate Z-Report
   */
  const endShift = useCallback(async (actualCash: number, staffName: string, notes?: string) => {
    if (!state.currentShift) {
      return { success: false, error: 'No open shift' };
    }

    const result = await closeShiftWithZReport(
      state.currentShift.id,
      toAgorot(actualCash),
      staffName,
      notes
    );

    if (result.success) {
      setState(prev => ({ ...prev, currentShift: null }));
    }

    return result;
  }, [state.currentShift]);

  /**
   * Print receipt via ESC/POS
   */
  const printReceipt = useCallback(async (document: FiscalDocument): Promise<boolean> => {
    if (!window.electronAPI?.printEscPos) {
      console.warn('ESC/POS printing not available');
      return false;
    }

    try {
      // Build receipt using ESC/POS builder
      const builder = createESCPOSBuilder({ 
        paperWidth: 80, 
        cutAfterPrint: true 
      });

      // Header
      builder
        .align('center')
        .bold(true)
        .setSize('double')
        .textLn(document.business.name)
        .setSize('normal')
        .bold(false)
        .textLn(document.business.address)
        .textLn(`טל: ${document.business.phone}`)
        .textLn(`ע.מ.: ${document.business.registrationNumber}`)
        .lineFeed()
        .doubleLine();

      // Document type & number
      builder
        .bold(true)
        .setSize('double')
        .centerText(getDocumentTypeNameHe(document.documentType))
        .setSize('normal')
        .centerText(`מס' ${document.fullDocumentNumber}`)
        .bold(false)
        .textLn(new Date(document.createdAt).toLocaleString('he-IL'))
        .dashedLine();

      // Items (Right Aligned Layout for Hebrew)
      for (const item of document.items) {
        // Reverse Hebrew for dumb thermal printers
        const description = item.descriptionHe || item.description;
        const displayDesc = reverseHebrew(description);

        builder
          .align('right')
          .textLn(displayDesc) // Description on its own line for long names, aligned right
          .align('left')       // Reset alignment for two-column
          .twoColumn(
             formatNIS(item.lineTotal), // Left: Price (Total)
             `${item.quantity} x ${formatNIS(item.unitPrice)}` // Right: Qty x Unit
          );
      }

      // Totals
      builder
        .dashedLine()
        .twoColumn('סה"כ לפני מע"מ:', formatNIS(document.subtotalBeforeVat));
      
      if (document.vat17Amount > 0) {
        builder.twoColumn('מע"מ 17%:', formatNIS(document.vat17Amount));
      }

      builder
        .doubleLine()
        .bold(true)
        .setSize('double-height')
        .twoColumn('סה"כ:', formatNIS(document.totalAmount))
        .setSize('normal')
        .bold(false);

      // Payment method
      if (document.paymentMethod) {
        builder
          .lineFeed()
          .centerText(`שולם ב: ${getPaymentMethodNameHe(document.paymentMethod)}`);
      }

      // Hash signature
      builder
        .lineFeed()
        .align('center')
        .textLn('חתימה דיגיטלית:')
        .textLn(document.documentHash.substring(0, 8).toUpperCase())
        .lineFeed()
        .centerText('תודה שקניתם!')
        .lineFeed(3);

      // Send to printer
      const commands = builder.buildBase64();
      const printers = await window.electronAPI.getPrinters?.() || [];
      const receiptPrinter = printers.find(p => 
        p.name.toLowerCase().includes('thermal') ||
        p.name.toLowerCase().includes('receipt') ||
        p.name.toLowerCase().includes('pos')
      ) || printers[0];

      if (receiptPrinter) {
        const result = await window.electronAPI.printEscPos(receiptPrinter.name, commands);
        return result.success;
      }

      return false;
    } catch (error) {
      console.error('Print failed:', error);
      return false;
    }
  }, []);

  /**
   * Open cash drawer
   */
  const openDrawer = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI?.openCashDrawer) {
      return false;
    }

    try {
      const printers = await window.electronAPI.getPrinters?.() || [];
      const thermalPrinter = printers.find(p => 
        p.name.toLowerCase().includes('thermal') ||
        p.name.toLowerCase().includes('pos')
      ) || printers[0];

      if (thermalPrinter) {
        const result = await window.electronAPI.openCashDrawer(thermalPrinter.name, 'printer');
        return result.success;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  /**
   * Process a sale from cart items
   */
  const processSale = useCallback(async (
    cartItems: MarketCartItem[],
    paymentMethod: PaymentMethod,
    options: {
      customer?: CustomerDetails;
      documentType?: FiscalDocumentType;
      printReceipt?: boolean;
      notes?: string;
    } = {}
  ): Promise<SaleResult> => {
    if (!fiscalService) {
      return { success: false, error: 'Fiscal service not initialized' };
    }

    if (!state.currentShift) {
      return { success: false, error: 'No open shift. Please open a shift first.' };
    }

    if (cartItems.length === 0) {
      return { success: false, error: 'Cart is empty' };
    }

    setState(prev => ({ ...prev, isProcessing: true, lastError: null }));

    try {
      // Calculate total using lineTotal from cart
      const total = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const totalAgorot = toAgorot(total);

      // 1. Process payment first
      const paymentService = getPaymentService();
      const paymentResult = await paymentService.processPayment({
        amount: totalAgorot,
        currency: 'ILS',
        method: paymentMethod,
      });

      if (!paymentResult.success) {
        setState(prev => ({ 
          ...prev, 
          isProcessing: false, 
          lastError: paymentResult.error || 'Payment failed' 
        }));
        return { success: false, error: paymentResult.error, paymentResult };
      }

      // 2. Create fiscal document
      const documentType = options.documentType || 'receipt';
      
      const documentResult = await fiscalService.createDocument({
        documentType,
        customer: options.customer,
        items: cartItems.map(item => ({
          itemId: item.id,
          barcode: item.menuItem.barcode,
          description: item.menuItem.name,
          descriptionHe: item.menuItem.name_he || item.menuItem.name,
          quantity: item.isWeighed ? (item.weight || item.quantity) : item.quantity,
          unit: item.isWeighed ? 'kg' : 'pcs',
          unitPrice: toAgorot(item.unitPrice),
          discountAmount: 0,
          discountPercentage: 0,
          vatCategory: item.menuItem.tax_rate === 0 ? 'exempt' : 'standard',
          unitCost: toAgorot(item.menuItem.cost_price || 0),
        })),
        paymentMethod,
        paymentReference: paymentResult.transactionId,
        printedNotes: options.notes,
      });

      if (!documentResult.success || !documentResult.document) {
        setState(prev => ({ 
          ...prev, 
          isProcessing: false, 
          lastError: documentResult.error || 'Failed to create document' 
        }));
        return { success: false, error: documentResult.error };
      }

      // 3. Record transaction in shift
      await recordShiftTransaction(state.currentShift.id, {
        transactionType: 'sale',
        amount: totalAgorot,
        paymentMethod: paymentMethod,
        fiscalDocumentId: documentResult.document.id,
        cardLastFour: paymentResult.cardLastFour,
        cardType: paymentResult.cardType,
        authCode: paymentResult.authCode,
        performedByName: user?.email || 'Staff',
      });

      // 4. Print receipt if requested
      if (options.printReceipt !== false) {
        await printReceipt(documentResult.document);
      }

      // 5. Update state
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        lastDocument: documentResult.document!,
        lastError: null,
      }));

      return { 
        success: true, 
        document: documentResult.document, 
        paymentResult 
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Sale failed';
      setState(prev => ({ ...prev, isProcessing: false, lastError: errorMsg }));
      return { success: false, error: errorMsg };
    }
  }, [fiscalService, state.currentShift, user?.email, printReceipt]);

  /**
   * Process a refund
   */
  const processRefund = useCallback(async (
    originalDocumentId: string,
    reason: string,
    paymentMethod: PaymentMethod
  ): Promise<SaleResult> => {
    if (!fiscalService) {
      return { success: false, error: 'Fiscal service not initialized' };
    }

    if (!state.currentShift) {
      return { success: false, error: 'No open shift' };
    }

    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      // Get original document
      const originalDoc = await fiscalService.getDocument(originalDocumentId);
      if (!originalDoc) {
        throw new Error('Original document not found');
      }

      // Create credit note
      const creditNoteResult = await fiscalService.createDocument({
        documentType: 'credit_note',
        originalDocumentId,
        customer: originalDoc.customer,
        items: originalDoc.items.map(item => ({
          ...item,
          quantity: -item.quantity, // Negative for credit
        })),
        paymentMethod,
        printedNotes: `זיכוי עבור ${originalDoc.fullDocumentNumber}: ${reason}`,
      });

      if (!creditNoteResult.success || !creditNoteResult.document) {
        throw new Error(creditNoteResult.error || 'Failed to create credit note');
      }

      // Process refund payment
      const paymentService = getPaymentService();
      const refundResult = await paymentService.processRefund({
        originalTransactionId: originalDoc.paymentReference || '',
        amount: originalDoc.totalAmount,
        reason,
      }, paymentMethod);

      // Record in shift
      await recordShiftTransaction(state.currentShift.id, {
        transactionType: 'refund',
        amount: originalDoc.totalAmount,
        paymentMethod,
        fiscalDocumentId: creditNoteResult.document.id,
        performedByName: user?.email || 'Staff',
        notes: reason,
      });

      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        lastDocument: creditNoteResult.document!,
      }));

      return { 
        success: true, 
        document: creditNoteResult.document,
        paymentResult: refundResult,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Refund failed';
      setState(prev => ({ ...prev, isProcessing: false, lastError: errorMsg }));
      return { success: false, error: errorMsg };
    }
  }, [fiscalService, state.currentShift, user?.email]);

  return {
    // State
    currentShift: state.currentShift,
    isProcessing: state.isProcessing,
    lastDocument: state.lastDocument,
    lastError: state.lastError,
    hasOpenShift: !!state.currentShift,

    // Shift management
    startShift,
    endShift,
    loadCurrentShift,

    // Sales
    processSale,
    processRefund,

    // Printing
    printReceipt,
    openDrawer,

    // Service access
    fiscalService,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getDocumentTypeNameHe(type: FiscalDocumentType): string {
  const names: Record<FiscalDocumentType, string> = {
    receipt: 'קבלה',
    tax_invoice: 'חשבונית מס',
    tax_invoice_receipt: 'חשבונית מס קבלה',
    credit_note: 'הודעת זיכוי',
    debit_note: 'הודעת חיוב',
  };
  return names[type] || 'מסמך';
}

function getPaymentMethodNameHe(method: PaymentMethod): string {
  const names: Record<PaymentMethod, string> = {
    cash: 'מזומן',
    credit_card: 'כרטיס אשראי',
    debit_card: 'כרטיס חיוב',
    check: "צ'ק",
    bank_transfer: 'העברה בנקאית',
    digital_wallet: 'ארנק דיגיטלי',
    credit: 'אשראי',
    multi: 'מפוצל',
    other: 'אחר',
  };
  return names[method] || method;
}

export default useMarketFiscal;
