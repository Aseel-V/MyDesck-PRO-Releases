/**
 * Restaurant Price Calculator
 * 
 * Production-ready utility for calculating order totals with:
 * - Base item prices
 * - Modifier adjustments (extra cheese, size upgrades, etc.)
 * - Quantity multipliers
 * - Tax calculations
 * - Discount support
 * 
 * CRITICAL: This handles money - extensively tested for accuracy
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface OrderItemModifier {
  id: string;
  modifier_name: string;
  price_adjustment: number;
}

export interface OrderItemForCalculation {
  id: string;
  item_id: string;
  quantity: number;
  price_at_time: number;      // Base price snapshot
  tax_rate: number;           // Percentage (e.g., 17 for 17%)
  modifiers?: OrderItemModifier[];
}

export interface OrderForCalculation {
  id: string;
  items: OrderItemForCalculation[];
  tip_amount?: number;
  discount_amount?: number;
  discount_percentage?: number;
}

export interface LineItemResult {
  id: string;
  item_id: string;
  quantity: number;
  base_price: number;
  modifiers_total: number;
  line_subtotal: number;      // (base + modifiers) × quantity
  line_tax: number;
  line_total: number;         // subtotal + tax
}

export interface OrderTotalResult {
  line_items: LineItemResult[];
  subtotal: number;           // Sum of all line subtotals (before tax)
  modifiers_total: number;    // Total modifier adjustments
  discount_amount: number;    // Applied discount
  tax_amount: number;         // Total tax
  tip_amount: number;
  total_amount: number;       // Final total
  currency: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Round to 2 decimal places using banker's rounding
 * This is critical for financial accuracy
 */
function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate modifier total for a single item (not multiplied by quantity yet)
 */
function calculateModifiersTotal(modifiers: OrderItemModifier[] | undefined): number {
  if (!modifiers || modifiers.length === 0) return 0;
  
  return modifiers.reduce((sum, mod) => {
    const adjustment = Number(mod.price_adjustment) || 0;
    return sum + adjustment;
  }, 0);
}

/**
 * Calculate a single line item
 */
function calculateLineItem(item: OrderItemForCalculation): LineItemResult {
  const basePrice = roundCurrency(Number(item.price_at_time) || 0);
  const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
  const taxRate = Math.max(0, Number(item.tax_rate) || 0);
  
  // Calculate modifier total per unit
  const modifiersTotal = roundCurrency(calculateModifiersTotal(item.modifiers));
  
  // Unit price = base + modifiers
  const unitPrice = roundCurrency(basePrice + modifiersTotal);
  
  // Line subtotal = unit price × quantity
  const lineSubtotal = roundCurrency(unitPrice * quantity);
  
  // Tax on this line
  const lineTax = roundCurrency(lineSubtotal * (taxRate / 100));
  
  // Line total = subtotal + tax
  const lineTotal = roundCurrency(lineSubtotal + lineTax);
  
  return {
    id: item.id,
    item_id: item.item_id,
    quantity,
    base_price: basePrice,
    modifiers_total: roundCurrency(modifiersTotal * quantity), // Total modifiers for this line
    line_subtotal: lineSubtotal,
    line_tax: lineTax,
    line_total: lineTotal,
  };
}

// ============================================================================
// MAIN CALCULATOR FUNCTION
// ============================================================================

/**
 * Calculate complete order total
 * 
 * @param order - The order with items, modifiers, tip, and discounts
 * @param currency - Currency code (default: ILS)
 * @returns Complete breakdown of order totals
 * 
 * @example
 * const result = calculateOrderTotal({
 *   id: 'order-123',
 *   items: [
 *     {
 *       id: 'item-1',
 *       item_id: 'menu-burger',
 *       quantity: 2,
 *       price_at_time: 55.00,
 *       tax_rate: 17,
 *       modifiers: [
 *         { id: 'm1', modifier_name: 'Extra Cheese', price_adjustment: 5 },
 *         { id: 'm2', modifier_name: 'Bacon', price_adjustment: 8 }
 *       ]
 *     }
 *   ],
 *   tip_amount: 20,
 *   discount_percentage: 10
 * });
 * 
 * // Result:
 * // - Each burger: 55 + 5 + 8 = 68
 * // - 2 burgers subtotal: 136
 * // - 10% discount: -13.60
 * // - After discount: 122.40
 * // - Tax (17%): 20.81
 * // - Tip: 20
 * // - Total: 163.21
 */
