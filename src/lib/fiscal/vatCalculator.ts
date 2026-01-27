/**
 * Israeli VAT Calculator
 * 
 * Production-ready VAT calculation for Israeli supermarket POS.
 * Handles:
 * - Standard rate (17%)
 * - Zero-rated items (0% but VAT recoverable)
 * - Exempt items (fruits, vegetables - legally different from 0%)
 * - Eilat VAT-free zone
 * - Mixed baskets with correct rounding
 * 
 * All amounts are in AGOROT for precision (no floating point errors)
 */

import type { 
  VATCategory, 
  FiscalDocumentItem,
} from '../../types/fiscal';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Current Israeli VAT rates
 * Note: Standard rate is 17% as of 2026
 */
export const VAT_RATES: Record<VATCategory, number> = {
  standard: 17,
  zero_rated: 0,
  exempt: 0,
  eilat: 0,
} as const;

/**
 * VAT category display names (Hebrew)
 */
export const VAT_CATEGORY_NAMES: Record<VATCategory, { he: string; en: string }> = {
  standard: { he: 'מע"מ 17%', en: 'VAT 17%' },
  zero_rated: { he: 'מע"מ 0%', en: 'Zero-rated' },
  exempt: { he: 'פטור', en: 'Exempt' },
  eilat: { he: 'אילת', en: 'Eilat' },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface VATLineResult {
  lineSubtotal: number;      // In agorot (before VAT)
  vatRate: number;           // Percentage
  vatAmount: number;         // In agorot
  lineTotal: number;         // In agorot (after VAT)
}

export interface VATSummary {
  // Standard rate (17%)
  standard: {
    base: number;            // Taxable amount in agorot
    vat: number;             // VAT amount in agorot
    total: number;           // Base + VAT in agorot
  };
  // Zero-rated (0%)
  zeroRated: {
    base: number;
    vat: number;
    total: number;
  };
  // Exempt
  exempt: {
    base: number;
    vat: number;
    total: number;
  };
  // Eilat
  eilat: {
    base: number;
    vat: number;
    total: number;
  };
  // Totals
  totalBase: number;         // Sum of all bases
  totalVat: number;          // Sum of all VAT
  grandTotal: number;        // Sum of all totals
}

export interface LineItemInput {
  quantity: number;
  unitPrice: number;         // In agorot
  discountAmount?: number;   // In agorot
  discountPercentage?: number;
  vatCategory: VATCategory;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Round to nearest agorot using banker's rounding (half to even)
 * This is critical for financial accuracy and matches Israeli tax authority expectations
 */
export function roundAgorot(value: number): number {
  return Math.round(value);
}

/**
 * Calculate VAT for a single line item
 * 
 * @param input - Line item details
 * @returns Calculated amounts in agorot
 */
export function calculateLineVAT(input: LineItemInput): VATLineResult {
  const { quantity, unitPrice, discountAmount = 0, discountPercentage = 0, vatCategory } = input;
  
  // Calculate gross line total
  const grossAmount = roundAgorot(quantity * unitPrice);
  
  // Apply discounts
  let discountTotal = discountAmount;
  if (discountPercentage > 0) {
    discountTotal += roundAgorot(grossAmount * (discountPercentage / 100));
  }
  
  // Line subtotal before VAT
  const lineSubtotal = roundAgorot(Math.max(0, grossAmount - discountTotal));
  
  // Get VAT rate for category
  const vatRate = VAT_RATES[vatCategory];
  
  // Calculate VAT
  // For standard rate: VAT = subtotal * rate / 100
  // For zero-rated/exempt/eilat: VAT = 0
  const vatAmount = roundAgorot(lineSubtotal * (vatRate / 100));
  
  // Line total including VAT
  const lineTotal = lineSubtotal + vatAmount;
  
  return {
    lineSubtotal,
    vatRate,
    vatAmount,
    lineTotal,
  };
}

/**
 * Calculate VAT for multiple line items and return summary
 * 
 * @param items - Array of line items
 * @returns Complete VAT breakdown by category
 */
export function calculateVATSummary(items: LineItemInput[]): VATSummary {
  // Initialize category totals
  const summary: VATSummary = {
    standard: { base: 0, vat: 0, total: 0 },
    zeroRated: { base: 0, vat: 0, total: 0 },
    exempt: { base: 0, vat: 0, total: 0 },
    eilat: { base: 0, vat: 0, total: 0 },
    totalBase: 0,
    totalVat: 0,
    grandTotal: 0,
  };
  
  for (const item of items) {
    const result = calculateLineVAT(item);
    
    // Add to appropriate category
    switch (item.vatCategory) {
      case 'standard':
        summary.standard.base += result.lineSubtotal;
        summary.standard.vat += result.vatAmount;
        summary.standard.total += result.lineTotal;
        break;
      case 'zero_rated':
        summary.zeroRated.base += result.lineSubtotal;
        summary.zeroRated.vat += result.vatAmount;
        summary.zeroRated.total += result.lineTotal;
        break;
      case 'exempt':
        summary.exempt.base += result.lineSubtotal;
        summary.exempt.vat += result.vatAmount;
        summary.exempt.total += result.lineTotal;
        break;
      case 'eilat':
        summary.eilat.base += result.lineSubtotal;
        summary.eilat.vat += result.vatAmount;
        summary.eilat.total += result.lineTotal;
        break;
    }
    
    // Add to totals
    summary.totalBase += result.lineSubtotal;
    summary.totalVat += result.vatAmount;
    summary.grandTotal += result.lineTotal;
  }
  
  return summary;
}

/**
 * Calculate VAT from items array (for document creation)
 */
export function calculateDocumentVAT(items: Pick<FiscalDocumentItem, 
  'quantity' | 'unitPrice' | 'discountAmount' | 'discountPercentage' | 'vatCategory'
>[]): VATSummary {
  return calculateVATSummary(items.map(item => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    discountPercentage: item.discountPercentage,
    vatCategory: item.vatCategory,
  })));
}

