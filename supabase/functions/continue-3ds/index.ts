import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

// PHP-compatible URL encoding to match http_build_query()
function phpRawUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '+')
}

// Generate signature using G2Pay's method (SHA-512)
async function createSignature(data: Record<string, string | number>, signatureKey: string): Promise<string> {
  const keys = Object.keys(data).sort()
  const pairs: string[] = []
  keys.forEach(key => {
    const value = String(data[key])
    pairs.push(`${phpRawUrlEncode(key)}=${phpRawUrlEncode(value)}`)
  })

  let signatureString = pairs.join('&')
  signatureString = signatureString
    .replace(/%0D%0A/g, '%0A')
    .replace(/%0A%0D/g, '%0A')
    .replace(/%0D/g, '%0A')

  const msgBuffer = new TextEncoder().encode(signatureString + signatureKey)
  const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const G2PAY_MERCHANT_ID = Deno.env.get('G2PAY_MERCHANT_ID')
    const G2PAY_SIGNATURE_KEY = Deno.env.get('G2PAY_SIGNATURE_KEY')
    const G2PAY_DIRECT_API_URL = Deno.env.get('G2PAY_DIRECT_API_URL') || 'https://payments.g2pay.co.uk/direct/'

    if (!G2PAY_MERCHANT_ID || !G2PAY_SIGNATURE_KEY) {
      throw new Error('G2Pay configuration missing')
    }

    // Verify JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { threeDSRef, threeDSResponse, orderRef } = await req.json()

    if (!threeDSRef) {
      return new Response(
        JSON.stringify({ error: 'threeDSRef is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[continue-3ds] Processing 3DS continuation', {
      threeDSRef,
      orderRef,
      threeDSResponse: threeDSResponse ? Object.keys(threeDSResponse) : 'empty',
    })

    // Build the continuation request
    const requestData: Record<string, string | number> = {
      merchantID: G2PAY_MERCHANT_ID,
      action: 'SALE',
      threeDSRef,
      // Include any 3DS response data (cres, threeDSMethodData, etc.)
      ...(threeDSResponse || {}),
    }

    const signature = await createSignature(requestData, G2PAY_SIGNATURE_KEY)
    const finalRequest = { ...requestData, signature }

    console.log('[continue-3ds] Sending to G2Pay:', {
      threeDSRef,
      keys: Object.keys(finalRequest).join(', '),
    })

    // Send continuation to G2Pay
    const g2payResponse = await fetch(G2PAY_DIRECT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(finalRequest as Record<string, string>).toString(),
    })

    const responseText = await g2payResponse.text()
    console.log('[continue-3ds] Raw response:', responseText)

    const responseParams = new URLSearchParams(responseText)
    const responseData: Record<string, string> = {}
    responseParams.forEach((value, key) => { responseData[key] = value })

    console.log('[continue-3ds] Parsed response:', {
      responseCode: responseData.responseCode,
      responseMessage: responseData.responseMessage,
      threeDSRef: responseData.threeDSRef,
    })

    // Success
    if (responseData.responseCode === '0') {
      console.log('[continue-3ds] Payment successful after 3DS')

      return new Response(
        JSON.stringify({
          success: true,
          status: 'success',
          transactionID: responseData.transactionID,
          xref: responseData.xref,
          orderRef,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Another 3DS challenge required (recursive)
    if (responseData.responseCode === '65802') {
      console.log('[continue-3ds] Additional 3DS challenge required')

      return new Response(
        JSON.stringify({
          success: true,
          status: 'threeDSRequired',
          threeDSRef: responseData.threeDSRef,
          threeDSURL: responseData.threeDSURL,
          threeDSRequest: responseData.threeDSRequest,
          xref: responseData.xref,
          orderRef,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Failed
    console.error('[continue-3ds] Payment failed:', responseData.responseMessage)

    return new Response(
      JSON.stringify({
        success: false,
        status: 'failed',
        error: responseData.responseMessage || 'Authentication failed',
        responseCode: responseData.responseCode,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[continue-3ds] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
