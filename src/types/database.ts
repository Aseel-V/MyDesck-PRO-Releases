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
        };

        // ما نستخدمش Database جوّا نفسه هنا عشان ما نعملش حلقة
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

          // قيم محسوبة – نخليها اختيارية
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
