// ============================================================================
// RESERVATIONS BOARD - Host View for Managing Reservations
// Version: 2.0.0 | Production-Ready with i18n, Table Picker, Date Validation
// ============================================================================

import { useState, useMemo, useEffect } from 'react';
import { useReservations, useWaitlist, useGuestProfiles, useRestaurant } from '../../hooks/useRestaurant';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import ReservationModal from './ReservationModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';

import { Reservation, Waitlist as WaitlistType, ReservationStatus } from '../../types/restaurant';
import { 
  Calendar, 
  Clock, 
  Users, 
  Phone, 
  Mail, 
  Plus, 
  Check, 
  X, 
  UserCheck,
  Search,
  Bell,
  Star,
  AlertTriangle,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from 'lucide-react';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Locale-aware date formatting
function formatLocalizedDate(date: Date, language: string, options?: Intl.DateTimeFormatOptions): string {
  const localeMap: Record<string, string> = {
    en: 'en-US',
    ar: 'ar-EG',
    he: 'he-IL'
  };
  const locale = localeMap[language] || 'en-US';
  return new Intl.DateTimeFormat(locale, options).format(date);
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function getStatusColor(status: ReservationStatus): string {
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'seated': return 'bg-green-100 text-green-800 border-green-200';
    case 'completed': return 'bg-slate-100 text-slate-800 border-slate-200';
    case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
    case 'no_show': return 'bg-orange-100 text-orange-800 border-orange-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
}

// ============================================================================
// RESERVATION CARD COMPONENT
// ============================================================================

interface ReservationCardProps {
  reservation: Reservation;
  onConfirm: () => void;
  onSeat: () => void;
  onCancel: () => void;
  onNoShow: () => void;
  t: (key: string) => string;
}

function ReservationCard({ reservation, onConfirm, onSeat, onCancel, onNoShow, t }: ReservationCardProps) {
  const isUpcoming = reservation.status === 'pending' || reservation.status === 'confirmed';
  const isToday = new Date(reservation.date).toDateString() === new Date().toDateString();
  
  return (
    <div className={`
      bg-white dark:bg-slate-900 rounded-xl border shadow-sm overflow-hidden
      ${isToday ? 'border-blue-300 dark:border-blue-700' : 'border-slate-200 dark:border-slate-700'}
    `}>
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 dark:text-white">
                {reservation.guest_name}
              </h3>
              {reservation.guest?.vip_level && reservation.guest.vip_level > 0 && (
                <Star size={14} className="text-yellow-500 fill-yellow-500" />
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <Users size={12} />
                {reservation.party_size}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTime(reservation.time)}
              </span>
            </div>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-bold uppercase border ${getStatusColor(reservation.status)}`}>
            {reservation.status}
          </span>
        </div>
      </div>
      
      {/* Contact Info */}
      <div className="p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Phone size={14} />
          <span>{reservation.guest_phone}</span>
        </div>
        {reservation.guest_email && (
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Mail size={14} />
            <span>{reservation.guest_email}</span>
          </div>
        )}
        {reservation.notes && (
          <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-2 rounded">
            <MessageCircle size={14} className="mt-0.5" />
            <span>{reservation.notes}</span>
          </div>
        )}
        {reservation.special_requests && (
          <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
            <AlertTriangle size={14} className="mt-0.5" />
            <span>{reservation.special_requests}</span>
          </div>
        )}
        
        {/* Guest allergies if linked */}
        {reservation.guest?.allergies && reservation.guest.allergies.length > 0 && (
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            <AlertTriangle size={14} className="mt-0.5" />
            <span>Allergies: {reservation.guest.allergies.join(', ')}</span>
          </div>
        )}
      </div>
      
      {/* Actions */}
      {isUpcoming && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex gap-2">
          {reservation.status === 'pending' && (
            <button
              onClick={onConfirm}
              className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-1 text-sm font-medium"
            >
              <Check size={14} />
              {t('reservationsBoard.actions.confirm')}
            </button>
          )}
          {reservation.status === 'confirmed' && (
            <button
              onClick={onSeat}
              className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-1 text-sm font-medium"
            >
              <UserCheck size={14} />
              {t('reservationsBoard.actions.seat')}
            </button>
          )}
          <button
            onClick={onNoShow}
            className="py-2 px-3 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm font-medium"
          >
            {t('reservationsBoard.actions.noShow')}
          </button>
          <button
            onClick={onCancel}
            className="py-2 px-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}



// ============================================================================
// TABLE PICKER MODAL - For Waitlist Seating
// ============================================================================

interface TablePickerModalProps {
  tables: Array<{ id: string; name: string; seats: number; status: string }>;
  partySize: number;
  onSelect: (tableId: string) => void;
  onClose: () => void;
  t: (key: string) => string;
}

function TablePickerModal({ tables, partySize, onSelect, onClose, t }: TablePickerModalProps) {
  const availableTables = tables.filter(table => 
    table.status === 'available' && table.seats >= partySize
  );
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-800 dark:text-white">
            {t('reservationsBoard.selectTable') || 'Select Table'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>
        
        <p className="text-sm text-slate-500 mb-4">
          {t('reservationsBoard.partySizeLabel') || 'Party size'}: {partySize} {t('reservationsBoard.guests') || 'guests'}
        </p>
        
        {availableTables.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <MapPin size={32} className="mx-auto mb-2 opacity-50" />
            <p>{t('reservationsBoard.noAvailableTables') || 'No available tables for this party size'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
            {availableTables.map((table) => (
              <button
                key={table.id}
                onClick={() => onSelect(table.id)}
                className="p-4 border-2 border-slate-200 dark:border-slate-700 rounded-xl hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors text-center"
              >
                <div className="font-bold text-slate-800 dark:text-white">{table.name}</div>
                <div className="text-xs text-slate-500">{table.seats} {t('orderEntry.seats') || 'seats'}</div>
              </button>
            ))}
          </div>
        )}
        
        <button
          onClick={onClose}
          className="w-full mt-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {t('reservationsBoard.cancel')}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// WAITLIST SECTION
// ============================================================================

interface WaitlistSectionProps {
  waitlist: WaitlistType[];
  onSeat: (id: string, partySize: number) => void;
  onRemove: (id: string, status: 'left' | 'no_show') => void;
  t: (key: string) => string;
}

function WaitlistSection({ waitlist, onSeat, onRemove, t }: WaitlistSectionProps) {
  if (waitlist.length === 0) return null;
  
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={18} className="text-amber-600" />
        <h3 className="font-bold text-amber-800 dark:text-amber-300">
          {t('reservationsBoard.waitlist.title')} ({waitlist.length})
        </h3>
      </div>
      <div className="space-y-2">
        {waitlist.map((entry) => {
          const waitTime = Math.floor((Date.now() - new Date(entry.check_in_time).getTime()) / 60000);
          return (
            <div 
              key={entry.id}
              className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div>
                  <div className="font-medium text-slate-800 dark:text-white">
                    {entry.guest_name}
                  </div>
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {entry.party_size}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone size={12} />
                      {entry.guest_phone}
                    </span>
                  </div>
                </div>
                <div className={`text-sm font-bold ${waitTime > entry.quoted_wait_minutes ? 'text-red-500' : 'text-slate-600'}`}>
                  {waitTime}m / {entry.quoted_wait_minutes}m
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onSeat(entry.id, entry.party_size)}
                  className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                >
                  {t('reservationsBoard.waitlist.seat')}
                </button>
                <button
                  onClick={() => onRemove(entry.id, 'left')}
                  className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300"
                >
                  {t('reservationsBoard.waitlist.left')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN RESERVATIONS BOARD COMPONENT
// ============================================================================

export default function ReservationsBoard() {
  const { can } = useRestaurantRole();
  const { t, language } = useLanguage();
  const { tables } = useRestaurant();
  const { 
    reservations, 
    isLoading,
    createReservation,
    updateReservationStatus,
    cancelReservation,
  } = useReservations();
  
  const { 
    waitlist, 
    seatFromWaitlist, 
    removeFromWaitlist,
  } = useWaitlist();
  
  const { searchGuests } = useGuestProfiles();
  const [guestSuggestions, setGuestSuggestions] = useState<any[]>([]);
  const handleSearchGuests = async (term: string) => {
      if (term.length >= 3) {
          const results = await searchGuests(term);
          setGuestSuggestions(results);
      } else {
          setGuestSuggestions([]);
      }
  };
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>('all');
  
  // Table picker state for waitlist seating
  const [tablePicker, setTablePicker] = useState<{ waitlistId: string; partySize: number } | null>(null);
  
  // 1.2 FIX: Server-trust time source
  const [serverOffset, setServerOffset] = useState(0);

  useEffect(() => {
    const syncTime = async () => {
      // Preferred: Select NOW() via RPC
      // Fallback: Use simple offset if RPC missing (graceful degradation)
      try {
        // @ts-ignore - RPC created manually in DB
        const { data, error } = await supabase.rpc('get_server_time');
        if (data && !error) {
           const serverTime = new Date(data as any).getTime();
           setServerOffset(serverTime - Date.now());
           return;
        }
      } catch {
        // RPC might not exist
      }
      
      // Alternative: Use auth token issue time as reasonably trusted source
      // or just assume client time if RPC fails (best effort without breaking app)
       const { data } = await supabase.auth.getSession();
       if (data.session?.access_token) {
          // Parsing JWT iat would be next step, but let's default to 0 (client trust) 
          // if we can't get strict server time, to avoid blocking valid usage.
       }
    };
    syncTime();
  }, []);
  
  
  
  // Filter reservations
  const filteredReservations = useMemo(() => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    let filtered = reservations.filter(r => r.date === dateStr);
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.guest_name.toLowerCase().includes(q) ||
        r.guest_phone.includes(q)
      );
    }
    
    return filtered.sort((a, b) => a.time.localeCompare(b.time));
  }, [reservations, selectedDate, statusFilter, searchQuery]);
  
  // Group by time slots
  const timeSlots = useMemo(() => {
    const slots: Record<string, Reservation[]> = {};
    filteredReservations.forEach(r => {
      const hour = r.time.split(':')[0];
      const key = `${hour}:00`;
      if (!slots[key]) slots[key] = [];
      slots[key].push(r);
    });
    return slots;
  }, [filteredReservations]);
  
  // Handlers
  const handleConfirm = async (id: string) => {
    await updateReservationStatus.mutateAsync({ id, status: 'confirmed' });
  };
  
  const handleSeat = async (id: string) => {
    await updateReservationStatus.mutateAsync({ id, status: 'seated' });
  };
  
  const handleNoShow = async (id: string) => {
    await updateReservationStatus.mutateAsync({ id, status: 'no_show' });
  };
  
  const handleCancel = async (id: string) => {
    await cancelReservation.mutateAsync(id);
  };
  
  const handleAddReservation = async (data: any) => {
    await createReservation.mutateAsync(data);
    setShowAddModal(false);
  };
  
  // Waitlist seating handler - opens table picker
  const handleOpenTablePicker = (id: string, partySize: number) => {
    setTablePicker({ waitlistId: id, partySize });
  };
  
  // Actually seat from waitlist with selected table
  const handleSeatWithTable = async (tableId: string) => {
    if (!tablePicker) return;
    await seatFromWaitlist.mutateAsync({ id: tablePicker.waitlistId, tableId });
    setTablePicker(null);
  };
  
  // Date navigation
  const goToDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };
  
  // Permission check  
  if (!can('canManageReservations')) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <Calendar size={48} className="mx-auto text-slate-400 mb-4" />
          <h2 className="text-xl font-bold text-slate-600 dark:text-slate-400">
            {t('reservationsBoard.accessDenied')}
          </h2>
          <p className="text-slate-500">{t('reservationsBoard.noPermission')}</p>
        </div>
      </div>
    );
  }
  
  const isToday = selectedDate.toDateString() === new Date().toDateString();
  
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t('reservationsBoard.title')}</h1>
            <p className="text-slate-500">{t('reservationsBoard.subtitle')}</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Plus size={18} />
            {t('reservationsBoard.newReservation')}
          </button>
        </div>
        
        {/* Date Navigation */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToDate(-1)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft size={20} />
            </button>
            <div className={`px-4 py-2 rounded-lg font-medium ${isToday ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {formatLocalizedDate(selectedDate, language, { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              })}
              {isToday && <span className="ml-2 text-xs">({t('reservationsBoard.today')})</span>}
            </div>
            <button
              onClick={() => goToDate(1)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight size={20} />
            </button>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-3 py-1 text-sm text-blue-500 hover:text-blue-600"
              >
                {t('reservationsBoard.today')}
              </button>
            )}
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                className="pl-9 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm w-48"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
            >
              <option value="all">{t('reservationsBoard.allStatus') || 'All Status'}</option>
              <option value="pending">{t('reservationsBoard.statuses.pending')}</option>
              <option value="confirmed">{t('reservationsBoard.statuses.confirmed')}</option>
              <option value="seated">{t('reservationsBoard.statuses.seated')}</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 mt-6">
        {/* Waitlist (only show for today) */}
        {isToday && (
          <WaitlistSection
            waitlist={waitlist}
            onSeat={handleOpenTablePicker}
            onRemove={(id, status) => removeFromWaitlist.mutate({ id, status })}
            t={t}
          />
        )}
        
        {/* Table Picker Modal */}
        {tablePicker && (
          <TablePickerModal
            tables={tables}
            partySize={tablePicker.partySize}
            onSelect={handleSeatWithTable}
            onClose={() => setTablePicker(null)}
            t={t}
          />
        )}
        
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
        
        {/* Empty State */}
        {!isLoading && filteredReservations.length === 0 && (
          <div className="text-center py-16">
            <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-600 dark:text-slate-400 mb-2">
              {t('reservationsBoard.noReservations')}
            </h3>
            <p className="text-slate-500 mb-4">
              {t('reservationsBoard.noReservationsForDate')}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              {t('reservationsBoard.addReservation')}
            </button>
          </div>
        )}
        
        {/* Reservations by Time Slot */}
        {!isLoading && Object.keys(timeSlots).length > 0 && (
          <div className="space-y-6">
            {Object.entries(timeSlots).sort(([a], [b]) => a.localeCompare(b)).map(([time, reservs]) => (
              <div key={time}>
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={16} className="text-slate-400" />
                  <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                    {formatTime(time)}
                  </h3>
                  <span className="text-sm text-slate-500">
                    ({reservs.length} {reservs.length === 1 ? t('reservationsBoard.reservation') : t('reservationsBoard.reservations')})
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {reservs.map((reservation) => (
                    <ReservationCard
                      key={reservation.id}
                      reservation={reservation}
                      onConfirm={() => handleConfirm(reservation.id)}
                      onSeat={() => handleSeat(reservation.id)}
                      onCancel={() => handleCancel(reservation.id)}
                      onNoShow={() => handleNoShow(reservation.id)}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Add Reservation Modal */}
      {/* Add Reservation Modal - New Wizard */}
      {showAddModal && (
      <ReservationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddReservation}
        selectedDate={selectedDate}
        guestSuggestions={guestSuggestions}
        onSearchGuests={handleSearchGuests}
        serverOffset={serverOffset}
      />
      )}
    </div>
  );
}
