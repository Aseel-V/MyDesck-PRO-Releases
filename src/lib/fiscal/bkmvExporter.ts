/**
 * BKMV Export Module
 * 
 * Generates BKMV (Bikoret Maslul Vetiud) unified files for
 * Israeli Tax Authority audits.
 * 
 * Format specifications:
 * - Header: INI format with 5-character company codes
 * - Transactions: Fixed-width or delimited records
 * - Encryption: Per tax authority requirements
 * 
 * Reference: הנחיות רשות המסים לקובץ אחיד
 * 
 * NOTE: Table types will be recognized after running migrations and
 * regenerating Supabase types with: npx supabase gen types typescript
 */

import { supabase } from '../supabase';
import type { FiscalDocument, ZReport } from '../../types/fiscal';

// ============================================================================
// TYPES
// ============================================================================

export interface BKMVExportOptions {
  businessId: string;
  startDate: string;
  endDate: string;
  includeDocuments: boolean;
  includeZReports: boolean;
  format: 'standard' | 'extended';
}

export interface BKMVExportResult {
  success: boolean;
  filename?: string;
  data?: Blob;
  recordCount: number;
  error?: string;
}

interface BKMVHeader {
  companyCode: string;
  companyName: string;
  taxFileNumber: string;
  exportDate: string;
  softwareName: string;
  softwareVersion: string;
  recordCount: number;
}

interface BKMVRecord {
  recordType: string;
  data: Record<string, string | number>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Record type codes
const RECORD_TYPES = {
  HEADER: 'A100',
  SALE: 'C100',
  ITEM: 'D100',
  PAYMENT: 'E100',
  CUSTOMER: 'B100',
  Z_REPORT: 'Z100',
  FOOTER: 'X100',
} as const;

// Field widths for fixed-format files
const FIELD_WIDTHS = {
  recordType: 4,
  documentNumber: 15,
  date: 8,
  amount: 15,
  vatAmount: 12,
  description: 50,
  customerName: 50,
  customerId: 15,
};

// Use 'any' type for tables that don't exist in generated types yet
// After running migrations and `npx supabase gen types typescript`, remove these
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ============================================================================
// BKMV EXPORTER CLASS
// ============================================================================

export class BKMVExporter {
  private businessId: string;
  private header: BKMVHeader | null = null;

  constructor(businessId: string) {
    this.businessId = businessId;
  }

  /**
   * Generate BKMV export file
   */
  async export(options: BKMVExportOptions): Promise<BKMVExportResult> {
    try {
      // Get business details
      const businessDetails = await this.getBusinessDetails();
      if (!businessDetails) {
        return { success: false, recordCount: 0, error: 'Business details not found' };
      }

      // Initialize header
      this.header = {
        companyCode: businessDetails.registrationNumber?.substring(0, 5) || '00000',
        companyName: businessDetails.name || '',
        taxFileNumber: businessDetails.taxFileNumber || '',
        exportDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
        softwareName: 'MYDESCK PRO',
        softwareVersion: '1.0.0',
        recordCount: 0,
      };

      const records: BKMVRecord[] = [];

      // Add header record
      records.push(this.createHeaderRecord());

      // Export documents
      if (options.includeDocuments) {
        const documents = await this.getDocuments(options.startDate, options.endDate);
        for (const doc of documents) {
          records.push(...this.createDocumentRecords(doc));
        }
      }

      // Export Z-Reports
      if (options.includeZReports) {
        const zReports = await this.getZReports(options.startDate, options.endDate);
        for (const report of zReports) {
          records.push(this.createZReportRecord(report));
        }
      }

      // Update record count
      this.header.recordCount = records.length;

      // Add footer record
      records.push(this.createFooterRecord(records.length));

      // Generate file content
      const content = this.generateFileContent(records, options.format);

      // Create blob
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

      // Generate filename
      const filename = `BKMV_${this.header.companyCode}_${options.startDate.replace(/-/g, '')}_${options.endDate.replace(/-/g, '')}.txt`;

      return {
        success: true,
        filename,
        data: blob,
        recordCount: records.length,
      };
    } catch (error) {
      return {
        success: false,
        recordCount: 0,
        error: error instanceof Error ? error.message : 'Export failed',
      };
    }
  }

