import { supabase } from '../../lib/supabase';
import type { Database, Json } from '../../types/database';
import type { AutoRepairOrder } from '../../types/autoRepair';
import type { CarPart } from '../../types/carParts';
import type { AutoRepairRepository, ServiceItemInput, VehicleInput, WorkingOrderInput } from '../domain/autoRepair';

type CustomerVehicleInsert = Database['public']['Tables']['customer_vehicles']['Insert'];

/**
 * Auto repair data access, moved verbatim from Cars, NewCarForm and AddServiceModal. This is the shipped
 * Supabase path until cutover; the Firebase root uses FirestoreAutoRepairRepository.
 */
export class SupabaseAutoRepairRepository implements AutoRepairRepository {
  async listRepairOrders(businessId: string): Promise<AutoRepairOrder[]> {
    const { data, error } = await supabase
      .from('repair_orders')
      .select(`
            *,
            vehicle:customer_vehicles(*),
            items:repair_order_items(*)
        `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as unknown as AutoRepairOrder[];
  }

  async deleteRepairOrder(orderId: string): Promise<void> {
    const { error } = await supabase
      .from('repair_orders')
      .delete()
      .eq('id', orderId);

    if (error) throw error;
  }

  async registerVehicleAndOpenOrder(businessId: string, vehicle: VehicleInput, order: WorkingOrderInput): Promise<void> {
    // 1. Upsert Vehicle (Identify by plate + business_id)
    const { data: existingVehicle } = await supabase
      .from('customer_vehicles')
      .select('id')
      .eq('business_id', businessId)
      .eq('plate_number', vehicle.plate_number)
      .maybeSingle();

    let vehicleId = existingVehicle?.id;

    const vehicleData = {
      business_id: businessId,
      plate_number: vehicle.plate_number,
      model: vehicle.model,
      owner_name: vehicle.owner_name,
      owner_phone: vehicle.owner_phone,
      color: vehicle.color,
      year: vehicle.year,
      test_expiry: vehicle.test_expiry,
      trim_level: vehicle.trim_level,
      ownership: vehicle.ownership,
      updated_at: new Date().toISOString(),
    } as unknown as CustomerVehicleInsert;

    if (!vehicleId) {
      // Create new vehicle
      const { data: newVehicle, error: vehicleError } = await supabase
        .from('customer_vehicles')
        .insert([{ ...vehicleData, created_at: new Date().toISOString() }])
        .select()
        .single();

      if (vehicleError) throw vehicleError;
      vehicleId = newVehicle.id;
    } else {
      // Update existing
      await supabase
        .from('customer_vehicles')
        .update(vehicleData)
        .eq('id', vehicleId);
    }

    // 2. Create Repair Order
    const { error: orderError } = await supabase
      .from('repair_orders')
      .insert([{
        business_id: businessId,
        vehicle_id: vehicleId,
        status: 'working',
        odometer_reading: order.odometer_reading,
        notes: order.notes,
        total_amount: 0,
        currency: order.currency,
        created_at: new Date().toISOString(),
      }]);

    if (orderError) throw orderError;
  }

  async listPartsInStock(businessId: string): Promise<CarPart[]> {
    const { data, error } = await supabase
      .from('car_parts')
      .select('*')
      .eq('business_id', businessId)
      .gt('quantity', 0) // Only show parts in stock
      .order('part_name');

    if (error) throw error;
    return (data as unknown as CarPart[]) || [];
  }

  async addServiceToOrder(orderId: string, items: ServiceItemInput[]): Promise<void> {
    const { error: rpcError } = await supabase.rpc('add_repair_service_transaction', {
      p_order_id: orderId,
      p_items: items as unknown as Json,
    });

    if (rpcError) throw rpcError;
  }
}
