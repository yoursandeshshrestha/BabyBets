import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

// PHP-compatible URL encoding to match http_build_query() — see Apple Pay
// edge function for full rationale.
function phpRawUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '+')
}

async function createSignature(data: Record<string, string | number>, signatureKey: string): Promise<string> {
  const keys = Object.keys(data).sort()
  const pairs: string[] = []
  keys.forEach(key => {
    pairs.push(`${phpRawUrlEncode(key)}=${phpRawUrlEncode(String(data[key]))}`)
  })

  let signatureString = pairs.join('&')
  signatureString = signatureString
    .replace(/%0D%0A/g, '%0A')
    .replace(/%0A%0D/g, '%0A')
    .replace(/%0D/g, '%0A')

  const msgBuffer = new TextEncoder().encode(signatureString + signatureKey)
  const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  // Get CORS headers based on request origin
  const requestOrigin = req.headers.get('Origin') || undefined
  const corsHeaders = getCorsHeaders(false, requestOrigin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const G2PAY_MERCHANT_ID = Deno.env.get('G2PAY_MERCHANT_ID')
    const G2PAY_SIGNATURE_KEY = Deno.env.get('G2PAY_SIGNATURE_KEY')
    const G2PAY_DIRECT_API_URL = Deno.env.get('G2PAY_DIRECT_API_URL') || 'https://payments.g2pay.co.uk/direct/'
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')

    if (!G2PAY_MERCHANT_ID || !G2PAY_SIGNATURE_KEY) {
      throw new Error('G2Pay configuration missing')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { orderId, paymentToken, customerEmail, customerPhone } = await req.json()

    if (!orderId || !paymentToken) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, status, total_pence')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (order.status === 'paid') {
      return new Response(JSON.stringify({ success: false, error: 'Order already paid' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const transactionUnique = crypto.randomUUID()

    const { data: transactionLog } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        order_id: orderId,
        user_id: user.id,
        transaction_unique: transactionUnique,
        amount_pence: order.total_pence,
        currency_code: 826,
        status: 'pending',
        gateway_url: G2PAY_DIRECT_API_URL,
      })
      .select('id')
      .single()

    // Client IP + User-Agent for 3DS device data
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || '0.0.0.0'
    const userAgent = req.headers.get('user-agent') || 'Mozilla/5.0'
    const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.babybets.co.uk'
    const threeDSRedirectURL = `${PUBLIC_SITE_URL}/payment-3ds?orderRef=${orderId}`

    const requestData: Record<string, string | number> = {
      merchantID: G2PAY_MERCHANT_ID,
      action: 'SALE',
      type: 1,
      countryCode: 826,
      currencyCode: 826,
      amount: order.total_pence,
      orderRef: orderId,
      transactionUnique,
      // Google Pay specific fields (required by Cardstream Direct API)
      paymentMethod: 'googlepay',
      paymentToken: typeof paymentToken === 'string' ? paymentToken : JSON.stringify(paymentToken),
      callbackURL: `${SUPABASE_URL}/functions/v1/g2pay-webhook`,

      // 3DS fields — required when Cardstream needs to challenge a PAN_ONLY token
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

      ...(customerEmail && { customerEmail }),
      ...(customerPhone && { customerPhone }),
    }

    const signature = await createSignature(requestData, G2PAY_SIGNATURE_KEY)
    const finalRequest = { ...requestData, signature }

    const g2payResponse = await fetch(G2PAY_DIRECT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(finalRequest as Record<string, string>).toString(),
    })

    if (!g2payResponse.ok) {
      throw new Error(`G2Pay API request failed: ${g2payResponse.status}`)
    }

    const responseText = await g2payResponse.text()
    const responseParams = new URLSearchParams(responseText)
    const responseData: Record<string, string> = {}
    responseParams.forEach((value, key) => { responseData[key] = value })

    // Cardstream returns nested 3DS payloads as PHP-style bracket keys, e.g.
    // threeDSRequest[threeDSMethodData]=...&threeDSRequest[anotherField]=...
    // URLSearchParams keeps the brackets literal, so `responseData.threeDSRequest`
    // is undefined. Reconstruct it as a URL-encoded form body the iframe can POST.
    const threeDSRequestPairs: string[] = []
    Object.entries(responseData).forEach(([key, value]) => {
      const match = key.match(/^threeDSRequest\[(.+)\]$/)
      if (match) {
        threeDSRequestPairs.push(`${encodeURIComponent(match[1])}=${encodeURIComponent(value)}`)
      }
    })
    if (!responseData.threeDSRequest && threeDSRequestPairs.length > 0) {
      responseData.threeDSRequest = threeDSRequestPairs.join('&')
    }

    console.log('[Google Pay] G2Pay response:', {
      responseCode: responseData.responseCode,
      responseMessage: responseData.responseMessage,
      threeDSRef: responseData.threeDSRef,
      threeDSURL: responseData.threeDSURL,
      threeDSRequest_length: responseData.threeDSRequest?.length ?? 0,
      threeDSRequest_reconstructed: threeDSRequestPairs.length > 0,
      allKeys: Object.keys(responseData).join(', '),
    })

    if (responseData.responseCode === '0') {
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

      return new Response(JSON.stringify({
        success: true,
        transactionID: responseData.transactionID,
        transactionUnique: responseData.transactionUnique || transactionUnique,
        orderRef: responseData.orderRef || orderId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3DS challenge required (responseCode 65802)
    if (responseData.responseCode === '65802') {
      console.log('[Google Pay] 3DS challenge required')

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

      return new Response(JSON.stringify({
        success: true,
        status: 'threeDSRequired',
        threeDSRef: responseData.threeDSRef,
        threeDSURL: responseData.threeDSURL,
        threeDSRequest: responseData.threeDSRequest,
        xref: responseData.xref,
        orderRef: orderId,
        transactionUnique,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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

    return new Response(JSON.stringify({
      success: false,
      error: responseData.responseMessage || 'Payment failed',
      responseCode: responseData.responseCode,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[Google Pay] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to process payment',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
