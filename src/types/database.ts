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
          payment_method: 'card' | 'cash' | 'mixed' | null;
          card_paid_amount: number | null;
          cash_paid_amount: number | null;
          source_template_id: string | null;
          source_template_name: string | null;
          room_type: Json;
          board_basis: string | null;
          hotel_name: string | null;
          service_type: 'ticket' | 'hotel' | 'both';
          trip_type: 'one_way' | 'round_trip' | null;
          airline_name: string | null;
          flight_number: string | null;
          booking_reference: string | null;
          departure_airport: string | null;
          arrival_airport: string | null;
          departure_datetime: string | null;
          arrival_datetime: string | null;
          return_flight_number: string | null;
          return_departure_airport: string | null;
          return_arrival_airport: string | null;
          return_departure_datetime: string | null;
          return_arrival_datetime: string | null;
          ticket_class: 'economy' | 'premium_economy' | 'business' | 'first' | null;
          ticket_cost_ils: number | null;
          ticket_notes: string | null;
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
          deleted_at: string | null;
          deleted_by: string | null;
          search_document: string;
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
          payment_method?: 'card' | 'cash' | 'mixed' | null;
          card_paid_amount?: number | null;
          cash_paid_amount?: number | null;
          source_template_id?: string | null;
          source_template_name?: string | null;
          room_type?: Json;
          board_basis?: string | null;
          hotel_name?: string | null;
          service_type?: 'ticket' | 'hotel' | 'both';
          trip_type?: 'one_way' | 'round_trip' | null;
          airline_name?: string | null;
          flight_number?: string | null;
          booking_reference?: string | null;
          departure_airport?: string | null;
          arrival_airport?: string | null;
          departure_datetime?: string | null;
          arrival_datetime?: string | null;
          return_flight_number?: string | null;
          return_departure_airport?: string | null;
          return_arrival_airport?: string | null;
          return_departure_datetime?: string | null;
          return_arrival_datetime?: string | null;
          ticket_class?: 'economy' | 'premium_economy' | 'business' | 'first' | null;
          ticket_cost_ils?: number | null;
          ticket_notes?: string | null;
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
          deleted_at?: string | null;
          deleted_by?: string | null;
          search_document?: string;
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
          payment_method?: 'card' | 'cash' | 'mixed' | null;
          card_paid_amount?: number | null;
          cash_paid_amount?: number | null;
          source_template_id?: string | null;
          source_template_name?: string | null;
          room_type?: Json;
          board_basis?: string | null;
          hotel_name?: string | null;
          service_type?: 'ticket' | 'hotel' | 'both';
          trip_type?: 'one_way' | 'round_trip' | null;
          airline_name?: string | null;
          flight_number?: string | null;
          booking_reference?: string | null;
          departure_airport?: string | null;
          arrival_airport?: string | null;
          departure_datetime?: string | null;
          arrival_datetime?: string | null;
          return_flight_number?: string | null;
          return_departure_airport?: string | null;
          return_arrival_airport?: string | null;
          return_departure_datetime?: string | null;
          return_arrival_datetime?: string | null;
          ticket_class?: 'economy' | 'premium_economy' | 'business' | 'first' | null;
          ticket_cost_ils?: number | null;
          ticket_notes?: string | null;
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
          deleted_at?: string | null;
          deleted_by?: string | null;
          search_document?: string;
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

      car_parts: {
        Row: {
          id: string;
          business_id: string;
          part_name: string;
          description: string | null;
          serial_number: string | null;
          compatible_cars: string[] | null;
          quantity: number;
          purchase_price_unit: number | null;
          purchase_price_total: number | null;
          selling_price_unit: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id?: string;
          part_name: string;
          description?: string | null;
          serial_number?: string | null;
          compatible_cars?: string[] | null;
          quantity?: number;
          purchase_price_unit?: number | null;
          purchase_price_total?: number | null;
          selling_price_unit?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          part_name: string;
          description: string | null;
          serial_number: string | null;
          compatible_cars: string[] | null;
          quantity: number;
          purchase_price_unit: number | null;
          purchase_price_total: number | null;
          selling_price_unit: number | null;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };

      customer_vehicles: {
        Row: {
          id: string;
          business_id: string;
          plate_number: string;
          owner_name: string;
          owner_phone: string;
          model: string | null;
          vin: string | null;
          color: string | null;
          year: number | null;
          last_odometer: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          plate_number: string;
          owner_name: string;
          owner_phone: string;
          model?: string | null;
          vin?: string | null;
          color?: string | null;
          year?: number | null;
          last_odometer?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          plate_number: string;
          owner_name: string;
          owner_phone: string;
          model: string | null;
          vin: string | null;
          color: string | null;
          year: number | null;
          last_odometer: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };

      customers_ledger: {
        Row: {
          id: string;
          business_id: string;
          customer_phone: string;
          customer_name: string | null;
          transaction_type: 'invoice' | 'payment' | 'adjustment' | 'opening_balance';
          debit: number | null;
          credit: number | null;
          balance: number | null;
          ref_order_id: string | null;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_phone: string;
          customer_name?: string | null;
          transaction_type: 'invoice' | 'payment' | 'adjustment' | 'opening_balance';
          debit?: number | null;
          credit?: number | null;
          balance?: number | null;
          ref_order_id?: string | null;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          customer_phone: string;
          customer_name: string | null;
          transaction_type: 'invoice' | 'payment' | 'adjustment' | 'opening_balance';
          debit: number | null;
          credit: number | null;
          balance: number | null;
          ref_order_id: string | null;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        }>;
        Relationships: [];
      };

      repair_orders: {
        Row: {
          id: string;
          business_id: string;
          vehicle_id: string;
          customer_id: string | null;
          status: 'pending' | 'diagnostics' | 'waiting_parts' | 'working' | 'completed' | 'cancelled';
          odometer_reading: number | null;
          problem_description: string | null;
          technician_notes: string | null;
          estimated_completion: string | null;
          completed_at: string | null;
          parts_total: number | null;
          labor_total: number | null;
          discount: number | null;
          total_amount: number | null;
          paid_amount: number | null;
          payment_status: 'paid' | 'partial' | 'unpaid';
          payment_method: string | null;
          currency: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          vehicle_id: string;
          customer_id?: string | null;
          status?: 'pending' | 'diagnostics' | 'waiting_parts' | 'working' | 'completed' | 'cancelled';
          odometer_reading?: number | null;
          problem_description?: string | null;
          technician_notes?: string | null;
          estimated_completion?: string | null;
          completed_at?: string | null;
          parts_total?: number | null;
          labor_total?: number | null;
          discount?: number | null;
          total_amount?: number | null;
          paid_amount?: number | null;
          payment_status?: 'paid' | 'partial' | 'unpaid';
          payment_method?: string | null;
          currency?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          vehicle_id: string;
          customer_id: string | null;
          status: 'pending' | 'diagnostics' | 'waiting_parts' | 'working' | 'completed' | 'cancelled';
          odometer_reading: number | null;
          problem_description: string | null;
          technician_notes: string | null;
          estimated_completion: string | null;
          completed_at: string | null;
          parts_total: number | null;
          labor_total: number | null;
          discount: number | null;
          total_amount: number | null;
          paid_amount: number | null;
          payment_status: 'paid' | 'partial' | 'unpaid';
          payment_method: string | null;
          currency: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };

      repair_order_items: {
        Row: {
          id: string;
          order_id: string;
          type: 'part' | 'labor';
          inventory_item_id: string | null;
          name: string;
          quantity: number | null;
          cost: number | null;
          price: number | null;
          warranty_days: number | null;
          mechanic_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          type: 'part' | 'labor';
          inventory_item_id?: string | null;
          name: string;
          quantity?: number | null;
          cost?: number | null;
          price?: number | null;
          warranty_days?: number | null;
          mechanic_id?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          order_id: string;
          type: 'part' | 'labor';
          inventory_item_id: string | null;
          name: string;
          quantity: number | null;
          cost: number | null;
          price: number | null;
          warranty_days: number | null;
          mechanic_id: string | null;
          created_at: string;
        }>;
        Relationships: [];
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
          user_id: string | null;
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
          assigned_tables: string[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id?: string | null;
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
          assigned_tables?: string[] | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          user_id: string | null;
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
          assigned_tables: string[] | null;
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

      restaurant_historical_data: {
        Row: {
          id: string;
          business_id: string;
          date: string;
          day_of_week: number;
          covers: number;
          revenue: number;
          orders: number;
          weather: string | null;
          temperature: number | null;
          was_holiday: boolean | null;
          special_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          date: string;
          day_of_week: number;
          covers: number;
          revenue: number;
          orders: number;
          weather?: string | null;
          temperature?: number | null;
          was_holiday?: boolean | null;
          special_notes?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          date: string;
          day_of_week: number;
          covers: number;
          revenue: number;
          orders: number;
          weather: string | null;
          temperature: number | null;
          was_holiday: boolean | null;
          special_notes: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      restaurant_demand_forecasts: {
        Row: {
          id: string;
          business_id: string;
          forecast_date: string;
          day_of_week: number;
          predicted_covers: number;
          predicted_revenue: number;
          predicted_orders: number;
          confidence_score: number | null;
          weather_condition: string | null;
          temperature: number | null;
          local_events: string[] | null;
          is_holiday: boolean | null;
          staffing_recommendation: Json | null;
          prep_recommendations: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          forecast_date: string;
          day_of_week: number;
          predicted_covers: number;
          predicted_revenue: number;
          predicted_orders: number;
          confidence_score?: number | null;
          weather_condition?: string | null;
          temperature?: number | null;
          local_events?: string[] | null;
          is_holiday?: boolean | null;
          staffing_recommendation?: Json | null;
          prep_recommendations?: Json | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          business_id: string;
          forecast_date: string;
          day_of_week: number;
          predicted_covers: number;
          predicted_revenue: number;
          predicted_orders: number;
          confidence_score: number | null;
          weather_condition: string | null;
          temperature: number | null;
          local_events: string[] | null;
          is_holiday: boolean | null;
          staffing_recommendation: Json | null;
          prep_recommendations: Json | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      trip_financial_audit: {
        Row: { id: number; trip_id: string; user_id: string; actor_user_id: string | null; changed_at: string; changed_field: string; previous_value: Json | null; new_value: Json | null; operation_type: string };
        Insert: { id?: number; trip_id: string; user_id: string; actor_user_id?: string | null; changed_at?: string; changed_field: string; previous_value?: Json | null; new_value?: Json | null; operation_type: string };
        Update: never;
        Relationships: [];
      };
      trip_attachment_cleanup_queue: {
        Row: { id: number; trip_id: string; user_id: string; attachments: Json; status: 'pending' | 'processing' | 'completed' | 'failed'; attempts: number; last_error: string | null; last_attempted_at: string | null; next_retry_at: string; created_at: string; completed_at: string | null };
        Insert: { id?: number; trip_id: string; user_id: string; attachments?: Json; status?: 'pending' | 'processing' | 'completed' | 'failed'; attempts?: number; last_error?: string | null; last_attempted_at?: string | null; next_retry_at?: string; created_at?: string; completed_at?: string | null };
        Update: Partial<Database['public']['Tables']['trip_attachment_cleanup_queue']['Insert']>;
        Relationships: [];
      };
      trip_activity_log: {
        Row: { id: number; trip_id: string; user_id: string; actor_user_id: string | null; activity_type: string; metadata: Json; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      trip_templates: {
        Row: { id: string; user_id: string; name: string; description: string | null; template_data: Json; template_type: 'full_trip' | 'itinerary' | 'hotel' | 'transportation' | 'pricing' | 'checklist' | 'message'; is_favorite: boolean; usage_count: number; last_used_at: string | null; status: 'active' | 'archived'; deleted_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; name: string; description?: string | null; template_data?: Json; template_type?: 'full_trip' | 'itinerary' | 'hotel' | 'transportation' | 'pricing' | 'checklist' | 'message'; is_favorite?: boolean; usage_count?: number; last_used_at?: string | null; status?: 'active' | 'archived'; deleted_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['trip_templates']['Insert']>;
        Relationships: [];
      };
      trip_notification_settings: {
        Row: { user_id: string; timezone: string; upcoming_enabled: boolean; upcoming_days: number; trip_reminder_days: number[]; payment_enabled: boolean; payment_reminder_days: number[]; cleanup_enabled: boolean; retention_enabled: boolean; updated_at: string };
        Insert: { user_id: string; timezone?: string; upcoming_enabled?: boolean; upcoming_days?: number; trip_reminder_days?: number[]; payment_enabled?: boolean; payment_reminder_days?: number[]; cleanup_enabled?: boolean; retention_enabled?: boolean; updated_at?: string };
        Update: Partial<Database['public']['Tables']['trip_notification_settings']['Insert']>;
        Relationships: [];
      };
      trip_notifications: {
        Row: { id: string; user_id: string; trip_id: string | null; notification_type: string; title_key: string; body_key: string; params: Json; dedupe_key: string; read_at: string | null; snoozed_until: string | null; dismissed_at: string | null; completed_at: string | null; scheduled_for: string; created_at: string };
        Insert: never;
        Update: { read_at?: string | null; snoozed_until?: string | null; dismissed_at?: string | null; completed_at?: string | null };
        Relationships: [];
      };
      trip_payment_plans: {
        Row: { id: string; trip_id: string; user_id: string; payment_method: 'card' | 'cash' | 'mixed'; currency: string; card_total_minor: number; cash_total_minor: number; card_paid_minor: number; cash_paid_minor: number; installment_count: number; first_installment_date: string | null; source: 'native' | 'legacy'; status: 'active' | 'completed' | 'cancelled'; notes: string | null; deleted_at: string | null; created_at: string; updated_at: string };
        Insert: never; Update: never; Relationships: [];
      };
      trip_installments: {
        Row: { id: string; payment_plan_id: string; trip_id: string; user_id: string; installment_number: number; due_date: string; expected_amount_minor: number; paid_amount_minor: number; paid_at: string | null; status: 'scheduled' | 'paid' | 'partially_paid' | 'cancelled'; notes: string | null; created_at: string; updated_at: string };
        Insert: never; Update: never; Relationships: [];
      };
      trip_installment_events: {
        Row: { id: number; installment_id: string; trip_id: string; user_id: string; actor_user_id: string | null; event_type: string; previous_state: Json | null; new_state: Json | null; created_at: string };
        Insert: never; Update: never; Relationships: [];
      };
      trip_payment_events: {
        Row: { id: number; payment_plan_id: string; trip_id: string; user_id: string; actor_user_id: string | null; event_type: string; previous_state: Json | null; new_state: Json | null; created_at: string };
        Insert: never; Update: never; Relationships: [];
      };
      trip_packing_lists: {
        Row: { id: string; trip_id: string | null; user_id: string; name: string; is_template: boolean; items: Json; deleted_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; trip_id?: string | null; user_id: string; name: string; is_template?: boolean; items?: Json; deleted_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['trip_packing_lists']['Insert']>; Relationships: [];
      };
      trip_pricing_preferences: {
        Row: { user_id: string; default_target_markup: number; minimum_profit_minor: number; currency: string; updated_at: string };
        Insert: { user_id: string; default_target_markup?: number; minimum_profit_minor?: number; currency?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['trip_pricing_preferences']['Insert']>; Relationships: [];
      };
      trip_whatsapp_templates: {
        Row: { id: string; user_id: string; name: string; body: string; language: 'en' | 'he' | 'ar'; category: string; is_favorite: boolean; is_archived: boolean; usage_count: number; last_used_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; name: string; body: string; language?: 'en' | 'he' | 'ar'; category?: string; is_favorite?: boolean; is_archived?: boolean; usage_count?: number; last_used_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['trip_whatsapp_templates']['Insert']>;
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
          email_input: string;
        };
        Returns: boolean;
      };
      add_repair_service_transaction: {
        Args: {
          p_order_id: string;
          p_items: Json;
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
      get_trips_page: {
        Args: {
          p_year: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string | null;
          p_payment_status?: string | null;
          p_trip_status?: string | null;
          p_month?: number | null;
          p_destination?: string | null;
        };
        Returns: Json;
      };
      get_trip_details: {
        Args: {
          p_trip_id: string;
        };
        Returns: Json;
      };
      get_trip_dashboard_items: {
        Args: {
          p_year: string;
        };
        Returns: Json;
      };
      purge_deleted_trips: {
        Args: {
          p_retention_days?: number;
        };
        Returns: number;
      };
      retry_trip_attachment_cleanup: { Args: { p_job_id: number }; Returns: boolean };
      get_trip_activity_page: { Args: { p_trip_id: string; p_page?: number; p_page_size?: number; p_type?: string | null }; Returns: Json };
      get_trip_financial_audit_page: { Args: { p_trip_id: string; p_page?: number; p_page_size?: number }; Returns: Json };
      get_deleted_trips_page: { Args: { p_page?: number; p_page_size?: number; p_search?: string | null }; Returns: Json };
      restore_deleted_trips: { Args: { p_trip_ids: string[] }; Returns: number };
      permanently_delete_trips: { Args: { p_trip_ids: string[] }; Returns: number };
      log_trip_activity: { Args: { p_trip_id: string; p_activity_type: string; p_metadata?: Json }; Returns: number };
      claim_trip_pdf_generation: { Args: Record<PropertyKey, never>; Returns: boolean };
      generate_trip_notifications: { Args: { p_now?: string }; Returns: number };
      create_trip_event_notification: { Args: { p_trip_id: string; p_event_type: string }; Returns: string };
      use_trip_template: { Args: { p_template_id: string }; Returns: Json };
      create_trip_payment_plan: { Args: { p_trip_id: string; p_payment_method: string; p_currency: string; p_card_total_minor: number; p_cash_total_minor: number; p_installment_count: number; p_first_installment_date: string; p_notes?: string | null }; Returns: string };
      record_trip_installment_payment: { Args: { p_installment_id: string; p_paid_amount_minor: number; p_paid_at: string; p_notes?: string | null }; Returns: Json };
      reschedule_trip_installment: { Args: { p_installment_id: string; p_due_date: string }; Returns: Json };
      record_trip_cash_payment: { Args: { p_payment_plan_id: string; p_paid_amount_minor: number; p_paid_at: string; p_notes?: string | null }; Returns: Json };
      recalculate_future_trip_installments: { Args: { p_payment_plan_id: string; p_new_card_total_minor: number }; Returns: number };
      mark_all_trip_notifications_read: { Args: Record<PropertyKey, never>; Returns: number };
      get_travel_reports: { Args: { p_start_date: string; p_end_date: string; p_currency?: string | null; p_destination?: string | null; p_include_archived?: boolean }; Returns: Json };
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
