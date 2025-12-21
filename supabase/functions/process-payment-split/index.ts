import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { amount, currency } = await req.json()

        // Platform Fee Configuration
        const PLATFORM_FEE_PERCENTAGE = 0.10 // 10%

        const amountNum = Number(amount)
        const platformFee = amountNum * PLATFORM_FEE_PERCENTAGE
        const guideNetAmount = amountNum - platformFee

        // Currency conversion logic would go here
        // For now, we assume USD or pass through

        return new Response(
            JSON.stringify({
                original_amount: amountNum,
                platform_fee: platformFee,
                guide_net_amount: guideNetAmount,
                currency: currency,
                split_details: {
                    percentage: PLATFORM_FEE_PERCENTAGE * 100,
                    description: "Platform fee 10%"
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
