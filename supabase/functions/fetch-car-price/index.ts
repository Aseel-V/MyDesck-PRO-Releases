import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { plateNumber } = await req.json()
    
    if (!plateNumber) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plate number is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Fetch the page from balcar.co.il
    const response = await fetch(`https://balcar.co.il/car/${plateNumber}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      }
    })

    const html = await response.text()
    
    // Try to extract API endpoint or data from the page
    // balcar.co.il is a React SPA, so we need to look for the API it calls
    // Let's try their API endpoint directly
    const apiResponse = await fetch(`https://balcar.co.il/api/car/${plateNumber}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://balcar.co.il/',
      }
    })

    if (apiResponse.ok) {
      const data = await apiResponse.json()
      // Extract price from API response
      const price = data?.loanAmount || data?.price || data?.value || null
      
      return new Response(
        JSON.stringify({ success: true, price, rawData: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If API doesn't work, try to find price in HTML using regex
    // Look for patterns like "55,000" near loan/price keywords
    const pricePatterns = [
      /גובה ההלוואה[^0-9]*([0-9]{1,3}(?:,[0-9]{3})*)/,
      /שווי[^0-9]*([0-9]{1,3}(?:,[0-9]{3})*)/,
      /מחיר[^0-9]*([0-9]{1,3}(?:,[0-9]{3})*)/,
      /"loanAmount":\s*([0-9]+)/,
      /"price":\s*([0-9]+)/,
    ]

    for (const pattern of pricePatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        const price = parseInt(match[1].replace(/,/g, ''))
        if (price >= 10000 && price <= 1000000) {
          return new Response(
            JSON.stringify({ success: true, price }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Could not extract price from page' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error fetching car price:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
