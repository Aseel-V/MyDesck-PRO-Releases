// ============================================================================
// KITCHEN DISPLAY SYSTEM (KDS) - Real-time Kitchen Management
// Version: 1.0.0 | Production-Ready
// ============================================================================

import { useState, useMemo } from 'react';
import { useRestaurant } from '../../hooks/useRestaurant';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
  KitchenTicket, 
  KitchenStation,
  TicketStatus 
} from '../../types/restaurant';
import { 
  ChefHat, 
  Clock, 
  AlertTriangle, 
  Check, 
  Play, 
  Bell,
  Flame,
  Star,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getUrgencyColor(level: string): string {
  switch (level) {
    case 'critical': return 'bg-red-500 border-red-600';
    case 'warning': return 'bg-orange-500 border-orange-600';
    case 'attention': return 'bg-yellow-500 border-yellow-600';
    default: return 'bg-blue-500 border-blue-600';
  }
}

function getStatusColor(status: TicketStatus): string {
  switch (status) {
    case 'new': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'in_progress': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'ready': return 'bg-green-100 text-green-800 border-green-200';
    case 'served': return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

// ============================================================================
// STATION ICON HELPER
// ============================================================================

function getStationIcon(id: KitchenStation | 'all') {
  switch (id) {
    case 'grill': return <Flame size={16} />;
    case 'fry': return <Flame size={16} />;
    case 'expo': return <Check size={16} />;
    default: return <ChefHat size={16} />;
  }
}

// ============================================================================
// TICKET CARD COMPONENT
// ============================================================================

interface TicketCardProps {
  ticket: KitchenTicket;
  onStart: () => void;
  onBump: () => void;
  onItemStatusChange: (itemId: string, status: string) => void;
  t: (key: string) => string;
}

function TicketCard({ ticket, onStart, onBump, onItemStatusChange, t }: TicketCardProps) {
  // SAFETY: Force urgency to CRITICAL if any item has allergy notes
  const hasAllergy = ticket.items?.some(i => 
    i.notes && (i.notes.includes('ALLERGY') || i.notes.includes('⚠️'))
  );
  const urgency = hasAllergy ? 'critical' : (ticket.urgency_level || 'normal');
  
  return (
    <div 
      className={`
        relative rounded-xl border-2 overflow-hidden transition-all
        ${urgency === 'critical' ? 'animate-pulse border-red-500 shadow-red-200' : ''}
        ${urgency === 'warning' ? 'border-orange-400 shadow-orange-100' : ''}
        ${urgency === 'attention' ? 'border-yellow-400' : ''}
        ${urgency === 'normal' ? 'border-slate-200 dark:border-slate-700' : ''}
        bg-white dark:bg-slate-900 shadow-lg
      `}
    >
      {/* Header */}
      <div className={`px-4 py-3 text-white ${getUrgencyColor(urgency)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{ticket.table_name || 'Counter'}</span>
            {ticket.is_rush && (
              <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold animate-pulse">
                🔥 RUSH
              </span>
            )}
            {ticket.is_vip && (
              <Star size={14} className="text-yellow-300 fill-yellow-300" />
            )}
            {ticket.course_number && (
              <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold uppercase">
                {['', 'Starter', 'Main', 'Dessert', 'Drink'][ticket.course_number] || `Course ${ticket.course_number}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} />
            <span className="font-mono font-bold">
              {formatElapsedTime(ticket.elapsed_seconds || 0)}
            </span>
          </div>
        </div>
        {ticket.server_name && (
          <div className="text-xs opacity-80 mt-1">
            Server: {ticket.server_name}
          </div>
        )}
      </div>
      
      {/* Items */}
      <div className="p-4 space-y-3">
        {ticket.items?.map((item) => (
          <div 
            key={item.id}
            className={`
              p-3 rounded-lg border transition-all cursor-pointer
              ${item.status === 'ready' ? 'bg-green-50 border-green-200 line-through opacity-60' : ''}
              ${item.status === 'cooking' ? 'bg-yellow-50 border-yellow-200' : ''}
              ${item.status === 'pending' ? 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700' : ''}
              ${item.status === 'cancelled' ? 'bg-red-50 border-red-200 line-through opacity-50' : ''}
            `}
            onClick={() => {
              if (item.status === 'pending') onItemStatusChange(item.id, 'cooking');
              else if (item.status === 'cooking') onItemStatusChange(item.id, 'ready');
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{item.quantity}×</span>
                  <span className="font-semibold text-slate-800 dark:text-white">
                    {item.item_name}
                  </span>
                </div>
                {item.modifiers_text && (
                  <div className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                    {item.modifiers_text}
                  </div>
                )}
                {item.notes && (
                  <div className={`mt-1 flex items-center gap-1 text-sm font-medium ${
                    item.notes.includes('ALLERGY') || item.notes.includes('⚠️')
                      ? 'bg-red-500 text-white p-2 rounded animate-pulse font-bold uppercase tracking-wide'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    <AlertTriangle size={item.notes.includes('ALLERGY') ? 16 : 12} />
                    {item.notes}
                  </div>
                )}
              </div>
              <span className={`
                px-2 py-1 rounded text-xs font-bold uppercase
                ${getStatusColor(item.status as TicketStatus)}
              `}>
                {item.status}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer Actions */}
      <div className="px-4 pb-4 flex gap-2">
        {ticket.status === 'new' && (
          <button
            onClick={onStart}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Play size={18} />
            {t('kds.actions.start')}
          </button>
        )}
        {ticket.status === 'in_progress' && (
          <button
            onClick={onBump}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Bell size={18} />
            {t('kds.actions.bump')}
          </button>
        )}
        {ticket.status === 'ready' && (
          <div className="flex-1 bg-green-100 text-green-800 py-3 rounded-lg font-bold text-center">
            ✓ {t('kds.actions.ready')}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN KDS COMPONENT
// ============================================================================

export default function KitchenDisplaySystem() {
  const { can } = useRestaurantRole();
  const { t } = useLanguage();
  const { 
    kitchenTickets, 
    loadingTickets, 
    updateTicketStatus, 
    updateTicketItemStatus,
    bumpTicket 
  } = useRestaurant();
  
  // Build translated stations array
  const STATIONS: { id: KitchenStation | 'all'; label: string }[] = [
    { id: 'all', label: t('kds.stations.all') },
    { id: 'grill', label: t('kds.stations.grill') },
    { id: 'fry', label: t('kds.stations.fry') },
    { id: 'salad', label: t('kds.stations.salad') },
    { id: 'bar', label: t('kds.stations.bar') },
    { id: 'dessert', label: t('kds.stations.dessert') },
    { id: 'expo', label: t('kds.stations.expo') },
  ];
  
  const [selectedStation, setSelectedStation] = useState<KitchenStation | 'all'>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Filter tickets by station
  const filteredTickets = useMemo(() => {
    if (selectedStation === 'all') return kitchenTickets;
    return kitchenTickets.filter(t => t.station === selectedStation || !t.station);
  }, [kitchenTickets, selectedStation]);
  
  // Group tickets by status
  const newTickets = filteredTickets.filter(t => t.status === 'new');
  const inProgressTickets = filteredTickets.filter(t => t.status === 'in_progress');
  const readyTickets = filteredTickets.filter(t => t.status === 'ready');
  
  // Stats
  const stats = useMemo(() => {
    const total = filteredTickets.length;
    const avgTime = filteredTickets.length > 0
      ? Math.floor(filteredTickets.reduce((sum, t) => sum + (t.elapsed_seconds || 0), 0) / filteredTickets.length / 60)
      : 0;
    const critical = filteredTickets.filter(t => t.urgency_level === 'critical').length;
    return { total, avgTime, critical };
  }, [filteredTickets]);
  
  // Handlers
  const handleStart = async (ticketId: string) => {
    try {
      await updateTicketStatus.mutateAsync({ ticketId, status: 'in_progress' });
    } catch (err) {
      console.error('Failed to start ticket:', err);
    }
  };
  
  const handleBump = async (ticketId: string) => {
    try {
      await bumpTicket.mutateAsync(ticketId);
      if (soundEnabled) {
        // Play bump sound
        const audio = new Audio('/sounds/bump.mp3');
        audio.play().catch(() => {});
      }
    } catch (err) {
      console.error('Failed to bump ticket:', err);
    }
  };
  
  const handleItemStatusChange = async (itemId: string, status: string) => {
    try {
      await updateTicketItemStatus.mutateAsync({ itemId, status });
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  };
  
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };
  
  // Permission check
  if (!can('canViewKDS')) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <ChefHat size={48} className="mx-auto text-slate-400 mb-4" />
          <h2 className="text-xl font-bold text-slate-600 dark:text-slate-400">
            {t('kds.accessDenied')}
          </h2>
          <p className="text-slate-500">{t('kds.noPermission')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Top Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <ChefHat size={24} className="text-orange-400" />
            <h1 className="text-xl font-bold">{t('kds.title')}</h1>
          </div>
          
          {/* Station Tabs */}
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {STATIONS.map((station) => (
              <button
                key={station.id}
                onClick={() => setSelectedStation(station.id)}
                className={`
                  px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1
                  ${selectedStation === station.id 
                    ? 'bg-orange-500 text-white' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }
                `}
              >
                {getStationIcon(station.id)}
                {station.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Stats & Controls */}
        <div className="flex items-center gap-6">
          {/* Stats */}
          <div className="flex gap-6 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-slate-400">{t('kds.open')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.avgTime}m</div>
              <div className="text-slate-400">{t('kds.avgTime')}</div>
            </div>
            {stats.critical > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400 animate-pulse">{stats.critical}</div>
                <div className="text-red-300">{t('kds.critical')}</div>
              </div>
            )}
          </div>
          
          {/* Controls */}
          <div className="flex gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg ${soundEnabled ? 'bg-green-500' : 'bg-slate-700'}`}
              title={soundEnabled ? t('kds.soundOn') : t('kds.soundOff')}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600"
              title={t('kds.fullscreen')}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>
      </div>
      
      {/* Loading State */}
      {loadingTickets && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
        </div>
      )}
      
      {/* Empty State */}
      {!loadingTickets && filteredTickets.length === 0 && (
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
          <ChefHat size={64} className="mb-4 opacity-30" />
          <h2 className="text-2xl font-bold mb-2">{t('kds.noOrders')}</h2>
          <p>{t('kds.newOrdersWillAppear')}</p>
        </div>
      )}
      
      {/* Tickets Grid */}
      {!loadingTickets && filteredTickets.length > 0 && (
        <div className="p-4">
          {/* Section: New Tickets */}
          {newTickets.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                  {t('kds.newTickets')} ({newTickets.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {newTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onStart={() => handleStart(ticket.id)}
                    onBump={() => handleBump(ticket.id)}
                    onItemStatusChange={handleItemStatusChange}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Section: In Progress */}
          {inProgressTickets.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                  {t('kds.inProgress')} ({inProgressTickets.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {inProgressTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onStart={() => handleStart(ticket.id)}
                    onBump={() => handleBump(ticket.id)}
                    onItemStatusChange={handleItemStatusChange}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Section: Ready */}
          {readyTickets.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                  {t('kds.readyForPickup')} ({readyTickets.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {readyTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onStart={() => handleStart(ticket.id)}
                    onBump={() => handleBump(ticket.id)}
                    onItemStatusChange={handleItemStatusChange}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
