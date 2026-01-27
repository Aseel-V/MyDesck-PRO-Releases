/**
 * Fiscal Document Service
 * 
 * Main service for creating and managing Israeli fiscal documents.
 * Implements full compliance with Israeli tax authority requirements.
 * 
 * Features:
 * - Sequential numbering (no gaps)
 * - Hash chain integrity
 * - VAT calculations
 * - Israel Invoices Model integration
 * - Customer detail requirements
 */

import { supabase } from '../supabase';

// Use 'any' type for tables and functions that don't exist in generated types yet
// After running migrations and `npx supabase gen types typescript`, remove this
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
import type { 
  FiscalDocument, 
  FiscalDocumentItem, 
  FiscalDocumentType,
  FiscalDocumentStatus,
  CreateFiscalDocumentRequest,
  BusinessDetails,
  VATCategory,
  PaymentMethod,
} from '../../types/fiscal';
import { 
  calculateLineVAT, 
  calculateVATSummary, 
  requiresCustomerDetails,
  requiresAllocationNumber,
  roundAgorot,
} from './vatCalculator';
import { getNextDocumentNumber } from './documentNumbering';
import { calculateDocumentHash, getPreviousDocumentHash } from './hashChain';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateDocumentResult {
  success: boolean;
  document?: FiscalDocument;
  error?: string;
  warnings?: string[];
}

export interface CancelDocumentResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

export class FiscalDocumentService {
  private businessId: string;
  private businessDetails: BusinessDetails;

  constructor(businessId: string, businessDetails: BusinessDetails) {
    this.businessId = businessId;
    this.businessDetails = businessDetails;
  }