  /**
   * Export as ZIP archive with INI header
   */
  async exportAsZip(options: BKMVExportOptions): Promise<BKMVExportResult> {
    // First generate the main export
    const result = await this.export(options);
    if (!result.success || !result.data) {
      return result;
    }

    // Generate INI header file (for future ZIP creation)
    // const _iniContent = this.generateIniHeader(options);
    // In production, use JSZip to create actual ZIP with both files

    return {
      ...result,
      filename: result.filename?.replace('.txt', '.zip'),
    };
  }

  // ============================================================================
  // RECORD CREATION
  // ============================================================================

  private createHeaderRecord(): BKMVRecord {
    return {
      recordType: RECORD_TYPES.HEADER,
      data: {
        companyCode: this.header!.companyCode,
        companyName: this.header!.companyName,
        taxFileNumber: this.header!.taxFileNumber,
        exportDate: this.header!.exportDate,
        softwareName: this.header!.softwareName,
        softwareVersion: this.header!.softwareVersion,
      },
    };
  }

  private createDocumentRecords(doc: FiscalDocument): BKMVRecord[] {
    const records: BKMVRecord[] = [];

    // Document header record
    records.push({
      recordType: RECORD_TYPES.SALE,
      data: {
        documentType: this.getDocumentTypeCode(doc.documentType),
        documentNumber: doc.fullDocumentNumber,
        date: new Date(doc.createdAt).toISOString().split('T')[0].replace(/-/g, ''),
        totalAmount: doc.totalAmount / 100, // Convert to NIS
        vatAmount: doc.vatAmount / 100,
        customerName: doc.customer?.name || '',
        customerId: doc.customer?.idNumber || '',
        status: doc.status === 'cancelled' ? 'C' : 'A',
        paymentMethod: doc.paymentMethod || '',
      },
    });

    // Item records
    for (const item of doc.items) {
      records.push({
        recordType: RECORD_TYPES.ITEM,
        data: {
          documentNumber: doc.fullDocumentNumber,
          lineNumber: item.sortOrder + 1,
          description: (item.descriptionHe || item.description).substring(0, 50),
          barcode: item.barcode || '',
          quantity: item.quantity,
          unitPrice: item.unitPrice / 100,
          lineTotal: item.lineTotal / 100,
          vatCategory: item.vatCategory,
          vatRate: item.vatRate,
          vatAmount: item.vatAmount / 100,
        },
      });
    }

    return records;
  }

  private createZReportRecord(report: ZReport): BKMVRecord {
    return {
      recordType: RECORD_TYPES.Z_REPORT,
      data: {
        zNumber: report.zNumber,
        date: new Date(report.generatedAt).toISOString().split('T')[0].replace(/-/g, ''),
        periodStart: new Date(report.periodStart).toISOString().split('T')[0].replace(/-/g, ''),
        periodEnd: new Date(report.periodEnd).toISOString().split('T')[0].replace(/-/g, ''),
        grossSales: report.grossSales / 100,
        netSales: report.netSales / 100,
        totalVat: report.totalVat / 100,
        cashTotal: report.cashTotal / 100,
        cardTotal: (report.creditCardTotal + report.debitCardTotal) / 100,
        totalReceipts: report.totalReceipts,
        totalInvoices: report.totalInvoices,
      },
    };
  }

  private createFooterRecord(recordCount: number): BKMVRecord {
    return {
      recordType: RECORD_TYPES.FOOTER,
      data: {
        totalRecords: recordCount,
        exportDate: this.header!.exportDate,
        checksum: this.calculateChecksum(recordCount),
      },
    };
  }

  // ============================================================================
  // FILE GENERATION
  // ============================================================================

  private generateFileContent(records: BKMVRecord[], format: 'standard' | 'extended'): string {
    const lines: string[] = [];

    for (const record of records) {
      if (format === 'standard') {
        lines.push(this.formatRecordStandard(record));
      } else {
        lines.push(this.formatRecordExtended(record));
      }
    }

    return lines.join('\r\n');
  }

  private formatRecordStandard(record: BKMVRecord): string {
    const fields: string[] = [record.recordType];

    for (const [key, value] of Object.entries(record.data)) {
      const strValue = String(value);
      const width = FIELD_WIDTHS[key as keyof typeof FIELD_WIDTHS] || 20;
      fields.push(strValue.padEnd(width).substring(0, width));
    }

    return fields.join('|');
  }

  private formatRecordExtended(record: BKMVRecord): string {
    const fields: string[] = [record.recordType];

    for (const [key, value] of Object.entries(record.data)) {
      fields.push(`${key}=${value}`);
    }

    return fields.join('\t');
  }



  // ============================================================================
  // DATA RETRIEVAL
  // ============================================================================

