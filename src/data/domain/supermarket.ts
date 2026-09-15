/**
 * Supermarket (market POS) contract.
 *
 * The supermarket shares restaurant_menu_items and restaurant_menu_categories with the restaurant
 * vertical and records sales in market_transactions. Every source table here scopes by
 * `business_id = auth.uid()`, i.e. the owner uid, so the methods take that uid.
 */
import type { Database } from '../../types/database';

type Tables = Database['public']['Tables'];
export type MenuItemRow = Tables['restaurant_menu_items']['Row'];
export type MenuCategoryRow = Tables['restaurant_menu_categories']['Row'];

/** market_transactions is not in the generated database types; the row is the source columns. */
export interface MarketTransactionRow {
  id: string;
  business_id: string;
  order_id: string | null;
  receipt_number: string;
  items: unknown;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  created_at: string;
}

export interface CategorySeed { name: string; name_he: string; sort_order: number; is_active: boolean }

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  barcode: string | null;
  category_id: string | null;
  type: 'unit' | 'weight';
  image_url: string | null;
}

export interface SaleInput {
  receipt_number: string;
  items: unknown;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  created_at: string;
}

export interface SalePatch { items: unknown; total_amount: number; subtotal: number; vat_amount: number }

export interface SupermarketRepository {
  /** restaurant_menu_items WHERE business_id = owner AND is_available (no ORDER BY in the source). */
  listAvailableProducts(ownerUid: string): Promise<MenuItemRow[]>;
  /** restaurant_menu_categories WHERE business_id = owner ORDER BY sort_order ASC. */
  listCategories(ownerUid: string): Promise<MenuCategoryRow[]>;
  /** INSERT ... RETURNING, in insertion order. */
  seedDefaultCategories(ownerUid: string, seeds: CategorySeed[]): Promise<MenuCategoryRow[]>;
  createProduct(ownerUid: string, input: ProductInput): Promise<void>;
  /** UPDATE ... WHERE id; a vanished row updates nothing and is not an error. */
  updateProduct(productId: string, patch: Partial<ProductInput>): Promise<void>;
  deleteProduct(productId: string): Promise<void>;
  recordSale(ownerUid: string, sale: SaleInput): Promise<void>;
  /** market_transactions WHERE business_id = owner AND created_at BETWEEN ORDER BY created_at DESC. */
  listSales(ownerUid: string, fromIso: string, toIso: string): Promise<MarketTransactionRow[]>;
  /** The ownership pre-check SalesAnalytics performs before a delete; null when not found. */
  getSaleOwner(saleId: string): Promise<{ id: string; business_id: string } | null>;
  updateSale(saleId: string, patch: SalePatch): Promise<void>;
  deleteSale(saleId: string): Promise<void>;
}
