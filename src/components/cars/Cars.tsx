import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  LayoutGrid,
  List,
  CarFront,
  Search,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { AutoRepairOrder } from '../../types/autoRepair';
import CarCard from './CarCard';
import NewCarForm from './NewCarForm';
import CarDetailsModal from './CarDetailsModal';
import { Skeleton } from '../ui/Skeleton';

function CarsFilter({ search, onSearchChange }: { search: string, onSearchChange: (v: string) => void }) {
    return (
        <div className="relative">
            <input 
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search by plate, model, or customer..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
            />
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
        </div>
    )
}

export default function Cars({ onToggleNavbar }: { onToggleNavbar?: (show: boolean) => void }) {
  const { user, profile } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showNewCarForm, setShowNewCarForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<AutoRepairOrder | null>(null);

  useEffect(() => {
    if (onToggleNavbar) {
      onToggleNavbar(!(selectedOrder || showNewCarForm));
    }
    return () => {
      if (onToggleNavbar) onToggleNavbar(true);
    };
  }, [selectedOrder, showNewCarForm, onToggleNavbar]);

  // Fetch Repair Orders
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['repair-orders', user?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('repair_orders' as any)
        .select(`
            *,
            vehicle:customer_vehicles(*),
            items:repair_order_items(*)
        `)
        .eq('business_id', profile.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as AutoRepairOrder[];
    },
    enabled: !!profile?.id,
  });

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    const lowerSearch = searchTerm.toLowerCase();
    return orders.filter(o => 
       o.vehicle?.plate_number?.toLowerCase().includes(lowerSearch) ||
       o.vehicle?.model?.toLowerCase().includes(lowerSearch) ||
       o.vehicle?.owner_name?.toLowerCase().includes(lowerSearch)
    );
  }, [orders, searchTerm]);


  if (isLoading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[280px] w-full rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header + actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold gradient-title drop-shadow dark:drop-shadow-none text-slate-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-slate-50 dark:via-sky-100 dark:to-slate-200 flex items-center gap-3">
            <CarFront className="w-8 h-8 text-slate-800 dark:text-sky-200" />
            Cars
          </h2>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-300">
             Manage your repair jobs and history
          </p>
        </div>

        <div className="flex items-center gap-2">
             {/* Simple View Toggle */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800/80">
                <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                    ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-800 dark:text-sky-400'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list'
                    ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-800 dark:text-sky-400'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                <List className="w-4 h-4" />
                </button>
            </div>
            
             <button
                onClick={() => setShowNewCarForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-700 shadow-lg shadow-sky-500/30 transition-all"
             >
                <Plus className="w-5 h-5" />
                <span>Add New Car</span>
             </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-panel p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50">
          <CarsFilter search={searchTerm} onSearchChange={setSearchTerm} />
      </div>

      {/* Grid */}
      <div className="min-h-[400px]">
        {filteredOrders.length === 0 ? (
             <div className="text-center py-20">
                 <p className="text-slate-400">No cars found.</p>
             </div>
        ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {filteredOrders.map(order => (
                     <CarCard 
                        key={order.id} 
                        order={order} 
                        onClick={() => setSelectedOrder(order)} 
                     />
                 ))}
            </div>
        ) : (
            <div className="glass-panel overflow-hidden rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                            <th className="p-4 text-left font-medium text-slate-500">Plate</th>
                            <th className="p-4 text-left font-medium text-slate-500">Model</th>
                            <th className="p-4 text-left font-medium text-slate-500">Owner</th>
                            <th className="p-4 text-left font-medium text-slate-500">Status</th>
                            <th className="p-4 text-right font-medium text-slate-500">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredOrders.map(order => (
                            <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                <td className="p-4 font-mono font-bold">{order.vehicle?.plate_number}</td>
                                <td className="p-4">{order.vehicle?.model}</td>
                                <td className="p-4">{order.vehicle?.owner_name}</td>
                                <td className="p-4 capitalize">{order.status}</td>
                                <td className="p-4 text-right font-bold">{parseFloat(String(order.total_amount)).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>


      
      {showNewCarForm && (
        <NewCarForm 
            onClose={() => setShowNewCarForm(false)} 
            onSave={() => {
                refetch();
            }} 
        />
      )}
      
      {selectedOrder && (
        <CarDetailsModal 
            order={selectedOrder} 
            onClose={() => setSelectedOrder(null)} 
            onDelete={async (id) => {
                try {
                    const { error } = await supabase
                        .from('repair_orders')
                        .delete()
                        .eq('id', id);
                    
                    if (error) throw error;
                    
                    toast.success('Order deleted successfully');
                    setSelectedOrder(null);
                    refetch();
                } catch (err) {
                    toast.error('Failed to delete order');
                    console.error(err);
                }
            }}
            onUpdate={() => {
                 refetch();
                 // We also need to re-select the order to update the modal content
                 // Since refetch might take a moment, we optionally can close logic or try to refetch the specific order
                 // For now, let's just close the modal which feels natural after a major edit, OR
                 // ideally we want to keep it open with fresh data.
                 // But react-query cache update might not reflect immediately in `selectedOrder` state if it's just a local copy.
                 // Actually `selectedOrder` is just state. It won't update automatically unless we update it.
                 // So we should probably listen to the new data list and update selectedOrder if it exists.
                 setSelectedOrder(null); // Simple UX: Close modal on success
            }}
        />
      )}
    </div>
  );
}
