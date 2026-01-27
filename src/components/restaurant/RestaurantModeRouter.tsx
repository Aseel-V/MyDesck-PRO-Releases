// ============================================================================
// RESTAURANT MODE ROUTER - Role-Based View Switching
// Version: 1.0.0 | Renders different views based on staff role
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PinPadModal } from './PinPadModal';
import { RestaurantStaff } from '../../types/restaurant';
import { toast } from 'sonner';

// Lazy imports for code splitting
import StaffShiftScreen from './StaffShiftScreen';
import RestaurantDashboardV2 from './RestaurantDashboardV2';
import KitchenDisplaySystem from './KitchenDisplaySystem';
import ReservationsBoard from './ReservationsBoard';
import { MarketPOS } from '../../modules/market';
import { useBusinessSettings } from '../../hooks/useRestaurant';

// ============================================================================
// MANAGER AUTH OVERLAY
// ============================================================================

interface ManagerAuthOverlayProps {
  action: string;
  onSuccess: (manager: RestaurantStaff) => void;
  onCancel: () => void;
}

function ManagerAuthOverlay({ action, onSuccess, onCancel }: ManagerAuthOverlayProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [isValidating, setIsValidating] = useState(false);
  
  const handlePinSubmit = async (pin: string) => {
    if (!profile?.id) return;
    
    setIsValidating(true);
    try {
      // Fetch all managers and validate PIN
      const { data: managers, error } = await supabase
        .from('restaurant_staff')
        .select('*')
        .eq('business_id', profile.id)
        .eq('is_active', true)
        .in('restaurant_role', ['super_admin', 'branch_manager']);
      
      if (error) throw error;
      
      // Find manager with matching PIN
      const matchingManager = managers?.find(m => m.pin_code === pin);
      
      if (matchingManager) {
        toast.success(`Authorized by ${matchingManager.full_name}`);
        onSuccess(matchingManager as RestaurantStaff);
      } else {
        toast.error(t('managerAuth.invalidPin') || 'Invalid manager PIN');
      }
    } catch (err) {
      console.error('Manager auth error:', err);
      toast.error('Authorization failed');
    } finally {
      setIsValidating(false);
    }
  };
  
  return (
    <PinPadModal
      title={t('managerAuth.title') || 'Manager Authorization Required'}
      description={t('managerAuth.description')?.replace('{action}', action) || `Action: ${action}`}
      onClose={onCancel}
      onSuccess={handlePinSubmit}
      isProcessing={isValidating}
    />
  );
}

// ============================================================================
// MAIN ROUTER COMPONENT
// ============================================================================

interface RestaurantModeRouterProps {
  forceView?: 'shift' | 'dashboard' | 'kds' | 'reservations' | 'market';
}

export default function RestaurantModeRouter({ forceView }: RestaurantModeRouterProps) {
  const { 
    activeStaff, 
    currentRole, 
    isStaffLoggedIn,
    managerAuthRequest,
    resolveManagerAuth,
    cancelManagerAuth,
  } = useRestaurantRole();
  
  // Get business settings to determine operation mode
  const { isMarketMode, isLoading: settingsLoading } = useBusinessSettings();
  
  const [, setRerender] = useState(0);
  
  // Force rerender when staff logs in
  useEffect(() => {
    setRerender(prev => prev + 1);
  }, [activeStaff]);
  
  // Handle successful login
  const handleLoginSuccess = useCallback(() => {
    setRerender(prev => prev + 1);
  }, []);
  
  // Handle manager auth resolution
  const handleManagerAuthSuccess = useCallback((manager: RestaurantStaff) => {
    resolveManagerAuth(manager);
  }, [resolveManagerAuth]);
  
  // ============================================================================
  // VIEW DETERMINATION LOGIC
  // ============================================================================
  
  // If forced view is specified, use it
  if (forceView) {
    switch (forceView) {
      case 'shift':
        return <StaffShiftScreen onLoginSuccess={handleLoginSuccess} />;
      case 'dashboard':
        return <RestaurantDashboardV2 />;
      case 'kds':
        return <KitchenDisplaySystem />;
      case 'reservations':
        return <ReservationsBoard />;
      case 'market':
        return <MarketPOS />;
    }
  }
  
  // Show loading while settings are being fetched
  if (settingsLoading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading...</div>
      </div>
    );
  }
  
  // If Market Mode is enabled, show MarketPOS directly (no staff login required)
  if (isMarketMode) {
    return <MarketPOS />;
  }
  
  // If no staff is logged in, show shift screen
  if (!isStaffLoggedIn) {
    return <StaffShiftScreen onLoginSuccess={handleLoginSuccess} />;
  }
  
  // Determine view based on role
  const renderRoleBasedView = () => {
    switch (currentRole) {
      // Kitchen roles → KDS
      case 'kitchen_staff':
      case 'head_chef':
        return <KitchenDisplaySystem />;
      
      // Host → Reservations
      case 'host':
        return <ReservationsBoard />;
      
      // Waiter, Cashier, Managers → Dashboard (with permission-filtered views)
      case 'waiter':
      case 'cashier':
      case 'branch_manager':
      case 'super_admin':
      default:
        return <RestaurantDashboardV2 />;
    }
  };
  
  return (
    <>
      {/* Main View */}
      {renderRoleBasedView()}
      
      {/* Manager Auth Overlay (appears when requireManagerAuth is called) */}
      {managerAuthRequest && (
        <ManagerAuthOverlay
          action={managerAuthRequest.action}
          onSuccess={handleManagerAuthSuccess}
          onCancel={cancelManagerAuth}
        />
      )}
    </>
  );
}

// useRequireManagerAuth hook moved to '../../hooks/useRequireManagerAuth'