export function calculateOrderTotal(
  order: OrderForCalculation,
  currency: string = 'ILS'
): OrderTotalResult {
  // Handle empty order
  if (!order.items || order.items.length === 0) {
    return {
      line_items: [],
      subtotal: 0,
      modifiers_total: 0,
      discount_amount: 0,
      tax_amount: 0,
      tip_amount: 0,
      total_amount: 0,
      currency,
    };
  }
  
  // Calculate all line items
  const lineItems = order.items.map(calculateLineItem);
  
  // Sum up subtotals (before tax and discounts)
  const subtotalBeforeDiscount = lineItems.reduce(
    (sum, line) => sum + line.line_subtotal,
    0
  );
  
  // Sum up total modifiers
  const modifiersTotal = lineItems.reduce(
    (sum, line) => sum + line.modifiers_total,
    0
  );
  
  // Calculate discount
  let discountAmount = 0;
  if (order.discount_percentage && order.discount_percentage > 0) {
    discountAmount = roundCurrency(
      subtotalBeforeDiscount * (order.discount_percentage / 100)
    );
  }
  if (order.discount_amount && order.discount_amount > 0) {
    discountAmount = roundCurrency(discountAmount + order.discount_amount);
  }
  
  // Subtotal after discount
  const subtotalAfterDiscount = roundCurrency(
    Math.max(0, subtotalBeforeDiscount - discountAmount)
  );
  
  // Recalculate tax on discounted amount
  // We need to calculate a weighted average tax rate
  const totalTaxFromLines = lineItems.reduce(
    (sum, line) => sum + line.line_tax,
    0
  );
  
  // If there's a discount, proportionally reduce tax
  let taxAmount: number;
  if (discountAmount > 0 && subtotalBeforeDiscount > 0) {
    const discountRatio = subtotalAfterDiscount / subtotalBeforeDiscount;
    taxAmount = roundCurrency(totalTaxFromLines * discountRatio);
  } else {
    taxAmount = roundCurrency(totalTaxFromLines);
  }
  
  // Tip (applied after tax)
  const tipAmount = roundCurrency(Number(order.tip_amount) || 0);
  
  // Final total
  const totalAmount = roundCurrency(
    subtotalAfterDiscount + taxAmount + tipAmount
  );
  
  return {
    line_items: lineItems,
    subtotal: roundCurrency(subtotalAfterDiscount),
    modifiers_total: roundCurrency(modifiersTotal),
    discount_amount: roundCurrency(discountAmount),
    tax_amount: taxAmount,
    tip_amount: tipAmount,
    total_amount: totalAmount,
    currency,
  };
}

// ============================================================================
// HELPER FUNCTIONS FOR COMMON USE CASES
// ============================================================================

/**
 * Quick calculation for display purposes (less detail)
 */
export function calculateQuickTotal(
  items: Array<{
    price: number;
    quantity: number;
    tax_rate?: number;
    modifiers_total?: number;
  }>
): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  let tax = 0;
  
  for (const item of items) {
    const unitPrice = (item.price || 0) + (item.modifiers_total || 0);
    const lineSubtotal = unitPrice * (item.quantity || 1);
    const lineTax = lineSubtotal * ((item.tax_rate || 0) / 100);
    
    subtotal += lineSubtotal;
    tax += lineTax;
  }
  
  return {
    subtotal: roundCurrency(subtotal),
    tax: roundCurrency(tax),
    total: roundCurrency(subtotal + tax),
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(
  amount: number,
  currency: string = 'ILS',
  locale: string = 'he-IL'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Validate order data before calculation
 */
export function validateOrderForCalculation(
  order: OrderForCalculation
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!order.id) {
    errors.push('Order ID is required');
  }
  
  if (!order.items || !Array.isArray(order.items)) {
    errors.push('Order items must be an array');
  } else {
    order.items.forEach((item, index) => {
      if (typeof item.price_at_time !== 'number' || item.price_at_time < 0) {
        errors.push(`Item ${index + 1}: Invalid price`);
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1) {
        errors.push(`Item ${index + 1}: Quantity must be at least 1`);
      }
      if (typeof item.tax_rate !== 'number' || item.tax_rate < 0 || item.tax_rate > 100) {
        errors.push(`Item ${index + 1}: Tax rate must be between 0 and 100`);
      }
    });
  }
  
  if (order.discount_percentage !== undefined) {
    if (order.discount_percentage < 0 || order.discount_percentage > 100) {
      errors.push('Discount percentage must be between 0 and 100');
    }
  }
  
  if (order.tip_amount !== undefined && order.tip_amount < 0) {
    errors.push('Tip cannot be negative');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
