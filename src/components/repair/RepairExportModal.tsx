import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { generateRepairInvoicePDF, RepairOrderPDFData } from '../../lib/repairPdfGenerator';

interface RepairExportModalProps {
  order: RepairOrderPDFData;
  onClose: () => void;
}

export default function RepairExportModal({ order, onClose }: RepairExportModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const pdfBytes = await generateRepairInvoicePDF(order, profile);
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${order.plate_number}_${order.id.slice(0,6)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Export Repair Invoice</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg">
            <div className="flex justify-between text-sm mb-2">
               <span className="text-slate-400">Customer:</span>
               <span className="text-white font-medium">{order.customer_name}</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
               <span className="text-slate-400">Vehicle:</span>
               <span className="text-white font-medium">{order.vehicle_model} ({order.plate_number})</span>
            </div>
            <div className="flex justify-between text-sm border-t border-slate-700 pt-2 mt-2">
               <span className="text-slate-400">Total Due:</span>
               <span className="text-emerald-400 font-bold text-lg">${order.total_due.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
                <span>Generating...</span>
            ) : (
                <>
                    <Download className="w-5 h-5" />
                    Download Invoice PDF
                </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
