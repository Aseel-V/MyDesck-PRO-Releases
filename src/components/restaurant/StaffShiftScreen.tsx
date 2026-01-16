// ============================================================================
// STAFF SHIFT SCREEN - PIN-Based Staff Selection & Login
// Version: 1.0.0 | Restaurant Mode Entry Point
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, LogIn, Clock, ChefHat, UtensilsCrossed, UserCog, Wallet, ConciergeBell, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurantRole, RestaurantStaffMember } from '../../contexts/RestaurantRoleContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { PinPadModal, PinPadModalHandle } from './PinPadModal';
import { UserRole, KitchenStation } from '../../types/restaurant';

// ============================================================================
// ROLE ICONS & COLORS
// ============================================================================

const ROLE_CONFIG: Record<UserRole, { icon: typeof Users; color: string; bgColor: string }> = {
  super_admin: { icon: UserCog, color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  branch_manager: { icon: UserCog, color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  head_chef: { icon: ChefHat, color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  waiter: { icon: UtensilsCrossed, color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  kitchen_staff: { icon: ChefHat, color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  cashier: { icon: Wallet, color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  host: { icon: ConciergeBell, color: 'text-pink-600', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
};

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Admin',
  branch_manager: 'Manager',
  head_chef: 'Head Chef',
  waiter: 'Waiter',
  kitchen_staff: 'Kitchen',
  cashier: 'Cashier',
  host: 'Host',
};

// ============================================================================
// STAFF CARD COMPONENT
// ============================================================================

interface StaffCardProps {
  staff: RestaurantStaffMember;
  onClick: () => void;
}

function StaffCard({ staff, onClick }: StaffCardProps) {
  const config = ROLE_CONFIG[staff.restaurant_role] || ROLE_CONFIG.waiter;
  const Icon = config.icon;
  
  const initials = staff.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 hover:scale-[1.02] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      {/* Clock-in indicator */}
      {staff.is_clocked_in && (
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Active</span>
        </div>
      )}
      
      {/* Avatar */}
      <div className={`w-16 h-16 ${config.bgColor} ${config.color} rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
        <span className="text-xl font-bold">{initials}</span>
      </div>
      
      {/* Name */}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 text-center">
        {staff.full_name}
      </h3>
      
      {/* Role badge */}
      <div className={`flex items-center gap-1.5 px-3 py-1 ${config.bgColor} rounded-full`}>
        <Icon size={14} className={config.color} />
        <span className={`text-sm font-medium ${config.color}`}>
          {ROLE_LABELS[staff.restaurant_role]}
        </span>
      </div>
      
      {/* Hover hint */}
      <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <LogIn size={12} />
          Tap to clock in
        </span>
      </div>
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface StaffShiftScreenProps {
  onLoginSuccess?: () => void;
}

export default function StaffShiftScreen({ onLoginSuccess }: StaffShiftScreenProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { loginWithPin } = useRestaurantRole();
  
  const [staffList, setStaffList] = useState<RestaurantStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<RestaurantStaffMember | null>(null);
  const [showPinPad, setShowPinPad] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const pinPadRef = useRef<PinPadModalHandle>(null);
  
  // Fetch active staff members
  const fetchStaff = useCallback(async () => {
    if (!profile?.id) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('restaurant_staff')
        .select('*')
        .eq('business_id', profile.id)
        .eq('is_active', true)
        .order('full_name');
      
      if (error) throw error;
      
      const mapped: RestaurantStaffMember[] = (data || []).map(s => ({
        id: s.id,
        user_id: s.user_id || undefined,
        full_name: s.full_name,
        restaurant_role: s.restaurant_role as UserRole,
        assigned_station: s.assigned_station as KitchenStation | undefined,
        assigned_tables: s.assigned_tables || [],
        is_clocked_in: s.is_clocked_in,
        hourly_rate: s.hourly_rate,
      }));
      
      setStaffList(mapped);
    } catch (err) {
      console.error('Error fetching staff:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);
  
  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);
  
  // Handle staff card click
  const handleStaffClick = (staff: RestaurantStaffMember) => {
    setSelectedStaff(staff);
    setShowPinPad(true);
  };
  
  // Handle PIN submission
  const handlePinSubmit = async (pin: string) => {
    if (!selectedStaff) return;
    
    setIsAuthenticating(true);
    try {
      const success = await loginWithPin(selectedStaff.id, pin);
      
      if (success) {
        setShowPinPad(false);
        setSelectedStaff(null);
        onLoginSuccess?.();
      } else {
        pinPadRef.current?.triggerFailure();
      }
    } catch (err) {
        console.error('Login error:', err);
        pinPadRef.current?.triggerFailure();
    } finally {
      setIsAuthenticating(false);
    }
  };
  
  // Handle PIN modal close
  const handlePinClose = () => {
    setShowPinPad(false);
    setSelectedStaff(null);
  };
  
  // Current time display
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Users className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {t('staffShift.title') || 'Staff Check-In'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {profile?.business_name}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Clock size={18} />
            <span className="text-lg font-mono">
              {currentTime.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
              })}
            </span>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Instructions */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-white mb-2">
              {t('staffShift.selectStaff') || 'Select Your Profile'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {t('staffShift.enterPin') || 'Tap your name and enter your PIN to start your shift'}
            </p>
          </div>
          
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}
          
          {/* Empty State */}
          {!loading && staffList.length === 0 && (
            <div className="text-center py-20">
              <Users className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('staffShift.noStaff') || 'No Staff Members'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                {t('staffShift.addStaffHint') || 'Add staff members in Settings to enable check-in'}
              </p>
            </div>
          )}
          
          {/* Staff Grid */}
          {!loading && staffList.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {staffList.map(staff => (
                <StaffCard
                  key={staff.id}
                  staff={staff}
                  onClick={() => handleStaffClick(staff)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span>{staffList.filter(s => s.is_clocked_in).length} / {staffList.length} staff clocked in</span>
        </div>
      </footer>
      
      {/* PIN Pad Modal */}
      {showPinPad && selectedStaff && (
        <PinPadModal
          ref={pinPadRef}
          title={`Welcome, ${selectedStaff.full_name}`}
          description={t('staffShift.pinPrompt') || 'Enter your 4-digit PIN to clock in'}
          onClose={handlePinClose}
          onSuccess={handlePinSubmit}
          isProcessing={isAuthenticating}
        />
      )}
    </div>
  );
}
