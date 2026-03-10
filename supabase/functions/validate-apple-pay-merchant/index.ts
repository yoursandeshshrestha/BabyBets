import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Generate signature using G2Pay's method (SHA-512)
async function createSignature(data: Record<string, string | number>, signatureKey: string): Promise<string> {
  const processedData: Record<string, string> = {}
  const keys = Object.keys(data).sort()

  keys.forEach(key => {
    processedData[key] = String(data[key])
  })

  const params = new URLSearchParams()
  for (const key in processedData) {
    params.append(key, processedData[key])
  }
  let signatureString = params.toString()

  signatureString = signatureString
    .replace(/%0D%0A/g, '%0A')
    .replace(/%0A%0D/g, '%0A')
    .replace(/%0D/g, '%0A')

  const messageToHash = signatureString + signatureKey

  const msgBuffer = new TextEncoder().encode(messageToHash)
  const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  return hashHex
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const G2PAY_MERCHANT_ID = Deno.env.get('G2PAY_MERCHANT_ID')
    const G2PAY_SIGNATURE_KEY = Deno.env.get('G2PAY_SIGNATURE_KEY')
    const G2PAY_HOSTED_URL = Deno.env.get('G2PAY_HOSTED_URL') || 'https://checkout.g2pay.co.uk/postbridge/g2paymodal'

    if (!G2PAY_MERCHANT_ID || !G2PAY_SIGNATURE_KEY) {
      throw new Error('G2Pay configuration missing')
    }

    // Verify JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get request body
    const { validationURL, displayName, domainName } = await req.json()

    if (!validationURL || !displayName || !domainName) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('[Apple Pay Validation] Validating merchant:', {
      validationURL,
      displayName,
      domainName,
    })

    // Prepare request data for G2Pay
    const requestData: Record<string, string | number> = {
      merchantID: G2PAY_MERCHANT_ID,
      process: 'applepay.validateMerchant',
      validationURL,
      displayName,
      domainName,
    }

    // Generate signature
    const signature = await createSignature(requestData, G2PAY_SIGNATURE_KEY)

    // Add signature to request
    const finalRequest = {
      ...requestData,
      signature,
    }

    console.log('[Apple Pay Validation] Sending request to G2Pay')

    // Make request to G2Pay Hosted Integration URL
    const g2payResponse = await fetch(G2PAY_HOSTED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(finalRequest as Record<string, string>).toString(),
    })

    if (!g2payResponse.ok) {
      console.error('[Apple Pay Validation] G2Pay request failed:', g2payResponse.status)
      throw new Error(`G2Pay request failed: ${g2payResponse.status}`)
    }

    // G2Pay returns the Apple Pay merchant session as JSON
    const merchantSession = await g2payResponse.json()

    console.log('[Apple Pay Validation] Merchant validation successful')

    return new Response(
      JSON.stringify({
        success: true,
        merchantSession,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Apple Pay Validation] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to validate merchant',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
