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
      business_profiles: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          address: string | null;
          logo_url: string | null;
          preferred_currency: 'USD' | 'EUR' | 'ILS';
          preferred_language: 'en' | 'ar' | 'he';
          phone_number: string | null;
          business_registration_number: string | null;
          signature_url: string | null;
          business_type: 'tourism' | 'auto_repair' | 'restaurant' | 'supermarket' | 'phone_shop' | 'car_parts' | 'clothes_shop' | 'furniture_store' | 'other';
          subscription_status: 'trial' | 'active' | 'expired' | 'suspended' | 'past_due';
          trial_start_date: string | null;
          is_suspended: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          business_name: string;
          address?: string | null;
          logo_url?: string | null;
          preferred_currency?: 'USD' | 'EUR' | 'ILS';
          preferred_language?: 'en' | 'ar' | 'he';
          phone_number?: string | null;
          business_registration_number?: string | null;
          signature_url?: string | null;
          business_type?: 'tourism' | 'auto_repair' | 'restaurant' | 'supermarket' | 'phone_shop' | 'car_parts' | 'clothes_shop' | 'furniture_store' | 'other';
          subscription_status?: 'trial' | 'active' | 'expired' | 'suspended' | 'past_due';
          trial_start_date?: string | null;
          is_suspended?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          business_name: string;
          address: string | null;
          logo_url: string | null;
          preferred_currency: 'USD' | 'EUR' | 'ILS';
          preferred_language: 'en' | 'ar' | 'he';
          phone_number: string | null;
          business_registration_number: string | null;
          signature_url: string | null;
          business_type: 'tourism' | 'auto_repair' | 'restaurant' | 'supermarket' | 'phone_shop' | 'car_parts' | 'clothes_shop' | 'furniture_store' | 'other';
          subscription_status: 'trial' | 'active' | 'expired' | 'suspended' | 'past_due';
          trial_start_date: string | null;
          is_suspended: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "business_profiles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };

      user_profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          email: string | null;
          phone_number: string | null;
          role: 'admin' | 'user';
          is_suspended: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          email?: string | null;
          phone_number?: string | null;
          role?: 'admin' | 'user';
          is_suspended?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          full_name: string;
          email: string | null;
          phone_number: string | null;
          role: 'admin' | 'user';
          is_suspended: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "user_profiles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };

      trips: {
        Row: {
          id: string;
          user_id: string;
          destination: string;
          client_name: string;
          client_phone: string | null;
          travelers: Json;
          travelers_count: number;
          itinerary: Json;
          start_date: string;
          end_date: string;
          currency: string;
          exchange_rate: number;
          wholesale_cost: number;
          sale_price: number;
          profit: number;
          profit_percentage: number;
          payment_status: 'paid' | 'partial' | 'unpaid';
          payments: Json;
          amount_paid: number;
          amount_due: number;
          payment_date: string | null;
          room_type: Json;
          board_basis: string | null;
          attachments: Json;
          notes: string;
          status: 'active' | 'completed' | 'cancelled' | 'archived';
          export_to_pdf: boolean;
          created_at: string;
          updated_at: string;
          wholesale_original_amount: number | null;
          wholesale_currency: string | null;
          sale_original_amount: number | null;
          sale_currency: string | null;
        };

        Insert: {
          id?: string;
          user_id: string;
          destination: string;
          client_name: string;
          client_phone?: string | null;
          travelers?: Json;
          travelers_count: number;
          itinerary?: Json;
          start_date: string;
          end_date: string;
          currency?: string;
          exchange_rate?: number;
          wholesale_cost: number;
          sale_price: number;
          // Calculated values optional
          profit?: number;
          profit_percentage?: number;
          payments?: Json;
          amount_paid: number;
          amount_due?: number;
          payment_date?: string | null;
          room_type?: Json;
          board_basis?: string | null;
          attachments?: Json;
          notes?: string;
          status: 'active' | 'completed' | 'cancelled' | 'archived';
          payment_status?: 'paid' | 'partial' | 'unpaid';
          export_to_pdf?: boolean;
          wholesale_original_amount?: number | null;
          wholesale_currency?: string | null;
          sale_original_amount?: number | null;
          sale_currency?: string | null;
          created_at?: string;
          updated_at?: string;
        };

        Update: {
          id?: string;
          user_id?: string;
          destination?: string;
          client_name?: string;
          client_phone?: string | null;
          travelers?: Json;
          travelers_count?: number;
          itinerary?: Json;
          start_date?: string;
          end_date?: string;
          currency?: string;
          exchange_rate?: number;
          wholesale_cost?: number;
          sale_price?: number;
          profit?: number;
          profit_percentage?: number;
          payment_status?: 'paid' | 'partial' | 'unpaid';
          payments?: Json;
          amount_paid?: number;
          payment_date?: string | null;
          room_type?: Json;
          board_basis?: string | null;
          attachments?: Json;
          amount_due?: number;
          notes?: string;
          status?: 'active' | 'completed' | 'cancelled' | 'archived';
          export_to_pdf?: boolean;
          wholesale_original_amount?: number | null;
          wholesale_currency?: string | null;
          sale_original_amount?: number | null;
          sale_currency?: string | null;
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
          status: 'free' | 'occupied' | 'billed' | 'reserved' | 'dirty' | 'blocked';
          seats: number;
          min_party_size: number;
          position_x: number;
          position_y: number;
          shape: 'round' | 'square' | 'rectangle' | 'booth' | 'bar';
          zone: 'indoor' | 'outdoor' | 'patio' | 'private' | 'bar_area';
          width: number;
          height: number;
          rotation: number;
          is_mergeable: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          status?: 'free' | 'occupied' | 'billed' | 'reserved' | 'dirty' | 'blocked';
          seats?: number;
          min_party_size?: number;
          position_x?: number;
          position_y?: number;
          shape?: 'round' | 'square' | 'rectangle' | 'booth' | 'bar';
          zone?: 'indoor' | 'outdoor' | 'patio' | 'private' | 'bar_area';
          width?: number;
          height?: number;
          rotation?: number;
          is_mergeable?: boolean;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          name: string;
          status: 'free' | 'occupied' | 'billed' | 'reserved' | 'dirty' | 'blocked';
          seats: number;
          min_party_size: number;
          position_x: number;
          position_y: number;
          shape: 'round' | 'square' | 'rectangle' | 'booth' | 'bar';
          zone: 'indoor' | 'outdoor' | 'patio' | 'private' | 'bar_area';
          width: number;
          height: number;
          rotation: number;
          is_mergeable: boolean;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_menu_categories: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          description: string | null;
          parent_id: string | null;
          sort_order: number;
          is_active: boolean;
          icon: string | null;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          name_he?: string | null;
          name_ar?: string | null;
          description?: string | null;
          parent_id?: string | null;
          sort_order?: number;
          is_active?: boolean;
          icon?: string | null;
          color?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          description: string | null;
          parent_id: string | null;
          sort_order: number;
          is_active: boolean;
          icon: string | null;
          color: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_menu_items: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          description: string | null;
          price: number;
          cost_price: number;
          type: 'unit' | 'weight';
          is_available: boolean;
          tax_rate: number;
          prep_time_minutes: number;
          station: 'grill' | 'fry' | 'salad' | 'bar' | 'expo' | 'dessert' | 'general';
          allergen_codes: string[];
          allergens: string[];
          calories: number | null;
          image_url: string | null;
          sort_order: number;
          is_popular: boolean;
          is_new: boolean;
          available_from: string | null;
          available_until: string | null;
          available_days: number[] | null;
          spicy_level: number;
          dietary_tags: string[];
          barcode: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          name_he?: string | null;
          name_ar?: string | null;
          description?: string | null;
          price: number;
          cost_price?: number;
          type?: 'unit' | 'weight';
          is_available?: boolean;
          tax_rate?: number;
          prep_time_minutes?: number;
          station?: 'grill' | 'fry' | 'salad' | 'bar' | 'expo' | 'dessert' | 'general';
          allergen_codes?: string[];
          allergens?: string[];
          calories?: number | null;
          image_url?: string | null;
          sort_order?: number;
          is_popular?: boolean;
          is_new?: boolean;
          available_from?: string | null;
          available_until?: string | null;
          available_days?: number[] | null;
          spicy_level?: number;
          dietary_tags?: string[];
          barcode?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          category_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          description: string | null;
          price: number;
          cost_price: number;
          type: 'unit' | 'weight';
          is_available: boolean;
          tax_rate: number;
          prep_time_minutes: number;
          station: 'grill' | 'fry' | 'salad' | 'bar' | 'expo' | 'dessert' | 'general';
          allergen_codes: string[];
          allergens: string[];
          calories: number | null;
          image_url: string | null;
          sort_order: number;
          is_popular: boolean;
          is_new: boolean;
          available_from: string | null;
          available_until: string | null;
          available_days: number[] | null;
          spicy_level: number;
          dietary_tags: string[];
          barcode: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_staff: {
        Row: {
          id: string;
          business_id: string;
          full_name: string;
          role: 'Manager' | 'Waiter' | 'Chef' | 'Other' | 'Host' | 'Cashier' | 'Kitchen';
          restaurant_role: 'super_admin' | 'branch_manager' | 'head_chef' | 'waiter' | 'kitchen_staff' | 'cashier' | 'host';
          email: string | null;
          phone: string | null;
          pin_code: string | null;
          avatar_url: string | null;
          hourly_rate: number;
          is_active: boolean;
          is_clocked_in: boolean;
          clocked_in_at: string | null;
          assigned_station: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          full_name: string;
          role?: 'Manager' | 'Waiter' | 'Chef' | 'Other' | 'Host' | 'Cashier' | 'Kitchen';
          restaurant_role?: 'super_admin' | 'branch_manager' | 'head_chef' | 'waiter' | 'kitchen_staff' | 'cashier' | 'host';
          email?: string | null;
          phone?: string | null;
          pin_code?: string | null;
          avatar_url?: string | null;
          hourly_rate?: number;
          is_active?: boolean;
          is_clocked_in?: boolean;
          clocked_in_at?: string | null;
          assigned_station?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          full_name: string;
          role: 'Manager' | 'Waiter' | 'Chef' | 'Other' | 'Host' | 'Cashier' | 'Kitchen';
          restaurant_role: 'super_admin' | 'branch_manager' | 'head_chef' | 'waiter' | 'kitchen_staff' | 'cashier' | 'host';
          email: string | null;
          phone: string | null;
          pin_code: string | null;
          avatar_url: string | null;
          hourly_rate: number;
          is_active: boolean;
          is_clocked_in: boolean;
          clocked_in_at: string | null;
          assigned_station: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_modifier_groups: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          min_selections: number;
          max_selections: number;
          is_required: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          name_he?: string | null;
          name_ar?: string | null;
          min_selections?: number;
          max_selections?: number;
          is_required?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          min_selections: number;
          max_selections: number;
          is_required: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_modifiers: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          price_adjustment: number;
          is_available: boolean;
          is_default: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          name_he?: string | null;
          name_ar?: string | null;
          price_adjustment?: number;
          is_available?: boolean;
          is_default?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          group_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          price_adjustment: number;
          is_available: boolean;
          is_default: boolean;
          sort_order: number;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_order_item_modifiers: {
        Row: {
          id: string;
          order_item_id: string;
          modifier_id: string | null;
          modifier_name: string;
          price_adjustment: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_item_id: string;
          modifier_id?: string | null;
          modifier_name: string;
          price_adjustment: number;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          order_item_id: string;
          modifier_id: string | null;
          modifier_name: string;
          price_adjustment: number;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_orders: {
        Row: {
          id: string;
          business_id: string;
          order_number: number;
          session_id: string | null;
          table_id: string | null;
          server_id: string | null;
          guest_id: string | null;
          order_type: 'dine_in' | 'takeaway' | 'delivery';
          status: 'draft' | 'pending' | 'in_progress' | 'ready' | 'served' | 'billed' | 'closed' | 'cancelled';
          subtotal_amount: number;
          discount_amount: number;
          discount_percentage: number;
          discount_reason: string | null;
          tax_amount: number;
          tip_amount: number;
          total_amount: number;
          payment_method: 'cash' | 'card' | 'bit' | 'split' | null;
          payment_status: 'pending' | 'partial' | 'paid' | 'refunded';
          is_rush: boolean;
          is_vip: boolean;
          course_number: number;
          notes: string | null;
          created_at: string;
          closed_at: string | null;
          currency: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          order_number: number;
          session_id?: string | null;
          table_id?: string | null;
          server_id?: string | null;
          guest_id?: string | null;
          order_type?: 'dine_in' | 'takeaway' | 'delivery';
          status?: 'draft' | 'pending' | 'in_progress' | 'ready' | 'served' | 'billed' | 'closed' | 'cancelled';
          subtotal_amount?: number;
          discount_amount?: number;
          discount_percentage?: number;
          discount_reason?: string | null;
          tax_amount?: number;
          tip_amount?: number;
          total_amount?: number;
          payment_method?: 'cash' | 'card' | 'bit' | 'split' | null;
          payment_status?: 'pending' | 'partial' | 'paid' | 'refunded';
          is_rush?: boolean;
          is_vip?: boolean;
          course_number?: number;
          notes?: string | null;
          created_at?: string;
          closed_at?: string | null;
          currency?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          order_number: number;
          session_id: string | null;
          table_id: string | null;
          server_id: string | null;
          guest_id: string | null;
          order_type: 'dine_in' | 'takeaway' | 'delivery';
          status: 'draft' | 'pending' | 'in_progress' | 'ready' | 'served' | 'billed' | 'closed' | 'cancelled';
          subtotal_amount: number;
          discount_amount: number;
          discount_percentage: number;
          discount_reason: string | null;
          tax_amount: number;
          tip_amount: number;
          total_amount: number;
          payment_method: 'cash' | 'card' | 'bit' | 'split' | null;
          payment_status: 'pending' | 'partial' | 'paid' | 'refunded';
          is_rush: boolean;
          is_vip: boolean;
          course_number: number;
          notes: string | null;
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
          status: 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';
          voided: boolean;
          void_reason: string | null;
          voided_by: string | null;
          fired_at: string | null;
          ready_at: string | null;
          served_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          item_id: string;
          quantity?: number;
          price_at_time: number;
          notes?: string | null;
          status?: 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';
          voided?: boolean;
          void_reason?: string | null;
          voided_by?: string | null;
          fired_at?: string | null;
          ready_at?: string | null;
          served_at?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          order_id: string;
          item_id: string;
          quantity: number;
          price_at_time: number;
          notes: string | null;
          status: 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';
          voided: boolean;
          void_reason: string | null;
          voided_by: string | null;
          fired_at: string | null;
          ready_at: string | null;
          served_at: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_table_sessions: {
        Row: {
          id: string;
          business_id: string;
          table_id: string | null;
          guest_count: number;
          server_id: string | null;
          guest_id: string | null;
          started_at: string;
          ended_at: string | null;
          status: 'active' | 'billed' | 'closed';
          notes: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          table_id?: string | null;
          guest_count?: number;
          server_id?: string | null;
          guest_id?: string | null;
          started_at?: string;
          ended_at?: string | null;
          status?: 'active' | 'billed' | 'closed';
          notes?: string | null;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          table_id: string | null;
          guest_count: number;
          server_id: string | null;
          guest_id: string | null;
          started_at: string;
          ended_at: string | null;
          status: 'active' | 'billed' | 'closed';
          notes: string | null;
        }>;
        Relationships: [];
      };

      restaurant_kitchen_tickets: {
        Row: {
          id: string;
          business_id: string;
          order_id: string;
          table_name: string | null;
          server_name: string | null;
          station: string | null;
          status: 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled';
          priority: number;
          is_rush: boolean;
          is_vip: boolean;
          course_number: number;
          fired_at: string;
          started_at: string | null;
          completed_at: string | null;
          served_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          order_id: string;
          table_name?: string | null;
          server_name?: string | null;
          station?: string | null;
          status?: 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled';
          priority?: number;
          is_rush?: boolean;
          is_vip?: boolean;
          course_number?: number;
          fired_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          served_at?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          order_id: string;
          table_name: string | null;
          server_name: string | null;
          station: string | null;
          status: 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled';
          priority: number;
          is_rush: boolean;
          is_vip: boolean;
          course_number: number;
          fired_at: string;
          started_at: string | null;
          completed_at: string | null;
          served_at: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_ticket_items: {
        Row: {
          id: string;
          ticket_id: string;
          order_item_id: string;
          item_name: string;
          quantity: number;
          notes: string | null;
          modifiers_text: string | null;
          seat_number: number | null;
          status: 'pending' | 'cooking' | 'ready' | 'cancelled';
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          order_item_id: string;
          item_name: string;
          quantity: number;
          notes?: string | null;
          modifiers_text?: string | null;
          seat_number?: number | null;
          status?: 'pending' | 'cooking' | 'ready' | 'cancelled';
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          ticket_id: string;
          order_item_id: string;
          item_name: string;
          quantity: number;
          notes: string | null;
          modifiers_text: string | null;
          seat_number: number | null;
          status: 'pending' | 'cooking' | 'ready' | 'cancelled';
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_reservations: {
        Row: {
          id: string;
          business_id: string;
          table_ids: string[];
          guest_id: string | null;
          guest_name: string;
          guest_phone: string;
          guest_email: string | null;
          party_size: number;
          reservation_date: string;
          reservation_time: string;
          duration_minutes: number;
          status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
          notes: string | null;
          special_requests: string | null;
          source: 'phone' | 'website' | 'walk_in' | 'app' | 'whatsapp';
          seated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          table_ids?: string[];
          guest_id?: string | null;
          guest_name: string;
          guest_phone: string;
          guest_email?: string | null;
          party_size: number;
          reservation_date: string;
          reservation_time: string;
          duration_minutes?: number;
          status?: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
          notes?: string | null;
          special_requests?: string | null;
          source?: 'phone' | 'website' | 'walk_in' | 'app' | 'whatsapp';
          seated_at?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          table_ids: string[];
          guest_id: string | null;
          guest_name: string;
          guest_phone: string;
          guest_email: string | null;
          party_size: number;
          reservation_date: string;
          reservation_time: string;
          duration_minutes: number;
          status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
          notes: string | null;
          special_requests: string | null;
          source: 'phone' | 'website' | 'walk_in' | 'app' | 'whatsapp';
          seated_at: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_guest_profiles: {
        Row: {
          id: string;
          business_id: string;
          first_name: string;
          last_name: string | null;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          visit_count: number;
          total_lifetime_spend: number;
          average_check: number;
          last_visit_date: string | null;
          favorite_items: string[] | null;
          dietary_restrictions: string[] | null;
          allergy_codes: string[];
          allergies: string[] | null;
          seating_preference: 'booth' | 'table' | 'patio' | 'bar' | 'any';
          noise_preference: 'quiet' | 'lively' | 'any' | null;
          preferred_server_id: string | null;
          notes: string | null;
          tags: string[];
          birthdate: string | null;
          anniversary: string | null;
          vip_level: number;
          marketing_opt_in: boolean;
          whatsapp_opt_in: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          first_name: string;
          last_name?: string | null;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          visit_count?: number;
          total_lifetime_spend?: number;
          average_check?: number;
          last_visit_date?: string | null;
          favorite_items?: string[] | null;
          dietary_restrictions?: string[] | null;
          allergy_codes?: string[];
          allergies?: string[] | null;
          seating_preference?: 'booth' | 'table' | 'patio' | 'bar' | 'any';
          noise_preference?: 'quiet' | 'lively' | 'any' | null;
          preferred_server_id?: string | null;
          notes?: string | null;
          tags?: string[];
          birthdate?: string | null;
          anniversary?: string | null;
          vip_level?: number;
          marketing_opt_in?: boolean;
          whatsapp_opt_in?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          first_name: string;
          last_name: string | null;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          visit_count: number;
          total_lifetime_spend: number;
          average_check: number;
          last_visit_date: string | null;
          favorite_items: string[] | null;
          dietary_restrictions: string[] | null;
          allergy_codes: string[];
          allergies: string[] | null;
          seating_preference: 'booth' | 'table' | 'patio' | 'bar' | 'any';
          noise_preference: 'quiet' | 'lively' | 'any' | null;
          preferred_server_id: string | null;
          notes: string | null;
          tags: string[];
          birthdate: string | null;
          anniversary: string | null;
          vip_level: number;
          marketing_opt_in: boolean;
          whatsapp_opt_in: boolean;
          created_at: string;
          updated_at: string;
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
          total_discounts: number;
          total_refunds: number;
          total_voids: number;
          total_expenses: number;
          total_labor_cost: number;
          net_profit: number;
          total_covers: number;
          total_orders: number;
          average_check: number;
          currency: string | null;
          closed_by: string | null;
          created_at: string;
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
          total_discounts?: number;
          total_refunds?: number;
          total_voids?: number;
          total_expenses?: number;
          total_labor_cost?: number;
          net_profit?: number;
          total_covers?: number;
          total_orders?: number;
          average_check?: number;
          currency?: string | null;
          closed_by?: string | null;
          created_at?: string;
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
          total_discounts: number;
          total_refunds: number;
          total_voids: number;
          total_expenses: number;
          total_labor_cost: number;
          net_profit: number;
          total_covers: number;
          total_orders: number;
          average_check: number;
          currency: string | null;
          closed_by: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      staff_shifts: {
        Row: {
          id: string;
          report_id: string;
          staff_id: string;
          clock_in: string;
          clock_out: string | null;
          hours_worked: number;
          total_pay: number;
          tips_earned: number;
          sales_total: number;
          orders_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          staff_id: string;
          clock_in: string;
          clock_out?: string | null;
          hours_worked?: number;
          total_pay?: number;
          tips_earned?: number;
          sales_total?: number;
          orders_count?: number;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          report_id: string;
          staff_id: string;
          clock_in: string;
          clock_out: string | null;
          hours_worked: number;
          total_pay: number;
          tips_earned: number;
          sales_total: number;
          orders_count: number;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_branches: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          address: string | null;
          phone: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          name_he?: string | null;
          name_ar?: string | null;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          address: string | null;
          phone: string | null;
          is_active: boolean;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_waitlist: {
        Row: {
          id: string;
          business_id: string;
          guest_name: string;
          guest_phone: string;
          party_size: number;
          estimated_wait_minutes: number;
          quoted_wait_minutes: number;
          check_in_time: string;
          status: 'waiting' | 'notified' | 'seated' | 'left' | 'no_show';
          notes: string | null;
          notification_sent_at: string | null;
          seated_at: string | null;
          table_id: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          guest_name: string;
          guest_phone: string;
          party_size: number;
          estimated_wait_minutes?: number;
          quoted_wait_minutes?: number;
          check_in_time?: string;
          status?: 'waiting' | 'notified' | 'seated' | 'left' | 'no_show';
          notes?: string | null;
          notification_sent_at?: string | null;
          seated_at?: string | null;
          table_id?: string | null;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          guest_name: string;
          guest_phone: string;
          party_size: number;
          estimated_wait_minutes: number;
          quoted_wait_minutes: number;
          check_in_time: string;
          status: 'waiting' | 'notified' | 'seated' | 'left' | 'no_show';
          notes: string | null;
          notification_sent_at: string | null;
          seated_at: string | null;
          table_id: string | null;
        }>;
        Relationships: [];
      };

      restaurant_settings: {
        Row: {
          business_id: string;
          default_tax_rate: number;
          currency: string;
          timezone: string;
          language: string;
          auto_print_kitchen_tickets: boolean;
          auto_print_receipts: boolean;
          require_table_for_dine_in: boolean;
          allow_negative_inventory: boolean;
          default_tip_percentages: number[];
          service_charge_percent: number | null;
          auto_close_time: string | null;
          expected_table_turnover_minutes: number;
          kitchen_alert_thresholds: Json;
          whatsapp_enabled: boolean;
        };
        Insert: {
          business_id: string;
          default_tax_rate?: number;
          currency?: string;
          timezone?: string;
          language?: string;
          auto_print_kitchen_tickets?: boolean;
          auto_print_receipts?: boolean;
          require_table_for_dine_in?: boolean;
          allow_negative_inventory?: boolean;
          default_tip_percentages?: number[];
          service_charge_percent?: number | null;
          auto_close_time?: string | null;
          expected_table_turnover_minutes?: number;
          kitchen_alert_thresholds?: Json;
          whatsapp_enabled?: boolean;
        };
        Update: Partial<{
          business_id: string;
          default_tax_rate: number;
          currency: string;
          timezone: string;
          language: string;
          auto_print_kitchen_tickets: boolean;
          auto_print_receipts: boolean;
          require_table_for_dine_in: boolean;
          allow_negative_inventory: boolean;
          default_tip_percentages: number[];
          service_charge_percent: number | null;
          auto_close_time: string | null;
          expected_table_turnover_minutes: number;
          kitchen_alert_thresholds: Json;
          whatsapp_enabled: boolean;
        }>;
        Relationships: [];
      };

      restaurant_ingredients: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          unit: string;
          current_stock: number;
          alert_threshold: number;
          cost_per_unit: number;
          supplier: string | null;
          sku: string | null;
          is_active: boolean;
          last_restock_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          name_he?: string | null;
          name_ar?: string | null;
          unit: string;
          current_stock?: number;
          alert_threshold?: number;
          cost_per_unit?: number;
          supplier?: string | null;
          sku?: string | null;
          is_active?: boolean;
          last_restock_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          name: string;
          name_he: string | null;
          name_ar: string | null;
          unit: string;
          current_stock: number;
          alert_threshold: number;
          cost_per_unit: number;
          supplier: string | null;
          sku: string | null;
          is_active: boolean;
          last_restock_date: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };

      restaurant_recipes: {
        Row: {
          id: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity_required: number;
          unit: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity_required: number;
          unit?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity_required: number;
          unit: string | null;
          notes: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_notifications: {
        Row: {
          id: string;
          business_id: string;
          type: string;
          title: string;
          message: string | null;
          reference_id: string | null;
          is_read: boolean;
          priority: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          type: string;
          title: string;
          message?: string | null;
          reference_id?: string | null;
          is_read?: boolean;
          priority?: string;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          type: string;
          title: string;
          message: string | null;
          reference_id: string | null;
          is_read: boolean;
          priority: string;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_printers: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          device_name: string;
          type: 'receipt' | 'kitchen' | 'label';
          paper_width: number;
          is_default: boolean;
          is_active: boolean;
          station: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          device_name: string;
          type: 'receipt' | 'kitchen' | 'label';
          paper_width?: number;
          is_default?: boolean;
          is_active?: boolean;
          station?: string | null;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          name: string;
          device_name: string;
          type: 'receipt' | 'kitchen' | 'label';
          paper_width: number;
          is_default: boolean;
          is_active: boolean;
          station: string | null;
        }>;
        Relationships: [];
      };

      restaurant_menu_item_modifier_groups: {
        Row: {
          menu_item_id: string;
          modifier_group_id: string;
          sort_order: number;
        };
        Insert: {
          menu_item_id: string;
          modifier_group_id: string;
          sort_order?: number;
        };
        Update: Partial<{
          menu_item_id: string;
          modifier_group_id: string;
          sort_order: number;
        }>;
        Relationships: [];
      };

      restaurant_payments: {
        Row: {
          id: string;
          business_id: string;
          order_id: string;
          amount: number;
          method: 'cash' | 'card' | 'bit' | 'split';
          tip_amount: number;
          status: 'pending' | 'completed' | 'refunded' | 'failed';
          processed_by: string;
          processed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          order_id: string;
          amount: number;
          method: 'cash' | 'card' | 'bit' | 'split';
          tip_amount?: number;
          status?: 'pending' | 'completed' | 'refunded' | 'failed';
          processed_by: string;
          processed_at?: string;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          order_id: string;
          amount: number;
          method: 'cash' | 'card' | 'bit' | 'split';
          tip_amount: number;
          status: 'pending' | 'completed' | 'refunded' | 'failed';
          processed_by: string;
          processed_at: string;
          created_at: string;
        }>;
        Relationships: [];
      };

      business_settings: {
        Row: {
          id: string;
          business_id: string;
          operation_mode: 'travel' | 'restaurant' | 'market';
          theme: 'light' | 'dark' | 'system';
          language: string;
          currency: string;
          market_scale_prefix: string | null;
          market_scale_port: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          operation_mode?: 'travel' | 'restaurant' | 'market';
          theme?: 'light' | 'dark' | 'system';
          language?: string;
          currency?: string;
          market_scale_prefix?: string | null;
          market_scale_port?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          operation_mode: 'travel' | 'restaurant' | 'market';
          theme: 'light' | 'dark' | 'system';
          language: string;
          currency: string;
          market_scale_prefix: string | null;
          market_scale_port: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };

    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      delete_menu_item_secure: {
        Args: {
          p_item_id: string;
        };
        Returns: void;
      };
      delete_staff_secure: {
        Args: {
          p_staff_id: string;
        };
        Returns: void;
      };
      log_business_activity_v2: {
        Args: {
          p_activity_type: string;
          p_details: Json;
          p_business_id?: string;
          p_entity_type?: string;
          p_entity_id?: string;
          p_staff_id?: string;
        };
        Returns: void;
      };
      authorize_staff_action: {
        Args: {
          p_pin_code: string;
          p_business_id: string;
          p_required_role: string | null;
        };
        Returns: Json;
      };
      close_business_day_secure: {
        Args: {
          p_auth_staff_id: string;
          p_date: string;
          p_shifts: Json;
          p_expenses: Json;
        };
        Returns: string;
      };
      void_order_item_secure: {
        Args: {
          p_item_id: string;
          p_reason: string;
          p_auth_staff_id: string;
        };
        Returns: void;
      };
      create_kitchen_ticket: {
        Args: {
          p_order_id: string;
          p_station: string | null;
        };
        Returns: string;
      };
      apply_discount_secure: {
        Args: {
          p_order_id: string;
          p_discount_amount: number;
          p_discount_percentage: number;
          p_reason: string;
          p_auth_staff_id: string;
        };
        Returns: void;
      };
      authenticate_staff: {
        Args: {
          p_email: string;
          p_password: string;
        };
        Returns: Json;
      };
      check_email_exists: {
        Args: {
          p_email: string;
        };
        Returns: Json;
      };
      get_trip_years: {
        Args: Record<PropertyKey, never>;
        Returns: {
          year: string;
        }[];
      };
      get_trips_by_year: {
        Args: {
          year_input: string;
        };
        Returns: Database['public']['Tables']['trips']['Row'][];
      };
      get_yearly_stats_overview: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };

    Enums: {
      [_ in never]: never;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
