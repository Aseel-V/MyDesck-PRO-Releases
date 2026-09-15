// ============================================================================
// RESTAURANT HOOKS - Complete Data Layer for Restaurant Mode
// Version: 2.0.0 | Enterprise-Grade React Query Hooks
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEffect, useCallback } from 'react';
import { Json } from '../types/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getBackend } from '../data/backend';
import type { ApprovalCredential, RestaurantFeed, StaffAuthorizationResult as BackendAuthorizationResult } from '../data/domain/restaurant';
import {
  RestaurantTable,
  MenuCategory,
  MenuItem,
  RestaurantOrder,
  RestaurantStaff,
  DailyReport,
  KitchenTicket,
  ModifierGroup,
  Modifier,
  OrderItem,
  Reservation,
  Waitlist,
  GuestProfile,
  RealtimeKPIs,
  TicketStatus,
  ReservationStatus,
  TableStatus,
  BusinessSettings
} from '../types/restaurant';

const restaurant = () => getBackend().restaurant;

// Define RPC helper type to avoid 'any'
// ============================================================================
// REALTIME SUBSCRIPTION HELPER
// ============================================================================

export type StaffAuthorizationResult = BackendAuthorizationResult;

function useRealtimeSubscription(
  table: RestaurantFeed,
  queryKey: (string | null | undefined)[],
  enabled: boolean = true
) {
  const queryClient = useQueryClient();

  // The key array is rebuilt on every render; subscribing on its content keeps one live subscription per feed.
  const keyText = JSON.stringify(queryKey);

  useEffect(() => {
    if (!enabled) return;
    const key = JSON.parse(keyText) as (string | null)[];

    return restaurant().subscribe(table, String(key[1] ?? ''), () => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  }, [table, keyText, enabled, queryClient]);
}

// ============================================================================
// MAIN RESTAURANT HOOK
// ============================================================================

export function useRestaurant() {
  const { user, profile, staffUser } = useAuth();
  const queryClient = useQueryClient();
  const businessId = user?.id || staffUser?.business_id;
  const currency = profile?.preferred_currency || 'ILS';

  // ═══════════════════════════════════════════════════════════
  // REALTIME SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════

  useRealtimeSubscription('restaurant_tables', ['restaurant_tables', businessId], !!businessId);
  useRealtimeSubscription('restaurant_orders', ['restaurant_active_orders', businessId], !!businessId);
  useRealtimeSubscription('restaurant_kitchen_tickets', ['kitchen_tickets', businessId], !!businessId);
  useRealtimeSubscription('restaurant_table_sessions', ['table_sessions', businessId], !!businessId);

  // ═══════════════════════════════════════════════════════════
  // TABLE QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: tables = [], isLoading: loadingTables } = useQuery({
    queryKey: ['restaurant_tables', businessId],
    queryFn: async () => {
      if (!businessId) return [];
      return restaurant().listTables(businessId as string);
    },
    enabled: !!businessId,
  });

  // ═══════════════════════════════════════════════════════════
  // MENU QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: categories = [], isLoading: loadingMenu } = useQuery({
    queryKey: ['restaurant_menu', businessId],
    queryFn: async () => restaurant().listMenu(businessId as string),
    enabled: !!businessId,
  });

  const { data: modifierGroups = [], isLoading: loadingModifiers } = useQuery({
    queryKey: ['restaurant_modifier_groups', businessId],
    queryFn: async () => restaurant().listModifierGroups(businessId as string),
    enabled: !!businessId,
  });

  // ═══════════════════════════════════════════════════════════
  // ORDER QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: activeOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['restaurant_active_orders', businessId],
    queryFn: async () => restaurant().listActiveOrders(businessId as string),
    enabled: !!businessId,
  });

  // ═══════════════════════════════════════════════════════════
  // STAFF QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ['restaurant_staff', businessId],
    queryFn: async () => restaurant().listStaff(businessId as string),
    enabled: !!businessId
  });

  // ═══════════════════════════════════════════════════════════
  // TABLE SESSION QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: activeSessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['table_sessions', businessId],
    queryFn: async () => restaurant().listActiveSessions(businessId as string),
    enabled: !!businessId,
  });

  // ═══════════════════════════════════════════════════════════
  // KITCHEN TICKET QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: kitchenTickets = [], isLoading: loadingTickets } = useQuery({
    queryKey: ['kitchen_tickets', businessId],
    queryFn: async () => {
      const data = await restaurant().listKitchenTickets(businessId as string);

      // Calculate elapsed time and urgency
      const now = Date.now();
      return (data as unknown as KitchenTicket[]).map(ticket => {
        const createdAt = new Date(ticket.created_at).getTime();
        const elapsedSeconds = Math.floor((now - createdAt) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);

        let urgencyLevel: 'normal' | 'attention' | 'warning' | 'critical' = 'normal';
        if (elapsedMinutes >= 15) urgencyLevel = 'critical';
        else if (elapsedMinutes >= 10) urgencyLevel = 'warning';
        else if (elapsedMinutes >= 5) urgencyLevel = 'attention';

        return { ...ticket, elapsed_seconds: elapsedSeconds, urgency_level: urgencyLevel };
      });
    },
    enabled: !!businessId,
    refetchInterval: 10000, // Refresh every 10 seconds for timers
  });

  // ═══════════════════════════════════════════════════════════
  // DAILY REPORT QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: dailyReports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['restaurant_daily_reports', businessId],
    queryFn: async () => restaurant().listDailyReports(businessId as string),
    enabled: !!businessId,
  });

  // ═══════════════════════════════════════════════════════════
  // TABLE MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const createTable = useMutation({
    mutationFn: async (tableData: Partial<RestaurantTable> & { name: string }) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().createTable(businessId, tableData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const updateTable = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RestaurantTable> & { id: string }) => {
      await restaurant().updateTable(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const deleteTable = useMutation({
    mutationFn: async (id: string) => {
      await restaurant().deleteTable(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const updateTableStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TableStatus }) => {
      await restaurant().updateTable(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  // ═══════════════════════════════════════════════════════════
  // CATEGORY MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const createCategory = useMutation({
    mutationFn: async (categoryData: Partial<MenuCategory> & { name: string }) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().createCategory(businessId, categoryData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MenuCategory> & { id: string }) => {
      await restaurant().updateCategory(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await restaurant().deleteCategory(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  // ═══════════════════════════════════════════════════════════
  // MENU ITEM MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const createMenuItem = useMutation({
    mutationFn: async (itemData: Partial<MenuItem> & { category_id: string; name: string; price: number }) => {
      return restaurant().createMenuItem(itemData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  const updateMenuItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MenuItem> & { id: string }) => {
      await restaurant().updateMenuItem(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  const deleteMenuItem = useMutation({
    mutationFn: async (id: string) => {
      await restaurant().deleteMenuItem(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  // 86 an item (mark unavailable)
  const toggleItem86 = useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      await restaurant().updateMenuItem(id, { is_available });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  // ═══════════════════════════════════════════════════════════
  // MODIFIER MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const createModifierGroup = useMutation({
    mutationFn: async (groupData: Partial<ModifierGroup> & { name: string }) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().createModifierGroup(businessId, groupData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_modifier_groups'] });
    },
  });

  const createModifier = useMutation({
    mutationFn: async (modifierData: Partial<Modifier> & { group_id: string; name: string }) => {
      return restaurant().createModifier(modifierData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_modifier_groups'] });
    },
  });

  // ═══════════════════════════════════════════════════════════
  // STAFF MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const createStaff = useMutation({
    mutationFn: async (staffData: Partial<RestaurantStaff> & { full_name: string }) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().createStaff(businessId, staffData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  const updateStaff = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RestaurantStaff> & { id: string }) => {
      await restaurant().updateStaff(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: string) => {
      await restaurant().deleteStaff(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  const clockInStaff = useMutation({
    mutationFn: async (staffId: string) => {
      await restaurant().setStaffClockedIn(staffId, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  const clockOutStaff = useMutation({
    mutationFn: async (staffId: string) => {
      await restaurant().setStaffClockedIn(staffId, false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  // ═══════════════════════════════════════════════════════════
  // SESSION MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const startSession = useMutation({
    mutationFn: async (params: { tableId: string; guestCount: number; serverId?: string }) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().startSession(businessId, params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table_sessions'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const endSession = useMutation({
    mutationFn: async (sessionId: string) => {
      await restaurant().endSession(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table_sessions'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  // ═══════════════════════════════════════════════════════════
  // ORDER MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const createOrder = useMutation({
    mutationFn: async (orderData: Partial<RestaurantOrder>) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().createOrder(businessId, {
        table_id: orderData.table_id,
        session_id: orderData.session_id,
        server_id: orderData.server_id,
        guest_id: orderData.guest_id,
        order_type: orderData.order_type,
        is_rush: orderData.is_rush,
        is_vip: orderData.is_vip,
        notes: orderData.notes,
        currency,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RestaurantOrder> & { id: string }) => {
      await restaurant().updateOrder(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async ({ orderId, reason, managerId }: { orderId: string; reason: string; managerId: string }) => {
      await restaurant().cancelOrder({ orderId, reason, managerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const addOrderItem = useMutation({
    mutationFn: async (params: {
      orderId: string;
      itemId: string;
      quantity: number;
      priceAtTime: number;
      notes?: string;
      courseNumber?: number;
      seatNumber?: number;
      modifiers?: Array<{ modifier_id: string; name: string; price: number }>;
    }) => {
      return restaurant().addOrderItem(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });

  const updateOrderItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<OrderItem> & { id: string }) => {
      await restaurant().updateOrderItem(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });


  const authorizeStaffAction = useMutation({
    mutationFn: async ({ pin, credential, requiredRole }: { pin?: string; credential?: ApprovalCredential; requiredRole?: string }) => {
      if (!businessId) throw new Error("No business context");
      const result = await restaurant().authorizeStaffAction(businessId, credential ?? { pin: pin ?? '' }, requiredRole);
      if (!result.authorized) {
        throw new Error(result.error || 'Authorization Failed');
      }
      return result;
    },
  });

  // SECURITY: Verify Prices Logic (Client-Prep)
  // This simulates what the Edge Function does, but runs on client before submission
  // to give immediate feedback and prevent "price injection" attacks.
  const verifyPriceIntegrity = async (items: Array<{ menuItem: MenuItem; quantity: number }>) => {
     if (items.length === 0) return { valid: true };

     const itemIds = items.map(i => i.menuItem.id);

     // Fetch fresh data
     const dbItems = await restaurant().verifyMenuPrices(itemIds);

     const dbItemMap = new Map(dbItems.map((i) => [i.id, i]));
     const errors: string[] = [];

     for (const item of items) {
       const dbItem = dbItemMap.get(item.menuItem.id);
       if (!dbItem) {
          errors.push(`Item "${item.menuItem.name}" no longer exists.`);
          continue;
       }
       if (!dbItem.is_available) {
          errors.push(`Item "${dbItem.name}" is now unavailable.`);
          continue;
       }
       // 0.01 tolerance
       if (Math.abs(dbItem.price - item.menuItem.price) > 0.01) {
          errors.push(`Price changed for "${dbItem.name}" (Old: ${item.menuItem.price}, New: ${dbItem.price})`);
       }
     }

     return { valid: errors.length === 0, errors };
  };

  const closeBusinessDay = useMutation({
    mutationFn: async ({
      staffId,
      date,
      shifts,
      expenses
    }: {
      staffId: string;
      date: string;
      shifts: Json[];
      expenses: Json[];
    }) => {
      return restaurant().closeBusinessDay({ staffId, date, shifts, expenses }); // Returns report ID
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_daily_reports'] });
    },
  });

  const voidOrderItem = useMutation({
    mutationFn: async ({ itemId, reason, authStaffId }: { itemId: string; reason: string; authStaffId: string }) => {
      await restaurant().voidOrderItem({ itemId, reason, authStaffId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_audit_logs'] }); // Invalidate audit logs if we had a query for them
    },
  });

  // ═══════════════════════════════════════════════════════════
  // KITCHEN TICKET MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const sendToKitchen = useMutation({
    mutationFn: async (params: { orderId: string; station?: string }) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().sendToKitchen(params.orderId, params.station ?? null) as Promise<string>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen_tickets'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: TicketStatus }) => {
      await restaurant().updateTicketStatus(ticketId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen_tickets'] });
    },
  });

  const updateTicketItemStatus = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      await restaurant().updateTicketItemStatus(itemId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen_tickets'] });
    },
  });

  // Bump ticket (mark as ready)
  const bumpTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      await restaurant().bumpTicket(ticketId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen_tickets'] });
    },
  });

  // ═══════════════════════════════════════════════════════════
  // DAILY REPORT MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const createDailyReport = useMutation({
    mutationFn: async (reportData: Partial<DailyReport>) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().createDailyReport(businessId, reportData, currency);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_daily_reports'] });
    },
  });



  const applyDiscount = useMutation({
    mutationFn: async (params: {
      orderId: string;
      discountAmount?: number;
      discountPercentage?: number;
      reason: string;
      authStaffId: string;
    }) => {
      await restaurant().applyDiscount(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });

  const refundOrder = useMutation({
    mutationFn: async (params: {
        orderId: string;
        itemIds?: string[];
        amount: number;
        reason: string;
        authStaffId: string;
    }) => {
        if (!businessId) throw new Error("No business context");
        await restaurant().refundOrder(businessId, params);
    },
    onSuccess: () => {
        toast.success("Refund processed");
    }
  });

  // ═══════════════════════════════════════════════════════════
  // RETURN ALL HOOKS
  // ═══════════════════════════════════════════════════════════

  return {
    // Data
    tables,
    categories,
    modifierGroups,
    activeOrders,
    staff,
    activeSessions,
    kitchenTickets,
    dailyReports,

    // Loading states
    loadingTables,
    loadingMenu,
    loadingModifiers,
    loadingOrders,
    loadingStaff,
    loadingSessions,
    loadingTickets,
    loadingReports,

    // Table mutations
    createTable,
    updateTable,
    deleteTable,
    updateTableStatus,

    // Category mutations
    createCategory,
    updateCategory,
    deleteCategory,

    // Menu item mutations
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    toggleItem86,

    // Modifier mutations
    createModifierGroup,
    createModifier,

    // Staff mutations
    createStaff,
    updateStaff,
    deleteStaff,
    clockInStaff,
    clockOutStaff,

    // Session mutations
    startSession,
    endSession,

    // Order mutations
    createOrder,
    updateOrder,
    cancelOrder,
    addOrderItem,
    updateOrderItem,
    voidOrderItem,
    authorizeStaffAction,
    applyDiscount,
    refundOrder,

    // Kitchen mutations
    sendToKitchen,
    updateTicketStatus,
    updateTicketItemStatus,
    bumpTicket,

    // Report mutations
    createDailyReport,
    closeBusinessDay,
    verifyPriceIntegrity,
  };
}

// RESERVATIONS HOOK
// ============================================================================

export function useReservations() {
  const { user, staffUser } = useAuth();
  const queryClient = useQueryClient();
  const businessId = user?.id || staffUser?.business_id;

  useRealtimeSubscription('restaurant_reservations', ['reservations', businessId], !!businessId);

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', businessId],
    queryFn: async () => restaurant().listReservations(businessId as string),
    enabled: !!businessId,
  });

  const { data: todayReservations = [] } = useQuery({
    queryKey: ['reservations_today', businessId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      return restaurant().listReservationsOn(businessId as string, today);
    },
    enabled: !!businessId,
  });

  const createReservation = useMutation({
    mutationFn: async (data: Partial<Reservation> & {
      guest_name: string;
      guest_phone: string;
      reservation_date: string;
      reservation_time: string;
      party_size: number;
    }) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().createReservation(businessId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservations_today'] });
    },
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Reservation> & { id: string }) => {
      await restaurant().updateReservation(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservations_today'] });
    },
  });

  const updateReservationStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservationStatus }) => {
      const updates: Record<string, unknown> = { status };
      if (status === 'seated') {
        updates.seated_at = new Date().toISOString();
      }
      await restaurant().updateReservation(id, updates as Partial<Reservation>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservations_today'] });
    },
  });

  const cancelReservation = useMutation({
    mutationFn: async (id: string) => {
      await restaurant().updateReservation(id, { status: 'cancelled' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservations_today'] });
    },
  });

  return {
    reservations,
    todayReservations,
    isLoading,
    createReservation,
    updateReservation,
    updateReservationStatus,
    cancelReservation,
  };
}

// ============================================================================
// WAITLIST HOOK
// ============================================================================

export function useWaitlist() {
  const { user, staffUser } = useAuth();
  const queryClient = useQueryClient();
  const businessId = user?.id || staffUser?.business_id;

  useRealtimeSubscription('restaurant_waitlist', ['waitlist', businessId], !!businessId);

  const { data: waitlist = [], isLoading } = useQuery({
    queryKey: ['waitlist', businessId],
    queryFn: async () => restaurant().listWaitlist(businessId as string),
    enabled: !!businessId,
  });

  const addToWaitlist = useMutation({
    mutationFn: async (data: Partial<Waitlist> & {
      guest_name: string;
      guest_phone: string;
      party_size: number;
    }) => {
      if (!businessId) throw new Error("No business context");
      return restaurant().addToWaitlist(businessId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });

  const seatFromWaitlist = useMutation({
    mutationFn: async ({ id, tableId }: { id: string; tableId: string }) => {
      await restaurant().updateWaitlist(id, {
        status: 'seated',
        seated_at: new Date().toISOString(),
        table_id: tableId,
      } as Partial<Waitlist>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });

  const removeFromWaitlist = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'left' | 'no_show' }) => {
      await restaurant().updateWaitlist(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });

  return {
    waitlist,
    isLoading,
    addToWaitlist,
    seatFromWaitlist,
    removeFromWaitlist,
  };
}

// ============================================================================
// GUEST PROFILES HOOK
// ============================================================================

export function useGuestProfiles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data: guests = [], isLoading } = useQuery({
    queryKey: ['guest_profiles', userId],
    queryFn: async () => restaurant().listGuests(),
    enabled: !!userId,
  });

  const searchGuests = useCallback(async (query: string): Promise<GuestProfile[]> => {
    if (!userId || !query) return [];
    return restaurant().searchGuests(query);
  }, [userId]);

  const getGuestByPhone = useCallback(async (phone: string): Promise<GuestProfile | null> => {
    if (!userId || !phone) return null;
    return restaurant().getGuestByPhone(phone);
  }, [userId]);

  const createGuest = useMutation({
    mutationFn: async (data: Partial<GuestProfile> & { first_name: string }) => {
      if (!userId) throw new Error("No user");
      return restaurant().createGuest(userId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest_profiles'] });
    },
  });

  const updateGuest = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<GuestProfile> & { id: string }) => {
      await restaurant().updateGuest(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest_profiles'] });
    },
  });

  const recordVisit = useMutation({
    mutationFn: async (params: {
      guestId: string;
      amountSpent: number;
      itemsOrdered?: string[];
    }) => {
      await restaurant().recordVisit({ guestId: params.guestId, amountSpent: params.amountSpent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest_profiles'] });
    },
  });

  return {
    guests,
    isLoading,
    searchGuests,
    getGuestByPhone,
    createGuest,
    updateGuest,
    recordVisit,
  };
}

// ============================================================================
// PAYMENTS HOOK
// ============================================================================

export function usePayments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const processPayment = useMutation({
    mutationFn: async (params: {
      orderId: string;
      amount: number;
      method: 'cash' | 'card' | 'split';
      tipAmount?: number;
      processedBy: string;
    }) => {
      if (!userId) throw new Error("No user");
      return restaurant().processPayment(userId, params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const processSplitPayment = useMutation({
    mutationFn: async (params: {
      orderId: string;
      payments: Array<{ amount: number; method: 'cash' | 'card'; tipAmount?: number }>;
      processedBy: string;
    }) => {
      if (!userId) throw new Error("No user");
      await restaurant().processSplitPayment(userId, params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  return {
    processPayment,
    processSplitPayment,
  };
}

// ============================================================================
// KPI / ANALYTICS HOOK
// ============================================================================

export function useRestaurantKPIs() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['restaurant_kpis', userId],
    queryFn: async (): Promise<RealtimeKPIs> => {
      const today = new Date().toISOString().split('T')[0];
      return restaurant().getKpis(today);
    },
    enabled: !!userId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return { kpis, isLoading };
}

// ============================================================================
// BUSINESS SETTINGS HOOK (Market Mode Support)
// ============================================================================

export function useBusinessSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['business_settings', userId],
    queryFn: async (): Promise<BusinessSettings> => {
      if (!userId) throw new Error('Not authenticated');
      return restaurant().getOrCreateBusinessSettings(userId);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<Pick<BusinessSettings, 'operation_mode' | 'market_scale_prefix' | 'market_scale_port'>>) => {
      if (!userId) throw new Error('Not authenticated');

      // Validate operation_mode if provided
      if (updates.operation_mode && !['restaurant', 'market'].includes(updates.operation_mode)) {
        throw new Error('Invalid operation mode');
      }

      // Sanitize scale prefix (only digits allowed)
      if (updates.market_scale_prefix) {
        updates.market_scale_prefix = updates.market_scale_prefix.replace(/\D/g, '').slice(0, 5);
      }

      return restaurant().updateBusinessSettings(userId, updates);
    },
    onMutate: async (updates) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['business_settings', userId] });
      const previous = queryClient.getQueryData<BusinessSettings>(['business_settings', userId]);

      if (previous) {
        queryClient.setQueryData(['business_settings', userId], {
          ...previous,
          ...updates,
        });
      }

      return { previous };
    },
    onError: (err, _, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['business_settings', userId], context.previous);
      }
      toast.error('Failed to update settings');
      console.error('Settings update error:', err);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business_settings', userId] });
      toast.success('Settings updated successfully');
    },
  });

  return {
    settings: settings ?? null,
    isLoading,
    error,
    isMarketMode: settings?.operation_mode === 'market',
    isRestaurantMode: settings?.operation_mode === 'restaurant' || !settings,
    updateSettings: updateSettings.mutateAsync,
    isUpdating: updateSettings.isPending,
  };
}
