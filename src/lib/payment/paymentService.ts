/**
 * Payment Service
 * 
 * Abstract payment handling for Israeli POS with support for:
 * - Cash payments (with drawer integration)
 * - Card payments (EMV terminal stub)
 * - Multi-tender (split payments)
 * - Refunds and voids
 * 
 * Designed to be extended with specific EMV terminal implementations.
 */

import type { PaymentMethod } from '../../types/fiscal';
import { toNIS } from '../../types/fiscal';

// ============================================================================
// TYPES
// ============================================================================

export interface PaymentRequest {
  amount: number;           // In agorot
  currency: 'ILS';
  method: PaymentMethod;
  reference?: string;       // Order/transaction reference
  fiscalDocumentId?: string;
}

export interface CardPaymentRequest extends PaymentRequest {
  method: 'credit_card' | 'debit_card';
  terminalId?: string;
  allowPartial?: boolean;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  method: PaymentMethod;
  amount: number;           // In agorot
  authCode?: string;
  cardLastFour?: string;
  cardType?: string;
  cardBrand?: string;
  terminalTransactionId?: string;
  receiptData?: string;
  error?: string;
  errorCode?: string;
  timestamp: string;
}

export interface RefundRequest {
  originalTransactionId: string;
  amount: number;           // In agorot (partial refund if less than original)
  reason: string;
}

export interface MultiTenderPayment {
  payments: PaymentRequest[];
  totalAmount: number;      // In agorot
}

export interface MultiTenderResult {
  success: boolean;
  results: PaymentResult[];
  totalPaid: number;
  remaining: number;
  allSuccessful: boolean;
}

// ============================================================================
// ABSTRACT PAYMENT HANDLER
// ============================================================================

export abstract class PaymentHandler {
  abstract readonly method: PaymentMethod;

  abstract process(request: PaymentRequest): Promise<PaymentResult>;
  abstract refund(request: RefundRequest): Promise<PaymentResult>;
  abstract void(transactionId: string): Promise<PaymentResult>;
}

// ============================================================================
// CASH PAYMENT HANDLER
// ============================================================================

export class CashPaymentHandler extends PaymentHandler {
  readonly method: PaymentMethod = 'cash';

  async process(request: PaymentRequest): Promise<PaymentResult> {
    const transactionId = this.generateTransactionId();

    // Open cash drawer via Electron IPC
    await this.openCashDrawer();

    return {
      success: true,
      transactionId,
      method: 'cash',
      amount: request.amount,
      timestamp: new Date().toISOString(),
    };
  }

