import { UserRole } from '../../types/restaurant';

// Role hierarchy for permission escalation checks
export const ROLE_HIERARCHY: UserRole[] = [
  'super_admin',
  'branch_manager',
  'head_chef',
  'waiter',
  'cashier',
  'kitchen_staff',
  'host',
];

// Default views per role
export const ROLE_DEFAULT_VIEWS: Record<UserRole, string> = {
  super_admin: '/restaurant/analytics',
  branch_manager: '/restaurant/floor',
  head_chef: '/restaurant/kitchen',
  waiter: '/restaurant/tables',
  kitchen_staff: '/restaurant/kds',
  cashier: '/restaurant/payments',
  host: '/restaurant/reservations',
};
