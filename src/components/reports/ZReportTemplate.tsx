/**
 * Z-Report Template - Printable
 * 
 * End-of-day report template for Israeli POS compliance.
 * Designed for 80mm thermal printers and A4 PDF.
 */

import { useMemo } from 'react';
import type { ZReport } from '../../types/fiscal';
import { formatNIS } from '../../types/fiscal';
import { shortHash } from '../../lib/fiscal/hashChain';

// ============================================================================
// TYPES
// ============================================================================

interface ZReportTemplateProps {
  report: ZReport;
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  format?: 'thermal' | 'a4';
  locale?: 'he' | 'en';
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ZReportTemplate({
  report,
  businessName,
  businessAddress,
  businessPhone,
  format = 'thermal',
  locale = 'he',
}: ZReportTemplateProps) {
  const isRTL = locale === 'he';
  const isThermal = format === 'thermal';

  // Format dates
  const formattedPeriod = useMemo(() => {
    const start = new Date(report.periodStart);
    const end = new Date(report.periodEnd);
    return {
      startDate: start.toLocaleDateString('he-IL'),
      startTime: start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
      endDate: end.toLocaleDateString('he-IL'),
      endTime: end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    };
  }, [report.periodStart, report.periodEnd]);

  const generatedDate = useMemo(() => {
    const date = new Date(report.generatedAt);
    return {
      date: date.toLocaleDateString('he-IL'),
      time: date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    };
  }, [report.generatedAt]);

  return (
    <div
      className={`bg-white text-black font-mono ${isThermal ? 'text-xs' : 'text-sm'}`}
      style={{
        width: isThermal ? '80mm' : '210mm',
        padding: isThermal ? '4mm' : '20mm',
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      {/* Header */}
      <div className="text-center border-b-2 border-black pb-3 mb-3">
        <div className={`font-bold ${isThermal ? 'text-lg' : 'text-2xl'}`}>
          {isRTL ? 'דוח Z - סיום יום' : 'Z-Report - End of Day'}
        </div>
        <div className={`font-bold ${isThermal ? 'text-xl' : 'text-3xl'} mt-2`}>
          Z-{report.zNumber}
        </div>
      </div>

      {/* Business Info */}
      <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
        <div className="font-bold">{businessName}</div>
        {businessAddress && <div className="text-xs">{businessAddress}</div>}
        {businessPhone && <div className="text-xs">טל: {businessPhone}</div>}
      </div>

      {/* Period */}
      <Section title={isRTL ? 'תקופת הדוח' : 'Report Period'}>
        <Row label={isRTL ? 'מתאריך:' : 'From:'} value={`${formattedPeriod.startDate} ${formattedPeriod.startTime}`} />
        <Row label={isRTL ? 'עד תאריך:' : 'To:'} value={`${formattedPeriod.endDate} ${formattedPeriod.endTime}`} />
      </Section>

      {/* Sales Summary */}
      <Section title={isRTL ? 'סיכום מכירות' : 'Sales Summary'}>
        <Row label={isRTL ? 'מכירות ברוטו:' : 'Gross Sales:'} value={formatNIS(report.grossSales)} bold />
        {report.returnsRefunds > 0 && (
          <Row label={isRTL ? 'החזרות/זיכויים:' : 'Returns/Refunds:'} value={`-${formatNIS(report.returnsRefunds)}`} className="text-red-600" />
        )}
        {report.discounts > 0 && (
          <Row label={isRTL ? 'הנחות:' : 'Discounts:'} value={`-${formatNIS(report.discounts)}`} />
        )}
        <Row label={isRTL ? 'מכירות נטו:' : 'Net Sales:'} value={formatNIS(report.netSales)} bold className="border-t border-gray-400 pt-1" />
      </Section>

      {/* VAT Summary - CRITICAL FOR TAX AUTHORITY */}
      <Section title={isRTL ? 'פירוט מע"מ' : 'VAT Summary'}>
        <div className="border border-gray-400 p-2">
          {report.vat17Taxable > 0 && (
            <>
              <Row label={isRTL ? 'בסיס מס 17%:' : 'Tax Base 17%:'} value={formatNIS(report.vat17Taxable)} />
              <Row label={isRTL ? 'מע"מ 17%:' : 'VAT 17%:'} value={formatNIS(report.vat17Tax)} bold />
            </>
          )}
          {report.vat0Taxable > 0 && (
            <Row label={isRTL ? 'פטור (0%):' : 'Zero-Rated:'} value={formatNIS(report.vat0Taxable)} />
          )}
          {report.exemptTaxable > 0 && (
            <Row label={isRTL ? 'פטור ממע"מ:' : 'Exempt:'} value={formatNIS(report.exemptTaxable)} />
          )}
          <Row 
            label={isRTL ? 'סה"כ מע"מ:' : 'Total VAT:'} 
            value={formatNIS(report.totalVat)} 
            bold 
            className="border-t border-gray-400 pt-1 mt-1"
          />
        </div>
      </Section>

      {/* Payment Methods */}
      <Section title={isRTL ? 'אמצעי תשלום' : 'Payment Methods'}>
        <Row label={isRTL ? 'מזומן:' : 'Cash:'} value={formatNIS(report.cashTotal)} />
        <Row label={isRTL ? 'כרטיס אשראי:' : 'Credit Card:'} value={formatNIS(report.creditCardTotal)} />
        {report.debitCardTotal > 0 && (
          <Row label={isRTL ? 'כרטיס חיוב:' : 'Debit Card:'} value={formatNIS(report.debitCardTotal)} />
        )}
        {report.checksTotal > 0 && (
          <Row label={isRTL ? "צ'קים:" : 'Checks:'} value={formatNIS(report.checksTotal)} />
        )}
        {report.otherPaymentsTotal > 0 && (
          <Row label={isRTL ? 'אחר:' : 'Other:'} value={formatNIS(report.otherPaymentsTotal)} />
        )}
      </Section>

      {/* Document Counts */}
      <Section title={isRTL ? 'ספירת מסמכים' : 'Document Counts'}>
        <Row 
          label={isRTL ? 'קבלות:' : 'Receipts:'} 
          value={`${report.totalReceipts}${report.firstReceiptNumber && report.lastReceiptNumber ? ` (${report.firstReceiptNumber}-${report.lastReceiptNumber})` : ''}`}
        />
        <Row 
          label={isRTL ? 'חשבוניות:' : 'Invoices:'} 
          value={`${report.totalInvoices}${report.firstInvoiceNumber && report.lastInvoiceNumber ? ` (${report.firstInvoiceNumber}-${report.lastInvoiceNumber})` : ''}`}
        />
        {report.totalCreditNotes > 0 && (
          <Row label={isRTL ? 'הודעות זיכוי:' : 'Credit Notes:'} value={report.totalCreditNotes.toString()} />
        )}
        {report.totalCancelledDocs > 0 && (
          <Row label={isRTL ? 'מסמכים מבוטלים:' : 'Cancelled:'} value={report.totalCancelledDocs.toString()} className="text-red-600" />
        )}
      </Section>

      {/* Cash Drawer Reconciliation */}
      <Section title={isRTL ? 'התאמת קופה' : 'Cash Reconciliation'}>
        <Row label={isRTL ? 'מזומן פתיחה:' : 'Opening Cash:'} value={formatNIS(report.openingCash)} />
        {report.cashIn > 0 && (
          <Row label={isRTL ? 'כניסות מזומן:' : 'Cash In:'} value={`+${formatNIS(report.cashIn)}`} />
        )}
        {report.cashOut > 0 && (
          <Row label={isRTL ? 'יציאות מזומן:' : 'Cash Out:'} value={`-${formatNIS(report.cashOut)}`} />
        )}
        <Row label={isRTL ? 'צפי מזומן:' : 'Expected Cash:'} value={formatNIS(report.expectedCash)} bold className="border-t border-gray-400 pt-1" />
        
        {report.actualCash !== undefined && (
          <>
            <Row label={isRTL ? 'מזומן בפועל:' : 'Actual Cash:'} value={formatNIS(report.actualCash)} />
            {report.cashVariance !== undefined && report.cashVariance !== 0 && (
              <Row 
                label={isRTL ? 'הפרש:' : 'Variance:'} 
                value={`${report.cashVariance > 0 ? '+' : ''}${formatNIS(report.cashVariance)}`}
                bold
                className={report.cashVariance < 0 ? 'text-red-600' : 'text-green-600'}
              />
            )}
          </>
        )}
      </Section>

      {/* Signature & Hash Chain */}
      <div className="border-t-2 border-black pt-3 mt-3">
        <div className="text-center">
          <div className={`font-bold ${isThermal ? 'text-sm' : 'text-base'}`}>
            {isRTL ? 'חתימה דיגיטלית' : 'Digital Signature'}
          </div>
          <div className="font-mono text-xs tracking-widest mt-1">
            {shortHash(report.reportHash)}
          </div>
          {report.previousZHash && (
            <div className="text-xs text-gray-500 mt-1">
              {isRTL ? 'קודם:' : 'Previous:'} {shortHash(report.previousZHash)}
            </div>
          )}
          <div className={`mt-2 ${report.signatureChainValid ? 'text-green-600' : 'text-red-600'}`}>
            {report.signatureChainValid 
              ? (isRTL ? '✓ שרשרת תקינה' : '✓ Chain Valid') 
              : (isRTL ? '✗ שרשרת פגומה!' : '✗ Chain Broken!')
            }
          </div>
        </div>
      </div>

      {/* Generation Info */}
      <div className="text-center text-xs mt-4 pt-2 border-t border-dashed border-gray-400">
        <div>
          {isRTL ? 'הופק על ידי:' : 'Generated by:'} {report.generatedByName || report.generatedBy}
        </div>
        <div>
          {generatedDate.date} {generatedDate.time}
        </div>
      </div>

      {/* Notes */}
      {report.notes && (
        <div className="mt-2 p-2 bg-gray-100 text-xs">
          <div className="font-bold">{isRTL ? 'הערות:' : 'Notes:'}</div>
          <div>{report.notes}</div>
        </div>
      )}

      {/* Legal Footer */}
      <div className="text-center text-xs mt-4 text-gray-500">
        <div>{isRTL ? 'מסמך זה מהווה דוח Z רשמי לצורכי מס' : 'This is an official Z-Report for tax purposes'}</div>
        <div className="mt-1">MyDesck PRO</div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
      <div className="font-bold mb-1 text-center">{title}</div>
      {children}
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}

function Row({ label, value, bold = false, className = '' }: RowProps) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''} ${className}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ============================================================================
// EXPORT
// ============================================================================

export default ZReportTemplate;
