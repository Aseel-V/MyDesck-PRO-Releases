// ============================================================================
// RESTAURANT HOOKS - Complete Data Layer for Restaurant Mode
// Version: 2.0.0 | Enterprise-Grade React Query Hooks
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  RestaurantTable, 
  MenuCategory, 
  MenuItem, 
  RestaurantOrder, 
  RestaurantStaff, 
  DailyReport,
  TableSession,
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
} from '../types/restaurant';

// ============================================================================
// REALTIME SUBSCRIPTION HELPER
// ============================================================================

function useRealtimeSubscription(
  table: string,
  queryKey: (string | null | undefined)[],
  enabled: boolean = true
) {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!enabled) return;
    
    const channel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, queryKey, enabled, queryClient]);
}

// ============================================================================
// MAIN RESTAURANT HOOK
// ============================================================================

export function useRestaurant() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const currency = profile?.preferred_currency || 'ILS';

  // ═══════════════════════════════════════════════════════════
  // REALTIME SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════
  
  useRealtimeSubscription('restaurant_tables', ['restaurant_tables', userId], !!userId);
  useRealtimeSubscription('restaurant_orders', ['restaurant_active_orders', userId], !!userId);
  useRealtimeSubscription('restaurant_kitchen_tickets', ['kitchen_tickets', userId], !!userId);
  useRealtimeSubscription('restaurant_table_sessions', ['table_sessions', userId], !!userId);

  // ═══════════════════════════════════════════════════════════
  // TABLE QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: tables = [], isLoading: loadingTables } = useQuery({
    queryKey: ['restaurant_tables', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as RestaurantTable[];
    },
    enabled: !!userId,
  });

  // ═══════════════════════════════════════════════════════════
  // MENU QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: categories = [], isLoading: loadingMenu } = useQuery({
    queryKey: ['restaurant_menu', userId],
    queryFn: async () => {
      const { data: cats, error: catsError } = await supabase
        .from('restaurant_menu_categories')
        .select('*, items:restaurant_menu_items(*)')
        .order('sort_order');
      
      if (catsError) throw catsError;
      return cats as unknown as MenuCategory[];
    },
    enabled: !!userId,
  });

  const { data: modifierGroups = [], isLoading: loadingModifiers } = useQuery({
    queryKey: ['restaurant_modifier_groups', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_modifier_groups')
        .select('*, modifiers:restaurant_modifiers(*)')
        .order('sort_order');
      if (error) throw error;
      return data as unknown as ModifierGroup[];
    },
    enabled: !!userId,
  });

  // ═══════════════════════════════════════════════════════════
  // ORDER QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: activeOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['restaurant_active_orders', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_orders')
        .select(`
          *,
          items:restaurant_order_items(
            *,
            menu_item:restaurant_menu_items(*),
            modifiers:restaurant_order_item_modifiers(*)
          ),
          table:restaurant_tables(*),
          server:restaurant_staff(*)
        `)
        .not('status', 'in', '("closed","cancelled")')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as RestaurantOrder[];
    },
    enabled: !!userId,
  });

  // ═══════════════════════════════════════════════════════════
  // STAFF QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ['restaurant_staff', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_staff')
        .select('*')
        .order('full_name');
      if (error) throw error;
      return data as RestaurantStaff[];
    },
    enabled: !!userId
  });

  // ═══════════════════════════════════════════════════════════
  // TABLE SESSION QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: activeSessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['table_sessions', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_table_sessions')
        .select(`
          *,
          table:restaurant_tables(*),
          server:restaurant_staff(*),
          orders:restaurant_orders(*)
        `)
        .eq('status', 'active')
        .order('started_at', { ascending: false });
      if (error) throw error;
      return data as unknown as TableSession[];
    },
    enabled: !!userId,
  });

  // ═══════════════════════════════════════════════════════════
  // KITCHEN TICKET QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: kitchenTickets = [], isLoading: loadingTickets } = useQuery({
    queryKey: ['kitchen_tickets', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_kitchen_tickets')
        .select(`
          *,
          items:restaurant_ticket_items(*),
          order:restaurant_orders(*)
        `)
        .in('status', ['new', 'in_progress', 'ready'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      
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
    enabled: !!userId,
    refetchInterval: 10000, // Refresh every 10 seconds for timers
  });

  // ═══════════════════════════════════════════════════════════
  // DAILY REPORT QUERIES
  // ═══════════════════════════════════════════════════════════

  const { data: dailyReports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['restaurant_daily_reports', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_daily_reports')
        .select('*')
        .order('date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as unknown as DailyReport[]);
    },
    enabled: !!userId,
  });

  // ═══════════════════════════════════════════════════════════
  // TABLE MUTATIONS
  // ═══════════════════════════════════════════════════════════

  const createTable = useMutation({
    mutationFn: async (tableData: Partial<RestaurantTable> & { name: string }) => {
      if (!userId) throw new Error("No user logged in");
      const { data, error } = await supabase
        .from('restaurant_tables')
        .insert({ 
          name: tableData.name,
          seats: tableData.seats ?? 4,
          min_party_size: tableData.min_party_size ?? 1,
          status: tableData.status ?? 'free',
          position_x: tableData.position_x ?? 0,
          position_y: tableData.position_y ?? 0,
          shape: tableData.shape ?? 'round',
          zone: tableData.zone ?? 'indoor',
          width: tableData.width ?? 100,
          height: tableData.height ?? 100,
          rotation: tableData.rotation ?? 0,
          is_mergeable: tableData.is_mergeable ?? true,
          business_id: userId 
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const updateTable = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RestaurantTable> & { id: string }) => {
      const { error } = await supabase
        .from('restaurant_tables')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const deleteTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('restaurant_tables')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const updateTableStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TableStatus }) => {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
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
      if (!userId) throw new Error("No user logged in");
      const { data, error } = await supabase
        .from('restaurant_menu_categories')
        .insert([{ 
          ...categoryData, 
          business_id: userId,
          is_active: categoryData.is_active ?? true,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MenuCategory> & { id: string }) => {
      const { error } = await supabase
        .from('restaurant_menu_categories')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('restaurant_menu_categories')
        .delete()
        .eq('id', id);
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('restaurant_menu_items')
        .insert({ 
          category_id: itemData.category_id,
          name: itemData.name,
          name_he: itemData.name_he,
          name_ar: itemData.name_ar,
          price: itemData.price,
          cost_price: itemData.cost_price ?? 0,
          description: itemData.description ?? null,
          tax_rate: itemData.tax_rate ?? 17,
          is_available: itemData.is_available ?? true,
          prep_time_minutes: itemData.prep_time_minutes ?? 15,
          station: itemData.station ?? 'general',
          allergens: itemData.allergens ?? [],
          calories: itemData.calories,
          image_url: itemData.image_url,
          sort_order: itemData.sort_order ?? 0,
          is_popular: itemData.is_popular ?? false,
          is_new: itemData.is_new ?? false,
          spicy_level: itemData.spicy_level ?? 0,
          dietary_tags: itemData.dietary_tags ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  const updateMenuItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MenuItem> & { id: string }) => {
      const { error } = await supabase
        .from('restaurant_menu_items')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  const deleteMenuItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_menu_item_secure', {
        p_item_id: id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_menu'] });
    },
  });

  // 86 an item (mark unavailable)
  const toggleItem86 = useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      const { error } = await supabase
        .from('restaurant_menu_items')
        .update({ is_available })
        .eq('id', id);
      if (error) throw error;
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
      if (!userId) throw new Error("No user logged in");
      const { data, error } = await supabase
        .from('restaurant_modifier_groups')
        .insert([{ 
          ...groupData, 
          business_id: userId,
          is_required: groupData.is_required ?? false,
          min_selections: groupData.min_selections ?? 0,
          max_selections: groupData.max_selections ?? 1,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_modifier_groups'] });
    },
  });

  const createModifier = useMutation({
    mutationFn: async (modifierData: Partial<Modifier> & { group_id: string; name: string }) => {
      const { data, error } = await supabase
        .from('restaurant_modifiers')
        .insert([{ 
          ...modifierData,
          price_adjustment: modifierData.price_adjustment ?? 0,
          is_available: modifierData.is_available ?? true,
          is_default: modifierData.is_default ?? false,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
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
      if (!userId) throw new Error("No user logged in");
      const { data, error } = await supabase
        .from('restaurant_staff')
        .insert({ 
          full_name: staffData.full_name,
          role: staffData.role ?? 'Waiter',
          restaurant_role: staffData.restaurant_role ?? 'waiter',
          hourly_rate: staffData.hourly_rate ?? 0,
          email: staffData.email,
          phone: staffData.phone,
          pin_code: staffData.pin_code,
          assigned_station: staffData.assigned_station,
          business_id: userId, 
          is_active: true,
          is_clocked_in: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  const updateStaff = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RestaurantStaff> & { id: string }) => {
      const { error } = await supabase
        .from('restaurant_staff')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_staff_secure', {
        p_staff_id: id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  const clockInStaff = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase
        .from('restaurant_staff')
        .update({ 
          is_clocked_in: true, 
          clocked_in_at: new Date().toISOString() 
        })
        .eq('id', staffId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_staff'] });
    },
  });

  const clockOutStaff = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase
        .from('restaurant_staff')
        .update({ 
          is_clocked_in: false, 
          clocked_in_at: null 
        })
        .eq('id', staffId);
      if (error) throw error;
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
      if (!userId) throw new Error("No user logged in");
      
      // Create session
      const { data: session, error: sessionError } = await supabase
        .from('restaurant_table_sessions')
        .insert({
          business_id: userId,
          table_id: params.tableId,
          guest_count: params.guestCount,
          server_id: params.serverId,
          status: 'active',
        })
        .select()
        .single();
      
      if (sessionError) throw sessionError;
      
      // Update table status
      await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied' })
        .eq('id', params.tableId);
      
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table_sessions'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const endSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data: session, error: getError } = await supabase
        .from('restaurant_table_sessions')
        .select('table_id')
        .eq('id', sessionId)
        .single();
      
      if (getError) throw getError;
      
      // Close session
      const { error: updateError } = await supabase
        .from('restaurant_table_sessions')
        .update({ 
          status: 'closed', 
          ended_at: new Date().toISOString() 
        })
        .eq('id', sessionId);
      
      if (updateError) throw updateError;
      
      // Mark table as dirty (needs cleaning)
      if (session?.table_id) {
        await supabase
          .from('restaurant_tables')
          .update({ status: 'dirty' })
          .eq('id', session.table_id);
      }
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
      if (!userId) throw new Error("No user logged in");
      
      const payload = {
        business_id: userId,
        table_id: orderData.table_id,
        session_id: orderData.session_id,
        server_id: orderData.server_id,
        guest_id: orderData.guest_id,
        order_type: orderData.order_type ?? 'dine_in',
        status: 'draft' as const,
        subtotal_amount: 0,
        discount_amount: 0,
        discount_percentage: 0,
        tax_amount: 0,
        tip_amount: 0,
        total_amount: 0,
        payment_status: 'pending' as const,
        is_rush: orderData.is_rush ?? false,
        is_vip: orderData.is_vip ?? false,
        course_number: 1,
        notes: orderData.notes,
        currency,
      };
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase
        .from('restaurant_orders')
        .upsert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_tables'] });
    },
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RestaurantOrder> & { id: string }) => {
      const { error } = await supabase
        .from('restaurant_orders')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async ({ orderId, reason, managerId }: { orderId: string; reason: string; managerId: string }) => {
      // 1. Mark order as cancelled
      const { error: orderError } = await supabase
        .from('restaurant_orders')
        .update({ 
          status: 'cancelled',
          closed_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (orderError) throw orderError;

      // 2. Void all items
      const { error: itemsError } = await supabase
        .from('restaurant_order_items')
        .update({ voided: true })
        .eq('order_id', orderId);
      
      if (itemsError) throw itemsError;

      // Log activity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc('log_business_activity_v2', {
        p_activity_type: 'ORDER_CANCELLED',
        p_details: { orderId, reason, authorizedBy: managerId }
      });
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
      // Insert order item
      const { data: orderItem, error: itemError } = await supabase
        .from('restaurant_order_items')
        .insert({
          order_id: params.orderId,
          item_id: params.itemId,
          quantity: params.quantity,
          price_at_time: params.priceAtTime,
          notes: params.notes || null,
          status: 'pending',
          is_fired: false,
          course_number: params.courseNumber ?? 1,
          seat_number: params.seatNumber,
          voided: false,
        })
        .select()
        .single();
      
      if (itemError) throw itemError;
      
      // Insert modifiers if any
      if (params.modifiers && params.modifiers.length > 0) {
        const modifierRecords = params.modifiers.map(mod => ({
          order_item_id: orderItem.id,
          modifier_id: mod.modifier_id,
          modifier_name: mod.name,
          price_adjustment: mod.price,
        }));
        
        const { error: modError } = await supabase
          .from('restaurant_order_item_modifiers')
          .insert(modifierRecords);
        
        if (modError) throw modError;
      }
      
      return orderItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });

  const updateOrderItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<OrderItem> & { id: string }) => {
      const { error } = await supabase
        .from('restaurant_order_items')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });


  const authorizeStaffAction = useMutation({
    mutationFn: async ({ pin, requiredRole }: { pin: string; requiredRole?: string }) => {
      const { data, error } = await supabase.rpc('authorize_staff_action', {
        p_pin_code: pin,
        p_required_role: requiredRole || null,
      });

      if (error) throw error;
      
      const result = data as { authorized: boolean; staff_id?: string; full_name?: string; role?: string; error?: string };
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
     const { data: dbItems, error } = await supabase
       .from('restaurant_menu_items')
       .select('id, price, name, is_available')
       .in('id', itemIds);

     if (error) throw error;

     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     const dbItemMap = new Map(dbItems.map((i: any) => [i.id, i]));
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shifts: any[]; 
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expenses: any[]; 
    }) => {
      const { data, error } = await supabase.rpc('close_business_day_secure', {
        p_auth_staff_id: staffId,
        p_date: date,
        p_shifts: shifts,
        p_expenses: expenses
      });

      if (error) throw error;
      return data; // Returns report ID
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant_daily_reports'] });
    },
  });

  const voidOrderItem = useMutation({
    mutationFn: async ({ itemId, reason, authStaffId }: { itemId: string; reason: string; authStaffId: string }) => {
      const { error } = await supabase.rpc('void_order_item_secure', {
        p_item_id: itemId,
        p_reason: reason,
        p_auth_staff_id: authStaffId
      });
      if (error) throw error;
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
      if (!userId) throw new Error("No user logged in");
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('create_kitchen_ticket', {
        p_order_id: params.orderId,
        p_station: params.station ?? null,
      });
      
      if (error) throw error;
      
      // Update order status
      await supabase
        .from('restaurant_orders')
        .update({ status: 'pending' })
        .eq('id', params.orderId);
      
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen_tickets'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant_active_orders'] });
    },
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: TicketStatus }) => {
      const updates: Record<string, unknown> = { status };
      
      if (status === 'in_progress') {
        updates.started_at = new Date().toISOString();
      } else if (status === 'ready') {
        updates.completed_at = new Date().toISOString();
      } else if (status === 'served') {
        updates.served_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('restaurant_kitchen_tickets')
        .update(updates)
        .eq('id', ticketId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen_tickets'] });
    },
  });

  const updateTicketItemStatus = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      
      if (status === 'cooking') {
        updates.started_at = new Date().toISOString();
      } else if (status === 'ready') {
        updates.completed_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('restaurant_ticket_items')
        .update(updates)
        .eq('id', itemId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen_tickets'] });
    },
  });

  // Bump ticket (mark as ready)
  const bumpTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from('restaurant_kitchen_tickets')
        .update({ 
          status: 'ready',
          completed_at: new Date().toISOString(),
        })
        .eq('id', ticketId);
      
      if (error) throw error;
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
      if (!userId) throw new Error("No user logged in");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase
        .from('restaurant_daily_reports')
        .insert({ ...reportData, business_id: userId, currency } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
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
      const { error } = await supabase.rpc('apply_discount_secure', {
        p_order_id: params.orderId,
        p_discount_amount: params.discountAmount || 0,
        p_discount_percentage: params.discountPercentage || 0,
        p_reason: params.reason,
        p_auth_staff_id: params.authStaffId,
      });
      
      if (error) throw error;
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
        // Log the refund
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)('log_business_activity_v2', {
            p_business_id: userId,
            p_activity_type: 'REFUND',
            p_entity_type: 'order',
            p_entity_id: params.orderId,
            p_details: {
                amount: params.amount,
                reason: params.reason,
                item_ids: params.itemIds,
                auth_staff_id: params.authStaffId
            },
            p_staff_id: params.authStaffId
        });

        // If full refund check
        const { data: order } = await supabase.from('restaurant_orders').select('total_amount').eq('id', params.orderId).single();
        if (order && Math.abs(order.total_amount - params.amount) < 0.01) {
            await supabase.from('restaurant_orders').update({
                payment_status: 'refunded',
                closed_at: new Date().toISOString()
            }).eq('id', params.orderId);
        }
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

// ============================================================================
// RESERVATIONS HOOK
// ============================================================================

export function useReservations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  
  useRealtimeSubscription('restaurant_reservations', ['reservations', userId], !!userId);

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_reservations')
        .select('*, guest:restaurant_guest_profiles(*)')
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true });
      if (error) throw error;
      return data as unknown as Reservation[];
    },
    enabled: !!userId,
  });

  const { data: todayReservations = [] } = useQuery({
    queryKey: ['reservations_today', userId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('restaurant_reservations')
        .select('*, guest:restaurant_guest_profiles(*)')
        .eq('reservation_date', today)
        .order('reservation_time', { ascending: true });
      if (error) throw error;
      return data as unknown as Reservation[];
    },
    enabled: !!userId,
  });

  const createReservation = useMutation({
    mutationFn: async (data: Partial<Reservation> & { 
      guest_name: string; 
      guest_phone: string; 
      reservation_date: string;
      reservation_time: string;
      party_size: number;
    }) => {
      if (!userId) throw new Error("No user");
      const { data: reservation, error } = await supabase
        .from('restaurant_reservations')
        .insert({
          business_id: userId,
          guest_id: data.guest_id,
          guest_name: data.guest_name,
          guest_phone: data.guest_phone,
          guest_email: data.guest_email,
          party_size: data.party_size,
          reservation_date: data.reservation_date,
          reservation_time: data.reservation_time,
          duration_minutes: data.duration_minutes ?? 90,
          table_ids: data.table_ids ?? [],
          status: 'pending',
          notes: data.notes,
          special_requests: data.special_requests,
          source: data.source ?? 'phone',
        })
        .select()
        .single();
      if (error) throw error;
      return reservation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservations_today'] });
    },
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Reservation> & { id: string }) => {
      const { error } = await supabase
        .from('restaurant_reservations')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase
        .from('restaurant_reservations')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservations_today'] });
    },
  });

  const cancelReservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('restaurant_reservations')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  
  useRealtimeSubscription('restaurant_waitlist', ['waitlist', userId], !!userId);

  const { data: waitlist = [], isLoading } = useQuery({
    queryKey: ['waitlist', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_waitlist')
        .select('*')
        .eq('status', 'waiting')
        .order('check_in_time', { ascending: true });
      if (error) throw error;
      return data as Waitlist[];
    },
    enabled: !!userId,
  });

  const addToWaitlist = useMutation({
    mutationFn: async (data: Partial<Waitlist> & { 
      guest_name: string; 
      guest_phone: string; 
      party_size: number;
    }) => {
      if (!userId) throw new Error("No user");
      const { data: entry, error } = await supabase
        .from('restaurant_waitlist')
        .insert({
          business_id: userId,
          guest_name: data.guest_name,
          guest_phone: data.guest_phone,
          party_size: data.party_size,
          estimated_wait_minutes: data.estimated_wait_minutes ?? 30,
          quoted_wait_minutes: data.quoted_wait_minutes ?? 30,
          status: 'waiting',
          notes: data.notes,
        })
        .select()
        .single();
      if (error) throw error;
      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });

  const seatFromWaitlist = useMutation({
    mutationFn: async ({ id, tableId }: { id: string; tableId: string }) => {
      const { error } = await supabase
        .from('restaurant_waitlist')
        .update({ 
          status: 'seated', 
          seated_at: new Date().toISOString(),
          table_id: tableId,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });

  const removeFromWaitlist = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'left' | 'no_show' }) => {
      const { error } = await supabase
        .from('restaurant_waitlist')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_guest_profiles')
        .select('*')
        .order('last_visit_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as GuestProfile[];
    },
    enabled: !!userId,
  });

  const searchGuests = useCallback(async (query: string): Promise<GuestProfile[]> => {
    if (!userId || !query) return [];
    const { data, error } = await supabase
      .from('restaurant_guest_profiles')
      .select('*')
      .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);
    if (error) throw error;
    return data as GuestProfile[];
  }, [userId]);

  const getGuestByPhone = useCallback(async (phone: string): Promise<GuestProfile | null> => {
    if (!userId || !phone) return null;
    const { data, error } = await supabase
      .from('restaurant_guest_profiles')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    if (error) throw error;
    return data as GuestProfile | null;
  }, [userId]);

  const createGuest = useMutation({
    mutationFn: async (data: Partial<GuestProfile> & { first_name: string }) => {
      if (!userId) throw new Error("No user");
      const { data: guest, error } = await supabase
        .from('restaurant_guest_profiles')
        .insert({
          business_id: userId,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
          email: data.email,
          dietary_restrictions: data.dietary_restrictions ?? [],
          allergies: data.allergies ?? [],
          seating_preference: data.seating_preference ?? 'any',
          notes: data.notes,
          tags: data.tags ?? [],
          birthdate: data.birthdate,
          anniversary: data.anniversary,
          vip_level: data.vip_level ?? 0,
          marketing_opt_in: data.marketing_opt_in ?? false,
          whatsapp_opt_in: data.whatsapp_opt_in ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return guest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest_profiles'] });
    },
  });

  const updateGuest = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<GuestProfile> & { id: string }) => {
      const { error } = await supabase
        .from('restaurant_guest_profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
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
      const { data: guest, error: getError } = await supabase
        .from('restaurant_guest_profiles')
        .select('visit_count, total_lifetime_spend')
        .eq('id', params.guestId)
        .single();
      
      if (getError) throw getError;
      
      const newVisitCount = (guest.visit_count || 0) + 1;
      const newTotalSpend = (guest.total_lifetime_spend || 0) + params.amountSpent;
      const newAverageCheck = newTotalSpend / newVisitCount;
      
      const { error } = await supabase
        .from('restaurant_guest_profiles')
        .update({
          visit_count: newVisitCount,
          total_lifetime_spend: newTotalSpend,
          average_check: newAverageCheck,
          last_visit_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.guestId);
      
      if (error) throw error;
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
      
      // Create payment record
      const { data: payment, error: paymentError } = await supabase
        .from('restaurant_payments')
        .insert({
          business_id: userId,
          order_id: params.orderId,
          amount: params.amount,
          method: params.method,
          tip_amount: params.tipAmount ?? 0,
          status: 'completed',
          processed_by: params.processedBy,
          processed_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (paymentError) throw paymentError;
      
      // Update order status
      const { error: orderError } = await supabase
        .from('restaurant_orders')
        .update({
          payment_method: params.method,
          payment_status: 'paid',
          tip_amount: params.tipAmount ?? 0,
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', params.orderId);
      
      if (orderError) throw orderError;
      
      return payment;
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
      
      let totalTips = 0;
      
      // Create all payment records
      for (const p of params.payments) {
        const { error } = await supabase
          .from('restaurant_payments')
          .insert({
            business_id: userId,
            order_id: params.orderId,
            amount: p.amount,
            method: p.method,
            tip_amount: p.tipAmount ?? 0,
            status: 'completed',
            processed_by: params.processedBy,
            processed_at: new Date().toISOString(),
          });
        
        if (error) throw error;
        totalTips += p.tipAmount ?? 0;
      }
      
      // Update order
      const { error: orderError } = await supabase
        .from('restaurant_orders')
        .update({
          payment_method: 'split',
          payment_status: 'paid',
          tip_amount: totalTips,
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', params.orderId);
      
      if (orderError) throw orderError;
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
      
      // Get today's closed orders
      const { data: closedOrders } = await supabase
        .from('restaurant_orders')
        .select('total_amount, tip_amount')
        .eq('status', 'closed')
        .gte('closed_at', today);
      
      // Get open orders
      const { data: openOrders } = await supabase
        .from('restaurant_orders')
        .select('total_amount')
        .not('status', 'in', '("closed","cancelled")');
      
      // Get today's sessions for covers
      const { data: sessions } = await supabase
        .from('restaurant_table_sessions')
        .select('guest_count')
        .gte('started_at', today);
      
      // Get table counts
      const { data: tables } = await supabase
        .from('restaurant_tables')
        .select('status');
      
      // Get pending tickets
      const { data: tickets } = await supabase
        .from('restaurant_kitchen_tickets')
        .select('created_at')
        .in('status', ['new', 'in_progress']);
      
      // Get 86'd items
      const { data: items86 } = await supabase
        .from('restaurant_menu_items')
        .select('id')
        .eq('is_available', false);
      
      const todaysRevenue = (closedOrders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const openOrdersValue = (openOrders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const coversToday = (sessions || []).reduce((sum, s) => sum + (s.guest_count || 0), 0);
      const ordersCount = (closedOrders || []).length;
      const avgCheck = ordersCount > 0 ? todaysRevenue / ordersCount : 0;
      
      const openTables = (tables || []).filter(t => t.status === 'free').length;
      const occupiedTables = (tables || []).filter(t => t.status === 'occupied').length;
      
      // Calculate average ticket time
      const now = Date.now();
      const ticketTimes = (tickets || []).map(t => 
        Math.floor((now - new Date(t.created_at).getTime()) / 60000)
      );
      const avgTicketTime = ticketTimes.length > 0 
        ? ticketTimes.reduce((a, b) => a + b, 0) / ticketTimes.length 
        : 0;
      
      return {
        todays_revenue: todaysRevenue,
        open_orders_value: openOrdersValue,
        covers_today: coversToday,
        average_check: avgCheck,
        table_turnover_rate: 0, // Would need more complex calculation
        revpash: 0,
        labor_cost_percent: 0,
        open_tables: openTables,
        occupied_tables: occupiedTables,
        pending_kitchen_tickets: (tickets || []).length,
        average_ticket_time_minutes: avgTicketTime,
        eighty_sixed_items: (items86 || []).length,
      };
    },
    enabled: !!userId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return { kpis, isLoading };
}
