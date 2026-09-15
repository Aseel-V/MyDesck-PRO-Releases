import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/supabase';
import type {
  BusinessSettings, DailyReport, GuestProfile, KitchenTicket, MenuCategory, MenuItem, Modifier, ModifierGroup,
  OrderItem, RealtimeKPIs, Reservation, RestaurantOrder, RestaurantStaff, RestaurantTable, TableSession, TicketStatus,
  Waitlist,
} from '../../types/restaurant';
import type {
  ActivityInput, ApprovalCredential, BusinessSettingsPatch, CartLineInput, CloseDayInput, DiscountInput, EditedLineInput,
  NewOrderInput, OrderItemInput, OrderPayment, PaymentInput, RefundInput, ReservationInput, RestaurantFeed, RestaurantRepository,
  SplitPaymentInput, StaffAuthorizationResult, StaffPinResult,
} from '../domain/restaurant';

type Tables = Database['public']['Tables'];
/** RPCs absent from the generated types are called untyped, exactly as the screens called them. */
type UntypedRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as unknown as UntypedRpc)(fn, args);

/**
 * Restaurant data access, moved verbatim from useRestaurant, RestaurantRoleContext, OrderModal, OrderEntry,
 * ReservationsBoard, OrderHistoryModal, RestaurantAnalytics and EditRestaurantOrderModal. Where a screen awaited
 * a request without checking its error, the method does not raise it either.
 */
export class SupabaseRestaurantRepository implements RestaurantRepository {
  readonly approvalCredential = 'pin' as const;
  readonly staffRecordCredentials = true;

