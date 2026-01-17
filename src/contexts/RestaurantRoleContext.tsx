// ============================================================================
// RESTAURANT ROLE CONTEXT - Role-Based Access Control for Restaurant Mode
// Version: 2.0.0 | Enterprise-Grade RBAC with PIN-Based Staff Authentication
// ============================================================================

import { createContext, useContext, ReactNode, useMemo, useCallback, useState, useRef } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { 
  UserRole, 
  RolePermissions, 
  DEFAULT_ROLE_PERMISSIONS,
  KitchenStation,
  RestaurantStaff
} from '../types/restaurant';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface RestaurantStaffMember {
  id: string;
  user_id?: string;
  full_name: string;
  restaurant_role: UserRole;
  assigned_station?: KitchenStation;
  assigned_tables?: string[];
  is_clocked_in: boolean;
  pin_code?: string;
  hourly_rate?: number;
}

interface ManagerAuthRequest {
  action: string;
  resolve: (staff: RestaurantStaff | null) => void;
}

interface RestaurantRoleContextType {
  // Current staff member info
  currentStaff: RestaurantStaffMember | null;
  activeStaff: RestaurantStaffMember | null; // Alias for PIN-logged staff
  currentRole: UserRole;
  permissions: RolePermissions;
  isAuthenticated: boolean;
  isStaffLoggedIn: boolean;
  
  // Staff Authentication (PIN-based)
  loginWithPin: (staffId: string, pin: string) => Promise<boolean>;
  logout: () => void;
  clockIn: (staffId: string) => Promise<void>;
  clockOut: () => Promise<void>;
  
  // Manager Override
  requireManagerAuth: (action: string) => Promise<RestaurantStaff | null>;
  managerAuthRequest: ManagerAuthRequest | null;
  resolveManagerAuth: (staff: RestaurantStaff | null) => void;
  cancelManagerAuth: () => void;
  
  // Permission check helpers
  can: (permission: keyof RolePermissions) => boolean;
  canWithLimit: (permission: keyof RolePermissions, value?: number) => boolean;
  
  // Role check helpers
  isRole: (role: UserRole) => boolean;
  isAtLeast: (role: UserRole) => boolean;
  isManager: boolean;
  isKitchenStaff: boolean;
  isFrontOfHouse: boolean;
  
  // Default view for role
  defaultView: string;
  
  // Staff assignment helpers
  isAssignedToTable: (tableId: string) => boolean;
  isAssignedToStation: (station: KitchenStation) => boolean;
}

// Role hierarchy for permission escalation checks
const ROLE_HIERARCHY: UserRole[] = [
  'super_admin',
  'branch_manager',
  'head_chef',
  'waiter',
  'cashier',
  'kitchen_staff',
  'host',
];

// Default views per role
const ROLE_DEFAULT_VIEWS: Record<UserRole, string> = {
  super_admin: '/restaurant/analytics',
  branch_manager: '/restaurant/floor',
  head_chef: '/restaurant/kitchen',
  waiter: '/restaurant/tables',
  kitchen_staff: '/restaurant/kds',
  cashier: '/restaurant/payments',
  host: '/restaurant/reservations',
};

// Session storage key
const STAFF_SESSION_KEY = 'restaurant_active_staff';

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const RestaurantRoleContext = createContext<RestaurantRoleContextType | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface RestaurantRoleProviderProps {
  children: ReactNode;
  staffOverride?: RestaurantStaffMember; // For testing
}

