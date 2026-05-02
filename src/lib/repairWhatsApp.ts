import { supabase } from './supabase';

interface SendWhatsAppParams {
  phone: string;
  customerName: string;
  vehicleModel: string;
  totalAmount: number;
  debtAmount: number;
  receiptLink?: string; // Optional link to PDF
  type: 'repair_completed' | 'debt_reminder';
  currency?: string;
}

export const sendRepairWhatsApp = async ({
  phone,
  customerName,
  vehicleModel,
  totalAmount,
  debtAmount,
  receiptLink,
  type,
  currency = '$'
}: SendWhatsAppParams) => {
  try {
    const message = type === 'repair_completed'
      ? `Hello ${customerName}, your car ${vehicleModel} is ready. Total: ${currency}${totalAmount}. Debt Remaining: ${currency}${debtAmount}. ${receiptLink ? `Receipt: ${receiptLink}` : ''}`
      : `Hello ${customerName}, this is a reminder that you have an outstanding balance of ${currency}${debtAmount} for your car ${vehicleModel}. Please arrange payment.`;

    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        phone,
        message, // Assuming the function accepts raw message or we map it to template params
        template_name: type,
        template_params: {
            name: customerName,
            car_model: vehicleModel,
            total: totalAmount,
            debt: debtAmount,
            link: receiptLink
        }
      },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to send WhatsApp:', error);
    throw error;
  }
};
