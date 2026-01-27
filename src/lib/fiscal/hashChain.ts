/**
 * Hash Chain Service (Black Box)
 * 
 * Implements cryptographic hash chaining for fiscal documents.
 * This creates an immutable audit trail where any tampering
 * is immediately detectable.
 * 
 * Each document's hash depends on:
 * 1. Previous document's hash (chain)
 * 2. Document's key fields
 * 
 * This is the software equivalent of a fiscal "black box".
 */

import { supabase } from '../supabase';

// Use 'any' type for tables and functions that don't exist in generated types yet
// After running migrations and `npx supabase gen types typescript`, remove this
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
import type { FiscalDocumentType, FiscalDocument, ZReport } from '../../types/fiscal';

// ============================================================================
// TYPES
// ============================================================================

export interface HashResult {
  hash: string;
  previousHash: string;
  timestamp: string;
}

export interface ChainValidationResult {
  valid: boolean;
  brokenAt?: number;
  brokenHash?: string;
  expectedHash?: string;
  actualHash?: string;
  message: string;
}

// ============================================================================
// HASH CALCULATION
// ============================================================================

/**
 * Calculate SHA-256 hash of input string
 * Uses Web Crypto API for security
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  
  // Use Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Create hash input string from document fields
 * Order is critical - never change this!
 */
function createDocumentHashInput(
  previousHash: string,
  businessId: string,
  documentType: FiscalDocumentType,
  documentNumber: number,
  totalAmount: number,
  createdAt: string
): string {
  return [
    previousHash,
    businessId,
    documentType,
    documentNumber.toString(),
    totalAmount.toString(),
    createdAt,
  ].join('|');
}

/**
 * Create hash input string from Z-Report fields
 */
function createZReportHashInput(
  previousHash: string,
  businessId: string,
  zNumber: number,
  netSales: number,
  totalVat: number,
  generatedAt: string
): string {
  return [
    previousHash,
    businessId,
    zNumber.toString(),
    netSales.toString(),
    totalVat.toString(),
    generatedAt,
  ].join('|');
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Get the previous document hash for chain linking
 * This is the genesis point if no documents exist
 */
export async function getPreviousDocumentHash(
  businessId: string,
  documentType: FiscalDocumentType
): Promise<string> {
  // Try database function first
  const { data, error } = await db.rpc('get_previous_document_hash', {
    p_business_id: businessId,
    p_document_type: documentType,
  });

  if (error) {
    console.error('Failed to get previous hash:', error);
    // Return genesis hash as fallback
    return 'GENESIS';
  }

  return (data as string) || 'GENESIS';
}

/**
 * Calculate and store document hash
 */
export async function calculateDocumentHash(
  document: Pick<FiscalDocument, 
    'id' | 'businessId' | 'documentType' | 'documentNumber' | 'totalAmount' | 'createdAt'
  >
): Promise<HashResult> {
  const timestamp = new Date().toISOString();
  
  // Get previous document's hash
  const previousHash = await getPreviousDocumentHash(
    document.businessId,
    document.documentType
  );
  
  // Create hash input
  const hashInput = createDocumentHashInput(
    previousHash,
    document.businessId,
    document.documentType,
    document.documentNumber,
    document.totalAmount,
    document.createdAt
  );
  
  // Calculate hash
  const hash = await sha256(hashInput);
  
  return {
    hash,
    previousHash,
    timestamp,
  };
}

/**
 * Verify a single document's hash
 */
export async function verifyDocumentHash(
  document: FiscalDocument,
  expectedPreviousHash?: string
): Promise<boolean> {
  // Get the expected previous hash
  const previousHash = expectedPreviousHash || document.previousHash || 'GENESIS';
  
  // Recreate hash input
  const hashInput = createDocumentHashInput(
    previousHash,
    document.businessId,
    document.documentType,
    document.documentNumber,
    document.totalAmount,
    document.createdAt
  );
  
  // Calculate expected hash
  const expectedHash = await sha256(hashInput);
  
  // Compare
  return document.documentHash === expectedHash;
}

/**
 * Get previous Z-Report hash for chain
 */
export async function getPreviousZReportHash(businessId: string): Promise<string> {
  const { data, error } = await db.rpc('get_previous_z_hash', {
    p_business_id: businessId,
  });

  if (error) {
    console.error('Failed to get previous Z hash:', error);
    return 'Z-GENESIS';
  }

  return (data as string) || 'Z-GENESIS';
}

/**
 * Calculate Z-Report hash
 */
export async function calculateZReportHash(
  report: Pick<ZReport, 
    'businessId' | 'zNumber' | 'netSales' | 'totalVat' | 'generatedAt'
  >
): Promise<HashResult> {
  const timestamp = new Date().toISOString();
  
  const previousHash = await getPreviousZReportHash(report.businessId);
  
  const hashInput = createZReportHashInput(
    previousHash,
    report.businessId,
    report.zNumber,
    report.netSales,
    report.totalVat,
    report.generatedAt
  );
  
  const hash = await sha256(hashInput);
  
  return {
    hash,
    previousHash,
    timestamp,
  };
}

// ============================================================================
// CHAIN VALIDATION
// ============================================================================

/**
 * Validate entire document chain for a business
 * Used for audit purposes
 */
export async function validateDocumentChain(
  businessId: string,
  documentType: FiscalDocumentType
): Promise<ChainValidationResult> {
  // Fetch all documents in order
  const { data: documents, error } = await db
    .from('fiscal_documents')
    .select('id, document_number, document_hash, previous_hash, total_amount, created_at')
    .eq('business_id', businessId)
    .eq('document_type', documentType)
    .order('document_number', { ascending: true });

  if (error) {
    return {
      valid: false,
      message: `Failed to fetch documents: ${error.message}`,
    };
  }

  if (!documents || documents.length === 0) {
    return {
      valid: true,
      message: 'No documents to validate',
    };
  }

  let previousHash = 'GENESIS';
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < (documents as any[]).length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (documents as any[])[i];
    
    // Verify the previous hash reference
    if (doc.previous_hash !== previousHash) {
      return {
        valid: false,
        brokenAt: doc.document_number,
        message: `Chain broken at document #${doc.document_number}: previous_hash mismatch`,
      };
    }
    
    // Recreate and verify the hash
    const hashInput = createDocumentHashInput(
      previousHash,
      businessId,
      documentType,
      doc.document_number,
      doc.total_amount,
      doc.created_at
    );
    
    const expectedHash = await sha256(hashInput);
    
    if (doc.document_hash !== expectedHash) {
      return {
        valid: false,
        brokenAt: doc.document_number,
        brokenHash: doc.document_hash,
        expectedHash,
        actualHash: doc.document_hash,
        message: `Hash mismatch at document #${doc.document_number}: possible tampering detected`,
      };
    }
    
    // Move to next document
    previousHash = doc.document_hash;
  }

  return {
    valid: true,
    message: `Chain validated: ${documents.length} documents verified`,
  };
}