  async refund(request: RefundRequest): Promise<PaymentResult> {
    const transactionId = this.generateTransactionId();

    // Open drawer for cash refund
    await this.openCashDrawer();

    return {
      success: true,
      transactionId,
      method: 'cash',
      amount: -request.amount, // Negative for refund
      timestamp: new Date().toISOString(),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async void(_transactionId: string): Promise<PaymentResult> {
    // Cash voids just mark the transaction
    return {
      success: true,
      transactionId: this.generateTransactionId(),
      method: 'cash',
      amount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  private async openCashDrawer(): Promise<void> {
    if (window.electronAPI?.openCashDrawer) {
      // Get default printer from settings or use first thermal printer
      const printers = await window.electronAPI.getPrinters?.() || [];
      const thermalPrinter = printers.find(p => 
        p.name.toLowerCase().includes('thermal') ||
        p.name.toLowerCase().includes('pos') ||
        p.name.toLowerCase().includes('receipt')
      );

      if (thermalPrinter) {
        await window.electronAPI.openCashDrawer(thermalPrinter.name, 'printer');
      }
    }
  }

  private generateTransactionId(): string {
    return `CASH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}

// ============================================================================
// CARD PAYMENT HANDLER (STUB - Extend for specific terminal)
// ============================================================================

export class CardPaymentHandler extends PaymentHandler {
  readonly method: PaymentMethod = 'credit_card';
  private terminalId: string;

  constructor(terminalId: string = 'DEFAULT') {
    super();
    this.terminalId = terminalId;
  }

  async process(request: CardPaymentRequest): Promise<PaymentResult> {
    const transactionId = this.generateTransactionId();

    // TODO: Implement actual EMV terminal communication
    // This is a stub that should be replaced with real terminal integration
    console.log(`[CardPayment] Processing ${toNIS(request.amount)} NIS on terminal ${this.terminalId}`);

    // Simulate terminal interaction
    // In production, this would:
    // 1. Send transaction to terminal via serial/TCP
    // 2. Wait for customer to insert/tap card
    // 3. Process PIN if required
    // 4. Receive authorization response

    // For now, return mock success
    return {
      success: true,
      transactionId,
      method: request.method,
      amount: request.amount,
      authCode: this.generateAuthCode(),
      cardLastFour: '****',
      cardType: 'credit',
      cardBrand: 'Unknown',
      terminalTransactionId: `TRM-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
  }

  async refund(request: RefundRequest): Promise<PaymentResult> {
    const transactionId = this.generateTransactionId();

    // TODO: Implement terminal refund
    console.log(`[CardPayment] Refunding ${toNIS(request.amount)} NIS`);

    return {
      success: true,
      transactionId,
      method: 'credit_card',
      amount: -request.amount,
      authCode: this.generateAuthCode(),
      timestamp: new Date().toISOString(),
    };
  }

  async void(transactionId: string): Promise<PaymentResult> {
    // TODO: Implement terminal void
    console.log(`[CardPayment] Voiding transaction ${transactionId}`);

    return {
      success: true,
      transactionId: this.generateTransactionId(),
      method: 'credit_card',
      amount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  private generateTransactionId(): string {
    return `CARD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  private generateAuthCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

// ============================================================================
// PAYMENT SERVICE (ORCHESTRATOR)
// ============================================================================

export class PaymentService {
  private handlers: Map<PaymentMethod, PaymentHandler> = new Map();

  constructor() {
    // Register default handlers
    this.registerHandler(new CashPaymentHandler());
    this.registerHandler(new CardPaymentHandler());
  }

  /**
   * Register a payment handler
   */
  registerHandler(handler: PaymentHandler): void {
    this.handlers.set(handler.method, handler);
  }

  /**
   * Process a single payment
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const handler = this.handlers.get(request.method);
    
    if (!handler) {
      return {
        success: false,
        transactionId: '',
        method: request.method,
        amount: request.amount,
        error: `No handler registered for payment method: ${request.method}`,
        errorCode: 'NO_HANDLER',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      return await handler.process(request);
    } catch (error) {
      return {
        success: false,
        transactionId: '',
        method: request.method,
        amount: request.amount,
        error: error instanceof Error ? error.message : 'Payment failed',
        errorCode: 'PROCESSING_ERROR',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Process multi-tender payment
   */
  async processMultiTender(multiPayment: MultiTenderPayment): Promise<MultiTenderResult> {
    const results: PaymentResult[] = [];
    let totalPaid = 0;

    for (const payment of multiPayment.payments) {
      const result = await this.processPayment(payment);
      results.push(result);
      
      if (result.success) {
        totalPaid += Math.abs(result.amount);
      }
    }

    const allSuccessful = results.every(r => r.success);
    const remaining = multiPayment.totalAmount - totalPaid;

    return {
      success: allSuccessful && remaining <= 0,
      results,
      totalPaid,
      remaining: Math.max(0, remaining),
      allSuccessful,
    };
  }

  /**
   * Process refund
   */
  async processRefund(request: RefundRequest, method: PaymentMethod): Promise<PaymentResult> {
    const handler = this.handlers.get(method);
    
    if (!handler) {
      return {
        success: false,
        transactionId: '',
        method,
        amount: request.amount,
        error: `No handler for method: ${method}`,
        errorCode: 'NO_HANDLER',
        timestamp: new Date().toISOString(),
      };
    }

    return await handler.refund(request);
  }

  /**
   * Void a transaction
   */
  async voidTransaction(transactionId: string, method: PaymentMethod): Promise<PaymentResult> {
    const handler = this.handlers.get(method);
    
    if (!handler) {
      return {
        success: false,
        transactionId,
        method,
        amount: 0,
        error: `No handler for method: ${method}`,
        errorCode: 'NO_HANDLER',
        timestamp: new Date().toISOString(),
      };
    }

    return await handler.void(transactionId);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let paymentServiceInstance: PaymentService | null = null;

/**
 * Get payment service instance (singleton)
 */
export function getPaymentService(): PaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService();
  }
  return paymentServiceInstance;
}

/**
 * Create new payment service (for testing)
 */
export function createPaymentService(): PaymentService {
  return new PaymentService();
}
