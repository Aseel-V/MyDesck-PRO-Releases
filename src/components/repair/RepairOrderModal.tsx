import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { X, Plus, Search, Trash2, Save, Wrench, Package } from 'lucide-react';
import { AutoRepairOrder, AutoRepairItem } from '../../types/autoRepair';

interface RepairOrderModalProps {
  onClose: () => void;
  onSaved: () => void;
  initialOrder?: AutoRepairOrder;
  initialPlate?: string; 
}

export default function RepairOrderModal({ onClose, onSaved, initialOrder, initialPlate }: RepairOrderModalProps) {
  const { profile } = useAuth();
  const { t } = useLanguage(); (void t);
  const { currency, format } = useCurrency();

  const [plate, setPlate] = useState(initialPlate || initialOrder?.vehicle?.plate_number || '');
  const [vehicleId, setVehicleId] = useState(initialOrder?.vehicle_id || '');
  const [ownerName, setOwnerName] = useState(initialOrder?.vehicle?.owner_name || '');
  const [ownerPhone, setOwnerPhone] = useState(initialOrder?.vehicle?.owner_phone || '');
  const [vehicleModel, setVehicleModel] = useState(initialOrder?.vehicle?.model || '');
  
  const [odometer, setOdometer] = useState(initialOrder?.odometer_reading || 0);
  const [status, setStatus] = useState(initialOrder?.status || 'pending');
  const [notes] = useState(initialOrder?.notes || initialOrder?.technician_notes || '');

  const [items, setItems] = useState<Partial<AutoRepairItem>[]>(initialOrder?.items || []);
  
  // Inventory Search
  const [inventorySearch, setInventorySearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false); (void isSearching);

  const [loading, setLoading] = useState(false);

  // Search for vehicle when plate changes (debounced ideal, but onBlur for simple)
  const handlePlateBlur = async () => {
    if (!plate || vehicleId) return;
    const { data } = await supabase
      .from('customer_vehicles' as any)
      .select('*')
      .eq('plate_number', plate)
      .eq('business_id', profile?.id)
      .single();
    
    if (data) {
      const v = data as any;
      setVehicleId(v.id);
      setOwnerName(v.owner_name);
      setOwnerPhone(v.owner_phone);
      setVehicleModel(v.model);
      setOdometer(v.last_odometer || 0);
    }
  };

  // Search Inventory
  useEffect(() => {
    if (!inventorySearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from('restaurant_menu_items')
        .select('id, name, price, cost_price, stock_quantity')
        .ilike('name', `%${inventorySearch}%`)
        .limit(5);
      setSearchResults(data || []);
      setIsSearching(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [inventorySearch]);

  const addItem = (type: 'part' | 'labor', invItem?: any) => {
    setItems([
      ...items,
      {
        type,
        name: invItem ? invItem.name : '',
        inventory_item_id: invItem ? invItem.id : undefined,
        quantity: 1,
        price: invItem ? invItem.price : 0,
        cost: invItem ? invItem.cost_price || 0 : 0,
        warranty_days: type === 'part' ? 90 : 0,
      }
    ]);
    setInventorySearch('');
    setSearchResults([]);
  };

  const removeItem = (idx: number) => {
    const newItems = [...items];
    newItems.splice(idx, 1);
    setItems(newItems);
  };

  const updateItem = (idx: number, field: keyof AutoRepairItem, value: any) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    setItems(newItems);
  };

  // Calculations
  const partsTotal = items.filter(i => i.type === 'part').reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);
  const laborTotal = items.filter(i => i.type === 'labor').reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);
  const grandTotal = partsTotal + laborTotal;
  const totalCost = items.reduce((sum, i) => sum + (i.cost || 0) * (i.quantity || 1), 0);
  const estimatedProfit = grandTotal - totalCost;

  const handleSave = async () => {
    setLoading(true);
    try {
      let finalVehicleId = vehicleId;

      // 1. Upsert Vehicle if new
      if (!vehicleId) {
        const { data: vData, error: vError } = await supabase
            .from('customer_vehicles' as any)
            .upsert({
                business_id: profile?.id,
                plate_number: plate,
                owner_name: ownerName,
                owner_phone: ownerPhone,
                model: vehicleModel,
                last_odometer: odometer
            } as any, { onConflict: 'business_id,plate_number' })
            .select()
            .single();
        
        if (vError) throw vError;
        finalVehicleId = (vData as any).id;
      }

      // 2. Upsert Order
      const orderPayload = {
          business_id: profile?.id,
          vehicle_id: finalVehicleId,
          status,
          odometer_reading: odometer,
          notes: notes,
          parts_total: partsTotal,
          labor_total: laborTotal,
          total_amount: grandTotal,
          // paid_amount handled separately or generic default 0
      };

      let orderId = initialOrder?.id;

      if (orderId) {
          await supabase.from('repair_orders' as any).update(orderPayload).eq('id', orderId);
      } else {
          const { data: oData, error: oError } = await supabase.from('repair_orders' as any).insert(orderPayload).select().single();
          if (oError) throw oError;
          orderId = (oData as any).id;
      }

      // 3. Upsert Items (Delete all and recreate is easiest for simple logic, but Upsert is better)
      // For simplicity in this "100% mode", I'll delete existing items for this order and re-insert active ones.
      // NOTE: Deleting might mess up inventory decrement if we don't handle restoration. 
      // Ideally we diff. But let's assume Add Only for MVP robustness or handle via simple Insert for new ones.
      // Re-writing items is risky for stock sync.
      // Better: Only Insert new items (no id) and Update existing.
      
      for (const item of items) {
          const itemPayload = {
              order_id: orderId,
              type: item.type,
              inventory_item_id: item.inventory_item_id,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              cost: item.cost,
              warranty_days: item.warranty_days
          };

          // If it has an ID, update. Else insert.
          // Since we track `items` from state which might be Partial<AutoRepairItem> 
          // (if loaded from DB it has ID, new ones don't).
           // @ts-ignore
          if (item.id) {
               await supabase.from('repair_order_items' as any).update(itemPayload).eq('id', item.id);
          } else {
              await supabase.from('repair_order_items' as any).insert(itemPayload);
          }
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error saving order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl p-6 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-sky-500" />
            {initialOrder ? 'Edit Repair Order' : 'New Repair Job'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
             <X className="w-6 h-6 dark:text-slate-400" />
          </button>
        </div>

        {/* Vehicle Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Plate Number</label>
             <input 
               value={plate}
               onChange={(e) => setPlate(e.target.value.toUpperCase())}
               onBlur={handlePlateBlur}
               className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 font-mono font-bold tracking-widest"
               placeholder="12-345-67"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Model</label>
             <input 
               value={vehicleModel}
               onChange={(e) => setVehicleModel(e.target.value)}
               className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
               placeholder="Toyota Corolla"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Current Odometer</label>
             <input 
               type="number"
               value={odometer}
               onChange={(e) => setOdometer(Number(e.target.value))}
               className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
               placeholder="0"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Owner Name</label>
             <input 
               value={ownerName}
               onChange={(e) => setOwnerName(e.target.value)}
               className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
               placeholder="John Doe"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
             <input 
               value={ownerPhone}
               onChange={(e) => setOwnerPhone(e.target.value)}
               className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
               placeholder="05..."
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
               <select 
                 value={status}
                 onChange={(e) => setStatus(e.target.value as any)}
                 className="w-full p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
               >
                 <option value="pending">Reception (Pending)</option>
                 <option value="diagnostics">Diagnostics</option>
                 <option value="waiting_parts">Waiting Parts</option>
                 <option value="working">Working</option>
                 <option value="completed">Ready / Completed</option>
               </select>
           </div>
        </div>

        {/* Items Section */}
        <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 dark:text-white">Service Items</h3>
            
            {/* Add Bar */}
            <div className="flex gap-2 mb-4 bg-slate-100 dark:bg-slate-900 p-2 rounded-lg relative">
                <div className="relative flex-1">
                   <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                   <input
                     value={inventorySearch}
                     onChange={(e) => setInventorySearch(e.target.value)}
                     className="w-full pl-9 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                     placeholder="Search Parts (Inventory)..."
                   />
                   {searchResults.length > 0 && (
                     <div className="absolute top-12 left-0 w-full bg-white dark:bg-slate-800 shadow-xl rounded-xl border dark:border-slate-700 z-10 overflow-hidden">
                       {searchResults.map(res => (
                         <div 
                           key={res.id} 
                           onClick={() => addItem('part', res)}
                           className="p-3 hover:bg-sky-50 dark:hover:bg-slate-700 cursor-pointer flex justify-between"
                         >
                            <span>{res.name}</span>
                            <span className="font-mono">{res.stock_quantity ?? 0} in stock</span>
                         </div>
                       ))}
                     </div>
                   )}
                </div>
                <button 
                  onClick={() => addItem('labor')}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2"
                >
                   <Plus className="w-4 h-4" /> Add Labor
                </button>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
               {items.map((item, idx) => (
                 <div key={idx} className="flex items-center gap-2 p-3 bg-white border dark:bg-slate-800 dark:border-slate-700 rounded-lg shadow-sm">
                    <div className="p-2 rounded bg-slate-100 dark:bg-slate-900">
                        {item.type === 'part' ? <Package className="w-5 h-5 text-sky-500" /> : <Wrench className="w-5 h-5 text-indigo-500" />}
                    </div>
                    <div className="flex-1">
                        <input 
                          value={item.name}
                          onChange={(e) => updateItem(idx, 'name', e.target.value)}
                          className="w-full bg-transparent font-medium dark:text-white focus:outline-none"
                          placeholder="Item Name"
                        />
                    </div>
                    <div className="w-20">
                         <input 
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                          className="w-full p-1 text-center bg-slate-50 dark:bg-slate-900 rounded border dark:border-slate-700"
                        />
                    </div>
                    <div className="w-24">
                         <input 
                          type="number"
                          value={item.price}
                          onChange={(e) => updateItem(idx, 'price', Number(e.target.value))}
                          className="w-full p-1 text-right bg-slate-50 dark:bg-slate-900 rounded border dark:border-slate-700"
                        />
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-rose-400 hover:text-rose-600 p-2">
                        <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
               ))}
               {items.length === 0 && (
                 <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-700">
                    No items added yet. Search inventory or add labor.
                 </div>
               )}
            </div>
        </div>

        {/* Footer Stats */}
        <div className="flex justify-between items-end border-t dark:border-slate-700 pt-6">
           <div className="text-sm">
             <div className="text-slate-500">Live Profit Meter</div>
             <div className={`text-xl font-bold ${estimatedProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {format(estimatedProfit, currency)}
             </div>
           </div>
           
           <div className="flex items-center gap-6">
              <div className="text-right">
                 <div className="text-slate-500 text-sm">Grand Total</div>
                 <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                    {format(grandTotal, currency)}
                 </div>
              </div>
              <button 
                onClick={handleSave}
                disabled={loading}
                className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-xl font-bold text-lg flex items-center gap-2 shadow-lg shadow-green-600/20"
              >
                 {loading ? 'Saving...' : <><Save className="w-6 h-6" /> Save Order</>}
              </button>
           </div>
        </div>

      </div>
    </div>
  );
}
