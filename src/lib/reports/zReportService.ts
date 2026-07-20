/**
 * Z-Report Service
 * 
 * End-of-day Z-Report generation and X-Report snapshots.
 * Implements Israeli fiscal requirements for daily closing.
 * 
 * Z-Report: Resets counters, immutable hash chain
 * X-Report: Snapshot only, no reset
 */

import { supabase } from '../supabase';

// Use 'any' type for tables and functions that don't exist in generated types yet
// After running migrations and `npx supabase gen types typescript`, remove this
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
import type { ZReport, XReport, CashShift } from '../../types/fiscal';
// Hash chain imports removed as they are currently unused in this file
// import { calculateZReportHash, getPreviousZReportHash } from '../fiscal/hashChain';

// ============================================================================
// TYPES
// ============================================================================

export interface ZReportResult {
  success: boolean;
  report?: ZReport;
  error?: string;
}

export interface XReportResult {
  success: boolean;
  report?: XReport;
  error?: string;
}

export interface OpenShiftResult {
  success: boolean;
  shift?: CashShift;
  error?: string;
}

export interface CloseShiftResult {
  success: boolean;
  shift?: CashShift;
  zReport?: ZReport;
  error?: string;
}

// ============================================================================
// CASH SHIFT MANAGEMENT
// ============================================================================

/**
 * Open a new cash shift
 */
