// ============================================================================
// RESTAURANT COMPONENTS - Barrel Export File
// Version: 1.0.0 | All Restaurant Module Components
// ============================================================================

// Core Views
export { default as FloorPlanEditor } from './FloorPlanEditor';
export { default as KitchenDisplaySystem } from './KitchenDisplaySystem';
export { default as ReservationsBoard } from './ReservationsBoard';
export { default as GuestProfiles } from './GuestProfiles';
export { default as AnalyticsDashboard } from './AnalyticsDashboard';
export { default as OrderEntry } from './OrderEntry';

// Staff Authentication & Routing
export { default as StaffShiftScreen } from './StaffShiftScreen';
export { default as RestaurantModeRouter } from './RestaurantModeRouter';
export { useRequireManagerAuth } from '../../hooks/useRequireManagerAuth';

// Main Dashboard
export { default as RestaurantDashboardV2, FloorPlanWithOrders } from './RestaurantDashboardV2';

// Re-export types for convenience
export type {
  RestaurantTable,
  MenuCategory,
  MenuItem,
  RestaurantOrder,
  OrderItem,
  RestaurantStaff,
  DailyReport,
  KitchenTicket,
  TicketItem,
  TableSession,
  Reservation,
  GuestProfile,
  ModifierGroup,
  Modifier,
  RealtimeKPIs,
  ZReportResult,
  UserRole,
  TableStatus,
  OrderStatus,
  TicketStatus,
  ReservationStatus,
  KitchenStation,
} from '../../types/restaurant';

// Re-export hooks
export {
  useRestaurant,
  useReservations,
  useWaitlist,
  useGuestProfiles,
  usePayments,
  useRestaurantKPIs,
} from '../../hooks/useRestaurant';

// Re-export context
export {
  RestaurantRoleProvider,
  useRestaurantRole,
  PermissionGuard,
  RoleGuard,
  ManagerOnly,
} from '../../contexts/RestaurantRoleContext';
