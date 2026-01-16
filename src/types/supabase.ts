export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      trips: {
        Row: {
          id: string
          user_id: string
          destination: string
          client_name: string
          travelers_count: number
          start_date: string
          end_date: string
          wholesale_cost: number
          sale_price: number
          currency: 'USD' | 'EUR' | 'ILS' // Added
          exchange_rate: number // Added
          payments: Json[] | null // Added
          attachments: Json[] | null // Added
          payment_date: string | null // Added
          room_type: string | null // Added
          board_basis: string | null // Added
          itinerary: Json[] | null // Added
          travelers: Json[] | null // Added
          profit: number
          profit_percentage: number
          payment_status: 'paid' | 'partial' | 'unpaid'
          amount_paid: number
          amount_due: number
          notes: string
          status: 'active' | 'completed' | 'cancelled' | 'archived'
          export_to_pdf: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          destination: string
          client_name: string
          travelers_count: number
          start_date: string
          end_date: string
          wholesale_cost: number
          sale_price: number
          currency?: 'USD' | 'EUR' | 'ILS' // Added
          exchange_rate?: number // Added
          payments?: Json[] | null // Added
          attachments?: Json[] | null // Added
          payment_date?: string | null // Added
          room_type?: string | null // Added
          board_basis?: string | null // Added
          itinerary?: Json[] | null // Added
          travelers?: Json[] | null // Added
          payment_status: 'paid' | 'partial' | 'unpaid'
          amount_paid: number
          notes?: string
          status: 'active' | 'completed' | 'cancelled' | 'archived'
          export_to_pdf?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          destination?: string
          client_name?: string
          travelers_count?: number
          start_date?: string
          end_date?: string
          wholesale_cost?: number
          sale_price?: number
          currency?: 'USD' | 'EUR' | 'ILS' // Added
          exchange_rate?: number // Added
          payments?: Json[] | null // Added
          attachments?: Json[] | null // Added
          itinerary?: Json[] | null // Added
          travelers?: Json[] | null // Added
          room_type?: string | null // Added
          board_basis?: string | null // Added
          payment_status?: 'paid' | 'partial' | 'unpaid'
          amount_paid?: number
          notes?: string
          status?: 'active' | 'completed' | 'cancelled' | 'archived'
          export_to_pdf?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'trips_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }

      user_profiles: {
        Row: {
          id: string
          user_id: string
          full_name: string
          phone_number: string | null
          role: 'user' | 'admin'
          is_suspended: boolean
          email: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name: string
          phone_number?: string | null
          role?: 'user' | 'admin'
          is_suspended?: boolean
          email?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string
          phone_number?: string | null
          role?: 'user' | 'admin'
          is_suspended?: boolean
          email?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_profiles_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }

      business_profiles: {
        Row: {
          id: string
          user_id: string
          business_name: string
          logo_url: string | null
          preferred_currency: 'USD' | 'EUR' | 'ILS'
          preferred_language: 'en' | 'ar' | 'he'
          phone_number: string | null // Added manually to fix receipt type error
          business_registration_number: string | null // Added
          signature_url: string | null // Added
          business_type: 'tourism' | 'restaurant' | 'supermarket' | 'phone_shop' | 'car_parts' | 'clothes_shop' | 'furniture_store'
          subscription_status: 'active' | 'past_due' | 'trial'
          trial_start_date: string | null
          is_suspended: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          business_name: string
          logo_url?: string | null
          preferred_currency?: 'USD' | 'EUR' | 'ILS'
          preferred_language?: 'en' | 'ar' | 'he'
          phone_number?: string | null // Added manually
          business_registration_number?: string | null // Added
          signature_url?: string | null // Added
          business_type?: 'tourism' | 'restaurant' | 'supermarket' | 'phone_shop' | 'car_parts' | 'clothes_shop' | 'furniture_store'
          subscription_status?: 'active' | 'past_due' | 'trial'
          trial_start_date?: string | null
          is_suspended?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          business_name?: string
          logo_url?: string | null
          preferred_currency?: 'USD' | 'EUR' | 'ILS'
          preferred_language?: 'en' | 'ar' | 'he'
          phone_number?: string | null // Added manually
          business_registration_number?: string | null // Added
          signature_url?: string | null // Added
          business_type?: 'tourism' | 'restaurant' | 'supermarket' | 'phone_shop' | 'car_parts' | 'clothes_shop' | 'furniture_store'
          subscription_status?: 'active' | 'past_due' | 'trial'
          trial_start_date?: string | null
          is_suspended?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'business_profiles_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }

      restaurant_tables: {
        Row: {
            id: string
            business_id: string
            name: string
            status: 'free' | 'occupied' | 'billed' | 'reserved' | 'dirty' | 'blocked'
            seats: number
            position_x: number
            position_y: number
            position_z: number | null
            rotation: number
            shape: 'round' | 'square' | 'rectangle' | 'booth' | 'bar'
            is_mergeable: boolean
            merged_with: string[] | null
            zone: 'indoor' | 'outdoor' | 'patio' | 'private' | 'bar_area'
            min_party_size: number
            max_party_size: number | null
            current_session_id: string | null
            guest_count: number | null
            elapsed_minutes: number | null
            created_at: string
            width: number
            height: number
        }
        Insert: {
            id?: string
            business_id: string
            name: string
            status?: 'free' | 'occupied' | 'billed' | 'reserved' | 'dirty' | 'blocked'
            seats?: number
            position_x?: number
            position_y?: number
            position_z?: number | null
            rotation?: number
            shape?: 'round' | 'square' | 'rectangle' | 'booth' | 'bar'
            is_mergeable?: boolean
            merged_with?: string[] | null
            zone?: 'indoor' | 'outdoor' | 'patio' | 'private' | 'bar_area'
            min_party_size?: number
            max_party_size?: number | null
            current_session_id?: string | null
            guest_count?: number | null
            elapsed_minutes?: number | null
            created_at?: string
            width?: number
            height?: number
        }
        Update: {
            id?: string
            business_id?: string
            name?: string
            status?: 'free' | 'occupied' | 'billed' | 'reserved' | 'dirty' | 'blocked'
            seats?: number
            position_x?: number
            position_y?: number
            position_z?: number | null
            rotation?: number
            shape?: 'round' | 'square' | 'rectangle' | 'booth' | 'bar'
            is_mergeable?: boolean
            merged_with?: string[] | null
            zone?: 'indoor' | 'outdoor' | 'patio' | 'private' | 'bar_area'
            min_party_size?: number
            max_party_size?: number | null
            current_session_id?: string | null
            guest_count?: number | null
            elapsed_minutes?: number | null
            created_at?: string
            width?: number
            height?: number
        }
        Relationships: []
      }

      restaurant_menu_categories: {
        Row: {
            id: string
            business_id: string
            name: string
            name_he: string | null
            name_ar: string | null
            parent_id: string | null
            is_active: boolean
            icon: string | null
            color: string | null
            sort_order: number
            created_at: string
        }
        Insert: {
            id?: string
            business_id: string
            name: string
            name_he?: string | null
            name_ar?: string | null
            parent_id?: string | null
            is_active?: boolean
            icon?: string | null
            color?: string | null
            sort_order?: number
            created_at?: string
        }
        Update: {
            id?: string
            business_id?: string
            name?: string
            name_he?: string | null
            name_ar?: string | null
            parent_id?: string | null
            is_active?: boolean
            icon?: string | null
            color?: string | null
            sort_order?: number
            created_at?: string
        }
        Relationships: [
            {
                foreignKeyName: "restaurant_menu_categories_parent_id_fkey"
                columns: ["parent_id"]
                referencedRelation: "restaurant_menu_categories"
                referencedColumns: ["id"]
            }
        ]
      }

      restaurant_menu_items: {
        Row: {
            id: string
            category_id: string
            name: string
            name_he: string | null
            name_ar: string | null
            description: string | null
            price: number
            cost_price: number
            is_available: boolean
            tax_rate: number
            prep_time_minutes: number
            station: 'grill' | 'fry' | 'salad' | 'bar' | 'expo' | 'dessert' | 'general'
            allergens: string[] | null
            calories: number | null
            image_url: string | null
            sort_order: number
            is_popular: boolean
            is_new: boolean
            available_from: string | null
            available_until: string | null
            available_days: number[] | null
            spicy_level: number
            dietary_tags: string[] | null
            created_at: string
        }
        Insert: {
            id?: string
            category_id: string
            name: string
            name_he?: string | null
            name_ar?: string | null
            description?: string | null
            price: number
            cost_price?: number
            is_available?: boolean
            tax_rate?: number
            prep_time_minutes?: number
            station?: 'grill' | 'fry' | 'salad' | 'bar' | 'expo' | 'dessert' | 'general'
            allergens?: string[] | null
            calories?: number | null
            image_url?: string | null
            sort_order?: number
            is_popular?: boolean
            is_new?: boolean
            available_from?: string | null
            available_until?: string | null
            available_days?: number[] | null
            spicy_level?: number
            dietary_tags?: string[] | null
            created_at?: string
        }
        Update: {
            id?: string
            category_id?: string
            name?: string
            name_he?: string | null
            name_ar?: string | null
            description?: string | null
            price?: number
            cost_price?: number
            is_available?: boolean
            tax_rate?: number
            prep_time_minutes?: number
            station?: 'grill' | 'fry' | 'salad' | 'bar' | 'expo' | 'dessert' | 'general'
            allergens?: string[] | null
            calories?: number | null
            image_url?: string | null
            sort_order?: number
            is_popular?: boolean
            is_new?: boolean
            available_from?: string | null
            available_until?: string | null
            available_days?: number[] | null
            spicy_level?: number
            dietary_tags?: string[] | null
            created_at?: string
        }
        Relationships: [
            {
                foreignKeyName: "restaurant_menu_items_category_id_fkey"
                columns: ["category_id"]
                referencedRelation: "restaurant_menu_categories"
                referencedColumns: ["id"]
            }
        ]
      }

      restaurant_staff: {
          Row: {
            id: string
            business_id: string
            user_id: string | null
            full_name: string
            role: 'Waiter' | 'Chef' | 'Manager' | 'Other' | 'Host' | 'Cashier' | 'Kitchen'
            restaurant_role: 'super_admin' | 'branch_manager' | 'head_chef' | 'waiter' | 'kitchen_staff' | 'cashier' | 'host'
            pin_code: string | null
            email: string | null
            phone: string | null
            hourly_rate: number
            is_active: boolean
            is_clocked_in: boolean
            clocked_in_at: string | null
            assigned_tables: string[] | null
            assigned_station: string | null
            created_at: string
          }
          Insert: {
            id?: string
            business_id: string
            user_id?: string | null
            full_name: string
            role?: 'Waiter' | 'Chef' | 'Manager' | 'Other' | 'Host' | 'Cashier' | 'Kitchen'
            restaurant_role?: 'super_admin' | 'branch_manager' | 'head_chef' | 'waiter' | 'kitchen_staff' | 'cashier' | 'host'
            pin_code?: string | null
            email?: string | null
            phone?: string | null
            hourly_rate?: number
            is_active?: boolean
            is_clocked_in?: boolean
            clocked_in_at?: string | null
            assigned_tables?: string[] | null
            assigned_station?: string | null
            created_at?: string
          }
          Update: {
            id?: string
            business_id?: string
            user_id?: string | null
            full_name?: string
            role?: 'Waiter' | 'Chef' | 'Manager' | 'Other' | 'Host' | 'Cashier' | 'Kitchen'
            restaurant_role?: 'super_admin' | 'branch_manager' | 'head_chef' | 'waiter' | 'kitchen_staff' | 'cashier' | 'host'
            pin_code?: string | null
            email?: string | null
            phone?: string | null
            hourly_rate?: number
            is_active?: boolean
            is_clocked_in?: boolean
            clocked_in_at?: string | null
            assigned_tables?: string[] | null
            assigned_station?: string | null
            created_at?: string
          }
           Relationships: []
      }

      restaurant_orders: {
          Row: {
            id: string
            business_id: string
            table_id: string | null
            session_id: string | null
            order_number: number
            order_type: 'dine_in' | 'takeaway' | 'delivery'
            server_id: string | null
            guest_id: string | null
            status: 'draft' | 'pending' | 'in_progress' | 'ready' | 'served' | 'billed' | 'open' | 'closed' | 'cancelled'
            subtotal_amount: number
            total_amount: number
            tax_amount: number
            tip_amount: number
            discount_amount: number
            discount_percentage: number
            discount_reason: string | null
            payment_method: 'cash' | 'card' | 'split' | null
            payment_status: 'pending' | 'partial' | 'paid' | 'refunded'
            is_rush: boolean
            is_vip: boolean
            course_number: number
            notes: string | null
            currency: string
            created_at: string
            closed_at: string | null
          }
          Insert: {
            id?: string
            business_id: string
            table_id?: string | null
            session_id?: string | null
            order_number?: number
            order_type?: 'dine_in' | 'takeaway' | 'delivery'
            server_id?: string | null
            guest_id?: string | null
            status?: 'draft' | 'pending' | 'in_progress' | 'ready' | 'served' | 'billed' | 'open' | 'closed' | 'cancelled'
            subtotal_amount?: number
            total_amount?: number
            tax_amount?: number
            tip_amount?: number
            discount_amount?: number
            discount_percentage?: number
            discount_reason?: string | null
            payment_method?: 'cash' | 'card' | 'split' | null
            payment_status?: 'pending' | 'partial' | 'paid' | 'refunded'
            is_rush?: boolean
            is_vip?: boolean
            course_number?: number
            notes?: string | null
            currency?: string
            created_at?: string
            closed_at?: string | null
          }
          Update: {
            id?: string
            business_id?: string
            table_id?: string | null
            session_id?: string | null
            order_number?: number
            order_type?: 'dine_in' | 'takeaway' | 'delivery'
            server_id?: string | null
            guest_id?: string | null
            status?: 'draft' | 'pending' | 'in_progress' | 'ready' | 'served' | 'billed' | 'open' | 'closed' | 'cancelled'
            subtotal_amount?: number
            total_amount?: number
            tax_amount?: number
            tip_amount?: number
            discount_amount?: number
            discount_percentage?: number
            discount_reason?: string | null
            payment_method?: 'cash' | 'card' | 'split' | null
            payment_status?: 'pending' | 'partial' | 'paid' | 'refunded'
            is_rush?: boolean
            is_vip?: boolean
            course_number?: number
            notes?: string | null
            currency?: string
            created_at?: string
            closed_at?: string | null
          }
           Relationships: [
               {
                   foreignKeyName: "restaurant_orders_table_id_fkey"
                   columns: ["table_id"]
                   referencedRelation: "restaurant_tables"
                   referencedColumns: ["id"]
               },
               {
                   foreignKeyName: "restaurant_orders_session_id_fkey"
                   columns: ["session_id"]
                   referencedRelation: "restaurant_table_sessions"
                   referencedColumns: ["id"]
               }
           ]
      }

      restaurant_order_items: {
          Row: {
            id: string
            order_id: string
            item_id: string
            quantity: number
            price_at_time: number
            notes: string | null
            status: 'pending' | 'cooking' | 'ready' | 'cancelled'
            is_fired: boolean
            course_number: number
            seat_number: number | null
            voided: boolean
            void_reason: string | null
            created_at: string
          }
          Insert: {
            id?: string
            order_id: string
            item_id: string
            quantity?: number
            price_at_time: number
            notes?: string | null
            status?: 'pending' | 'cooking' | 'ready' | 'cancelled'
            is_fired?: boolean
            course_number?: number
            seat_number?: number | null
            voided?: boolean
            void_reason?: string | null
            created_at?: string
          }
          Update: {
            id?: string
            order_id?: string
            item_id?: string
            quantity?: number
            price_at_time?: number
            notes?: string | null
            status?: 'pending' | 'cooking' | 'ready' | 'cancelled'
            is_fired?: boolean
            course_number?: number
            seat_number?: number | null
            voided?: boolean
            void_reason?: string | null
            created_at?: string
          }
           Relationships: [
               {
                   foreignKeyName: "restaurant_order_items_order_id_fkey"
                   columns: ["order_id"]
                   referencedRelation: "restaurant_orders"
                   referencedColumns: ["id"]
               },
               {
                   foreignKeyName: "restaurant_order_items_item_id_fkey"
                   columns: ["item_id"]
                   referencedRelation: "restaurant_menu_items"
                   referencedColumns: ["id"]
               }
           ]
      }

      restaurant_daily_reports: {
          Row: {
            id: string
            business_id: string
            date: string
            z_report_number: number
            total_sales_cash: number
            total_sales_card: number
            total_tax: number
            total_tips: number
            total_expenses: number
            total_labor_cost: number
            total_discounts: number
            total_refunds: number
            total_voids: number
            total_covers: number
            total_orders: number
            average_check: number
            closed_by: string | null
            category_breakdown: Json | null
            net_profit: number
            created_at: string
            currency: string
          }
          Insert: {
            id?: string
            business_id: string
            date?: string
            z_report_number?: number
            total_sales_cash?: number
            total_sales_card?: number
            total_tax?: number
            total_tips?: number
            total_expenses?: number
            total_labor_cost?: number
            total_discounts?: number
            total_refunds?: number
            total_voids?: number
            total_covers?: number
            total_orders?: number
            average_check?: number
            closed_by?: string | null
            category_breakdown?: Json | null
            net_profit?: number
            created_at?: string
            currency?: string
          }
          Update: {
            id?: string
            business_id?: string
            date?: string
            z_report_number?: number
            total_sales_cash?: number
            total_sales_card?: number
            total_tax?: number
            total_tips?: number
            total_expenses?: number
            total_labor_cost?: number
            total_discounts?: number
            total_refunds?: number
            total_voids?: number
            total_covers?: number
            total_orders?: number
            average_check?: number
            closed_by?: string | null
            category_breakdown?: Json | null
            net_profit?: number
            created_at?: string
            currency?: string
          }
           Relationships: [
               {
                   foreignKeyName: "restaurant_daily_reports_closed_by_fkey"
                   columns: ["closed_by"]
                   referencedRelation: "restaurant_staff"
                   referencedColumns: ["id"]
               }
           ]
      }
      
      staff_shifts: {
          Row: {
            id: string
            report_id: string
            staff_id: string
            hours_worked: number
            total_pay: number
            created_at: string
          }
          Insert: {
            id?: string
            report_id: string
            staff_id: string
            hours_worked?: number
            total_pay?: number
            created_at?: string
          }
          Update: {
            id?: string
            report_id?: string
            staff_id?: string
            hours_worked?: number
            total_pay?: number
            created_at?: string
          }
           Relationships: [
               {
                   foreignKeyName: "staff_shifts_report_id_fkey"
                   columns: ["report_id"]
                   referencedRelation: "restaurant_daily_reports"
                   referencedColumns: ["id"]
               },
               {
                   foreignKeyName: "staff_shifts_staff_id_fkey"
                   columns: ["staff_id"]
                   referencedRelation: "restaurant_staff"
                   referencedColumns: ["id"]
               }
           ]
      }

      restaurant_modifier_groups: {
        Row: {
          id: string
          business_id: string
          name: string
          is_required: boolean
          min_selections: number
          max_selections: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          is_required?: boolean
          min_selections?: number
          max_selections?: number
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          is_required?: boolean
          min_selections?: number
          max_selections?: number
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }

      restaurant_modifiers: {
        Row: {
          id: string
          group_id: string
          name: string
          price_adjustment: number
          is_available: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          name: string
          price_adjustment?: number
          is_available?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          name?: string
          price_adjustment?: number
          is_available?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_modifiers_group_id_fkey"
            columns: ["group_id"]
            referencedRelation: "restaurant_modifier_groups"
            referencedColumns: ["id"]
          }
        ]
      }

      restaurant_item_modifier_groups: {
        Row: {
          item_id: string
          group_id: string
        }
        Insert: {
          item_id: string
          group_id: string
        }
        Update: {
          item_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_item_modifier_groups_item_id_fkey"
            columns: ["item_id"]
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_item_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            referencedRelation: "restaurant_modifier_groups"
            referencedColumns: ["id"]
          }
        ]
      }

      restaurant_order_item_modifiers: {
        Row: {
          id: string
          order_item_id: string
          modifier_id: string | null
          modifier_name: string
          price_adjustment: number
          created_at: string
        }
        Insert: {
          id?: string
          order_item_id: string
          modifier_id?: string | null
          modifier_name: string
          price_adjustment?: number
          created_at?: string
        }
        Update: {
          id?: string
          order_item_id?: string
          modifier_id?: string | null
          modifier_name?: string
          price_adjustment?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_order_item_modifiers_order_item_id_fkey"
            columns: ["order_item_id"]
            referencedRelation: "restaurant_order_items"
            referencedColumns: ["id"]
          }
        ]
      }

      restaurant_kitchen_tickets: {
        Row: {
          id: string
          business_id: string
          order_id: string
          table_name: string | null
          station: string | null
          status: 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled'
          priority: number
          created_at: string
          started_at: string | null
          completed_at: string | null
          served_at: string | null
        }
        Insert: {
          id?: string
          business_id: string
          order_id: string
          table_name?: string | null
          station?: string | null
          status?: 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled'
          priority?: number
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          served_at?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          order_id?: string
          table_name?: string | null
          station?: string | null
          status?: 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled'
          priority?: number
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          served_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_kitchen_tickets_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          }
        ]
      }

      restaurant_ticket_items: {
        Row: {
          id: string
          ticket_id: string
          order_item_id: string
          item_name: string
          quantity: number
          notes: string | null
          modifiers_text: string | null
          status: 'pending' | 'cooking' | 'ready' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          order_item_id: string
          item_name: string
          quantity?: number
          notes?: string | null
          modifiers_text?: string | null
          status?: 'pending' | 'cooking' | 'ready' | 'cancelled'
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          order_item_id?: string
          item_name?: string
          quantity?: number
          notes?: string | null
          modifiers_text?: string | null
          status?: 'pending' | 'cooking' | 'ready' | 'cancelled'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            referencedRelation: "restaurant_kitchen_tickets"
            referencedColumns: ["id"]
          }
        ]
      }

      restaurant_table_sessions: {
        Row: {
          id: string
          business_id: string
          table_id: string | null
          guest_count: number
          server_id: string | null
          started_at: string
          ended_at: string | null
          status: 'active' | 'billed' | 'closed'
        }
        Insert: {
          id?: string
          business_id: string
          table_id?: string | null
          guest_count?: number
          server_id?: string | null
          started_at?: string
          ended_at?: string | null
          status?: 'active' | 'billed' | 'closed'
        }
        Update: {
          id?: string
          business_id?: string
          table_id?: string | null
          guest_count?: number
          server_id?: string | null
          started_at?: string
          ended_at?: string | null
          status?: 'active' | 'billed' | 'closed'
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_table_sessions_table_id_fkey"
            columns: ["table_id"]
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          }
        ]
      }

      restaurant_guest_profiles: {
        Row: {
          id: string
          business_id: string
          first_name: string
          last_name: string | null
          full_name: string
          phone: string | null
          email: string | null
          visit_count: number
          total_lifetime_spend: number
          average_check: number
          last_visit_date: string | null
          favorite_items: string[] | null
          dietary_restrictions: string[] | null
          allergies: string[] | null
          seating_preference: 'booth' | 'table' | 'patio' | 'bar' | 'any'
          noise_preference: string | null
          preferred_server_id: string | null
          notes: string | null
          tags: string[] | null
          birthdate: string | null
          anniversary: string | null
          vip_level: number
          marketing_opt_in: boolean
          whatsapp_opt_in: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          first_name: string
          last_name?: string | null
          phone?: string | null
          email?: string | null
          visit_count?: number
          total_lifetime_spend?: number
          average_check?: number
          last_visit_date?: string | null
          favorite_items?: string[] | null
          dietary_restrictions?: string[] | null
          allergies?: string[] | null
          seating_preference?: 'booth' | 'table' | 'patio' | 'bar' | 'any'
          noise_preference?: string | null
          preferred_server_id?: string | null
          notes?: string | null
          tags?: string[] | null
          birthdate?: string | null
          anniversary?: string | null
          vip_level?: number
          marketing_opt_in?: boolean
          whatsapp_opt_in?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          first_name?: string
          last_name?: string | null
          phone?: string | null
          email?: string | null
          visit_count?: number
          total_lifetime_spend?: number
          average_check?: number
          last_visit_date?: string | null
          favorite_items?: string[] | null
          dietary_restrictions?: string[] | null
          allergies?: string[] | null
          seating_preference?: 'booth' | 'table' | 'patio' | 'bar' | 'any'
          noise_preference?: string | null
          preferred_server_id?: string | null
          notes?: string | null
          tags?: string[] | null
          birthdate?: string | null
          anniversary?: string | null
          vip_level?: number
          marketing_opt_in?: boolean
          whatsapp_opt_in?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      restaurant_reservations: {
        Row: {
          id: string
          business_id: string
          guest_id: string | null
          guest_name: string
          guest_phone: string
          guest_email: string | null
          party_size: number
          reservation_date: string
          reservation_time: string
          duration_minutes: number
          table_ids: string[] | null
          status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show'
          notes: string | null
          special_requests: string | null
          source: 'phone' | 'website' | 'walk_in' | 'app' | 'whatsapp'
          reminder_sent: boolean
          confirmation_sent: boolean
          created_at: string
          created_by: string | null
          seated_at: string | null
        }
        Insert: {
          id?: string
          business_id: string
          guest_id?: string | null
          guest_name: string
          guest_phone: string
          guest_email?: string | null
          party_size: number
          reservation_date: string
          reservation_time: string
          duration_minutes?: number
          table_ids?: string[] | null
          status?: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show'
          notes?: string | null
          special_requests?: string | null
          source?: 'phone' | 'website' | 'walk_in' | 'app' | 'whatsapp'
          reminder_sent?: boolean
          confirmation_sent?: boolean
          created_at?: string
          created_by?: string | null
          seated_at?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          guest_id?: string | null
          guest_name?: string
          guest_phone?: string
          guest_email?: string | null
          party_size?: number
          reservation_date?: string
          reservation_time?: string
          duration_minutes?: number
          table_ids?: string[] | null
          status?: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show'
          notes?: string | null
          special_requests?: string | null
          source?: 'phone' | 'website' | 'walk_in' | 'app' | 'whatsapp'
          reminder_sent?: boolean
          confirmation_sent?: boolean
          created_at?: string
          created_by?: string | null
          seated_at?: string | null
        }
        Relationships: []
      }

      restaurant_waitlist: {
        Row: {
          id: string
          business_id: string
          guest_name: string
          guest_phone: string
          party_size: number
          estimated_wait_minutes: number
          quoted_wait_minutes: number
          check_in_time: string
          status: 'waiting' | 'notified' | 'seated' | 'left' | 'no_show'
          notes: string | null
          notification_sent_at: string | null
          seated_at: string | null
          table_id: string | null
        }
        Insert: {
          id?: string
          business_id: string
          guest_name: string
          guest_phone: string
          party_size: number
          estimated_wait_minutes?: number
          quoted_wait_minutes?: number
          check_in_time?: string
          status?: 'waiting' | 'notified' | 'seated' | 'left' | 'no_show'
          notes?: string | null
          notification_sent_at?: string | null
          seated_at?: string | null
          table_id?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          guest_name?: string
          guest_phone?: string
          party_size?: number
          estimated_wait_minutes?: number
          quoted_wait_minutes?: number
          check_in_time?: string
          status?: 'waiting' | 'notified' | 'seated' | 'left' | 'no_show'
          notes?: string | null
          notification_sent_at?: string | null
          seated_at?: string | null
          table_id?: string | null
        }
        Relationships: []
      }

      restaurant_payments: {
        Row: {
          id: string
          business_id: string
          order_id: string
          amount: number
          method: 'cash' | 'card' | 'split'
          status: 'pending' | 'completed' | 'failed' | 'refunded'
          tip_amount: number
          reference_number: string | null
          card_last_four: string | null
          card_type: string | null
          processed_by: string | null
          processed_at: string | null
          refunded_at: string | null
          refund_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          order_id: string
          amount: number
          method: 'cash' | 'card' | 'split'
          status?: 'pending' | 'completed' | 'failed' | 'refunded'
          tip_amount?: number
          reference_number?: string | null
          card_last_four?: string | null
          card_type?: string | null
          processed_by?: string | null
          processed_at?: string | null
          refunded_at?: string | null
          refund_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          order_id?: string
          amount?: number
          method?: 'cash' | 'card' | 'split'
          status?: 'pending' | 'completed' | 'failed' | 'refunded'
          tip_amount?: number
          reference_number?: string | null
          card_last_four?: string | null
          card_type?: string | null
          processed_by?: string | null
          processed_at?: string | null
          refunded_at?: string | null
          refund_reason?: string | null
          created_at?: string
        }
        Relationships: []
      }

      restaurant_cash_drawers: {
        Row: {
          id: string
          business_id: string
          opened_by: string | null
          opened_at: string
          opening_balance: number
          expected_balance: number
          actual_balance: number | null
          closed_by: string | null
          closed_at: string | null
          variance: number | null
          status: 'open' | 'closed'
        }
        Insert: {
          id?: string
          business_id: string
          opened_by?: string | null
          opened_at?: string
          opening_balance?: number
          expected_balance?: number
          actual_balance?: number | null
          closed_by?: string | null
          closed_at?: string | null
          variance?: number | null
          status?: 'open' | 'closed'
        }
        Update: {
          id?: string
          business_id?: string
          opened_by?: string | null
          opened_at?: string
          opening_balance?: number
          expected_balance?: number
          actual_balance?: number | null
          closed_by?: string | null
          closed_at?: string | null
          variance?: number | null
          status?: 'open' | 'closed'
        }
        Relationships: []
      }

      restaurant_void_logs: {
        Row: {
          id: string
          business_id: string
          order_id: string | null
          order_item_id: string | null
          void_type: 'order' | 'item'
          original_amount: number
          reason: string
          approved_by: string | null
          performed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          order_id?: string | null
          order_item_id?: string | null
          void_type: 'order' | 'item'
          original_amount: number
          reason: string
          approved_by?: string | null
          performed_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          order_id?: string | null
          order_item_id?: string | null
          void_type?: 'order' | 'item'
          original_amount?: number
          reason?: string
          approved_by?: string | null
          performed_by?: string | null
          created_at?: string
        }
        Relationships: []
      }

      restaurant_whatsapp_settings: {
        Row: {
          id: string
          business_id: string
          is_enabled: boolean
          phone_number_id: string | null
          access_token: string | null
          webhook_verify_token: string | null
          templates: Json | null
          automation_rules: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          is_enabled?: boolean
          phone_number_id?: string | null
          access_token?: string | null
          webhook_verify_token?: string | null
          templates?: Json | null
          automation_rules?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          is_enabled?: boolean
          phone_number_id?: string | null
          access_token?: string | null
          webhook_verify_token?: string | null
          templates?: Json | null
          automation_rules?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      restaurant_whatsapp_messages: {
        Row: {
          id: string
          business_id: string
          guest_id: string | null
          phone_number: string
          template_name: string
          direction: 'outbound' | 'inbound'
          status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
          message_content: string | null
          error_message: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          guest_id?: string | null
          phone_number: string
          template_name: string
          direction: 'outbound' | 'inbound'
          status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
          message_content?: string | null
          error_message?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          guest_id?: string | null
          phone_number?: string
          template_name?: string
          direction?: 'outbound' | 'inbound'
          status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
          message_content?: string | null
          error_message?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Relationships: []
      }

      restaurant_demand_forecasts: {
        Row: {
          id: string
          business_id: string
          forecast_date: string
          day_of_week: number
          predicted_covers: number
          predicted_revenue: number
          predicted_orders: number
          confidence_score: number | null
          weather_condition: string | null
          temperature: number | null
          local_events: string[] | null
          is_holiday: boolean
          staffing_recommendation: Json | null
          prep_recommendations: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          forecast_date: string
          day_of_week: number
          predicted_covers: number
          predicted_revenue: number
          predicted_orders: number
          confidence_score?: number | null
          weather_condition?: string | null
          temperature?: number | null
          local_events?: string[] | null
          is_holiday?: boolean
          staffing_recommendation?: Json | null
          prep_recommendations?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          forecast_date?: string
          day_of_week?: number
          predicted_covers?: number
          predicted_revenue?: number
          predicted_orders?: number
          confidence_score?: number | null
          weather_condition?: string | null
          temperature?: number | null
          local_events?: string[] | null
          is_holiday?: boolean
          staffing_recommendation?: Json | null
          prep_recommendations?: Json | null
          created_at?: string
        }
        Relationships: []
      }

      restaurant_historical_data: {
        Row: {
          id: string
          business_id: string
          date: string
          day_of_week: number
          covers: number
          revenue: number
          orders: number
          weather: string | null
          temperature: number | null
          was_holiday: boolean
          special_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          date: string
          day_of_week: number
          covers: number
          revenue: number
          orders: number
          weather?: string | null
          temperature?: number | null
          was_holiday?: boolean
          special_notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          date?: string
          day_of_week?: number
          covers?: number
          revenue?: number
          orders?: number
          weather?: string | null
          temperature?: number | null
          was_holiday?: boolean
          special_notes?: string | null
          created_at?: string
        }
        Relationships: []
      }

      restaurant_floor_plans: {
        Row: {
          id: string
          business_id: string
          name: string
          is_active: boolean
          width: number
          height: number
          background_image_url: string | null
          zones: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name?: string
          is_active?: boolean
          width?: number
          height?: number
          background_image_url?: string | null
          zones?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          is_active?: boolean
          width?: number
          height?: number
          background_image_url?: string | null
          zones?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      restaurant_settings: {
        Row: {
          business_id: string
          default_tax_rate: number
          currency: string
          timezone: string
          language: string
          auto_print_kitchen_tickets: boolean
          auto_print_receipts: boolean
          require_table_for_dine_in: boolean
          allow_negative_inventory: boolean
          default_tip_percentages: number[] | null
          service_charge_percent: number | null
          auto_close_time: string | null
          expected_table_turnover_minutes: number
          kitchen_alert_thresholds: Json | null
          whatsapp_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          business_id: string
          default_tax_rate?: number
          currency?: string
          timezone?: string
          language?: string
          auto_print_kitchen_tickets?: boolean
          auto_print_receipts?: boolean
          require_table_for_dine_in?: boolean
          allow_negative_inventory?: boolean
          default_tip_percentages?: number[] | null
          service_charge_percent?: number | null
          auto_close_time?: string | null
          expected_table_turnover_minutes?: number
          kitchen_alert_thresholds?: Json | null
          whatsapp_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          default_tax_rate?: number
          currency?: string
          timezone?: string
          language?: string
          auto_print_kitchen_tickets?: boolean
          auto_print_receipts?: boolean
          require_table_for_dine_in?: boolean
          allow_negative_inventory?: boolean
          default_tip_percentages?: number[] | null
          service_charge_percent?: number | null
          auto_close_time?: string | null
          expected_table_turnover_minutes?: number
          kitchen_alert_thresholds?: Json | null
          whatsapp_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      get_user_stats: {
        Args: {
          p_user_id: string
        }
        Returns: {
          total_revenue: number
          total_profit: number
          total_trips: number
          total_travelers: number
        }[]
      }
      get_monthly_stats: {
        Args: {
          p_user_id: string
        }
        Returns: {
          month: string
          profit: number
          revenue: number
          travelers: number
        }[]
      }
      get_yearly_stats: {
        Args: {
          p_user_id: string
        }
        Returns: {
          year: string
          profit: number
        }[]
      }
      get_top_destinations: {
        Args: {
          p_user_id: string
          limit_count: number
        }
        Returns: {
          destination: string
          profit: number
          trip_count: number
        }[]
      }
      get_status_breakdown: {
        Args: {
          p_user_id: string
        }
        Returns: {
          status: string
          count: number
        }[]
      }
      get_payment_status_breakdown: {
        Args: {
          p_user_id: string
        }
        Returns: {
          payment_status: string
          count: number
        }[]
      }
      get_trips_by_year: {
        Args: {
          year_input: string
        }
        Returns: {
          id: string
          user_id: string
          destination: string
          client_name: string
          travelers_count: number
          start_date: string
          end_date: string
          wholesale_cost: number
          sale_price: number
          currency: string
          exchange_rate: number
          payments: Json[] | null
          attachments: Json[] | null
          payment_date: string | null
          room_type: string | null
          board_basis: string | null
          itinerary: Json[] | null
          travelers: Json[] | null
          profit: number
          profit_percentage: number
          payment_status: string
          amount_paid: number
          amount_due: number
          notes: string
          status: string
          export_to_pdf: boolean
          created_at: string
          updated_at: string
        }[]
      }
      get_trip_years: {
        Args: Record<string, never>
        Returns: {
          year: string
        }[]
      }
      check_email_exists: {
        Args: {
          email_input: string
        }
        Returns: boolean
      }
      authorize_staff_action: {
        Args: {
          p_pin_code: string
          p_required_role?: string | null
        }
        Returns: Json
      }
      void_order_item_secure: {
        Args: {
          p_item_id: string
          p_reason: string
          p_auth_staff_id: string
        }
        Returns: void
      }
      apply_discount_secure: {
        Args: {
          p_order_id: string
          p_discount_amount?: number
          p_discount_percentage?: number
          p_reason?: string
          p_auth_staff_id?: string | null
        }
        Returns: void
      }
      close_business_day_secure: {
        Args: {
          p_auth_staff_id: string
          p_date: string
          p_shifts?: Json
          p_expenses?: Json
        }
        Returns: string
      }
      delete_menu_item_secure: {
        Args: {
          p_item_id: string
        }
        Returns: void
      }
      delete_staff_secure: {
        Args: {
          p_staff_id: string
        }
        Returns: void
      }

    }

    Enums: {
      [_ in never]: never
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}
