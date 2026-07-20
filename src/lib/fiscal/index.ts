/**
 * Israeli Fiscal Module - Barrel Export
 * 
 * Main entry point for all fiscal-related functionality.
 */

// Types
export type {
  FiscalDocument,
  FiscalDocumentItem,
  FiscalDocumentType,
  FiscalDocumentStatus,
  VATCategory,
  BusinessDetails,
  CustomerDetails,
  CreateFiscalDocumentRequest,
  ZReport,
  XReport,
  CashShift,
  ShiftTransaction,
  IsraelInvoicesConfig,
  AllocationRequest,
  AllocationResponse,
  InventoryBatch,
  ShrinkageRecord,
  ShrinkageType,
  PaymentMethod,
} from '../../types/fiscal';

// Utility functions from types
export {
  toAgorot,
  toNIS,
  formatNIS,
} from '../../types/fiscal';

// VAT Calculator
export {
  VAT_RATES,
  VAT_CATEGORY_NAMES,
  calculateLineVAT,
  calculateVATSummary,
  calculateDocumentVAT,
  extractVATFromInclusive,
  addVATToExclusive,
  determineVATCategory,
  requiresCustomerDetails,
  requiresAllocationNumber,
  formatVATSummaryForPrint,
  roundAgorot,
  type VATLineResult,
  type VATSummary,
  type LineItemInput,
} from './vatCalculator';

// Document Numbering
export {
  getNextDocumentNumber,
  getCurrentCounterState,
  getAllCounterStates,
  getDocumentTypeName,
  validateDocumentSequence,
  formatDocumentNumber,
  type DocumentNumber,
  type CounterState,
} from './documentNumbering';

// Hash Chain
export {
  calculateDocumentHash,
  verifyDocumentHash,
  getPreviousDocumentHash,
  calculateZReportHash,
  getPreviousZReportHash,
  validateDocumentChain,
  validateZReportChain,
  shortHash,
  formatHashForReceipt,
  type HashResult,
  type ChainValidationResult,
} from './hashChain';

// Fiscal Document Service
export {
  FiscalDocumentService,
  createFiscalDocumentService,
  type CreateDocumentResult,
  type CancelDocumentResult,
} from './fiscalDocumentService';

// Israel Invoices Model API
export {
  IsraelInvoicesClient,
  createIsraelInvoicesClient,
  createIsraelInvoicesClientFromEnv,
} from './israelInvoicesApi';

// BKMV Export
export {
  BKMVExporter,
  createBKMVExporter,
  exportBKMV,
  type BKMVExportOptions,
  type BKMVExportResult,
} from './bkmvExporter';
