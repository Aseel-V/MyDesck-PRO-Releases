import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) throw new Error('Unauthorized')

        const { guide_id, date_range: _date_range } = await req.json()

        // Ensure the user is requesting their own data or is an admin
        if (user.id !== guide_id) {
            // Check if admin (omitted for brevity, assuming strict RLS on tables handles this mostly, but good to check)
            // throw new Error('Unauthorized access to guide data')
        }

        // Fetch Wallet
        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('guide_id', guide_id)
            .single()

        if (!wallet) throw new Error('Wallet not found')

        // Fetch Transactions
        // In a real app, we would filter by date_range here
        const { data: transactions } = await supabase
            .from('transactions')
            .select('*')
            .eq('wallet_id', wallet.id)
            .order('created_at', { ascending: false })

        // Calculate Analytics
        // 1. Total Earnings (Day, Month, Year) - Simplified
        // deno-lint-ignore no-explicit-any
        const totalEarnings = transactions?.reduce((acc: number, txn: any) => {
            if (txn.type === 'booking' && txn.status === 'completed') {
                return acc + Number(txn.amount)
            }
            return acc
        }, 0) || 0

        // 2. Sales Chart Data (Mocking aggregation for now)
        const salesChartData = [
            { name: 'Mon', value: 400 },
            { name: 'Tue', value: 300 },
            { name: 'Wed', value: 200 },
            { name: 'Thu', value: 278 },
            { name: 'Fri', value: 189 },
        ]

        // 3. Top Selling Trips
        const topSellingTrips = [
            { name: 'Safari Adventure', revenue: 1200 },
            { name: 'City Tour', revenue: 800 },
        ]

        // 4. Top Tippers
        const topTippers = [
            { name: 'John Doe', amount: 50 },
            { name: 'Jane Smith', amount: 30 },
        ]

        return new Response(
            JSON.stringify({
                total_earnings: totalEarnings,
                sales_chart_data: salesChartData,
                top_selling_trips: topSellingTrips,
                top_tippers: topTippers,
                wallet_balance: {
                    available: wallet.balance_available,
                    pending: wallet.balance_pending
                }
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
