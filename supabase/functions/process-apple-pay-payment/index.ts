import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

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
  // Get CORS headers based on request origin
  const requestOrigin = req.headers.get('Origin') || undefined
  const corsHeaders = getCorsHeaders(false, requestOrigin)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const G2PAY_MERCHANT_ID = Deno.env.get('G2PAY_MERCHANT_ID')
    const G2PAY_SIGNATURE_KEY = Deno.env.get('G2PAY_SIGNATURE_KEY')
    const G2PAY_DIRECT_API_URL = Deno.env.get('G2PAY_DIRECT_API_URL') || 'https://payments.g2pay.co.uk/direct/'
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')

    if (!G2PAY_MERCHANT_ID || !G2PAY_SIGNATURE_KEY || !G2PAY_DIRECT_API_URL) {
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

    // Create service role client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get request body
    const { orderId, paymentToken, customerEmail, customerPhone } = await req.json()

    if (!orderId || !paymentToken) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify the order exists and belongs to the authenticated user
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, status, total_pence')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (order.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Order does not belong to user' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (order.status === 'paid') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order already paid' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Generate unique transaction ID
    const transactionUnique = crypto.randomUUID()

    // Log transaction attempt
    const { data: transactionLog, error: logError } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        order_id: orderId,
        user_id: user.id,
        transaction_unique: transactionUnique,
        amount_pence: order.total_pence,
        currency_code: 826, // GBP
        status: 'pending',
        gateway_url: G2PAY_DIRECT_API_URL,
      })
      .select('id')
      .single()

    if (logError) {
      console.error('[Apple Pay Payment] Failed to create transaction log:', logError)
    }

    console.log('[Apple Pay Payment] Processing payment:', {
      orderId,
      amount: order.total_pence,
      transactionUnique,
    })

    // Client IP + User-Agent for 3DS device data
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || '0.0.0.0'
    const userAgent = req.headers.get('user-agent') || 'Mozilla/5.0'
    const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.babybets.co.uk'
    const threeDSRedirectURL = `${PUBLIC_SITE_URL}/payment-3ds?orderRef=${orderId}`

    // Prepare request data for G2Pay Direct API
    const requestData: Record<string, string | number> = {
      merchantID: G2PAY_MERCHANT_ID,
      action: 'SALE',
      type: 1,
      countryCode: 826, // UK
      currencyCode: 826, // GBP
      amount: order.total_pence,
      orderRef: orderId,
      transactionUnique,

      // Apple Pay specific fields (required by Cardstream Direct API — without
      // paymentMethod=applepay, gateway returns responseCode 66479 "Invalid paymentToken")
      paymentMethod: 'applepay',
      paymentToken: JSON.stringify(paymentToken),

      // Webhook callback URL
      callbackURL: `${SUPABASE_URL}/functions/v1/g2pay-webhook`,

      // 3DS fields — Apple Pay tokens usually skip 3DS via the on-device cryptogram,
      // but Cardstream still requires these to be present for risk assessment.
      threeDSRedirectURL,
      remoteAddress: clientIp,
      deviceChannel: 'browser',
      deviceIdentity: userAgent,
      deviceTimeZone: '0',
      deviceCapabilities: 'javascript',
      deviceScreenResolution: '1920x1080x24',
      deviceAcceptContent: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      deviceAcceptEncoding: 'gzip, deflate, br',
      deviceAcceptLanguage: 'en-GB',

      // Optional customer details
      ...(customerEmail && { customerEmail }),
      ...(customerPhone && { customerPhone }),
    }

    // Generate signature
    const signature = await createSignature(requestData, G2PAY_SIGNATURE_KEY)

    // Add signature to request
    const finalRequest = {
      ...requestData,
      signature,
    }

    // Make direct POST request to G2Pay API
    const g2payResponse = await fetch(G2PAY_DIRECT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(finalRequest as Record<string, string>).toString(),
    })

    if (!g2payResponse.ok) {
      console.error('[Apple Pay Payment] G2Pay API request failed:', g2payResponse.status)
      throw new Error(`G2Pay API request failed: ${g2payResponse.status}`)
    }

    // Parse response
    const responseText = await g2payResponse.text()
    console.log('[Apple Pay Payment] Raw G2Pay response:', responseText)

    const responseParams = new URLSearchParams(responseText)
    const responseData: Record<string, string> = {}

    responseParams.forEach((value, key) => {
      responseData[key] = value
    })

    console.log('[Apple Pay Payment] Parsed response:', {
      responseCode: responseData.responseCode,
      responseMessage: responseData.responseMessage,
      transactionID: responseData.transactionID,
    })

    // Check payment status (responseCode '0' = success)
    if (responseData.responseCode === '0') {
      console.log('[Apple Pay Payment] ✅ Payment successful')

      // Update transaction log with success
      if (transactionLog?.id) {
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            transaction_id: responseData.transactionID,
            response_code: responseData.responseCode,
            response_message: responseData.responseMessage,
            status: 'success',
            response_data: responseData,
          })
          .eq('id', transactionLog.id)
      }

      return new Response(
        JSON.stringify({
          success: true,
          transactionID: responseData.transactionID,
          transactionUnique: responseData.transactionUnique || transactionUnique,
          orderRef: responseData.orderRef || orderId,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 3DS challenge required (responseCode 65802)
    if (responseData.responseCode === '65802') {
      console.log('[Apple Pay Payment] 3DS challenge required')

      if (transactionLog?.id) {
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            response_code: responseData.responseCode,
            response_message: responseData.responseMessage,
            status: 'threeds_required',
            response_data: responseData,
          })
          .eq('id', transactionLog.id)
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'threeDSRequired',
          threeDSRef: responseData.threeDSRef,
          threeDSURL: responseData.threeDSURL,
          threeDSRequest: responseData.threeDSRequest,
          xref: responseData.xref,
          orderRef: orderId,
          transactionUnique,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Payment failed
    console.error('[Apple Pay Payment] Payment failed:', {
      responseCode: responseData.responseCode,
      responseMessage: responseData.responseMessage,
    })

    // Update transaction log with failure
    if (transactionLog?.id) {
      await supabaseAdmin
        .from('payment_transactions')
        .update({
          response_code: responseData.responseCode,
          response_message: responseData.responseMessage,
          status: 'failed',
          response_data: responseData,
          error_message: responseData.responseMessage,
        })
        .eq('id', transactionLog.id)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: responseData.responseMessage || 'Payment failed',
        responseCode: responseData.responseCode,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Apple Pay Payment] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to process payment',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
