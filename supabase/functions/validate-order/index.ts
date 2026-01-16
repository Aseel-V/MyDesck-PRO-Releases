
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderItemInput {
  itemId: string;
  price: number;
}

interface ValidationRequest {
  items: OrderItemInput[];
  _tableId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { items, _tableId }: ValidationRequest = await req.json()

    // 1. Validate Prices
    const itemIds = items.map((i: OrderItemInput) => i.itemId)
    const { data: dbItems, error: itemsError } = await supabaseClient
      .from('restaurant_menu_items')
      .select('id, price, name, is_available')
      .in('id', itemIds)

    if (itemsError) throw itemsError

    const dbItemMap = new Map(dbItems.map((i: { id: string, price: number, name: string, is_available: boolean }) => [i.id, i]))
    const errors = []

    for (const item of items) {
      const dbItem = dbItemMap.get(item.itemId)
      
      if (!dbItem) {
        errors.push(`Item ${item.itemId} not found`)
        continue
      }

      if (!dbItem.is_available) {
        errors.push(`Item ${dbItem.name} is no longer available`)
      }

      // Check Price Tolerance (e.g. 0.01 difference allowed)
      if (Math.abs(dbItem.price - item.price) > 0.01) {
        errors.push(`Price mismatch for ${dbItem.name}: Client=${item.price}, Server=${dbItem.price}`)
      }
    }

    if (errors.length > 0) {
       return new Response(
        JSON.stringify({ valid: false, errors }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 2. Validate Allergy Overrides (Optional: specific checks for authorized overrides)
    // ...

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
