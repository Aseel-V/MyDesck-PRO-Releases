/**
 * Fiscal Receipt Template - Thermal Printer Format
 * 
 * 80mm thermal receipt template for Israeli POS compliance.
 * Designed for ESC/POS printers and PDF generation.
 * 
 * Includes:
 * - Business header
 * - Itemized list with VAT
 * - VAT breakdown
 * - Sequential document number
 * - Hash chain signature
 */

import { useMemo } from 'react';
import type { FiscalDocument } from '../../types/fiscal';
import { formatNIS } from '../../types/fiscal';
import { formatHashForReceipt } from '../../lib/fiscal/hashChain';
import { getDocumentTypeName } from '../../lib/fiscal/documentNumbering';

// ============================================================================
// TYPES
// ============================================================================

interface FiscalReceiptTemplateProps {
  document: FiscalDocument;
  showHash?: boolean;
  locale?: 'he' | 'en' | 'ar';
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FiscalReceiptTemplate({
  document,
  showHash = true,
  locale = 'he',
}: FiscalReceiptTemplateProps) {
  const isRTL = locale === 'he' || locale === 'ar';
  const docTypeName = getDocumentTypeName(document.documentType);
  
  // Format date and time
  const formattedDateTime = useMemo(() => {
    const date = new Date(document.createdAt);
    return {
      date: date.toLocaleDateString('he-IL'),
      time: date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    };
  }, [document.createdAt]);

  return (
    <div 
      className="bg-gradient-to-b from-slate-50 to-white text-slate-900 font-sans shadow-2xl rounded-xl overflow-hidden"
      style={{ 
        width: 'min(90vw, 380px)',
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      {/* Business Header - Gradient Banner */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-5 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }} />
        
        {document.business.logoUrl ? (
          <div className="relative w-16 h-16 mx-auto mb-3 rounded-2xl bg-white/20 backdrop-blur-sm p-2 border border-white/30">
            <img 
              src={document.business.logoUrl} 
              alt="Logo" 
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="relative w-16 h-16 mx-auto mb-3 rounded-2xl bg-white/20 backdrop-blur-sm p-3 border border-white/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        )}
        
        <h1 className="relative text-2xl font-bold tracking-wide drop-shadow-sm">
          {document.business.name}
        </h1>
        
        <div className="relative mt-2 text-sm text-white/90 font-medium">
          {formattedDateTime.time}, {formattedDateTime.date}
        </div>
        
        <div className="relative text-xs text-white/75 mt-1 font-mono">
          {docTypeName.he} #{document.fullDocumentNumber}
        </div>
      </div>

      {/* Content Container */}
      <div className="p-5 space-y-4">
        
        {/* Customer Details (if present) */}
        {document.customer?.name && (
          <div className="bg-slate-100 rounded-xl p-3 border border-slate-200">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">לקוח</div>
            <div className="text-sm font-medium text-slate-800">{document.customer.name}</div>
            {document.customer.idNumber && (
              <div className="text-xs text-slate-500">ת.ז./ח.פ.: {document.customer.idNumber}</div>
            )}
          </div>
        )}

        {/* Items List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <div className="col-span-7 text-right">פריט</div>
            <div className="col-span-2 text-center">כמות</div>
            <div className="col-span-3 text-left">סה"כ</div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-slate-100">
            {document.items.map((item, index) => (
              <div key={item.id || index} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-50/50 transition-colors">
                <div className="col-span-7 text-right">
                  <div className="text-sm font-medium text-slate-800">{item.descriptionHe || item.description}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {formatNIS(item.unitPrice)} × {item.quantity}
                    {item.unit !== 'pcs' && ` ${item.unit}`}
                  </div>
                  {item.discountAmount > 0 && (
                    <div className="text-xs text-rose-500 font-medium mt-0.5">
                      הנחה: {formatNIS(item.discountAmount)}-
                    </div>
                  )}
                </div>
                <div className="col-span-2 text-center text-sm text-slate-600">
                  {item.quantity}
                </div>
                <div className="col-span-3 text-left text-sm font-bold text-slate-800">
                  {formatNIS(item.lineTotal)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Section */}
        <div className="space-y-2 text-sm">
          {/* Document-level Discount */}
          {document.discountAmount > 0 && (
            <div className="flex justify-between text-rose-500 font-medium">
              <span>הנחה:</span>
              <span>{formatNIS(document.discountAmount)}-</span>
            </div>
          )}

          {/* Subtotal before VAT */}
          <div className="flex justify-between text-slate-600">
            <span>לפני מע"מ:</span>
            <span>{formatNIS(document.subtotalBeforeVat)}</span>
          </div>

          {/* VAT Breakdown */}
          {document.vat17Amount > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>מע"מ (17%):</span>
              <span>{formatNIS(document.vat17Amount)}</span>
            </div>
          )}
          {document.vat0Base > 0 && (
            <div className="flex justify-between text-xs text-slate-400">
              <span>פטור (0%):</span>
              <span>{formatNIS(document.vat0Base)}</span>
            </div>
          )}
          {document.exemptBase > 0 && (
            <div className="flex justify-between text-xs text-slate-400">
              <span>פטור:</span>
              <span>{formatNIS(document.exemptBase)}</span>
            </div>
          )}

          {/* Tip (if present) */}
          {document.tipAmount > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>טיפ:</span>
              <span>{formatNIS(document.tipAmount)}</span>
            </div>
          )}
        </div>

        {/* Grand Total */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl p-4 shadow-lg">
          <div className="flex justify-between items-center text-2xl font-bold">
            <span>סה"כ:</span>
            <span className="font-mono">{formatNIS(document.totalAmount)}</span>
          </div>
        </div>

        {/* Payment / Change Info */}
        {document.paymentMethod && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-emerald-700 font-medium">שולם ב:</span>
              <span className="text-sm font-bold text-emerald-800">{getPaymentMethodName(document.paymentMethod)}</span>
            </div>
            {document.paymentReference && (
              <div className="text-xs text-emerald-600 mt-1 text-center">
                אסמכתא: {document.paymentReference}
              </div>
            )}
          </div>
        )}

        {/* Allocation Number (if applicable) */}
        {document.allocationNumber && (
          <div className="text-center text-xs text-slate-400 pt-2 border-t border-dashed border-slate-200">
            <span className="font-medium">מספר הקצאה:</span> {document.allocationNumber}
          </div>
        )}

        {/* Hash Signature (Black Box) */}
        {showHash && (
          <div className="text-center text-xs pt-2 border-t border-dashed border-slate-200 font-mono text-slate-400">
            <div className="text-slate-500 mb-1">חתימה דיגיטלית:</div>
            <div className="tracking-widest text-[10px] break-all">
              {formatHashForReceipt(document.documentHash, document.previousHash || 'GENESIS')}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 border-t border-dashed border-slate-200">
          <div className="text-sm font-semibold text-slate-600">תודה על קנייתכם!</div>
          <div className="text-xs text-slate-400 mt-1">
            MyDesck PRO Software
          </div>
        </div>

        {/* Printed Notes */}
        {document.printedNotes && (
          <div className="text-center text-xs text-slate-500 bg-amber-50 rounded-lg p-2 border border-amber-200">
            {document.printedNotes}
          </div>
        )}

        {/* Cancellation Notice */}
        {document.status === 'cancelled' && (
          <div className="text-center rounded-xl bg-rose-500 text-white p-4 shadow-lg">
            <div className="text-xl font-bold">*** מבוטל ***</div>
            {document.cancellationReason && (
              <div className="text-sm font-normal mt-1 opacity-90">
                {document.cancellationReason}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getPaymentMethodName(method: string): string {
  const names: Record<string, string> = {
    cash: 'מזומן',
    credit_card: 'כרטיס אשראי',
    debit_card: 'כרטיס חיוב',
    check: "צ'ק",
    bank_transfer: 'העברה בנקאית',
    digital_wallet: 'ארנק דיגיטלי',
    credit: 'אשראי',
    multi: 'תשלום מפוצל',
    other: 'אחר',
  };
  return names[method] || method;
}

// ============================================================================
// EXPORT
// ============================================================================

export default FiscalReceiptTemplate;