  /**
   * Create a new fiscal document
   */
  async createDocument(request: CreateFiscalDocumentRequest): Promise<CreateDocumentResult> {
    const warnings: string[] = [];

    try {
      // 1. Validate request
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // 2. Calculate line items with VAT
      const calculatedItems = this.calculateItems(request.items);
      
      // 3. Calculate totals
      const totals = this.calculateTotals(calculatedItems, request.discountAmount, request.tipAmount);
      
      // 4. Check if customer details are required
      if (requiresCustomerDetails(totals.totalAmount) && !request.customer?.name) {
        // For supermarket POS, we issue receipt if no customer details
        // But warn if trying to issue invoice without customer
        if (request.documentType !== 'receipt') {
          warnings.push('Customer details required for amounts over ₪5,000');
        }
      }

      // 5. Get next document number
      const docNumber = await getNextDocumentNumber(this.businessId, request.documentType);
      
      // 6. Prepare document for database
      const now = new Date().toISOString();
      
      const documentData = {
        business_id: this.businessId,
        document_type: request.documentType,
        document_number: docNumber.number,
        document_prefix: docNumber.prefix,
        status: 'issued' as FiscalDocumentStatus,
        
        // Business details
        business_name: this.businessDetails.name,
        business_registration_number: this.businessDetails.registrationNumber,
        business_address: this.businessDetails.address,
        business_phone: this.businessDetails.phone,
        business_email: this.businessDetails.email,
        
        // Customer details (if provided)
        customer_name: request.customer?.name,
        customer_id_number: request.customer?.idNumber,
        customer_address: request.customer?.address,
        customer_phone: request.customer?.phone,
        customer_email: request.customer?.email,
        
        // Linked document (for credit notes)
        original_document_id: request.originalDocumentId,
        
        // Totals
        subtotal_before_vat: totals.subtotalBeforeVat,
        vat_amount: totals.vatAmount,
        total_amount: totals.totalAmount,
        discount_amount: request.discountAmount || 0,
        tip_amount: request.tipAmount || 0,
        
        // VAT breakdown
        vat_17_base: totals.vat17Base,
        vat_17_amount: totals.vat17Amount,
        vat_0_base: totals.vat0Base,
        exempt_base: totals.exemptBase,
        
        // Allocation (will be updated later if required)
        allocation_status: requiresAllocationNumber(totals.totalAmount) ? 'pending' : 'not_required',
        
        // Hash will be calculated after insert
        document_hash: 'PENDING',
        previous_hash: await getPreviousDocumentHash(this.businessId, request.documentType),
        
        // Payment
        payment_method: request.paymentMethod,
        payment_reference: request.paymentReference,
        
        // Notes
        internal_notes: request.internalNotes,
        printed_notes: request.printedNotes,
        
        // Audit
        created_by: this.businessId, // TODO: Get actual user ID
        created_at: now,
      };

      // 7. Insert document
      const { data: insertedDoc, error: insertError } = await db
        .from('fiscal_documents')
        .insert(documentData)
        .select()
        .single();

      if (insertError) {
        console.error('Failed to insert document:', insertError);
        return { success: false, error: `Failed to create document: ${insertError.message}` };
      }

      // 8. Insert line items
      const itemsData = calculatedItems.map((item, index) => ({
        document_id: insertedDoc.id,
        item_id: item.itemId,
        barcode: item.barcode,
        description: item.description,
        description_he: item.descriptionHe,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
        discount_amount: item.discountAmount,
        discount_percentage: item.discountPercentage,
        line_subtotal: item.lineSubtotal,
        vat_category: item.vatCategory,
        vat_rate: item.vatRate,
        vat_amount: item.vatAmount,
        line_total: item.lineTotal,
        sort_order: index,
        unit_cost: item.unitCost || 0,
      }));

      const { error: itemsError } = await db
        .from('fiscal_document_items')
        .insert(itemsData);

      if (itemsError) {
        console.error('Failed to insert items:', itemsError);
        // Document was created but items failed - this is a problem
        // In production, this should be a transaction
        return { success: false, error: `Failed to create document items: ${itemsError.message}` };
      }

      // 9. Calculate and update hash
      const hashResult = await calculateDocumentHash({
        id: insertedDoc.id,
        businessId: this.businessId,
        documentType: request.documentType,
        documentNumber: docNumber.number,
        totalAmount: totals.totalAmount,
        createdAt: now,
      });

      await db
        .from('fiscal_documents')
        .update({ 
          document_hash: hashResult.hash,
          previous_hash: hashResult.previousHash,
        })
        .eq('id', insertedDoc.id);

      // 10. Build response document
      const document: FiscalDocument = {
        id: insertedDoc.id,
        businessId: this.businessId,
        documentType: request.documentType,
        documentNumber: docNumber.number,
        documentPrefix: docNumber.prefix,
        fullDocumentNumber: docNumber.fullNumber,
        status: 'issued',
        business: this.businessDetails,
        customer: request.customer,
        items: calculatedItems,
        subtotalBeforeVat: totals.subtotalBeforeVat,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
        discountAmount: request.discountAmount || 0,
        tipAmount: request.tipAmount || 0,
        vat17Base: totals.vat17Base,
        vat17Amount: totals.vat17Amount,
        vat0Base: totals.vat0Base,
        exemptBase: totals.exemptBase,
        allocationStatus: requiresAllocationNumber(totals.totalAmount) ? 'pending' : 'not_required',
        requiresAllocation: requiresAllocationNumber(totals.totalAmount),
        documentHash: hashResult.hash,
        previousHash: hashResult.previousHash,
        paymentMethod: request.paymentMethod,
        paymentReference: request.paymentReference,
        internalNotes: request.internalNotes,
        printedNotes: request.printedNotes,
        createdBy: this.businessId,
        createdAt: now,
        updatedAt: now,
      };

      return { success: true, document, warnings };

    } catch (error) {
      console.error('Error creating document:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Cancel a fiscal document
   * Note: Documents cannot be deleted - only marked as cancelled with reason
   */
  async cancelDocument(
    documentId: string, 
    reason: string
  ): Promise<CancelDocumentResult> {
    try {
      const { error } = await db.rpc('cancel_fiscal_document', {
        p_document_id: documentId,
        p_reason: reason,
        p_cancelled_by: this.businessId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get a document by ID
   */
  async getDocument(documentId: string): Promise<FiscalDocument | null> {
    const { data, error } = await db
      .from('fiscal_documents')
      .select(`
        *,
        items:fiscal_document_items(*)
      `)
      .eq('id', documentId)
      .eq('business_id', this.businessId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToFiscalDocument(data);
  }

  /**
   * Get documents by date range
   */
  async getDocumentsByDateRange(
    startDate: string,
    endDate: string,
    documentType?: FiscalDocumentType
  ): Promise<FiscalDocument[]> {
    let query = db
      .from('fiscal_documents')
      .select(`
        *,
        items:fiscal_document_items(*)
      `)
      .eq('business_id', this.businessId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (documentType) {
      query = query.eq('document_type', documentType);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((d: any) => this.mapToFiscalDocument(d));
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private validateRequest(request: CreateFiscalDocumentRequest): { valid: boolean; error?: string } {
    if (!request.items || request.items.length === 0) {
      return { valid: false, error: 'At least one item is required' };
    }

    for (const item of request.items) {
      if (!item.description) {
        return { valid: false, error: 'Item description is required' };
      }
      if (item.quantity <= 0) {
        return { valid: false, error: 'Item quantity must be positive' };
      }
      if (item.unitPrice < 0) {
        return { valid: false, error: 'Item unit price cannot be negative' };
      }
    }

    // For credit notes, original document is required
    if (request.documentType === 'credit_note' && !request.originalDocumentId) {
      return { valid: false, error: 'Credit note requires original document reference' };
    }

    return { valid: true };
  }

  private calculateItems(
    items: CreateFiscalDocumentRequest['items']
  ): FiscalDocumentItem[] {
    return items.map((item, index) => {
      const vatResult = calculateLineVAT({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        discountPercentage: item.discountPercentage,
        vatCategory: item.vatCategory,
      });

      return {
        id: `temp-${index}`,
        documentId: '',
        itemId: item.itemId,
        barcode: item.barcode,
        sku: item.sku,
        description: item.description,
        descriptionHe: item.descriptionHe,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        discountPercentage: item.discountPercentage || 0,
        lineSubtotal: vatResult.lineSubtotal,
        vatCategory: item.vatCategory,
        vatRate: vatResult.vatRate,
        vatAmount: vatResult.vatAmount,
        lineTotal: vatResult.lineTotal,
        sortOrder: index,
        unitCost: item.unitCost || 0,
      };
    });
  }

  private calculateTotals(
    items: FiscalDocumentItem[],
    discountAmount?: number,
    tipAmount?: number
  ) {
    const summary = calculateVATSummary(
      items.map(item => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        discountPercentage: item.discountPercentage,
        vatCategory: item.vatCategory,
      }))
    );

    // Apply document-level discount (on subtotal before VAT)
    const documentDiscount = roundAgorot(discountAmount || 0);
    const tip = roundAgorot(tipAmount || 0);
    
    // Adjust totals for discount
    const adjustedSubtotal = Math.max(0, summary.totalBase - documentDiscount);
    const discountRatio = summary.totalBase > 0 ? adjustedSubtotal / summary.totalBase : 1;
    const adjustedVat = roundAgorot(summary.totalVat * discountRatio);
    
    return {
      subtotalBeforeVat: adjustedSubtotal,
      vatAmount: adjustedVat,
      totalAmount: adjustedSubtotal + adjustedVat + tip,
      vat17Base: roundAgorot(summary.standard.base * discountRatio),
      vat17Amount: roundAgorot(summary.standard.vat * discountRatio),
      vat0Base: roundAgorot(summary.zeroRated.base * discountRatio),
      exemptBase: roundAgorot(summary.exempt.base * discountRatio),
    };
  }

  private mapToFiscalDocument(data: Record<string, unknown>): FiscalDocument {
    const items = (data.items as Array<Record<string, unknown>> || []).map(item => ({
      id: item.id as string,
      documentId: item.document_id as string,
      itemId: item.item_id as string | undefined,
      barcode: item.barcode as string | undefined,
      sku: item.sku as string | undefined,
      description: item.description as string,
      descriptionHe: item.description_he as string | undefined,
      quantity: item.quantity as number,
      unit: item.unit as string,
      unitPrice: item.unit_price as number,
      discountAmount: item.discount_amount as number,
      discountPercentage: item.discount_percentage as number,
      lineSubtotal: item.line_subtotal as number,
      vatCategory: item.vat_category as VATCategory,
      vatRate: item.vat_rate as number,
      vatAmount: item.vat_amount as number,
      lineTotal: item.line_total as number,
      sortOrder: item.sort_order as number,
    }));

    return {
      id: data.id as string,
      businessId: data.business_id as string,
      documentType: data.document_type as FiscalDocumentType,
      documentNumber: data.document_number as number,
      documentPrefix: data.document_prefix as string,
      fullDocumentNumber: data.full_document_number as string,
      status: data.status as FiscalDocumentStatus,
      business: {
        id: data.business_id as string,
        name: data.business_name as string,
        registrationNumber: data.business_registration_number as string,
        address: data.business_address as string,
        city: '',
        phone: data.business_phone as string,
        email: data.business_email as string | undefined,
      },
      customer: data.customer_name ? {
        name: data.customer_name as string,
        idNumber: data.customer_id_number as string | undefined,
        address: data.customer_address as string | undefined,
        phone: data.customer_phone as string | undefined,
        email: data.customer_email as string | undefined,
      } : undefined,
      items,
      subtotalBeforeVat: data.subtotal_before_vat as number,
      vatAmount: data.vat_amount as number,
      totalAmount: data.total_amount as number,
      discountAmount: data.discount_amount as number,
      tipAmount: data.tip_amount as number,
      vat17Base: data.vat_17_base as number,
      vat17Amount: data.vat_17_amount as number,
      vat0Base: data.vat_0_base as number,
      exemptBase: data.exempt_base as number,
      allocationNumber: data.allocation_number as string | undefined,
      allocationStatus: data.allocation_status as 'not_required' | 'pending' | 'success' | 'failed',
      allocationRequestedAt: data.allocation_requested_at as string | undefined,
      allocationReceivedAt: data.allocation_received_at as string | undefined,
      allocationError: data.allocation_error as string | undefined,
      requiresAllocation: data.requires_allocation as boolean,
      documentHash: data.document_hash as string,
      previousHash: data.previous_hash as string | undefined,
      signatureData: data.signature_data as string | undefined,
      paymentMethod: data.payment_method as PaymentMethod | undefined,
      paymentReference: data.payment_reference as string | undefined,
      internalNotes: data.internal_notes as string | undefined,
      printedNotes: data.printed_notes as string | undefined,
      cancelledAt: data.cancelled_at as string | undefined,
      cancelledBy: data.cancelled_by as string | undefined,
      cancellationReason: data.cancellation_reason as string | undefined,
      createdBy: data.created_by as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a FiscalDocumentService instance
 */
export function createFiscalDocumentService(
  businessId: string,
  businessDetails: BusinessDetails
): FiscalDocumentService {
  return new FiscalDocumentService(businessId, businessDetails);
}
