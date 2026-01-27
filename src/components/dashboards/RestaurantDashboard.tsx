import { useState, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useRestaurant } from '../../hooks/useRestaurant';
import { RestaurantTable } from '../../types/restaurant';
import { UtensilsCrossed, FileText, DollarSign, ChefHat, LayoutDashboard, ArrowLeft } from 'lucide-react';
import OrderModal from '../restaurant/OrderModal';

import KitchenDisplaySystem from '../restaurant/KitchenDisplaySystem';
import FloorPlanEditor from '../restaurant/FloorPlanEditor';
import TableVisual from '../restaurant/TableVisual';
import { RestaurantRoleProvider } from '../../contexts/RestaurantRoleContext';
import { FloorZone } from '../../types/restaurant';
import { ErrorBoundary } from '../ErrorBoundary';

interface RestaurantDashboardProps {
  onToggleNavbar: (show: boolean) => void;
}

type ViewMode = 'overview' | 'kds' | 'floorplan';

export default function RestaurantDashboard({ onToggleNavbar }: RestaurantDashboardProps) {
  const { tables, activeOrders, kitchenTickets, loadingTables } = useRestaurant();
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [activeZone, setActiveZone] = useState<FloorZone>('indoor');

  const { t } = useLanguage();

  // Quick Stats
  const openTablesCount = tables.filter(t => t.status === 'free').length;
  const activeOrdersValue = activeOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  // Ready Food Logic
  const tablesWithReadyFood = useMemo(() => {
    return new Set(
      kitchenTickets
        .filter(t => t.status === 'ready')
        .map(t => t.order?.table_id)
        .filter(Boolean)
    );
  }, [kitchenTickets]);


  // Render KDS View
  if (viewMode === 'kds') {
    return (
      <div className="animate-fadeIn">
        <div className="mb-4">
          <button 
            onClick={() => setViewMode('overview')}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span>{t('settings.restaurant.nav.backToDashboard')}</span>
          </button>
        </div>
        <ErrorBoundary>
          <RestaurantRoleProvider>
            <KitchenDisplaySystem />
          </RestaurantRoleProvider>
        </ErrorBoundary>
      </div>
    );
  }

  // Render Floor Plan Editor View
  if (viewMode === 'floorplan') {
    return (
      <div className="animate-fadeIn">
        <div className="mb-4">
          <button 
            onClick={() => setViewMode('overview')}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span>{t('settings.restaurant.nav.backToDashboard')}</span>
          </button>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 min-h-[80vh]">
          <ErrorBoundary>
            <RestaurantRoleProvider>
              <FloorPlanEditor />
            </RestaurantRoleProvider>
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
         <div className="flex flex-wrap gap-2 w-full lg:w-auto">
             <button 
                onClick={() => setViewMode('kds')}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/20"
             >
                <ChefHat size={18} />
                <span className="font-semibold text-sm">{t('settings.restaurant.nav.kdsFull')}</span>
             </button>
             <button 
                onClick={() => setViewMode('floorplan')}
                className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl transition shadow-lg shadow-sky-500/20"
             >
                <LayoutDashboard size={18} />
                <span className="font-semibold text-sm">{t('settings.restaurant.nav.floorPlanFull')}</span>
             </button>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider">{t('settings.restaurant.floorPlan') || 'Floor Plan'}</h2>
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
           {(['indoor', 'outdoor', 'patio', 'bar_area', 'private'] as const).map(zone => (
               <button
                  key={zone}
                  onClick={() => setActiveZone(zone)}
                  className={`
                      px-3 py-1 text-xs font-bold rounded-md transition-all capitalize
                      ${activeZone === zone 
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                      }
                  `}
               >
                   {zone.replace('_', ' ')}
               </button>
           ))}
        </div>
      </div>
      
       {loadingTables ? (
           <div className="text-center py-20 text-slate-500 animate-pulse">{t('auth.loading')}</div>
       ) : (
           <div className="relative bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-2xl backdrop-blur-sm group/canvas custom-scrollbar mb-10">
              <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
                   style={{ 
                       backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', 
                       backgroundSize: '32px 32px' 
                   }} 
              />
              <div className="relative min-w-[1200px] min-h-[800px] p-20">
                {tables.filter(t => (t.zone || 'indoor') === activeZone).map(table => (
                  <TableVisual 
                    key={table.id} 
                    table={table} 
                    onClick={setSelectedTable} 
                    hasReadyFood={tablesWithReadyFood.has(table.id)}
                  />
                ))}
              </div>
             {tables.filter(t => (t.zone || 'indoor') === activeZone).length === 0 && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                     <UtensilsCrossed size={48} className="mb-4 opacity-20" />
                     <p>No tables in this zone</p>
                 </div>
             )}
          </div>
      )}

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
    </div>
  );
}
