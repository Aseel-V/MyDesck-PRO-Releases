/**
 * Israeli Fiscal Compliance - Type Definitions
 * 
 * Complete TypeScript types for Israeli POS fiscal requirements:
 * - Fiscal documents (receipts, invoices, credit notes)
 * - VAT categories and calculations
 * - Israel Invoices Model integration
 * - Z/X Reports
 * - Cash shifts
 * 
 * All monetary values are in AGOROT (1/100 of NIS) for precision
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Israeli fiscal document types
 * - receipt: קבלה
 * - tax_invoice: חשבונית מס
 * - tax_invoice_receipt: חשבונית מס קבלה
 * - credit_note: הודעת זיכוי
 * - debit_note: הודעת חיוב
 */
export type FiscalDocumentType = 
  | 'receipt'
  | 'tax_invoice'
  | 'tax_invoice_receipt'
  | 'credit_note'
  | 'debit_note';

/**
 * Document status
 */
export type FiscalDocumentStatus = 
  | 'draft'
  | 'issued'
  | 'cancelled'
  | 'voided';

/**
 * VAT categories per Israeli tax law
 * - standard: 17% (as of 2026)
 * - zero_rated: 0% but VAT recoverable (exports, etc.)
 * - exempt: Exempt from VAT (fruits, vegetables - different from 0%)
 * - eilat: Eilat VAT-free zone
 */
export type VATCategory = 
  | 'standard'
  | 'zero_rated'
  | 'exempt'
  | 'eilat';

/**
 * Payment methods
 */
export type PaymentMethod = 
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'check'
  | 'bank_transfer'
  | 'digital_wallet'
  | 'credit'
  | 'multi'
  | 'other';

/**
 * Shrinkage types for inventory losses
 */
export type ShrinkageType = 
  | 'expired'
  | 'spoilage'
  | 'damage'
  | 'theft'
  | 'breakage'
  | 'counting_variance'
  | 'other';

// ============================================================================
// VAT RATES
// ============================================================================

export const VAT_RATES: Record<VATCategory, number> = {
  standard: 17,      // Current Israeli VAT rate
  zero_rated: 0,
  exempt: 0,
  eilat: 0,
} as const;

// Threshold for allocation number requirement (in agorot)
export const ALLOCATION_THRESHOLD_AGOROT = 2500000; // 25,000 NIS

// Threshold for mandatory customer details (in agorot)
export const CUSTOMER_DETAILS_THRESHOLD_AGOROT = 500000; // 5,000 NIS

// ============================================================================
// BUSINESS DETAILS
// ============================================================================

export interface BusinessDetails {
  id: string;
  name: string;
  registrationNumber: string;  // ע.מ. / ח.פ.
  address: string;
  city: string;
  postalCode?: string;
  phone: string;
  email?: string;
  vatNumber?: string;
  logoUrl?: string;
}

// ============================================================================
// CUSTOMER DETAILS
// ============================================================================

export interface CustomerDetails {
  name?: string;
  idNumber?: string;          // ת.ז. or ח.פ.
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
}

// ============================================================================
// FISCAL DOCUMENT ITEM
// ============================================================================

export interface FiscalDocumentItem {
  id: string;
  documentId: string;
  
  // Item identification
  itemId?: string;           // Reference to menu item
  barcode?: string;
  sku?: string;
  
  // Description
  description: string;
  descriptionHe?: string;    // Hebrew
  
  // Quantity and pricing (amounts in agorot)
  quantity: number;
  unit: string;              // 'pcs', 'kg', 'g', 'L', etc.
  unitPrice: number;         // In agorot
  
  // Discounts (in agorot)
  discountAmount: number;
  discountPercentage: number;
  
  // Line totals (in agorot)
  lineSubtotal: number;      // qty * price - discount (before VAT)
  
  // VAT
  vatCategory: VATCategory;
  vatRate: number;           // Percentage (17, 0, etc.)
  vatAmount: number;         // In agorot
  
  // Line total (in agorot)
  lineTotal: number;         // subtotal + VAT
  
  // Sort order
  sortOrder: number;

  // Profit Analysis
  unitCost?: number;         // In agorot, snapshot at time of sale
}

// ============================================================================
// FISCAL DOCUMENT
// ============================================================================

export interface FiscalDocument {
  id: string;
  businessId: string;
  
