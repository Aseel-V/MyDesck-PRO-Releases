import { supabase } from '../../lib/supabase';
import type { CarPart, CarPartInput } from '../../types/carParts';
import type { CarPartsRepository } from '../domain/carParts';

/**
 * Car parts inventory data access, moved verbatim from CarPartsInventory. This is the shipped Supabase path until
 * cutover; the Firebase root uses FirestoreCarPartsRepository.
 */
export class SupabaseCarPartsRepository implements CarPartsRepository {
  async listParts(businessId: string): Promise<CarPart[]> {
    const { data, error } = await supabase
      .from('car_parts')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as unknown as CarPart[]) || [];
  }

  async createPart(businessId: string, input: CarPartInput): Promise<CarPart> {
    const { data, error } = await supabase
      .from('car_parts')
      .insert({ ...input, business_id: businessId })
      .select()
      .single();

    if (error) throw error;
    return data as unknown as CarPart;
  }

  async updatePart(partId: string, input: CarPartInput): Promise<CarPart> {
    const { data, error } = await supabase
      .from('car_parts')
      .update(input)
      .eq('id', partId)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as CarPart;
  }

  async deletePart(partId: string): Promise<void> {
    const { error } = await supabase
      .from('car_parts')
      .delete()
      .eq('id', partId);

    if (error) throw error;
  }
}
