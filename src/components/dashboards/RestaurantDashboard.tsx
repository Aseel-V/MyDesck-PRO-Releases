import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useRestaurant } from '../../hooks/useRestaurant';
import { RestaurantTable } from '../../types/restaurant';
import { UtensilsCrossed, FileText, DollarSign, Users, LogOut } from 'lucide-react';
import OrderModal from '../restaurant/OrderModal';
import CloseDayWizard from '../restaurant/CloseDayWizard';
import { ErrorBoundary } from '../ErrorBoundary';

interface RestaurantDashboardProps {
  onToggleNavbar: (show: boolean) => void;
}

export default function RestaurantDashboard({ onToggleNavbar }: RestaurantDashboardProps) {
  const { tables, activeOrders, loadingTables } = useRestaurant();
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isCloseDayOpen, setIsCloseDayOpen] = useState(false);

  const { t } = useLanguage();

  // Quick Stats
  const openTablesCount = tables.filter(t => t.status === 'free').length;
  const activeOrdersValue = activeOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const getTableColor = (status: string) => {
    switch (status) {
      case 'occupied': return 'bg-rose-500 text-white border-rose-600 shadow-rose-200';
      case 'billed': return 'bg-amber-400 text-amber-900 border-amber-500 shadow-amber-200';
      case 'reserved': return 'bg-sky-500 text-white border-sky-600 shadow-sky-200';
      case 'free':
      default: return 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-200';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      {/* Top Bar: Stats & Actions */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full md:w-auto">
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
                 <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg">
                    <UtensilsCrossed size={20} />
                 </div>
                 <div>
                    <div className="text-2xl font-bold">{openTablesCount}</div>
                    <div className="text-xs text-slate-500">{t('settings.restaurant.freeTables') || 'Free Tables'}</div>
                 </div>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
                 <div className="p-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-lg">
                    <FileText size={20} />
                 </div>
                 <div>
                    <div className="text-2xl font-bold">{activeOrders.length}</div>
                    <div className="text-xs text-slate-500">{t('settings.restaurant.activeOrders') || 'Active Orders'}</div>
                 </div>
             </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
                 <div className="p-2 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-lg">
                    <DollarSign size={20} />
                 </div>
                 <div>
                    <div className="text-2xl font-bold">₪{activeOrdersValue.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">{t('settings.restaurant.openValue') || 'Open Value'}</div>
                 </div>
             </div>
         </div>

         <button 
            onClick={() => setIsCloseDayOpen(true)}
            className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl hover:bg-slate-800 transition shadow-lg w-full md:w-auto justify-center"
         >
            <LogOut size={18} />
            <span className="font-semibold">{t('settings.restaurant.closeDay') || 'Close Day (Z-Report)'}</span>
         </button>
      </div>

      {/* Floor Plan Grid */}
      <h2 className="text-lg font-bold text-slate-800 dark:text-white">{t('settings.restaurant.floorPlan') || 'Floor Plan'}</h2>
      
      {loadingTables ? (
          <div className="text-center py-20 text-slate-400">{t('auth.loading')}</div>
      ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {tables.map(table => (
              <div 
                key={table.id}
                onClick={() => setSelectedTable(table)}
                className={`
                    relative aspect-square rounded-full border-4 flex flex-col items-center justify-center cursor-pointer transition-transform hover:scale-105
                    ${getTableColor(table.status)}
                `}
              >
                  <span className="text-xl font-bold">{table.name}</span>
                  <div className="flex items-center gap-1 text-xs opacity-90 mt-1">
                      <Users size={12} />
                      <span>{table.seats}</span>
                  </div>
                  {/* Status Label */}
                  <span className="absolute -bottom-2 px-2 py-0.5 bg-white text-slate-900 text-[10px] font-bold uppercase rounded-full shadow-sm border border-slate-100">
                      {table.status}
                  </span>
              </div>
            ))}
            
             {tables.length === 0 && (
                 <div className="col-span-full text-center py-16 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
                     <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                       <UtensilsCrossed size={40} className="text-slate-400" />
                     </div>
                     <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">No tables configured</h3>
                     <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
                       Set up your restaurant tables, menu items, and staff in Settings to start taking orders.
                     </p>
                     <p className="text-sm text-slate-400 dark:text-slate-500">
                       Go to <span className="font-semibold text-emerald-600 dark:text-emerald-400">Settings → Restaurant</span> tab to configure your floor plan.
                     </p>
                 </div>
             )}
          </div>
      )}

      {/* Order Modal */}
      {selectedTable && (
        <ErrorBoundary>
          <OrderModal 
              table={selectedTable} 
              isOpen={!!selectedTable} 
              onClose={() => setSelectedTable(null)} 
              onToggleNavbar={onToggleNavbar}
          />
        </ErrorBoundary>
      )}

      {/* Close Day Wizard */}
      {isCloseDayOpen && (
          <ErrorBoundary>
            <CloseDayWizard 
              isOpen={isCloseDayOpen} 
              onClose={() => setIsCloseDayOpen(false)} 
            />
          </ErrorBoundary>
      )}

    </div>
  );
}
