import { BusinessProfile } from './supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Define the shape of our Repair Order for PDF purposes
export interface RepairOrderPDFData {
  id: string;
  plate_number: string;
  vehicle_model: string;
  odometer: number;
  customer_name: string;
  customer_phone: string;
  completed_at: string;
  items: Array<{
    name: string;
    type: 'part' | 'labor';
    quantity: number;
    price: number;
    total: number;
    warranty?: string;
  }>;
  parts_total: number;
  labor_total: number;
  discount: number;
  grand_total: number;
  paid_amount: number;
  old_debt: number; // Snapshot from ledger
  total_due: number; // grand_total - paid_amount + old_debt
}

export const generateRepairInvoicePDF = async (
  order: RepairOrderPDFData,
  profile: BusinessProfile
): Promise<Uint8Array> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // -- Header --
  doc.setFontSize(22);
  doc.text(profile.business_name || 'Auto Repair Shop', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(profile.address || '', pageWidth / 2, 26, { align: 'center' });
  doc.text(`Phone: ${profile.phone_number || ''}`, pageWidth / 2, 31, { align: 'center' });

  // -- Invoice Info --
  doc.setFontSize(12);
  doc.text(`Invoice #: ${order.id.slice(0, 8).toUpperCase()}`, 14, 45);
  doc.text(`Date: ${new Date(order.completed_at || Date.now()).toLocaleDateString()}`, 14, 51);

  // -- Vehicle & Customer --
  doc.setDrawColor(200);
  doc.roundedRect(14, 56, pageWidth - 28, 25, 3, 3, 'S');
  
  doc.setFontSize(10);
  doc.text('Vehicle Details:', 18, 62);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`${order.vehicle_model} | ${order.plate_number}`, 18, 68);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Odometer: ${order.odometer} km`, 18, 74);

  doc.text('Customer:', 120, 62);
  doc.setFontSize(12);
  doc.text(order.customer_name, 120, 68);
  doc.setFontSize(10);
  doc.text(order.customer_phone, 120, 74);

  // -- Parts Table --
  const parts = order.items.filter(i => i.type === 'part');
  let finalY = 90;

  if (parts.length > 0) {
    doc.setFontSize(14);
    doc.text('Parts & Materials', 14, 88);
    
    autoTable(doc, {
      startY: 92,
      head: [['Item Name', 'Qty', 'Price', 'Warranty', 'Total']],
      body: parts.map(p => [
        p.name,
        p.quantity,
        p.price.toFixed(2),
        p.warranty ? `${p.warranty} days` : '-',
        p.total.toFixed(2)
      ]),
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    });
    // @ts-ignore
    finalY = doc.lastAutoTable.finalY + 10;
  }

  // -- Labor Table --
  const labor = order.items.filter(i => i.type === 'labor');
  if (labor.length > 0) {
    doc.setFontSize(14);
    doc.text('Labor / Services', 14, finalY);
    
    autoTable(doc, {
      startY: finalY + 4,
      head: [['Description', 'Qty', 'Rate', 'Total']],
      body: labor.map(l => [
        l.name,
        l.quantity,
        l.price.toFixed(2),
        l.total.toFixed(2)
      ]),
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    });
    // @ts-ignore
    finalY = doc.lastAutoTable.finalY + 10;
  }

  // -- Totals --
  const rightColX = pageWidth - 60;
  
  doc.line(14, finalY, pageWidth - 14, finalY); // Separator
  finalY += 10;

  doc.setFontSize(10);
  doc.text('Parts Total:', rightColX, finalY);
  doc.text(order.parts_total.toFixed(2), pageWidth - 14, finalY, { align: 'right' });
  finalY += 6;

  doc.text('Labor Total:', rightColX, finalY);
  doc.text(order.labor_total.toFixed(2), pageWidth - 14, finalY, { align: 'right' });
  finalY += 6;

  doc.text('Discount:', rightColX, finalY);
  doc.text(`-${order.discount.toFixed(2)}`, pageWidth - 14, finalY, { align: 'right' });
  finalY += 8;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text('Grand Total:', rightColX, finalY);
  doc.text(order.grand_total.toFixed(2), pageWidth - 14, finalY, { align: 'right' });
  finalY += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text('Paid Amount:', rightColX, finalY);
  doc.text(order.paid_amount.toFixed(2), pageWidth - 14, finalY, { align: 'right' });
  finalY += 6;

  // -- Previous Debt Section (The Accountant) --
  if (order.old_debt > 0) {
      doc.setTextColor(200, 0, 0); // Red
      doc.text('Previous Debt:', rightColX, finalY);
      doc.text(order.old_debt.toFixed(2), pageWidth - 14, finalY, { align: 'right' });
      finalY += 6;
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text('TOTAL DUE:', rightColX, finalY);
      doc.text(order.total_due.toFixed(2), pageWidth - 14, finalY, { align: 'right' });
      doc.setTextColor(0, 0, 0); // Reset black
  } else {
      // Just Current Balance
      const currentBalance = order.grand_total - order.paid_amount;
      if (currentBalance > 0) {
          doc.text('Balance Due:', rightColX, finalY);
          doc.text(currentBalance.toFixed(2), pageWidth - 14, finalY, { align: 'right' });
      } else {
          doc.setTextColor(0, 128, 0);
          doc.text('PAID IN FULL', rightColX, finalY);
          doc.setTextColor(0, 0, 0);
      }
  }

  // Footer
  doc.setFontSize(8);
  doc.text('Thank you for your business!', pageWidth / 2, pageWidth - 20, { align: 'center' });

  return new Uint8Array(doc.output('arraybuffer'));
};