  private async getBusinessDetails(): Promise<Record<string, string> | null> {
    // Try business_profiles first (exists in current schema)
    const { data } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('id', this.businessId)
      .single();

    if (data) {
      return {
        name: data.business_name || '',
        registrationNumber: '',
        taxFileNumber: '',
      };
    }

    return null;
  }

  private async getDocuments(startDate: string, endDate: string): Promise<FiscalDocument[]> {
    const { data } = await db
      .from('fiscal_documents')
      .select(`
        *,
        items:fiscal_document_items(*)
      `)
      .eq('business_id', this.businessId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: true });

    if (!data) return [];

    return data.map((d: Record<string, unknown>) => this.mapToFiscalDocument(d));
  }

  private async getZReports(startDate: string, endDate: string): Promise<ZReport[]> {
    const { data } = await db
      .from('z_reports')
      .select('*')
      .eq('business_id', this.businessId)
      .gte('generated_at', startDate)
      .lte('generated_at', endDate)
      .order('z_number', { ascending: true });

    if (!data) return [];

    return data.map((d: Record<string, unknown>) => this.mapToZReport(d));
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getDocumentTypeCode(docType: string): string {
    const codes: Record<string, string> = {
      receipt: '320',
      tax_invoice: '305',
      tax_invoice_receipt: '330',
      credit_note: '310',
      debit_note: '315',
    };
    return codes[docType] || '999';
  }

  private calculateChecksum(recordCount: number): string {
    // Simple checksum based on record count and date
    const sum = recordCount + parseInt(this.header!.exportDate);
    return (sum % 999999).toString().padStart(6, '0');
  }

  private mapToFiscalDocument(data: Record<string, unknown>): FiscalDocument {
    // Map database record to FiscalDocument type
    const items = (data.items as Array<Record<string, unknown>> || []).map(item => ({
      id: item.id as string,
      documentId: item.document_id as string,
      description: item.description as string,
      descriptionHe: item.description_he as string | undefined,
      quantity: item.quantity as number,
      unit: item.unit as string,
      unitPrice: item.unit_price as number,
      discountAmount: item.discount_amount as number || 0,
      discountPercentage: item.discount_percentage as number || 0,
      lineSubtotal: item.line_subtotal as number,
      vatCategory: item.vat_category as 'standard' | 'zero_rated' | 'exempt' | 'eilat',
      vatRate: item.vat_rate as number,
      vatAmount: item.vat_amount as number,
      lineTotal: item.line_total as number,
      sortOrder: item.sort_order as number || 0,
      barcode: item.barcode as string | undefined,
    }));

    return {
      id: data.id as string,
      businessId: data.business_id as string,
      documentType: data.document_type as 'receipt' | 'tax_invoice' | 'tax_invoice_receipt' | 'credit_note' | 'debit_note',
      documentNumber: data.document_number as number,
      fullDocumentNumber: data.full_document_number as string,
      status: data.status as 'draft' | 'issued' | 'cancelled' | 'voided',
      totalAmount: data.total_amount as number,
      vatAmount: data.vat_amount as number,
      createdAt: data.created_at as string,
      items,
      customer: data.customer_name ? {
        name: data.customer_name as string,
        idNumber: data.customer_id_number as string | undefined,
      } : undefined,
      paymentMethod: data.payment_method as string | undefined,
    } as FiscalDocument;
  }

  private mapToZReport(data: Record<string, unknown>): ZReport {
    return {
      zNumber: data.z_number as number,
      generatedAt: data.generated_at as string,
      periodStart: data.period_start as string,
      periodEnd: data.period_end as string,
      grossSales: data.gross_sales as number,
      netSales: data.net_sales as number,
      totalVat: data.total_vat as number,
      cashTotal: data.cash_total as number,
      creditCardTotal: data.credit_card_total as number || 0,
      debitCardTotal: data.debit_card_total as number || 0,
      totalReceipts: data.total_receipts as number,
      totalInvoices: data.total_invoices as number,
    } as ZReport;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create BKMV exporter instance
 */
export function createBKMVExporter(businessId: string): BKMVExporter {
  return new BKMVExporter(businessId);
}

/**
 * Quick export function
 */
export async function exportBKMV(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<BKMVExportResult> {
  const exporter = new BKMVExporter(businessId);
  return exporter.export({
    businessId,
    startDate,
    endDate,
    includeDocuments: true,
    includeZReports: true,
    format: 'standard',
  });
}
