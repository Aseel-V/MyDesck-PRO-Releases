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
          business_registration_number: string | null // Added
          signature_url: string | null // Added
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
          business_registration_number?: string | null // Added
          signature_url?: string | null // Added
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
          business_registration_number?: string | null // Added
          signature_url?: string | null // Added
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
    }

    Enums: {
      [_ in never]: never
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}
