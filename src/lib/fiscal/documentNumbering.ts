/**
 * Document Numbering Service
 * 
 * Handles sequential document numbering with NO GAPS.
 * This is critical for Israeli fiscal compliance - any gap in document
 * numbers triggers audit flags.
 * 
 * Implementation uses atomic database operations to prevent race conditions.
 */

import { supabase } from '../supabase';
import type { FiscalDocumentType } from '../../types/fiscal';

// Use 'any' type for tables and functions that don't exist in generated types yet
// After running migrations and `npx supabase gen types typescript`, remove this
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentNumber {
  number: number;
  prefix: string;
  fullNumber: string;
}

export interface CounterState {
  documentType: FiscalDocumentType;
  currentNumber: number;
  prefix: string;
  lastIssuedAt: string | null;
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

/**
 * Get the next sequential document number
 * 
 * Uses atomic database operation to ensure no gaps and no duplicates.
 * This is the ONLY way to get a new document number.
 * 
 * @param businessId - Business UUID
 * @param documentType - Type of fiscal document
 * @returns Next sequential number
 */
export async function getNextDocumentNumber(
  businessId: string,
  documentType: FiscalDocumentType
): Promise<DocumentNumber> {
  // Call the atomic database function
  const { data, error } = await db.rpc('get_next_document_number', {
    p_business_id: businessId,
    p_document_type: documentType,
  });

  if (error) {
    console.error('Failed to get next document number:', error);
    throw new Error(`Failed to get document number: ${error.message}`);
  }

  // Get the prefix for this document type
  const prefix = getDocumentPrefix(documentType);

  const number = data as number;
  const fullNumber = prefix ? `${prefix}-${number}` : String(number);

  return {
    number,
    prefix,
    fullNumber,
  };
}

/**
 * Get current counter state (for display purposes only)
 * DO NOT use this to determine the next number - always use getNextDocumentNumber
 */
export async function getCurrentCounterState(
  businessId: string,
  documentType: FiscalDocumentType
): Promise<CounterState | null> {
  const { data, error } = await db
    .from('fiscal_counters')
    .select('*')
    .eq('business_id', businessId)
    .eq('document_type', documentType)
    .maybeSingle();

  if (error) {
    console.error('Failed to get counter state:', error);
    return null;
  }

  if (!data) {
    return {
      documentType,
      currentNumber: 0,
      prefix: getDocumentPrefix(documentType),
      lastIssuedAt: null,
    };
  }

  return {
    documentType,
    currentNumber: data.current_number,
    prefix: data.prefix || getDocumentPrefix(documentType),
    lastIssuedAt: data.last_issued_at,
  };
}

/**
 * Get all counter states for a business
 */
export async function getAllCounterStates(businessId: string): Promise<CounterState[]> {
  const { data, error } = await db
    .from('fiscal_counters')
    .select('*')
    .eq('business_id', businessId);

  if (error) {
    console.error('Failed to get all counters:', error);
    return [];
  }

  const documentTypes: FiscalDocumentType[] = [
    'receipt',
    'tax_invoice',
    'tax_invoice_receipt',
    'credit_note',
    'debit_note',
  ];

  // Return all document types, even those without counters yet
  return documentTypes.map(docType => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counter = data?.find((c: any) => c.document_type === docType);
    return {
      documentType: docType,
      currentNumber: counter?.current_number || 0,
      prefix: counter?.prefix || getDocumentPrefix(docType),
      lastIssuedAt: counter?.last_issued_at || null,
    };
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get document prefix based on type
 * These are common Israeli document prefixes
 */
function getDocumentPrefix(documentType: FiscalDocumentType): string {
  switch (documentType) {
    case 'receipt':
      return 'ק';        // קבלה
    case 'tax_invoice':
      return 'חמ';       // חשבונית מס
    case 'tax_invoice_receipt':
      return 'חמק';      // חשבונית מס קבלה
    case 'credit_note':
      return 'ז';        // הודעת זיכוי
    case 'debit_note':
      return 'ח';        // הודעת חיוב
    default:
      return '';
  }
}

/**
 * Get document type display name (Hebrew)
 */
export function getDocumentTypeName(documentType: FiscalDocumentType): { he: string; en: string } {
  switch (documentType) {
    case 'receipt':
      return { he: 'קבלה', en: 'Receipt' };
    case 'tax_invoice':
      return { he: 'חשבונית מס', en: 'Tax Invoice' };
    case 'tax_invoice_receipt':
      return { he: 'חשבונית מס קבלה', en: 'Tax Invoice Receipt' };
    case 'credit_note':
      return { he: 'הודעת זיכוי', en: 'Credit Note' };
    case 'debit_note':
      return { he: 'הודעת חיוב', en: 'Debit Note' };
    default:
      return { he: 'מסמך', en: 'Document' };
  }
}

/**
 * Validate document number sequence
 * Used for audit purposes to verify no gaps exist
 * 
 * @param businessId - Business UUID
 * @param documentType - Type of document to validate
 * @returns Validation result with any detected gaps
 */
export async function validateDocumentSequence(
  businessId: string,
  documentType: FiscalDocumentType
): Promise<{ 
  valid: boolean; 
  gaps: number[];
  firstNumber: number;
  lastNumber: number;
  totalDocuments: number;
}> {
  const { data, error } = await db
    .from('fiscal_documents')
    .select('document_number')
    .eq('business_id', businessId)
    .eq('document_type', documentType)
    .order('document_number', { ascending: true });

  if (error) {
    throw new Error(`Failed to validate sequence: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return {
      valid: true,
      gaps: [],
      firstNumber: 0,
      lastNumber: 0,
      totalDocuments: 0,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const numbers = data.map((d: any) => d.document_number);
  const gaps: number[] = [];
  
  for (let i = 1; i < numbers.length; i++) {
    const expected = numbers[i - 1] + 1;
    if (numbers[i] !== expected) {
      // Found a gap
      for (let missing = expected; missing < numbers[i]; missing++) {
        gaps.push(missing);
      }
    }
  }

  return {
    valid: gaps.length === 0,
    gaps,
    firstNumber: numbers[0],
    lastNumber: numbers[numbers.length - 1],
    totalDocuments: numbers.length,
  };
}

/**
 * Format document number for display
 * Includes proper RTL handling for Hebrew
 */
export function formatDocumentNumber(
  documentType: FiscalDocumentType,
  number: number,
  prefix?: string
): string {
  const actualPrefix = prefix || getDocumentPrefix(documentType);
  
  if (actualPrefix) {
    // For Hebrew prefixes, use LTR embedding for the number
    return `${actualPrefix}-${number}`;
  }
  
  return String(number);
}
