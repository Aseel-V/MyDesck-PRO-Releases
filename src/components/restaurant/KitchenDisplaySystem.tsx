// ============================================================================
// KITCHEN DISPLAY SYSTEM (KDS) - Real-time Kitchen Management
// Version: 1.0.0 | Production-Ready
// ============================================================================

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRestaurant } from '../../hooks/useRestaurant';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
  KitchenTicket,
} from '../../types/restaurant';
import { 
  ChefHat, 
  Clock, 
  AlertTriangle, 
  Check, 
  Play, 
  Bell,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  X,
  Search,
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

// ============================================================================
// STATION ICON HELPER
// ============================================================================

function getCourseLabel(courseNumber: number | undefined | null): string {
  if (courseNumber === undefined || courseNumber === null) return '';
  const labels = ['', 'Starter', 'Main', 'Dessert', 'Drink'];
  return labels[courseNumber] || `Course ${courseNumber}`;
}

// ============================================================================
// TICKET CARD COMPONENT
// ============================================================================

interface TicketCardProps {
  ticket: KitchenTicket;
  onStart: () => void;
  onBump: () => void;
  onServe: () => void;
  onItemStatusChange: (itemId: string, status: string) => void;
  t: (key: string) => string;
}

function TicketCard({ ticket, onStart, onBump, onServe, onItemStatusChange, t }: TicketCardProps) {
  // SAFETY: Force urgency to CRITICAL if any item has allergy notes
  const hasAllergy = ticket.items?.some(i => 
    i.notes && (i.notes.includes('ALLERGY') || i.notes.includes('⚠️'))
  );
  const urgency = hasAllergy ? 'critical' : (ticket.urgency_level || 'normal');
  
  return (
    <div 
      className={`
        relative rounded-xl border-4 overflow-hidden transition-all duration-300 min-h-[400px] h-auto flex flex-col
        ${urgency === 'critical' ? 'animate-pulse border-red-600 shadow-[0_0_30px_rgba(220,38,38,0.3)]' : ''}
        ${urgency === 'warning' ? 'border-orange-500 shadow-lg shadow-orange-500/10' : ''}
        ${urgency === 'attention' ? 'border-yellow-400' : ''}
        ${urgency === 'normal' ? 'border-slate-200 dark:border-slate-800' : ''}
        bg-white dark:bg-slate-900
      `}
    >
      {/* Header - Compact & High Contrast */}
      <div className={`px-4 py-3 text-white ${getUrgencyColor(urgency)} shadow-lg shrink-0`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-2xl font-black tracking-tighter uppercase leading-tight line-clamp-2">{ticket.table_name || 'Counter'}</span>
            <div className="flex items-center gap-2 mt-1">
               {ticket.is_rush && (
                <span className="bg-black/20 px-1.5 py-0.5 rounded-sm text-[10px] font-black animate-pulse flex items-center gap-1 border border-white/20">
                  <Flame size={10} fill="white" /> RUSH
                </span>
              )}
              <span className="bg-black/20 px-1.5 py-0.5 rounded-sm text-[10px] font-black uppercase tracking-widest border border-white/10">
                {getCourseLabel(ticket.course_number)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <div className="flex items-center gap-1.5 bg-white text-slate-900 px-2 py-1 rounded-sm border border-white/10 shadow-lg">
              <Clock size={14} className="text-slate-900" />
              <span className="font-mono text-lg font-black tracking-wider">
                {formatElapsedTime(ticket.elapsed_seconds || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Items Section - Compact List */}
      <div className="flex-1 p-1">
        {ticket.items?.map((item) => (
          <div 
            key={item.id}
            className={`
              relative rounded-sm border-l-4 p-2 mb-1 last:mb-0 transition-all cursor-pointer group/item hover:bg-slate-50 dark:hover:bg-slate-800/50
              ${item.status === 'ready' ? 'border-l-emerald-500 bg-emerald-50/30' : ''}
              ${item.status === 'cooking' ? 'border-l-amber-500 bg-amber-50/10' : ''}
              ${item.status === 'pending' ? 'border-l-slate-300 dark:border-l-slate-600 bg-white dark:bg-slate-800/20' : ''}
              ${item.status === 'cancelled' ? 'border-l-red-500 bg-red-50/10 opacity-50' : ''}
              border-y border-r border-slate-100 dark:border-slate-800
            `}
            onClick={() => {
              if (item.status === 'pending') onItemStatusChange(item.id, 'cooking');
              else if (item.status === 'cooking') onItemStatusChange(item.id, 'ready');
            }}
          >
            <div className="flex items-center gap-3">
              
              {/* Quantity Indicator - Compact */}
              <div className="flex flex-col items-center justify-center w-8 shrink-0">
                <span className={`text-xl font-black leading-none ${
                   item.status === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : 
                   item.status === 'cooking' ? 'text-amber-500' : 
                   'text-slate-700 dark:text-slate-200'
                }`}>
                  {item.quantity}
                </span>
              </div>

              {/* Main Content */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <span className={`text-sm font-bold leading-tight ${
                    item.status === 'ready' ? 'text-slate-500 line-through decoration-2' : 
                    'text-slate-900 dark:text-white'
                  }`}>
                    {item.item_name}
                  </span>
                </div>

                {/* Modifiers & Notes */}
                {(item.modifiers_text || item.notes) && (
                  <div className="space-y-0.5 mt-0.5">
                    {item.modifiers_text && (
                      <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 leading-snug truncate">
                        + {item.modifiers_text}
                      </div>
                    )}
                    {item.notes && (
                      <div className={`flex items-start gap-1 px-1.5 py-1 rounded-sm text-xs font-black uppercase tracking-wide ${
                        item.notes.includes('ALLERGY')
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200 animate-pulse'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
                      }`}>
                        {item.notes.includes('ALLERGY') && <AlertTriangle size={10} className="shrink-0 mt-0.5" />}
                        <span className="whitespace-pre-wrap break-words">{item.notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer Actions - Compact */}
      <div className="p-3 bg-white dark:bg-slate-900 shrink-0">
        <div className="bg-slate-100 dark:bg-slate-800/50 p-1 rounded-lg flex gap-2">
            {ticket.status === 'new' && (
              <button
                onClick={onStart}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-10 rounded-md font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 text-xs"
              >
                <Play size={14} fill="white" />
                {t('kds.actions.start')}
              </button>
            )}
            {ticket.status === 'in_progress' && (
              <button
                onClick={onBump}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white h-10 rounded-md font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 text-xs"
              >
                <Bell size={14} fill="white" />
                {t('kds.actions.bump')}
              </button>
            )}
            {ticket.status === 'ready' && (
              <button
                onClick={onServe}
                className="flex-1 bg-slate-900 hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600 text-white h-10 rounded-md font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 text-xs border border-white/10"
              >
                <Check size={14} />
                {t('kds.actions.serve')}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN KDS COMPONENT
// ============================================================================

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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTicketIndex, setSelectedTicketIndex] = useState(0);
  
  // Filter tickets by station and search query
  const filteredTickets = useMemo(() => {
    let tickets = kitchenTickets;

    // 1. All tickets are shown by default (no station filter)

    // 2. Search Filter (Smart Search)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tickets = tickets.filter(t => 
        (t.table_name && t.table_name.toLowerCase().includes(q)) ||
        t.id.slice(0, 8).includes(q) ||
        (t.server_name && t.server_name.toLowerCase().includes(q)) ||
        t.items?.some(i => 
          i.item_name.toLowerCase().includes(q) || 
          (i.notes && i.notes.toLowerCase().includes(q))
        )
      );
    }
    
    return tickets;
  }, [kitchenTickets, searchQuery]);
  
  // Get all bumpable tickets (new or in_progress)
  const bumpableTickets = useMemo(() => {
    return filteredTickets.filter(t => t.status === 'new' || t.status === 'in_progress');
  }, [filteredTickets]);
  
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
  const handleStart = useCallback(async (ticketId: string) => {
    try {
      await updateTicketStatus.mutateAsync({ ticketId, status: 'in_progress' });
    } catch (err) {
      console.error('Failed to start ticket:', err);
    }
  }, [updateTicketStatus]);
  
  const handleBump = useCallback(async (ticketId: string) => {
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
  }, [bumpTicket, soundEnabled]);
  
  const handleItemStatusChange = useCallback(async (itemId: string, status: string) => {
    try {
      await updateTicketItemStatus.mutateAsync({ itemId, status });
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  }, [updateTicketItemStatus]);

  const handleServe = useCallback(async (ticketId: string) => {
    try {
      await updateTicketStatus.mutateAsync({ ticketId, status: 'served' });
    } catch (err) {
      console.error('Failed to serve ticket:', err);
    }
  }, [updateTicketStatus]);
  
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };
  
  // ========================================================================
  // BUMP BAR KEYBOARD SUPPORT (Enterprise Feature)
  // ========================================================================
  
  const bumpTicketAtIndex = useCallback(async (index: number) => {
    const ticket = bumpableTickets[index];
    if (!ticket) return;
    
    setSelectedTicketIndex(index);
    
    if (ticket.status === 'new') {
      await handleStart(ticket.id);
    } else if (ticket.status === 'in_progress') {
      await handleBump(ticket.id);
    }
  }, [bumpableTickets, handleStart, handleBump]);
  
  const bumpSelectedTicket = useCallback(async () => {
    await bumpTicketAtIndex(selectedTicketIndex);
  }, [bumpTicketAtIndex, selectedTicketIndex]);
  
  // Global keyboard listener for bump bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Number keys 1-9: Bump ticket at position
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        bumpTicketAtIndex(index);
        return;
      }
      
      // Space or Enter: Bump selected/first ticket
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        bumpSelectedTicket();
        return;
      }
      
      // Arrow keys: Navigate between tickets
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        e.preventDefault();
        setSelectedTicketIndex(prev => Math.min(prev + 1, bumpableTickets.length - 1));
        return;
      }
      
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        e.preventDefault();
        setSelectedTicketIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      
      // PageDown: Scroll down / next page
      if (e.code === 'PageDown') {
        e.preventDefault();
        setSelectedTicketIndex(prev => Math.min(prev + 5, bumpableTickets.length - 1));
        return;
      }
      
      // PageUp: Scroll up / previous page
      if (e.code === 'PageUp') {
        e.preventDefault();
        setSelectedTicketIndex(prev => Math.max(prev - 5, 0));
        return;
      }
      
      // F: Toggle fullscreen
      if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      
      // S: Toggle sound
      if (e.code === 'KeyS') {
        e.preventDefault();
        setSoundEnabled(prev => !prev);
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bumpTicketAtIndex, bumpSelectedTicket, bumpableTickets.length]);
  
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
    <div className="h-full min-h-[85vh] bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
      {/* Top Bar - Unified KDS Control Deck */}
      <div className="bg-[#0f172a] border-b border-slate-800/50 flex-none z-50 shadow-2xl relative">
        <div className="max-w-[1800px] mx-auto">
          {/* Main Action Bar */}
          <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-6">
            
            {/* Branding & Status Cluster */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4 group cursor-pointer">
                <div className="relative">
                  <div className="absolute -inset-1 bg-orange-500 rounded-xl blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
                  <div className="relative p-2.5 bg-orange-500 rounded-xl shadow-2xl flex items-center justify-center">
                    <ChefHat size={32} className="text-white" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-2xl font-black text-white tracking-tighter leading-none uppercase">{t('kds.title')}</h1>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE SYSTEM READY
                  </span>
                </div>
              </div>
            </div>

            
            {/* Metrics Engine - High Visibility HUD */}
            <div className="flex items-center bg-black/20 p-1.5 rounded-[1.5rem] border border-white/5 shadow-inner">
               {/* Global Stats */}
               <div className="flex items-center px-6 gap-8 border-r border-white/5 mr-4 py-1">
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black text-white leading-none">{stats.total}</span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1.5">{t('kds.open')}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black text-white leading-none">{stats.avgTime}<span className="text-xs ml-0.5">M</span></span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1.5">{t('kds.avgTime')}</span>
                  </div>
               </div>

               {/* Live Status Pipeline */}
               <div className="flex items-center gap-2">
                  {[
                    { label: 'NEW', count: newTickets.length, color: 'blue' },
                    { label: 'PREP', count: inProgressTickets.length, color: 'yellow' },
                    { label: 'READY', count: readyTickets.length, color: 'green' }
                  ].map((status) => (
                    <div 
                      key={status.label}
                      className={`
                        flex flex-col items-center justify-center min-w-[70px] py-2 px-3 rounded-2xl border transition-all
                        ${status.label === 'NEW' ? 'bg-blue-500/5 border-blue-500/20' : ''}
                        ${status.label === 'PREP' ? 'bg-yellow-500/5 border-yellow-500/20' : ''}
                        ${status.label === 'READY' ? 'bg-green-500/5 border-green-500/20' : ''}
                      `}
                    >
                       <span className={`text-xl font-black leading-none ${
                          status.label === 'NEW' ? 'text-blue-400' : 
                          status.label === 'PREP' ? 'text-yellow-400' : 'text-green-400'
                       }`}>
                         {status.count}
                       </span>
                       <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tighter mt-1">{status.label}</span>
                    </div>
                  ))}
               </div>
            </div>

            {/* Control Cluster */}
            <div className="flex items-center gap-3">
               <div className="flex gap-1.5 bg-slate-800/40 p-1.5 rounded-2xl border border-white/5">
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all ${soundEnabled ? 'text-emerald-400' : 'text-slate-600'}`}
                  >
                    {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white transition-all"
                  >
                    {isFullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
                  </button>
               </div>
            </div>
          </div>

          {/* Action Center - Balanced Professional Design */}
          <div className="px-6 py-4 bg-black/10 border-t border-white/5 flex items-center justify-center">
            <div className="w-full max-w-3xl relative group/search">
               {/* Subtle focus shadow */}
               <div className="absolute -inset-0.5 bg-orange-500/10 rounded-2xl blur opacity-0 group-focus-within/search:opacity-100 transition duration-300" />
               
               <div className="relative bg-slate-950/50 border border-slate-700/50 group-focus-within/search:border-orange-500/50 rounded-2xl transition-all duration-300 shadow-xl overflow-hidden">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/search:text-orange-500 transition-colors">
                    <Search size={22} strokeWidth={2.5} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search by order, table, or item..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-white text-lg font-semibold pl-14 pr-12 py-4 outline-none placeholder:text-slate-600 tracking-tight"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')} 
                        className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
               </div>
            </div>
          </div>

          </div>
        </div>
      
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {/* Loading State */}
        {loadingTickets && (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
          </div>
        )}
        
        {/* Empty State */}
        {!loadingTickets && filteredTickets.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 pb-20">
            <div className="w-24 h-24 bg-slate-200 dark:bg-slate-900 rounded-full flex items-center justify-center mb-6">
                 <ChefHat size={48} className="opacity-40" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-slate-800 dark:text-slate-200">
                {searchQuery ? 'No matching tickets found' : t('kds.noOrders')}
            </h2>
            <p className="max-w-md text-center">{searchQuery ? 'Try adjusting your search terms' : t('kds.newOrdersWillAppear')}</p>
          </div>
        )}
        
        {/* Tickets Grid */}
        {!loadingTickets && filteredTickets.length > 0 && (
          <div className="space-y-8 pb-20">
            {/* Section: New Tickets */}
            {newTickets.length > 0 && (
              <div className="animate-fade-in-up">
                <div className="flex items-center gap-2 mb-4 sticky top-0 bg-slate-100/95 dark:bg-slate-950/95 py-3 z-30 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                  <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)]"></div>
                  <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
                    {t('kds.newTickets')} <span className="text-blue-500 font-bold ml-1">({newTickets.length})</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {newTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onStart={() => handleStart(ticket.id)}
                      onBump={() => handleBump(ticket.id)}
                      onServe={() => handleServe(ticket.id)}
                      onItemStatusChange={handleItemStatusChange}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Section: In Progress */}
            {inProgressTickets.length > 0 && (
              <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <div className="flex items-center gap-2 mb-4 sticky top-0 bg-slate-100/95 dark:bg-slate-950/95 py-3 z-30 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.6)]"></div>
                  <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
                    {t('kds.inProgress')} <span className="text-yellow-600 dark:text-yellow-500 font-bold ml-1">({inProgressTickets.length})</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {inProgressTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onStart={() => handleStart(ticket.id)}
                      onBump={() => handleBump(ticket.id)}
                      onServe={() => handleServe(ticket.id)}
                      onItemStatusChange={handleItemStatusChange}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Section: Ready */}
            {readyTickets.length > 0 && (
              <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <div className="flex items-center gap-2 mb-4 sticky top-0 bg-slate-100/95 dark:bg-slate-950/95 py-3 z-30 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                  <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]"></div>
                  <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
                    {t('kds.readyForPickup')} <span className="text-green-600 dark:text-green-500 font-bold ml-1">({readyTickets.length})</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {readyTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onStart={() => handleStart(ticket.id)}
                      onBump={() => handleBump(ticket.id)}
                      onServe={() => handleServe(ticket.id)}
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
    </div>
  );
}
