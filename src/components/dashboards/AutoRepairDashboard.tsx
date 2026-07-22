import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { 
    Wrench, AlertTriangle, Search
} from 'lucide-react';
import { AutoRepairOrder } from '../../types/autoRepair';
import RepairOrderModal from '../repair/RepairOrderModal';
import RepairExportModal from '../repair/RepairExportModal';

import { RepairOrderPDFData } from '../../lib/repairPdfGenerator';
import type { Database } from '../../types/supabase';

type LedgerRow = Database['public']['Tables']['customers_ledger']['Row'];
type CustomerVehicle = Database['public']['Tables']['customer_vehicles']['Row'];

interface Debtor {
  name: string | null;
  phone: string;
  debt: number;
}

export default function AutoRepairDashboard() {
  const { profile } = useAuth();
  const { currency, format } = useCurrency();




  // Smart Reception
  const [receptionPlate, setReceptionPlate] = useState('');
  const [receptionWarning, setReceptionWarning] = useState<string | null>(null);

  // Modals
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<AutoRepairOrder | undefined>(undefined);
  const [initialPlate, setInitialPlate] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [orderToExport, setOrderToExport] = useState<RepairOrderPDFData | null>(null);

  // Stats

  const [debtors, setDebtors] = useState<Debtor[]>([]);

  const fetchDashboardData = useCallback(async () => {

    if (!profile) return;



    // 2. Fetch Ledger for Debt
    const { data: lData } = await supabase
        .from('customers_ledger')
        .select('*')
        .eq('business_id', profile.id);

    // 3. Process Logic


    // Group debtors by phone or simple mapping
    const debtorsMap = new Map<string, Debtor>();
    (lData || []).forEach((l: LedgerRow) => {
        // Assuming simple one-row-per-transaction ledger, we need Aggregation
        // Or if 'balance' is a running balance column.
        // For simplicity: calculate sum of (debit - credit) per customer
        const k = l.customer_phone;
        const current = debtorsMap.get(k) || { name: l.customer_name, phone: k, debt: 0 };
        current.debt += Number(l.debit || 0) - Number(l.credit || 0);
        debtorsMap.set(k, current);
    });
    
    // Convert map to array where debt > 0
    const finalDebtors: Debtor[] = [];
    debtorsMap.forEach(v => {
        if (v.debt > 0) finalDebtors.push(v);
    });
    setDebtors(finalDebtors.sort((a, b) => b.debt - a.debt));


  }, [profile]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  // Reception Logic
  const handleCheckPlate = async () => {
    if (!receptionPlate || !profile?.id) return;
    setReceptionWarning(null);

    // 1. Check if vehicle exists
    const { data: vData } = await supabase
      .from('customer_vehicles')
      .select('*')
      .eq('plate_number', receptionPlate)
      .eq('business_id', profile.id)
      .single();

    if (vData) {
        // 2. Check Debt
        const v: CustomerVehicle = vData;
        const debtor = debtors.find(d => d.phone === v.owner_phone);
        if (debtor && debtor.debt > 1) { // Tolerance
            setReceptionWarning(`⚠️ This customer owes ${format(debtor.debt, currency)}!`);
        } else {
            // New Job
            setInitialPlate(receptionPlate);
            setSelectedOrder(undefined);
            setShowOrderModal(true);
        }
    } else {
        // New Vehicle
        setInitialPlate(receptionPlate);
        setSelectedOrder(undefined);
        setShowOrderModal(true);
    }
  };







  return (
    <div className="space-y-6 p-6 animate-fadeIn pb-24">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
              <Wrench className="w-8 h-8 text-sky-600" />
              Auto Repair Mode
           </h1>
           <p className="text-slate-500 dark:text-slate-400 mt-1">Manage workshop orders, inventory, and financials.</p>
        </div>
        
        {/* Smart Reception Bar */}
        <div className="w-full md:w-auto flex-1 max-w-xl mx-auto">
             <div className="relative group">
                <input 
                  value={receptionPlate}
                  onChange={(e) => setReceptionPlate(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleCheckPlate()}
                  className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-12 pr-4 text-lg font-mono font-bold tracking-widest shadow-lg focus:ring-4 focus:ring-sky-500/20 focus:border-sky-500 transition-all placeholder:font-sans placeholder:tracking-normal"
                  placeholder="Scan/Type Plate Number (Enter)"
                />
                <Search className="absolute left-4 top-4 w-5 h-5 text-slate-400 group-focus-within:text-sky-500" />
             </div>
             {receptionWarning && (
                 <div className="absolute mt-2 w-full max-w-xl bg-red-600 text-white p-3 rounded-xl shadow-xl flex items-center gap-3 animate-slideDown z-20">
                     <AlertTriangle className="w-5 h-5" />
                     <span className="font-bold">{receptionWarning}</span>
                     <button onClick={() => setReceptionWarning(null)} className="ml-auto underline text-xs">Dismiss</button>
                 </div>
             )}
        </div>
      </div>



      {/* Content */}


      {/* Modals */}
      {showOrderModal && (
        <RepairOrderModal 
          initialOrder={selectedOrder}
          initialPlate={initialPlate}
          onClose={() => { setShowOrderModal(false); setSelectedOrder(undefined); }}
          onSaved={() => { fetchDashboardData(); }}
        />
      )}

      {showExportModal && orderToExport && (
          <RepairExportModal 
             order={orderToExport}
             onClose={() => { setShowExportModal(false); setOrderToExport(null); }}
          />
      )}
    </div>
  );
}