  subscribe(feed: RestaurantFeed, _businessId: string, onChange: () => void): () => void {
    const channel = supabase
      .channel(`${feed}_changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table: feed }, () => { onChange(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  // ---------------------------------------------------------------- floor and menu

  async listTables(businessId: string): Promise<RestaurantTable[]> {
    const { data, error } = await supabase.from('restaurant_tables').select('*').eq('business_id', businessId).order('name');
    if (error) throw error;
    return data as RestaurantTable[];
  }

  async createTable(businessId: string, tableData: Partial<RestaurantTable> & { name: string }): Promise<RestaurantTable> {
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
        business_id: businessId,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as RestaurantTable;
  }

  async updateTable(id: string, updates: Partial<RestaurantTable>): Promise<void> {
    const { error } = await supabase.from('restaurant_tables').update(updates as never).eq('id', id);
    if (error) throw error;
  }

  async deleteTable(id: string): Promise<void> {
    const { error } = await supabase.from('restaurant_tables').delete().eq('id', id);
    if (error) throw error;
  }

  async listMenu(businessId: string): Promise<MenuCategory[]> {
    const { data: cats, error: catsError } = await supabase
      .from('restaurant_menu_categories')
      .select('*, items:restaurant_menu_items(*)')
      .eq('business_id', businessId)
      .order('sort_order');
    if (catsError) throw catsError;
    return cats as unknown as MenuCategory[];
  }

  async createCategory(businessId: string, categoryData: Partial<MenuCategory> & { name: string }): Promise<MenuCategory> {
    const { data, error } = await supabase
      .from('restaurant_menu_categories')
      .insert([{ ...categoryData, business_id: businessId, is_active: categoryData.is_active ?? true }] as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as MenuCategory;
  }

  async updateCategory(id: string, updates: Partial<MenuCategory>): Promise<void> {
    const { error } = await supabase.from('restaurant_menu_categories').update(updates as never).eq('id', id);
    if (error) throw error;
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('restaurant_menu_categories').delete().eq('id', id);
    if (error) throw error;
  }

  async createMenuItem(itemData: Partial<MenuItem> & { category_id: string; name: string; price: number }): Promise<MenuItem> {
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
      } as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as MenuItem;
  }

  async updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<void> {
    const { error } = await supabase.from('restaurant_menu_items').update(updates as never).eq('id', id);
    if (error) throw error;
  }

  async deleteMenuItem(id: string): Promise<void> {
    const { error } = await rpc('delete_menu_item_secure', { p_item_id: id });
    if (error) throw error;
  }

  async listAvailableMenuItems(): Promise<MenuItem[]> {
    const { data, error } = await supabase.from('restaurant_menu_items').select('*').eq('is_available', true).order('name');
    if (error) throw error;
    return data as unknown as MenuItem[];
  }

  async verifyMenuPrices(itemIds: string[]) {
    const { data: dbItems, error } = await supabase.from('restaurant_menu_items').select('id, price, name, is_available').in('id', itemIds);
    if (error) throw error;
    return dbItems as Array<Pick<MenuItem, 'id' | 'price' | 'name' | 'is_available'>>;
  }

  async listModifierGroups(businessId: string): Promise<ModifierGroup[]> {
    const { data, error } = await supabase
      .from('restaurant_modifier_groups')
      .select('*, modifiers:restaurant_modifiers(*)')
      .eq('business_id', businessId)
      .order('sort_order');
    if (error) throw error;
    return data as unknown as ModifierGroup[];
  }

  async createModifierGroup(businessId: string, groupData: Partial<ModifierGroup> & { name: string }): Promise<ModifierGroup> {
    const { data, error } = await supabase
      .from('restaurant_modifier_groups')
      .insert([{
        ...groupData,
        business_id: businessId,
        is_required: groupData.is_required ?? false,
        min_selections: groupData.min_selections ?? 0,
        max_selections: groupData.max_selections ?? 1,
      }] as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ModifierGroup;
  }

  async createModifier(modifierData: Partial<Modifier> & { group_id: string; name: string }): Promise<Modifier> {
    const { data, error } = await supabase
      .from('restaurant_modifiers')
      .insert([{
        ...modifierData,
        price_adjustment: modifierData.price_adjustment ?? 0,
        is_available: modifierData.is_available ?? true,
        is_default: modifierData.is_default ?? false,
      }] as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Modifier;
  }

  // ---------------------------------------------------------------- staff

  async listStaff(businessId: string): Promise<RestaurantStaff[]> {
    const { data, error } = await supabase.from('restaurant_staff').select('*').eq('business_id', businessId).order('full_name');
    if (error) throw error;
    return data as unknown as RestaurantStaff[];
  }

  async createStaff(businessId: string, staffData: Partial<RestaurantStaff> & { full_name: string }): Promise<RestaurantStaff> {
    const { data, error } = await supabase
      .from('restaurant_staff')
      .insert({
        full_name: staffData.full_name,
        role: (staffData.role ?? 'Waiter') as RestaurantStaff['role'],
        restaurant_role: (staffData.restaurant_role ?? 'waiter') as RestaurantStaff['restaurant_role'],
        hourly_rate: staffData.hourly_rate ?? 0,
        email: staffData.email,
        phone: staffData.phone,
        pin_code: staffData.pin_code,
        assigned_station: staffData.assigned_station,
        business_id: businessId,
        is_active: true,
        is_clocked_in: false,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as RestaurantStaff;
  }

  async updateStaff(id: string, updates: Partial<RestaurantStaff>): Promise<void> {
    const safeUpdates = updates as unknown as Tables['restaurant_staff']['Update'];
    const { error } = await supabase.from('restaurant_staff').update(safeUpdates).eq('id', id);
    if (error) throw error;
  }

  async deleteStaff(id: string): Promise<void> {
    const { error } = await rpc('delete_staff_secure', { p_staff_id: id });
    if (error) throw error;
  }

  async setStaffClockedIn(staffId: string, clockedIn: boolean): Promise<void> {
    const { error } = await supabase
      .from('restaurant_staff')
      .update((clockedIn
        ? { is_clocked_in: true, clocked_in_at: new Date().toISOString() }
        : { is_clocked_in: false, clocked_in_at: null }) as never)
      .eq('id', staffId);
    if (error) throw error;
  }

  async verifyStaffPin(staffId: string, pin: string, businessId: string): Promise<StaffPinResult> {
    const { data: result, error: rpcError } = await rpc('verify_staff_pin_secure', {
      p_staff_id: staffId, p_pin: pin, p_business_id: businessId,
    });
    if (rpcError) throw rpcError;
    return result as StaffPinResult;
  }

  async authorizeStaffAction(businessId: string, credential: ApprovalCredential, requiredRole?: string): Promise<StaffAuthorizationResult> {
    if (!('pin' in credential)) throw new Error('PIN_REQUIRED');
    const { data, error } = await rpc('authorize_staff_action', {
      p_pin_code: credential.pin,
      p_business_id: businessId,
      p_required_role: requiredRole || null,
    });
    if (error) throw error;
    return data as StaffAuthorizationResult;
  }

  // ---------------------------------------------------------------- service

  async listActiveSessions(businessId: string): Promise<TableSession[]> {
    const { data, error } = await supabase
      .from('restaurant_table_sessions')
      .select(`
          *,
          table:restaurant_tables(*),
          server:restaurant_staff(*),
          orders:restaurant_orders(*)
        `)
      .eq('business_id', businessId)
      .eq('status', 'active')
      .order('started_at', { ascending: false });
    if (error) throw error;
    return data as unknown as TableSession[];
  }

  async startSession(businessId: string, params: { tableId: string; guestCount: number; serverId?: string }): Promise<TableSession> {
    const { data: session, error: sessionError } = await supabase
      .from('restaurant_table_sessions')
      .insert({
        business_id: businessId,
        table_id: params.tableId,
        guest_count: params.guestCount,
        server_id: params.serverId,
        status: 'active',
      } as never)
      .select()
      .single();
    if (sessionError) throw sessionError;
    await supabase.from('restaurant_tables').update({ status: 'occupied' } as never).eq('id', params.tableId);
    return session as unknown as TableSession;
  }

  async endSession(sessionId: string): Promise<void> {
    const { data: session, error: getError } = await supabase
      .from('restaurant_table_sessions')
      .select('table_id')
      .eq('id', sessionId)
      .single();
    if (getError) throw getError;
    const { error: updateError } = await supabase
      .from('restaurant_table_sessions')
      .update({ status: 'closed', ended_at: new Date().toISOString() } as never)
      .eq('id', sessionId);
    if (updateError) throw updateError;
    const tableId = (session as { table_id: string | null } | null)?.table_id;
    if (tableId) {
      await supabase.from('restaurant_tables').update({ status: 'dirty' } as never).eq('id', tableId);
    }
  }

  async getSessionGuestId(sessionId: string): Promise<string | null> {
    const { data: session } = await supabase.from('restaurant_table_sessions').select('guest_id' as never).eq('id', sessionId).single();
    return ((session as { guest_id?: string } | null)?.guest_id) ?? null;
  }

  async listActiveOrders(businessId: string): Promise<RestaurantOrder[]> {
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
      .eq('business_id', businessId)
      .not('status', 'in', '("closed","cancelled")')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as unknown as RestaurantOrder[];
  }

  async createOrder(businessId: string, orderData: NewOrderInput): Promise<RestaurantOrder> {
    const payload = {
      business_id: businessId,
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
      currency: orderData.currency,
    };
    const { data, error } = await supabase
      .from('restaurant_orders')
      .upsert(payload as Tables['restaurant_orders']['Insert'])
      .select()
      .single();
    if (error) throw error;
    return data as unknown as RestaurantOrder;
  }

  async updateOrder(id: string, updates: Partial<RestaurantOrder>): Promise<void> {
    const { error } = await supabase.from('restaurant_orders').update(updates as Tables['restaurant_orders']['Update']).eq('id', id);
    if (error) throw error;
  }

  async addOrderItem(params: OrderItemInput): Promise<OrderItem> {
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
      } as never)
      .select()
      .single();
    if (itemError) throw itemError;
    const created = orderItem as unknown as OrderItem;
    if (params.modifiers && params.modifiers.length > 0) {
      const modifierRecords = params.modifiers.map((mod) => ({
        order_item_id: created.id,
        modifier_id: mod.modifier_id,
        modifier_name: mod.name,
        price_adjustment: mod.price,
      }));
      const { error: modError } = await supabase.from('restaurant_order_item_modifiers').insert(modifierRecords as never);
      if (modError) throw modError;
    }
    return created;
  }

  async updateOrderItem(id: string, updates: Partial<OrderItem>): Promise<void> {
    const { error } = await supabase.from('restaurant_order_items').update(updates as never).eq('id', id);
    if (error) throw error;
  }

  async saveOrderCart(orderId: string, lines: CartLineInput[], fire: boolean, totals: { total_amount: number; tax_amount: number } | null): Promise<void> {
    if (totals) {
      await supabase.from('restaurant_orders').update({
        total_amount: totals.total_amount,
        tax_amount: totals.tax_amount,
      } as never).eq('id', orderId);
    }
    const ops = lines.map((item) => supabase.from('restaurant_order_items').upsert({
      id: item.id,
      order_id: orderId,
      item_id: item.item_id,
      quantity: item.quantity,
      price_at_time: item.price_at_time,
      notes: item.notes,
      course_number: item.course_number || 1,
      is_fired: fire,
    } as never));
    await Promise.all(ops);
  }

  async closeOrderPaid(orderId: string, payment: OrderPayment): Promise<void> {
    await supabase.from('restaurant_orders').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      payment_method: payment.method,
      total_amount: payment.total_amount,
      tax_amount: payment.tax_amount,
    } as never).eq('id', orderId);
  }

  async cancelOrderByManager(orderId: string, authStaffId: string): Promise<void> {
    await supabase.from('restaurant_orders').update({
      status: 'cancelled',
      notes: `Cancelled by Manager (ID: ${authStaffId})`,
    } as never).eq('id', orderId);
    await supabase.from('restaurant_order_items').update({
      status: 'cancelled',
      voided: true,
      void_reason: 'Full Order Cancelled',
    } as never).eq('order_id', orderId);
  }

  async cancelOrder({ orderId, reason, managerId }: { orderId: string; reason: string; managerId: string }): Promise<void> {
    const { error: orderError } = await supabase
      .from('restaurant_orders')
      .update({ status: 'cancelled', closed_at: new Date().toISOString() } as never)
      .eq('id', orderId);
    if (orderError) throw orderError;
    const { error: itemsError } = await supabase.from('restaurant_order_items').update({ voided: true } as never).eq('order_id', orderId);
    if (itemsError) throw itemsError;
    await rpc('log_business_activity_v2', {
      p_activity_type: 'ORDER_CANCELLED',
      p_details: { orderId, reason, authorizedBy: managerId },
    });
  }

  async voidOrderItem({ itemId, reason, authStaffId }: { itemId: string; reason: string; authStaffId: string }): Promise<void> {
    const { error } = await rpc('void_order_item_secure', { p_item_id: itemId, p_reason: reason, p_auth_staff_id: authStaffId });
    if (error) throw error;
  }

  async applyDiscount(params: DiscountInput): Promise<void> {
    const { error } = await rpc('apply_discount_secure', {
      p_order_id: params.orderId,
      p_discount_amount: params.discountAmount || 0,
      p_discount_percentage: params.discountPercentage || 0,
      p_reason: params.reason,
      p_auth_staff_id: params.authStaffId,
    });
    if (error) throw error;
  }

  async refundOrder(businessId: string, params: RefundInput): Promise<void> {
    await rpc('log_business_activity_v2', {
      p_business_id: businessId,
      p_activity_type: 'REFUND',
      p_entity_type: 'order',
      p_entity_id: params.orderId,
      p_details: { amount: params.amount, reason: params.reason, item_ids: params.itemIds, auth_staff_id: params.authStaffId },
      p_staff_id: params.authStaffId,
    });
    const { data: order } = await supabase.from('restaurant_orders').select('total_amount').eq('id', params.orderId).single();
    const total = (order as { total_amount: number } | null)?.total_amount;
    if (order && Math.abs((total as number) - params.amount) < 0.01) {
      await supabase.from('restaurant_orders').update({
        payment_status: 'refunded',
        closed_at: new Date().toISOString(),
      } as never).eq('id', params.orderId);
    }
  }

  async logActivity(input: ActivityInput): Promise<void> {
    await rpc('log_business_activity_v2', input as unknown as Record<string, unknown>);
  }

  async processPayment(ownerUid: string, params: PaymentInput): Promise<unknown> {
    const { data: payment, error: paymentError } = await supabase
      .from('restaurant_payments')
      .insert({
        business_id: ownerUid,
        order_id: params.orderId,
        amount: params.amount,
        method: params.method,
        tip_amount: params.tipAmount ?? 0,
        status: 'completed',
        processed_by: params.processedBy,
        processed_at: new Date().toISOString(),
      } as never)
      .select()
      .single();
    if (paymentError) throw paymentError;
    const { error: orderError } = await supabase
      .from('restaurant_orders')
      .update({
        payment_method: params.method,
        payment_status: 'paid',
        tip_amount: params.tipAmount ?? 0,
        status: 'closed',
        closed_at: new Date().toISOString(),
      } as never)
      .eq('id', params.orderId);
    if (orderError) throw orderError;
    return payment;
  }

  async processSplitPayment(ownerUid: string, params: SplitPaymentInput): Promise<void> {
    let totalTips = 0;
    for (const p of params.payments) {
      const { error } = await supabase
        .from('restaurant_payments')
        .insert({
          business_id: ownerUid,
          order_id: params.orderId,
          amount: p.amount,
          method: p.method,
          tip_amount: p.tipAmount ?? 0,
          status: 'completed',
          processed_by: params.processedBy,
          processed_at: new Date().toISOString(),
        } as never);
      if (error) throw error;
      totalTips += p.tipAmount ?? 0;
    }
    const { error: orderError } = await supabase
      .from('restaurant_orders')
      .update({
        payment_method: 'split',
        payment_status: 'paid',
        tip_amount: totalTips,
        status: 'closed',
        closed_at: new Date().toISOString(),
      } as never)
      .eq('id', params.orderId);
    if (orderError) throw orderError;
  }

  // ---------------------------------------------------------------- kitchen

  async listKitchenTickets(businessId: string): Promise<KitchenTicket[]> {
    const { data, error } = await supabase
      .from('restaurant_kitchen_tickets')
      .select(`
          *,
          items:restaurant_ticket_items(*),
          order:restaurant_orders(*)
        `)
      .eq('business_id', businessId)
      .in('status', ['new', 'in_progress', 'ready'])
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data as unknown as KitchenTicket[];
  }

  async sendToKitchen(orderId: string, station?: string | null): Promise<string | null> {
    const { data, error } = await rpc('create_kitchen_ticket', { p_order_id: orderId, p_station: station ?? null });
    if (error) throw error;
    await supabase.from('restaurant_orders').update({ status: 'pending' } as never).eq('id', orderId);
    return data as string;
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (status === 'in_progress') updates.started_at = new Date().toISOString();
    else if (status === 'ready') updates.completed_at = new Date().toISOString();
    else if (status === 'served') updates.served_at = new Date().toISOString();
    const { error } = await supabase.from('restaurant_kitchen_tickets').update(updates as never).eq('id', ticketId);
    if (error) throw error;
  }

  async updateTicketItemStatus(itemId: string, status: string): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (status === 'cooking') updates.started_at = new Date().toISOString();
    else if (status === 'ready') updates.completed_at = new Date().toISOString();
    const { error } = await supabase.from('restaurant_ticket_items').update(updates as never).eq('id', itemId);
    if (error) throw error;
  }

  async bumpTicket(ticketId: string): Promise<void> {
    const { error } = await supabase
      .from('restaurant_kitchen_tickets')
      .update({ status: 'ready', completed_at: new Date().toISOString() } as never)
      .eq('id', ticketId);
    if (error) throw error;
  }

  // ---------------------------------------------------------------- reports and analytics

  async listDailyReports(businessId: string): Promise<DailyReport[]> {
    const { data, error } = await supabase
      .from('restaurant_daily_reports')
      .select('*')
      .eq('business_id', businessId)
      .order('date', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data as unknown as DailyReport[];
  }

  async createDailyReport(businessId: string, reportData: Partial<DailyReport>, currency: string): Promise<DailyReport> {
    const { data, error } = await supabase
      .from('restaurant_daily_reports')
      .insert({ ...reportData, business_id: businessId, currency } as Tables['restaurant_daily_reports']['Insert'])
      .select()
      .single();
    if (error) throw error;
    return data as unknown as DailyReport;
  }

  async closeBusinessDay({ staffId, date, shifts, expenses }: CloseDayInput): Promise<unknown> {
    const { data, error } = await rpc('close_business_day_secure', {
      p_auth_staff_id: staffId, p_date: date, p_shifts: shifts, p_expenses: expenses,
    });
    if (error) throw error;
    return data;
  }

  async listClosedOrders(fromIso: string, toIso: string): Promise<RestaurantOrder[]> {
    const { data, error } = await supabase
      .from('restaurant_orders')
      .select(`
                    *,
                    items:restaurant_order_items(
                        *,
                        menu_item:restaurant_menu_items(*)
                    ),
                    table:restaurant_tables(*),
                    server:restaurant_staff(*)
                `)
      .eq('status', 'closed')
      .gte('closed_at', fromIso)
      .lte('closed_at', toIso)
      .order('closed_at', { ascending: false });
    if (error) throw error;
    return (data as unknown as RestaurantOrder[]) || [];
  }

  async listOrderHistory(page: number, pageSize: number, search: string): Promise<RestaurantOrder[]> {
    let query = supabase
      .from('restaurant_orders')
      .select(`
          *,
          items:restaurant_order_items(
            *,
            menu_item:restaurant_menu_items(*)
          ),
          table:restaurant_tables(*),
          server:restaurant_staff(*)
        `)
      .in('status', ['closed', 'cancelled'])
      .order('closed_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (search) query = query.or(`order_number.eq.${search},id.eq.${search}`);
    const { data, error } = await query;
    if (error) throw error;
    return data as unknown as RestaurantOrder[];
  }

  async deleteOrder(orderId: string): Promise<void> {
    const { error: itemsError } = await supabase.from('restaurant_order_items').delete().eq('order_id', orderId);
    if (itemsError) throw itemsError;
    const { error } = await supabase.from('restaurant_orders').delete().eq('id', orderId);
    if (error) throw error;
  }

  async saveOrderEdit(order: RestaurantOrder, lines: EditedLineInput[], totals: { total_amount: number; subtotal_amount: number; tax_amount: number }): Promise<void> {
    const originalIds = order.items?.map((i) => i.id) || [];
    const currentIds = lines.map((i) => i.id).filter(Boolean);
    const idsToDelete = originalIds.filter((id) => !currentIds.includes(id));
    if (idsToDelete.length > 0) {
      await supabase.from('restaurant_order_items').delete().in('id', idsToDelete);
    }
    const upsertData = lines.map((item) => ({
      id: item.id,
      order_id: order.id,
      item_id: item.item_id,
      quantity: item.quantity,
      price_at_time: item.price_at_time,
      notes: item.notes,
      status: item.status || 'pending',
    }));
    const { error: itemsError } = await supabase.from('restaurant_order_items').upsert(upsertData as never);
    if (itemsError) throw itemsError;
    const { error: orderError } = await supabase
      .from('restaurant_orders')
      .update({ total_amount: totals.total_amount, subtotal_amount: totals.subtotal_amount, tax_amount: totals.tax_amount } as never)
      .eq('id', order.id);
    if (orderError) throw orderError;
  }

  async getKpis(today: string): Promise<RealtimeKPIs> {
    const { data: closedOrders } = await supabase.from('restaurant_orders').select('total_amount, tip_amount').eq('status', 'closed').gte('closed_at', today);
    const { data: openOrders } = await supabase.from('restaurant_orders').select('total_amount').not('status', 'in', '("closed","cancelled")');
    const { data: sessions } = await supabase.from('restaurant_table_sessions').select('guest_count').gte('started_at', today);
    const { data: tables } = await supabase.from('restaurant_tables').select('status');
    const { data: tickets } = await supabase.from('restaurant_kitchen_tickets').select('created_at').in('status', ['new', 'in_progress']);
    const { data: items86 } = await supabase.from('restaurant_menu_items').select('id').eq('is_available', false);

    const todaysRevenue = (closedOrders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const openOrdersValue = (openOrders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const coversToday = (sessions || []).reduce((sum, s) => sum + (s.guest_count || 0), 0);
    const ordersCount = (closedOrders || []).length;
    const avgCheck = ordersCount > 0 ? todaysRevenue / ordersCount : 0;
    const openTables = (tables || []).filter((t) => t.status === 'free').length;
    const occupiedTables = (tables || []).filter((t) => t.status === 'occupied').length;
    const now = Date.now();
    const ticketTimes = (tickets || []).map((t) => Math.floor((now - new Date(t.created_at).getTime()) / 60000));
    const avgTicketTime = ticketTimes.length > 0 ? ticketTimes.reduce((a, b) => a + b, 0) / ticketTimes.length : 0;
    return {
      todays_revenue: todaysRevenue,
      open_orders_value: openOrdersValue,
      covers_today: coversToday,
      average_check: avgCheck,
      table_turnover_rate: 0,
      revpash: 0,
      labor_cost_percent: 0,
      open_tables: openTables,
      occupied_tables: occupiedTables,
      pending_kitchen_tickets: (tickets || []).length,
      average_ticket_time_minutes: avgTicketTime,
      eighty_sixed_items: (items86 || []).length,
    };
  }

  // ---------------------------------------------------------------- reservations, waitlist, guests

  async listReservations(businessId: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('restaurant_reservations')
      .select('*, guest:restaurant_guest_profiles(*)')
      .eq('business_id', businessId)
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true });
    if (error) throw error;
    return data as unknown as Reservation[];
  }

  async listReservationsOn(businessId: string, date: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('restaurant_reservations')
      .select('*, guest:restaurant_guest_profiles(*)')
      .eq('business_id', businessId)
      .eq('reservation_date', date)
      .order('reservation_time', { ascending: true });
    if (error) throw error;
    return data as unknown as Reservation[];
  }

  async createReservation(businessId: string, data: ReservationInput): Promise<Reservation> {
    const { data: reservation, error } = await supabase
      .from('restaurant_reservations')
      .insert({
        business_id: businessId,
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
      } as never)
      .select()
      .single();
    if (error) throw error;
    return reservation as unknown as Reservation;
  }

  async updateReservation(id: string, updates: Partial<Reservation>): Promise<void> {
    const { error } = await supabase.from('restaurant_reservations').update(updates as never).eq('id', id);
    if (error) throw error;
  }

  async listWaitlist(businessId: string): Promise<Waitlist[]> {
    const { data, error } = await supabase
      .from('restaurant_waitlist')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'waiting')
      .order('check_in_time', { ascending: true });
    if (error) throw error;
    return data as unknown as Waitlist[];
  }

  async addToWaitlist(businessId: string, data: Partial<Waitlist>): Promise<Waitlist> {
    const { data: entry, error } = await supabase
      .from('restaurant_waitlist')
      .insert({
        business_id: businessId,
        guest_name: data.guest_name,
        guest_phone: data.guest_phone,
        party_size: data.party_size,
        estimated_wait_minutes: data.estimated_wait_minutes ?? 30,
        quoted_wait_minutes: data.quoted_wait_minutes ?? 30,
        status: 'waiting',
        notes: data.notes,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return entry as unknown as Waitlist;
  }

  async updateWaitlist(id: string, updates: Partial<Waitlist>): Promise<void> {
    const { error } = await supabase.from('restaurant_waitlist').update(updates as never).eq('id', id);
    if (error) throw error;
  }

  async listGuests(): Promise<GuestProfile[]> {
    const { data, error } = await supabase
      .from('restaurant_guest_profiles')
      .select('*')
      .order('last_visit_date', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data as unknown as GuestProfile[];
  }

  async searchGuests(queryText: string): Promise<GuestProfile[]> {
    const { data, error } = await supabase
      .from('restaurant_guest_profiles')
      .select('*')
      .or(`full_name.ilike.%${queryText}%,phone.ilike.%${queryText}%,email.ilike.%${queryText}%`)
      .limit(10);
    if (error) throw error;
    return data as unknown as GuestProfile[];
  }

  async getGuestByPhone(phone: string): Promise<GuestProfile | null> {
    const { data, error } = await supabase.from('restaurant_guest_profiles').select('*').eq('phone', phone).maybeSingle();
    if (error) throw error;
    return data as unknown as GuestProfile | null;
  }

  async createGuest(ownerUid: string, data: Partial<GuestProfile>): Promise<GuestProfile> {
    const { data: guest, error } = await supabase
      .from('restaurant_guest_profiles')
      .insert({
        business_id: ownerUid,
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
      } as never)
      .select()
      .single();
    if (error) throw error;
    return guest as unknown as GuestProfile;
  }

  async updateGuest(id: string, updates: Partial<GuestProfile>): Promise<void> {
    const { error } = await supabase
      .from('restaurant_guest_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id);
    if (error) throw error;
  }

  async recordVisit(params: { guestId: string; amountSpent: number }): Promise<void> {
    const { data: guest, error: getError } = await supabase
      .from('restaurant_guest_profiles')
      .select('visit_count, total_lifetime_spend')
      .eq('id', params.guestId)
      .single();
    if (getError) throw getError;
    const current = guest as { visit_count: number | null; total_lifetime_spend: number | null };
    const newVisitCount = (current.visit_count || 0) + 1;
    const newTotalSpend = (current.total_lifetime_spend || 0) + params.amountSpent;
    const newAverageCheck = newTotalSpend / newVisitCount;
    const { error } = await supabase
      .from('restaurant_guest_profiles')
      .update({
        visit_count: newVisitCount,
        total_lifetime_spend: newTotalSpend,
        average_check: newAverageCheck,
        last_visit_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', params.guestId);
    if (error) throw error;
  }

  async getServerTimeOffset(): Promise<number> {
    try {
      const { data, error } = await rpc('get_server_time');
      if (data && !error) return new Date(data as string).getTime() - Date.now();
    } catch {
      // RPC might not exist
    }
    await supabase.auth.getSession();
    return 0;
  }

  // ---------------------------------------------------------------- operation mode

  async getOrCreateBusinessSettings(ownerUid: string): Promise<BusinessSettings> {
    const { data, error: fetchError } = await supabase.from('business_settings').select('*').eq('business_id', ownerUid).maybeSingle();
    if (fetchError) throw fetchError;
    if (!data) {
      const { data: newSettings, error: insertError } = await supabase
        .from('business_settings')
        .insert({ business_id: ownerUid, operation_mode: 'restaurant', market_scale_prefix: '20', market_scale_port: null } as never)
        .select()
        .single();
      if (insertError) throw insertError;
      return newSettings as unknown as BusinessSettings;
    }
    return data as unknown as BusinessSettings;
  }

  async updateBusinessSettings(ownerUid: string, updates: BusinessSettingsPatch): Promise<BusinessSettings> {
    const { data, error } = await supabase.from('business_settings').update(updates as never).eq('business_id', ownerUid).select().single();
    if (error) throw error;
    return data as unknown as BusinessSettings;
  }
}