export async function openCashShift(
  businessId: string,
  openingCash: number,  // In agorot
  openedByName: string,
  terminalId: string = 'POS-1'
): Promise<OpenShiftResult> {
  try {
    // Check for existing open shift
    const { data: existingShift } = await db
      .from('cash_shifts')
      .select('id')
      .eq('business_id', businessId)
      .eq('terminal_id', terminalId)
      .eq('status', 'open')
      .maybeSingle();

    if (existingShift) {
      return { 
        success: false, 
        error: 'A shift is already open for this terminal' 
      };
    }

    // Call the open shift function
    const { data, error } = await db.rpc('open_cash_shift', {
      p_business_id: businessId,
      p_opening_cash: openingCash,
      p_opened_by: businessId, // TODO: Get actual user ID
      p_opened_by_name: openedByName,
      p_terminal_id: terminalId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Fetch the created shift
    const { data: shift } = await db
      .from('cash_shifts')
      .select('*')
      .eq('id', data)
      .single();

    return { 
      success: true, 
      shift: mapToShift(shift) 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get current open shift
 */
export async function getCurrentShift(
  businessId: string,
  terminalId: string = 'POS-1'
): Promise<CashShift | null> {
  const { data, error } = await db
    .from('cash_shifts')
    .select('*')
    .eq('business_id', businessId)
    .eq('terminal_id', terminalId)
    .eq('status', 'open')
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapToShift(data);
}

/**
 * Record a transaction in the current shift
 */
export async function recordShiftTransaction(
  shiftId: string,
  transaction: {
    transactionType: 'sale' | 'refund' | 'void' | 'cash_in' | 'cash_out' | 'no_sale';
    amount: number;  // In agorot
    paymentMethod?: string;
    fiscalDocumentId?: string;
    orderId?: string;
    cardLastFour?: string;
    cardType?: string;
    authCode?: string;
    performedByName: string;
    notes?: string;
  }
): Promise<boolean> {
  try {
    const { error } = await db
      .from('shift_transactions')
      .insert({
        shift_id: shiftId,
        transaction_type: transaction.transactionType,
        amount: transaction.amount,
        payment_method: transaction.paymentMethod,
        fiscal_document_id: transaction.fiscalDocumentId,
        order_id: transaction.orderId,
        card_last_four: transaction.cardLastFour,
        card_type: transaction.cardType,
        auth_code: transaction.authCode,
        performed_by_name: transaction.performedByName,
        notes: transaction.notes,
      });

    return !error;
  } catch {
    return false;
  }
}

/**
 * Close shift and generate Z-Report
 */
export async function closeShiftWithZReport(
  shiftId: string,
  actualCash: number,  // In agorot
  closedByName: string,
  notes?: string
): Promise<CloseShiftResult> {
  try {
    const { data, error } = await db.rpc('close_shift_with_z_report', {
      p_shift_id: shiftId,
      p_actual_cash: actualCash,
      p_closed_by: null, // TODO: Get actual user ID
      p_closed_by_name: closedByName,
      p_notes: notes,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Fetch the created Z-Report
    const { data: zReport } = await db
      .from('z_reports')
      .select('*')
      .eq('id', data)
      .single();

    // Fetch the closed shift
    const { data: shift } = await db
      .from('cash_shifts')
      .select('*')
      .eq('id', shiftId)
      .single();

    return {
      success: true,
      shift: mapToShift(shift),
      zReport: mapToZReport(zReport),
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ============================================================================
// X-REPORT (SNAPSHOT)
// ============================================================================

/**
 * Generate X-Report (mid-day snapshot, no counter reset)
 */
export async function generateXReport(
  businessId: string,
  shiftId: string,
  generatedByName: string
): Promise<XReportResult> {
  try {
    // Get current shift totals
    const { data: shift } = await db
      .from('cash_shifts')
      .select('*')
      .eq('id', shiftId)
      .single();

    if (!shift) {
      return { success: false, error: 'Shift not found' };
    }

    // Insert X-Report
    const { data, error } = await db
      .from('x_reports')
      .insert({
        business_id: businessId,
        shift_id: shiftId,
        gross_sales: shift.total_sales,
        net_sales: shift.net_sales,
        total_vat: shift.vat_17_amount || 0,
        cash_total: shift.cash_sales,
        card_total: shift.card_sales,
        receipts_count: shift.receipts_issued,
        invoices_count: shift.invoices_issued,
        generated_by_name: generatedByName,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      report: mapToXReport(data),
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ============================================================================
// REPORT RETRIEVAL
// ============================================================================

/**
 * Get Z-Report by ID
 */
export async function getZReport(
  businessId: string,
  zReportId: string
): Promise<ZReport | null> {
  const { data, error } = await db
    .from('z_reports')
    .select('*')
    .eq('id', zReportId)
    .eq('business_id', businessId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapToZReport(data);
}

/**
 * Get Z-Reports by date range
 */
export async function getZReportsByDateRange(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<ZReport[]> {
  const { data, error } = await db
    .from('z_reports')
    .select('*')
    .eq('business_id', businessId)
    .gte('generated_at', startDate)
    .lte('generated_at', endDate)
    .order('z_number', { ascending: false });

  if (error || !data) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((item: any) => mapToZReport(item));
}

/**
 * Get latest Z-Report
 */
export async function getLatestZReport(businessId: string): Promise<ZReport | null> {
  const { data, error } = await db
    .from('z_reports')
    .select('*')
    .eq('business_id', businessId)
    .order('z_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapToZReport(data);
}

/**
 * Get all shifts for a date
 */
export async function getShiftsByDate(
  businessId: string,
  date: string
): Promise<CashShift[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const { data, error } = await db
    .from('cash_shifts')
    .select('*')
    .eq('business_id', businessId)
    .gte('opened_at', startOfDay.toISOString())
    .lte('opened_at', endOfDay.toISOString())
    .order('opened_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((item: any) => mapToShift(item));
}

// ============================================================================
// MAPPERS
// ============================================================================

function mapToShift(data: Record<string, unknown>): CashShift {
  return {
    id: data.id as string,
    businessId: data.business_id as string,
    shiftNumber: data.shift_number as number,
    terminalId: data.terminal_id as string,
    openedBy: data.opened_by as string,
    openedByName: data.opened_by_name as string | undefined,
    closedBy: data.closed_by as string | undefined,
    closedByName: data.closed_by_name as string | undefined,
    openedAt: data.opened_at as string,
    closedAt: data.closed_at as string | undefined,
    openingCash: data.opening_cash as number,
    expectedCash: data.expected_cash as number,
    actualCash: data.actual_cash as number | undefined,
    variance: data.variance as number | undefined,
    totalSales: data.total_sales as number,
    totalRefunds: data.total_refunds as number,
    totalVoids: data.total_voids as number,
    netSales: data.net_sales as number,
    cashSales: data.cash_sales as number,
    cardSales: data.card_sales as number,
    otherSales: data.other_sales as number,
    vat17Sales: data.vat_17_sales as number,
    vat17Amount: data.vat_17_amount as number,
    vat0Sales: data.vat_0_sales as number,
    exemptSales: data.exempt_sales as number,
    receiptsIssued: data.receipts_issued as number,
    invoicesIssued: data.invoices_issued as number,
    creditNotesIssued: data.credit_notes_issued as number,
    status: data.status as 'open' | 'closed' | 'reconciled',
    openingNotes: data.opening_notes as string | undefined,
    closingNotes: data.closing_notes as string | undefined,
    closingHash: data.closing_hash as string | undefined,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function mapToZReport(data: Record<string, unknown>): ZReport {
  return {
    id: data.id as string,
    businessId: data.business_id as string,
    zNumber: data.z_number as number,
    shiftId: data.shift_id as string | undefined,
    periodStart: data.period_start as string,
    periodEnd: data.period_end as string,
    grossSales: data.gross_sales as number,
    returnsRefunds: data.returns_refunds as number,
    discounts: data.discounts as number,
    netSales: data.net_sales as number,
    vat17Taxable: data.vat_17_taxable as number,
    vat17Tax: data.vat_17_tax as number,
    vat0Taxable: data.vat_0_taxable as number,
    exemptTaxable: data.exempt_taxable as number,
    totalVat: data.total_vat as number,
    cashTotal: data.cash_total as number,
    creditCardTotal: data.credit_card_total as number,
    debitCardTotal: data.debit_card_total as number,
    checksTotal: data.checks_total as number,
    otherPaymentsTotal: data.other_payments_total as number,
    firstReceiptNumber: data.first_receipt_number as number | undefined,
    lastReceiptNumber: data.last_receipt_number as number | undefined,
    totalReceipts: data.total_receipts as number,
    firstInvoiceNumber: data.first_invoice_number as number | undefined,
    lastInvoiceNumber: data.last_invoice_number as number | undefined,
    totalInvoices: data.total_invoices as number,
    totalCreditNotes: data.total_credit_notes as number,
    totalCancelledDocs: data.total_cancelled_docs as number,
    openingCash: data.opening_cash as number,
    cashIn: data.cash_in as number,
    cashOut: data.cash_out as number,
    expectedCash: data.expected_cash as number,
    actualCash: data.actual_cash as number | undefined,
    cashVariance: data.cash_variance as number | undefined,
    salesByCategory: data.sales_by_category as Record<string, number>,
    generatedBy: data.generated_by as string,
    generatedByName: data.generated_by_name as string | undefined,
    generatedAt: data.generated_at as string,
    reportHash: data.report_hash as string,
    previousZHash: data.previous_z_hash as string | undefined,
    signatureChainValid: data.signature_chain_valid as boolean,
    isFinal: data.is_final as boolean,
    sentToTaxAuthority: data.sent_to_tax_authority as boolean,
    sentAt: data.sent_at as string | undefined,
    notes: data.notes as string | undefined,
  };
}

function mapToXReport(data: Record<string, unknown>): XReport {
  return {
    id: data.id as string,
    businessId: data.business_id as string,
    shiftId: data.shift_id as string | undefined,
    reportNumber: data.report_number as number,
    snapshotAt: data.snapshot_at as string,
    grossSales: data.gross_sales as number,
    netSales: data.net_sales as number,
    totalVat: data.total_vat as number,
    cashTotal: data.cash_total as number,
    cardTotal: data.card_total as number,
    receiptsCount: data.receipts_count as number,
    invoicesCount: data.invoices_count as number,
    generatedBy: data.generated_by as string,
    generatedByName: data.generated_by_name as string | undefined,
    createdAt: data.created_at as string,
  };
}
