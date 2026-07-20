import { useCallback } from 'react';
import { useRestaurantRole } from '../contexts/RestaurantRoleContext';
import { RestaurantStaff } from '../types/restaurant';

// ============================================================================
// HELPER HOOK: useRequireManagerAuth
// Simplified hook for components that need manager auth
// ============================================================================

export function useRequireManagerAuth() {
  const { requireManagerAuth, isManager } = useRestaurantRole();
  
  /**
   * Execute an action that requires manager authorization
   * If current user is a manager, executes immediately
   * Otherwise, prompts for manager PIN
   */
  const withManagerAuth = useCallback(
    async <T,>(
      action: string,
      callback: (approver?: RestaurantStaff) => Promise<T> | T
    ): Promise<T | null> => {
      // Managers can execute directly
      if (isManager) {
        return callback();
      }
      
      // Non-managers need authorization
      const manager = await requireManagerAuth(action);
      
      if (manager) {
        return callback(manager);
      }
      
      return null;
    },
    [isManager, requireManagerAuth]
  );
  
  return { withManagerAuth };
}
