import { supabase } from '../../lib/supabase';
import type {
  CategorySeed, MarketTransactionRow, MenuCategoryRow, MenuItemRow, ProductInput, SaleInput, SalePatch,
  SupermarketRepository,
} from '../domain/supermarket';

/**
 * Supermarket data access, moved verbatim from SupermarketDashboard, AddProductModal, SalesAnalytics
 * and EditTransactionModal. market_transactions is absent from the generated database types, which
 * is why those calls address the table untyped, exactly as the components did.
 */
export class SupabaseSupermarketRepository implements SupermarketRepository {
  async listAvailableProducts(ownerUid: string): Promise<MenuItemRow[]> {
    const { data, error } = await supabase.from('restaurant_menu_items').select('*')
      .eq('business_id', ownerUid).eq('is_available', true);
    if (error) throw error;
    return (data ?? []) as MenuItemRow[];
  }

  async listCategories(ownerUid: string): Promise<MenuCategoryRow[]> {
    const { data, error } = await supabase.from('restaurant_menu_categories').select('*')
      .eq('business_id', ownerUid).order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as MenuCategoryRow[];
  }

  async seedDefaultCategories(ownerUid: string, seeds: CategorySeed[]): Promise<MenuCategoryRow[]> {
    const { data, error } = await supabase.from('restaurant_menu_categories')
      .insert(seeds.map((seed) => ({ business_id: ownerUid, ...seed }))).select();
    if (error) throw error;
    return (data ?? []) as MenuCategoryRow[];
  }

  async createProduct(ownerUid: string, input: ProductInput): Promise<void> {
    const { error } = await supabase.from('restaurant_menu_items')
      .insert({ business_id: ownerUid, ...input, is_available: true } as never);
    if (error) throw error;
  }

  async updateProduct(productId: string, patch: Partial<ProductInput>): Promise<void> {
    const { error } = await supabase.from('restaurant_menu_items').update(patch as never).eq('id', productId);
    if (error) throw error;
  }

  async deleteProduct(productId: string): Promise<void> {
    const { error } = await supabase.from('restaurant_menu_items').delete().eq('id', productId);
    if (error) throw error;
  }

  async recordSale(ownerUid: string, sale: SaleInput): Promise<void> {
    const { error } = await supabase.from('market_transactions' as never).insert({ business_id: ownerUid, ...sale } as never);
    if (error) throw error;
  }

  async listSales(ownerUid: string, fromIso: string, toIso: string): Promise<MarketTransactionRow[]> {
    const { data, error } = await supabase.from('market_transactions' as never).select('*')
      .eq('business_id', ownerUid).gte('created_at', fromIso).lte('created_at', toIso)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data as unknown) as MarketTransactionRow[]) ?? [];
  }

  async getSaleOwner(saleId: string): Promise<{ id: string; business_id: string } | null> {
    const { data } = await supabase.from('market_transactions' as never).select('id, business_id')
      .eq('id', saleId).single();
    return (data as unknown as { id: string; business_id: string } | null) ?? null;
  }

  async updateSale(saleId: string, patch: SalePatch): Promise<void> {
    const { error } = await supabase.from('market_transactions' as never).update(patch as never).eq('id', saleId);
    if (error) throw error;
  }

  async deleteSale(saleId: string): Promise<void> {
    const { error } = await supabase.from('market_transactions' as never).delete().eq('id', saleId);
    if (error) throw error;
  }
}