export function RestaurantRoleProvider({ children, staffOverride }: RestaurantRoleProviderProps) {
  const { user, profile } = useAuth();
  
  // Active staff from PIN login (stored in state, not session for security)
  const [activeStaff, setActiveStaff] = useState<RestaurantStaffMember | null>(() => {
    // Try to restore from session storage (for page refreshes during shift)
    try {
      const cached = sessionStorage.getItem(STAFF_SESSION_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Only restore if less than 8 hours old (typical shift duration)
        if (parsed.timestamp && Date.now() - parsed.timestamp < 8 * 60 * 60 * 1000) {
          return parsed.staff;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  });
  
  // Manager auth request state
  const [managerAuthRequest, setManagerAuthRequest] = useState<ManagerAuthRequest | null>(null);
  const managerAuthResolverRef = useRef<((staff: RestaurantStaff | null) => void) | null>(null);
  
  // PIN Rate Limiting - track failed attempts
  const [failedAttempts, setFailedAttempts] = useState<Record<string, number>>({});
  const [lockoutUntil, setLockoutUntil] = useState<Record<string, number>>({});
  
  const MAX_PIN_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  
  // ============================================================================
  // PIN-BASED AUTHENTICATION
  // ============================================================================
  
  const loginWithPin = useCallback(async (staffId: string, pin: string): Promise<boolean> => {
    if (!profile?.id) {
      toast.error('No business profile found');
      return false;
    }
    
    // Check if account is locked out
    const lockoutTime = lockoutUntil[staffId];
    if (lockoutTime && Date.now() < lockoutTime) {
      const remainingMinutes = Math.ceil((lockoutTime - Date.now()) / 60000);
      toast.error(`Account locked. Try again in ${remainingMinutes} minutes.`);
      return false;
    }
    
    try {
      // Use secure server-side PIN verification (hashed comparison)
      // Type assertion needed until Supabase types are regenerated with new RPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: rpcError } = await (supabase.rpc as any)(
        'verify_staff_pin_secure',
        { 
          p_staff_id: staffId, 
          p_pin: pin, 
          p_business_id: profile.id 
        }
      );
      
      if (rpcError) {
        console.error('PIN verification RPC error:', rpcError);
        toast.error('Login failed. Please try again.');
        return false;
      }
      
      // Check if PIN was valid
      if (!result?.valid) {
        // Track failed attempt
        const attempts = (failedAttempts[staffId] || 0) + 1;
        setFailedAttempts(prev => ({ ...prev, [staffId]: attempts }));
        
        if (attempts >= MAX_PIN_ATTEMPTS) {
          // Lock the account
          setLockoutUntil(prev => ({ ...prev, [staffId]: Date.now() + LOCKOUT_DURATION_MS }));
          setFailedAttempts(prev => ({ ...prev, [staffId]: 0 }));
          toast.error('Too many failed attempts. Account locked for 15 minutes.');
        } else {
          const remaining = MAX_PIN_ATTEMPTS - attempts;
          toast.error(`Invalid PIN. ${remaining} attempts remaining.`);
        }
        return false;
      }
      
      // Reset failed attempts on successful login
      setFailedAttempts(prev => ({ ...prev, [staffId]: 0 }));
      
      // Create staff member object from RPC response
      const staffMember: RestaurantStaffMember = {
        id: result.staff_id,
        user_id: undefined,
        full_name: result.full_name,
        restaurant_role: result.restaurant_role as UserRole,
        assigned_station: result.assigned_station as KitchenStation | undefined,
        assigned_tables: result.assigned_tables || [],
        is_clocked_in: result.is_clocked_in,
        hourly_rate: result.hourly_rate,
      };
      
      // Set active staff
      setActiveStaff(staffMember);
      
      // Store in session (for page refresh recovery)
      sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify({
        staff: staffMember,
        timestamp: Date.now(),
      }));
      
      // Auto clock-in if not already
      if (!result.is_clocked_in) {
        await supabase
          .from('restaurant_staff')
          .update({
            is_clocked_in: true,
            clocked_in_at: new Date().toISOString(),
          })
          .eq('id', staffId);
        
        staffMember.is_clocked_in = true;
        setActiveStaff({ ...staffMember });
      }
      
      toast.success(`Welcome, ${result.full_name}!`);
      return true;
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Login failed. Please try again.');
      return false;
    }
  }, [profile?.id, failedAttempts, lockoutUntil]);
  
  const logout = useCallback(() => {
    setActiveStaff(null);
    sessionStorage.removeItem(STAFF_SESSION_KEY);
    toast.info('Logged out successfully');
  }, []);
  
  const clockIn = useCallback(async (staffId: string) => {
    try {
      await supabase
        .from('restaurant_staff')
        .update({
          is_clocked_in: true,
          clocked_in_at: new Date().toISOString(),
        })
        .eq('id', staffId);
      
      if (activeStaff?.id === staffId) {
        setActiveStaff(prev => prev ? { ...prev, is_clocked_in: true } : null);
      }
      
      toast.success('Clocked in successfully');
    } catch (err) {
      console.error('Clock in error:', err);
      toast.error('Failed to clock in');
    }
  }, [activeStaff?.id]);
  
  const clockOut = useCallback(async () => {
    if (!activeStaff) return;
    
    try {
      await supabase
        .from('restaurant_staff')
        .update({
          is_clocked_in: false,
          clocked_in_at: null,
        })
        .eq('id', activeStaff.id);
      
      // Log out after clocking out
      logout();
      toast.success('Clocked out successfully');
    } catch (err) {
      console.error('Clock out error:', err);
      toast.error('Failed to clock out');
    }
  }, [activeStaff, logout]);
  
  // ============================================================================
  // MANAGER OVERRIDE AUTHENTICATION
  // ============================================================================
  
  const requireManagerAuth = useCallback((action: string): Promise<RestaurantStaff | null> => {
    return new Promise((resolve) => {
      managerAuthResolverRef.current = resolve;
      setManagerAuthRequest({ action, resolve });
    });
  }, []);
  
  const resolveManagerAuth = useCallback((staff: RestaurantStaff | null) => {
    if (managerAuthResolverRef.current) {
      managerAuthResolverRef.current(staff);
      managerAuthResolverRef.current = null;
    }
    setManagerAuthRequest(null);
  }, []);
  
  const cancelManagerAuth = useCallback(() => {
    if (managerAuthResolverRef.current) {
      managerAuthResolverRef.current(null);
      managerAuthResolverRef.current = null;
    }
    setManagerAuthRequest(null);
  }, []);
  
  // ============================================================================
  // DETERMINE CURRENT STAFF (Priority: PIN login > Override > Owner)
  // ============================================================================
  
  const currentStaff = useMemo((): RestaurantStaffMember | null => {
    // 1. PIN-logged staff takes priority
    if (activeStaff) return activeStaff;
    
    // 2. Staff override (for testing)
    if (staffOverride) return staffOverride;
    
    // 3. Fall back to business owner as manager
    if (!user) return null;
    
    return {
      id: user.id,
      user_id: user.id,
      full_name: profile?.business_name || user.email || 'Owner',
      restaurant_role: 'branch_manager',
      is_clocked_in: true,
    };
  }, [user, profile, staffOverride, activeStaff]);
  
  // Get current role
  const currentRole = useMemo((): UserRole => {
    return currentStaff?.restaurant_role || 'waiter';
  }, [currentStaff]);
  
  // Get permissions for current role
  const permissions = useMemo((): RolePermissions => {
    return DEFAULT_ROLE_PERMISSIONS[currentRole] || DEFAULT_ROLE_PERMISSIONS.waiter;
  }, [currentRole]);
  
  // Check if staff is logged in via PIN
  const isStaffLoggedIn = useMemo(() => !!activeStaff, [activeStaff]);
  
  // Check if user can perform action
  const can = useCallback((permission: keyof RolePermissions): boolean => {
    const value = permissions[permission];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    return false;
  }, [permissions]);
  
  // Check permission with value limit (e.g., discount percentage)
  const canWithLimit = useCallback((permission: keyof RolePermissions, value?: number): boolean => {
    const permValue = permissions[permission];
    if (typeof permValue === 'boolean') return permValue;
    if (typeof permValue === 'number') {
      if (value === undefined) return permValue > 0;
      return value <= permValue;
    }
    return false;
  }, [permissions]);
  
  // Check if current user has specific role
  const isRole = useCallback((role: UserRole): boolean => {
    return currentRole === role;
  }, [currentRole]);
  
  // Check if current user's role is at or above specified role in hierarchy
  const isAtLeast = useCallback((role: UserRole): boolean => {
    const currentIndex = ROLE_HIERARCHY.indexOf(currentRole);
    const requiredIndex = ROLE_HIERARCHY.indexOf(role);
    return currentIndex <= requiredIndex; // Lower index = higher privilege
  }, [currentRole]);
  
  // Role category helpers
  const isManager = useMemo((): boolean => {
    return currentRole === 'super_admin' || currentRole === 'branch_manager';
  }, [currentRole]);
  
  const isKitchenStaff = useMemo((): boolean => {
    return currentRole === 'head_chef' || currentRole === 'kitchen_staff';
  }, [currentRole]);
  
  const isFrontOfHouse = useMemo((): boolean => {
    return currentRole === 'waiter' || currentRole === 'host' || currentRole === 'cashier';
  }, [currentRole]);
  
  // Get default view for current role
  const defaultView = useMemo((): string => {
    return ROLE_DEFAULT_VIEWS[currentRole] || '/restaurant/floor';
  }, [currentRole]);
  
  // Check if staff is assigned to specific table
  const isAssignedToTable = useCallback((tableId: string): boolean => {
    if (isManager) return true; // Managers can access all tables
    if (!currentStaff?.assigned_tables) return false;
    return currentStaff.assigned_tables.includes(tableId);
  }, [currentStaff, isManager]);
  
  // Check if staff is assigned to specific station
  const isAssignedToStation = useCallback((station: KitchenStation): boolean => {
    if (isManager || currentRole === 'head_chef') return true;
    if (!currentStaff?.assigned_station) return false;
    return currentStaff.assigned_station === station;
  }, [currentStaff, isManager, currentRole]);
  
  const value = useMemo((): RestaurantRoleContextType => ({
    currentStaff,
    activeStaff,
    currentRole,
    permissions,
    isAuthenticated: !!currentStaff,
    isStaffLoggedIn,
    loginWithPin,
    logout,
    clockIn,
    clockOut,
    requireManagerAuth,
    managerAuthRequest,
    resolveManagerAuth,
    cancelManagerAuth,
    can,
    canWithLimit,
    isRole,
    isAtLeast,
    isManager,
    isKitchenStaff,
    isFrontOfHouse,
    defaultView,
    isAssignedToTable,
    isAssignedToStation,
  }), [
    currentStaff,
    activeStaff,
    currentRole,
    permissions,
    isStaffLoggedIn,
    loginWithPin,
    logout,
    clockIn,
    clockOut,
    requireManagerAuth,
    managerAuthRequest,
    resolveManagerAuth,
    cancelManagerAuth,
    can,
    canWithLimit,
    isRole,
    isAtLeast,
    isManager,
    isKitchenStaff,
    isFrontOfHouse,
    defaultView,
    isAssignedToTable,
    isAssignedToStation,
  ]);
  
  return (
    <RestaurantRoleContext.Provider value={value}>
      {children}
    </RestaurantRoleContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useRestaurantRole() {
  const context = useContext(RestaurantRoleContext);
  if (!context) {
    throw new Error('useRestaurantRole must be used within a RestaurantRoleProvider');
  }
  return context;
}

// ============================================================================
// PERMISSION GUARD COMPONENT
// ============================================================================

interface PermissionGuardProps {
  permission: keyof RolePermissions;
  value?: number;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGuard({ permission, value, fallback = null, children }: PermissionGuardProps) {
  const { canWithLimit } = useRestaurantRole();
  
  if (!canWithLimit(permission, value)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

// ============================================================================
// ROLE GUARD COMPONENT
// ============================================================================

interface RoleGuardProps {
  roles: UserRole[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function RoleGuard({ roles, fallback = null, children }: RoleGuardProps) {
  const { currentRole } = useRestaurantRole();
  
  if (!roles.includes(currentRole)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

// ============================================================================
// MANAGER ONLY GUARD
// ============================================================================

interface ManagerOnlyProps {
  fallback?: ReactNode;
  children: ReactNode;
}

export function ManagerOnly({ fallback = null, children }: ManagerOnlyProps) {
  const { isManager } = useRestaurantRole();
  
  if (!isManager) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ROLE_HIERARCHY, ROLE_DEFAULT_VIEWS };
export type { RestaurantRoleContextType, ManagerAuthRequest };