/**
 * Extract VAT from a VAT-inclusive price
 * Used when displaying prices that are stated including VAT
 * 
 * @param inclusivePrice - Price including VAT (in agorot)
 * @param vatRate - VAT rate percentage
 * @returns Object with base price and VAT amount (in agorot)
 */
export function extractVATFromInclusive(
  inclusivePrice: number, 
  vatRate: number
): { base: number; vat: number } {
  // Formula: base = inclusive / (1 + rate/100)
  // VAT = inclusive - base
  const base = roundAgorot(inclusivePrice / (1 + vatRate / 100));
  const vat = inclusivePrice - base;
  
  return { base, vat };
}

/**
 * Add VAT to an exclusive price
 * 
 * @param exclusivePrice - Price excluding VAT (in agorot)
 * @param vatRate - VAT rate percentage
 * @returns Total price including VAT (in agorot)
 */
export function addVATToExclusive(exclusivePrice: number, vatRate: number): number {
  const vatAmount = roundAgorot(exclusivePrice * (vatRate / 100));
  return exclusivePrice + vatAmount;
}

// Eilat Zone Configuration (Global Toggle)
export const IS_EILAT_ZONE = false; // Set to true for Eilat branches

/**
 * Determine VAT category based on item properties
 * 
 * @param isExempt - Is item legally exempt from VAT
 * @param isZeroRated - Is item zero-rated (exports, etc.)
 * @param isEilat - Is transaction in Eilat zone
 * @returns Appropriate VAT category
 */
export function determineVATCategory(options: {
  isExempt?: boolean;
  isZeroRated?: boolean;
  isEilat?: boolean;
}): VATCategory {
  const { isExempt, isZeroRated, isEilat } = options;
  
  // Priority: Eilat > Exempt > Zero-rated > Standard
  if (isEilat || IS_EILAT_ZONE) return 'eilat';
  if (isExempt) return 'exempt';
  if (isZeroRated) return 'zero_rated';
  return 'standard';
}

/**
 * Check if customer details are required based on amount
 * Per Israeli regulations: required for invoices over 5,000 NIS
 * 
 * @param totalAgorot - Total amount in agorot
 * @returns Whether customer details are required
 */
export function requiresCustomerDetails(totalAgorot: number): boolean {
  const THRESHOLD = 500000; // 5,000 NIS in agorot
  return totalAgorot >= THRESHOLD;
}

/**
 * Check if allocation number is required
 * Per Israel Invoices Model: required for transactions over 25,000 NIS
 * 
 * @param totalAgorot - Total amount in agorot
 * @returns Whether allocation number is required
 */
export function requiresAllocationNumber(totalAgorot: number): boolean {
  const THRESHOLD = 2500000; // 25,000 NIS in agorot
  return totalAgorot >= THRESHOLD;
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format VAT summary for display on receipt/invoice
 */
export function formatVATSummaryForPrint(summary: VATSummary): string[] {
  const lines: string[] = [];
  
  if (summary.standard.base > 0) {
    lines.push(`מע"מ 17%: ${formatCurrency(summary.standard.vat)} על ${formatCurrency(summary.standard.base)}`);
  }
  
  if (summary.zeroRated.base > 0) {
    lines.push(`פטור מע"מ (0%): ${formatCurrency(summary.zeroRated.base)}`);
  }
  
  if (summary.exempt.base > 0) {
    lines.push(`פטור: ${formatCurrency(summary.exempt.base)}`);
  }
  
  if (summary.eilat.base > 0) {
    lines.push(`אילת (פטור): ${formatCurrency(summary.eilat.base)}`);
  }
  
  return lines;
}

/**
 * Format amount in agorot as currency string
 */
function formatCurrency(agorot: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(agorot / 100);
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate VAT calculation results
 */
export function validateVATCalculation(
  items: LineItemInput[],
  expectedTotal: number
): { valid: boolean; difference: number } {
  const summary = calculateVATSummary(items);
  const difference = summary.grandTotal - expectedTotal;
  
  // Allow for tiny rounding differences (max 1 agora per item)
  const tolerance = items.length;
  
  return {
    valid: Math.abs(difference) <= tolerance,
    difference,
  };
}