  // Document identification
  documentType: FiscalDocumentType;
  documentNumber: number;
  documentPrefix?: string;
  fullDocumentNumber: string;
  
  // Status
  status: FiscalDocumentStatus;
  
  // Business snapshot
  business: BusinessDetails;
  
  // Customer (mandatory for invoices > 5,000 NIS)
  customer?: CustomerDetails;
  
  // Linked documents (for credit notes)
  originalDocumentId?: string;
  originalDocument?: FiscalDocument;
  
  // Items
  items: FiscalDocumentItem[];
  
  // Totals (all in agorot)
  subtotalBeforeVat: number;
  vatAmount: number;
  totalAmount: number;
  discountAmount: number;
  tipAmount: number;
  
  // VAT breakdown (in agorot)
  vat17Base: number;
  vat17Amount: number;
  vat0Base: number;          // Zero-rated
  exemptBase: number;        // Exempt
  
  // Israel Invoices Model (מודל חשבוניות ישראל)
  allocationNumber?: string;
  allocationStatus: 'not_required' | 'pending' | 'success' | 'failed';
  allocationRequestedAt?: string;
  allocationReceivedAt?: string;
  allocationError?: string;
  requiresAllocation: boolean;
  
  // Digital signature / Hash chain
  documentHash: string;
  previousHash?: string;
  signatureData?: string;
  
  // Payment
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  
  // Notes
  internalNotes?: string;
  printedNotes?: string;
  
  // Cancellation
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  
  // Audit
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// CREATE DOCUMENT REQUEST
// ============================================================================

export interface CreateFiscalDocumentRequest {
  documentType: FiscalDocumentType;
  
  // Customer (optional but may be required based on amount)
  customer?: CustomerDetails;
  
  // Items - vatRate and sortOrder can be derived automatically
  items: (Omit<FiscalDocumentItem, 'id' | 'documentId' | 'lineSubtotal' | 'vatAmount' | 'lineTotal' | 'vatRate' | 'sortOrder'> & {
    vatRate?: number;
    sortOrder?: number;
  })[];
  
  // Discounts / Tips (in agorot)
  discountAmount?: number;
  tipAmount?: number;
  
  // Payment
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  
  // Notes
  internalNotes?: string;
  printedNotes?: string;
  
  // For credit notes
  originalDocumentId?: string;
}

// ============================================================================
// Z-REPORT
// ============================================================================

export interface ZReport {
  id: string;
  businessId: string;
  
  // Z identification (NEVER gaps)
  zNumber: number;
  
  // Linked shift
  shiftId?: string;
  
  // Period
  periodStart: string;
  periodEnd: string;
  
  // Sales totals (in agorot)
  grossSales: number;
  returnsRefunds: number;
  discounts: number;
  netSales: number;
  
  // VAT breakdown (in agorot) - CRITICAL
  vat17Taxable: number;
  vat17Tax: number;
  vat0Taxable: number;
  exemptTaxable: number;
  totalVat: number;
  
  // Payment methods (in agorot)
  cashTotal: number;
  creditCardTotal: number;
  debitCardTotal: number;
  checksTotal: number;
  otherPaymentsTotal: number;
  
  // Document counts
  firstReceiptNumber?: number;
  lastReceiptNumber?: number;
  totalReceipts: number;
  firstInvoiceNumber?: number;
  lastInvoiceNumber?: number;
  totalInvoices: number;
  totalCreditNotes: number;
  totalCancelledDocs: number;
  
  // Cash drawer
  openingCash: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  actualCash?: number;
  cashVariance?: number;
  
  // Category breakdown
  salesByCategory: Record<string, number>;
  
  // Generation info
  generatedBy: string;
  generatedByName?: string;
  generatedAt: string;
  
  // Digital signature
  reportHash: string;
  previousZHash?: string;
  signatureChainValid: boolean;
  
  // Flags
  isFinal: boolean;
  sentToTaxAuthority: boolean;
  sentAt?: string;
  
  notes?: string;
}

// ============================================================================
// X-REPORT (Mid-day snapshot, no reset)
// ============================================================================

export interface XReport {
  id: string;
  businessId: string;
  shiftId?: string;
  
  reportNumber: number;
  snapshotAt: string;
  
  // Current totals (in agorot)
  grossSales: number;
  netSales: number;
  totalVat: number;
  
