export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      trips: {
        Row: {
          id: string;
          user_id: string;
          destination: string;
          client_name: string;
          travelers_count: number;
          start_date: string;
          end_date: string;
          wholesale_cost: number;
          sale_price: number;
          profit: number;
          profit_percentage: number;
          payment_status: 'paid' | 'partial' | 'unpaid';
          amount_paid: number;
          amount_due: number;
          notes: string;
          status: 'active' | 'completed' | 'cancelled';
          export_to_pdf: boolean;
          created_at: string;
          updated_at: string;
          wholesale_original_amount?: number | null;
          wholesale_currency?: string | null;
          sale_original_amount?: number | null;
          sale_currency?: string | null;
        };

        Insert: {
          id?: string;
          user_id: string;
          destination: string;
          client_name: string;
          travelers_count: number;
          start_date: string;
          end_date: string;
          wholesale_cost: number;
          sale_price: number;
          // Calculated values optional
          profit?: number;
          profit_percentage?: number;
          amount_paid: number;
          amount_due?: number;
          notes?: string;
          status: 'active' | 'completed' | 'cancelled';
          export_to_pdf?: boolean;
          created_at?: string;
          updated_at?: string;
        };

        Update: {
          id?: string;
          user_id?: string;
          destination?: string;
          client_name?: string;
          travelers_count?: number;
          start_date?: string;
          end_date?: string;
          wholesale_cost?: number;
          sale_price?: number;
          profit?: number;
          profit_percentage?: number;
          payment_status?: 'paid' | 'partial' | 'unpaid';
          amount_paid?: number;
          amount_due?: number;
          notes?: string;
          status?: 'active' | 'completed' | 'cancelled';
          export_to_pdf?: boolean;
          created_at?: string;
          updated_at?: string;
        };

        Relationships: [
          {
            foreignKeyName: 'trips_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      
      // Restaurant Tables
      restaurant_tables: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          status: 'free' | 'occupied' | 'billed' | 'reserved';
          seats: number;
          position_x: number;
          position_y: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          status?: 'free' | 'occupied' | 'billed' | 'reserved';
          seats?: number;
          position_x?: number;
          position_y?: number;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          name: string;
          status: 'free' | 'occupied' | 'billed' | 'reserved';
          seats: number;
          position_x: number;
          position_y: number;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_menu_categories: {
        Row: {
            id: string;
            business_id: string;
            name: string;
            sort_order: number;
            created_at: string;
        };
        Insert: {
            id?: string;
            business_id: string;
            name: string;
            sort_order?: number;
            created_at?: string;
        };
        Update: Partial<{
            id: string;
            business_id: string;
            name: string;
            sort_order: number;
            created_at: string;
        }>;
         Relationships: [];
      };

      restaurant_menu_items: {
        Row: {
            id: string;
            category_id: string;
            name: string;
            description: string | null;
            price: number;
            is_available: boolean;
            tax_rate: number;
            created_at: string;
        };
        Insert: {
            id?: string;
            category_id: string;
            name: string;
            description?: string | null;
            price: number;
            is_available?: boolean;
            tax_rate?: number;
            created_at?: string;
        };
        Update: Partial<{
            id: string;
            category_id: string;
            name: string;
            description: string | null;
            price: number;
            is_available: boolean;
            tax_rate: number;
            created_at: string;
        }>;
         Relationships: [];
      };

      restaurant_staff: {
          Row: {
            id: string;
            business_id: string;
            full_name: string;
            role: 'Waiter' | 'Chef' | 'Manager' | 'Other';
            hourly_rate: number;
            is_active: boolean;
            created_at: string;
          };
          Insert: {
            id?: string;
            business_id: string;
            full_name: string;
            role?: 'Waiter' | 'Chef' | 'Manager' | 'Other';
            hourly_rate?: number;
            is_active?: boolean;
            created_at?: string;
          };
          Update: Partial<{
            id: string;
            business_id: string;
            full_name: string;
            role: 'Waiter' | 'Chef' | 'Manager' | 'Other';
            hourly_rate: number;
            is_active: boolean;
            created_at: string;
          }>;
           Relationships: [];
      };

      restaurant_orders: {
          Row: {
            id: string;
            business_id: string;
            table_id: string | null;
            status: 'open' | 'closed' | 'cancelled';
            total_amount: number;
            tax_amount: number;
            tip_amount: number;
            payment_method: 'cash' | 'card' | 'split' | null;
            created_at: string;
            closed_at: string | null;
            currency: string;
          };
          Insert: {
            id?: string;
            business_id: string;
            table_id?: string | null;
            status?: 'open' | 'closed' | 'cancelled';
            total_amount?: number;
            tax_amount?: number;
            tip_amount?: number;
            payment_method?: 'cash' | 'card' | 'split' | null;
            created_at?: string;
            closed_at?: string | null;
            currency?: string;
          };
          Update: Partial<{
            id: string;
            business_id: string;
            table_id: string | null;
            status: 'open' | 'closed' | 'cancelled';
            total_amount: number;
            tax_amount: number;
            tip_amount: number;
            payment_method: 'cash' | 'card' | 'split' | null;
            created_at: string;
            closed_at: string | null;
            currency: string;
          }>;
           Relationships: [];
      };

      restaurant_order_items: {
          Row: {
            id: string;
            order_id: string;
            item_id: string;
            quantity: number;
            price_at_time: number;
            notes: string | null;
            created_at: string;
          };
          Insert: {
            id?: string;
            order_id: string;
            item_id: string;
            quantity?: number;
            price_at_time: number;
            notes?: string | null;
            created_at?: string;
          };
          Update: Partial<{
            id: string;
            order_id: string;
            item_id: string;
            quantity: number;
            price_at_time: number;
            notes: string | null;
            created_at: string;
          }>;
           Relationships: [];
      };

      restaurant_daily_reports: {
          Row: {
            id: string;
            business_id: string;
            date: string;
            z_report_number: number;
            total_sales_cash: number;
            total_sales_card: number;
            total_tax: number;
            total_tips: number;
            total_expenses: number;
            total_labor_cost: number;
            net_profit: number;
            created_at: string;
            currency: string;
          };
          Insert: {
            id?: string;
            business_id: string;
            date?: string;
            z_report_number?: number;
            total_sales_cash?: number;
            total_sales_card?: number;
            total_tax?: number;
            total_tips?: number;
            total_expenses?: number;
            total_labor_cost?: number;
            net_profit?: number;
            created_at?: string;
            currency?: string;
          };
          Update: Partial<{
            id: string;
            business_id: string;
            date: string;
            z_report_number: number;
            total_sales_cash: number;
            total_sales_card: number;
            total_tax: number;
            total_tips: number;
            total_expenses: number;
            total_labor_cost: number;
            net_profit: number;
            created_at: string;
            currency: string;
          }>;
           Relationships: [];
      };
      
      staff_shifts: {
          Row: {
            id: string;
            report_id: string;
            staff_id: string;
            hours_worked: number;
            total_pay: number;
            created_at: string;
          };
          Insert: {
            id?: string;
            report_id: string;
            staff_id: string;
            hours_worked?: number;
            total_pay?: number;
            created_at?: string;
          };
          Update: Partial<{
            id: string;
            report_id: string;
            staff_id: string;
            hours_worked: number;
            total_pay: number;
            created_at: string;
          }>;
           Relationships: [];
      };

    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      [_ in never]: never;
    };

    Enums: {
      [_ in never]: never;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