/**
 * Validate Z-Report chain
 */
export async function validateZReportChain(
  businessId: string
): Promise<ChainValidationResult> {
  const { data: reports, error } = await db
    .from('z_reports')
    .select('id, z_number, report_hash, previous_z_hash, net_sales, total_vat, generated_at')
    .eq('business_id', businessId)
    .order('z_number', { ascending: true });

  if (error) {
    return {
      valid: false,
      message: `Failed to fetch Z-reports: ${error.message}`,
    };
  }

  if (!reports || reports.length === 0) {
    return {
      valid: true,
      message: 'No Z-reports to validate',
    };
  }

  let previousHash = 'Z-GENESIS';
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < (reports as any[]).length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = (reports as any[])[i];
    
    if (report.previous_z_hash !== previousHash) {
      return {
        valid: false,
        brokenAt: report.z_number,
        message: `Z-Report chain broken at Z-${report.z_number}: previous_hash mismatch`,
      };
    }
    
    const hashInput = createZReportHashInput(
      previousHash,
      businessId,
      report.z_number,
      report.net_sales,
      report.total_vat,
      report.generated_at
    );
    
    const expectedHash = await sha256(hashInput);
    
    if (report.report_hash !== expectedHash) {
      return {
        valid: false,
        brokenAt: report.z_number,
        expectedHash,
        actualHash: report.report_hash,
        message: `Z-Report hash mismatch at Z-${report.z_number}: possible tampering`,
      };
    }
    
    previousHash = report.report_hash;
  }

  return {
    valid: true,
    message: `Z-Report chain validated: ${reports.length} reports verified`,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a short hash for display purposes
 * (First 8 characters of full hash)
 */
export function shortHash(fullHash: string): string {
  return fullHash.substring(0, 8).toUpperCase();
}

/**
 * Format hash for printing on receipt
 */
export function formatHashForReceipt(hash: string, previousHash: string): string {
  return `${shortHash(hash)} <- ${shortHash(previousHash)}`;
}