  // Payment breakdown (in agorot)
  cashTotal: number;
  cardTotal: number;
  
  // Document counts since last Z
  receiptsCount: number;
  invoicesCount: number;
  
  generatedBy: string;
  generatedByName?: string;
  
  createdAt: string;
}

// ============================================================================
// CASH SHIFT
// ============================================================================

export interface CashShift {
  id: string;
  businessId: string;
  
  // Identification
  shiftNumber: number;
  terminalId: string;
  
  // Staff
  openedBy: string;
  openedByName?: string;
  closedBy?: string;
  closedByName?: string;
  
  // Timing
  openedAt: string;
  closedAt?: string;
  
  // Cash amounts (in agorot)
  openingCash: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
  
  // Transaction totals (in agorot)
  totalSales: number;
  totalRefunds: number;
  totalVoids: number;
  netSales: number;
  
  // By payment method (in agorot)
  cashSales: number;
  cardSales: number;
  otherSales: number;
  
  // VAT (in agorot)
  vat17Sales: number;
  vat17Amount: number;
  vat0Sales: number;
  exemptSales: number;
  
  // Document counts
  receiptsIssued: number;
  invoicesIssued: number;
  creditNotesIssued: number;
  
  // Status
  status: 'open' | 'closed' | 'reconciled';
  
  // Notes
  openingNotes?: string;
  closingNotes?: string;
  
  // Hash
  closingHash?: string;
  
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SHIFT TRANSACTION
// ============================================================================

export interface ShiftTransaction {
  id: string;
  shiftId: string;
  
  transactionType: 'sale' | 'refund' | 'void' | 'cash_in' | 'cash_out' | 'no_sale';
  
  // Linked document
  fiscalDocumentId?: string;
  orderId?: string;
  
  // Amount (in agorot)
  amount: number;
  
  // Payment
  paymentMethod?: PaymentMethod;
  
  // Card details
  cardLastFour?: string;
  cardType?: string;
  authCode?: string;
  terminalTransactionId?: string;
  
  // Staff
  performedBy: string;
  performedByName?: string;
  
  // Notes
  notes?: string;
  
  createdAt: string;
}

// ============================================================================
// ISRAEL INVOICES MODEL API
// ============================================================================

export interface IsraelInvoicesConfig {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  taxFileNumber: string;    // תיק מס
  testMode: boolean;
}

export interface AllocationRequest {
  documentType: FiscalDocumentType;
  documentNumber: number;
  issueDate: string;
  totalAmount: number;       // In agorot
  vatAmount: number;         // In agorot
  customerIdNumber?: string;
  customerName?: string;
}

export interface AllocationResponse {
  success: boolean;
  allocationNumber?: string;
  timestamp?: string;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// INVENTORY / BATCH
// ============================================================================

export interface InventoryBatch {
  id: string;
  businessId: string;
  menuItemId: string;
  ingredientId?: string;
  
  batchNumber: string;
  lotNumber?: string;
  
  initialQuantity: number;
  currentQuantity: number;
  unit: string;
  
  // Cost (in agorot)
  unitCost: number;
  totalCost: number;
  
  // Dates
  productionDate?: string;
  receivedDate: string;
  expiryDate?: string;
  
  // Supplier
  supplierName?: string;
  supplierInvoice?: string;
  
  status: 'active' | 'depleted' | 'expired' | 'recalled' | 'written_off';
  
  notes?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface ShrinkageRecord {
  id: string;
  businessId: string;
  
  menuItemId?: string;
  ingredientId?: string;
  batchId?: string;
  
  shrinkageType: ShrinkageType;
  
  quantity: number;
  unit?: string;
  
  // Valuation (in agorot)
  unitCost: number;
  totalValue: number;
  
  reason?: string;
  notes?: string;
  
  recordedBy: string;
  recordedByName?: string;
  recordedAt: string;
  
  approvedBy?: string;
  approvedAt?: string;
  requiresApproval: boolean;
  
  photoUrl?: string;
  
  createdAt: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Convert amount from NIS to agorot
 */
export function toAgorot(nis: number): number {
  return Math.round(nis * 100);
}

/**
 * Convert amount from agorot to NIS
 */
export function toNIS(agorot: number): number {
  return agorot / 100;
}

/**
 * Format amount in agorot as NIS string
 */
export function formatNIS(agorot: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNIS(agorot));
}
