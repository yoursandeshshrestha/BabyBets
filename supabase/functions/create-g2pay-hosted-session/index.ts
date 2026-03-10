import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
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
    const G2PAY_DIRECT_API_URL = Deno.env.get('G2PAY_DIRECT_API_URL') || 'https://payments.g2pay.co.uk/direct/'
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SITE_URL = Deno.env.get('SITE_URL') || Deno.env.get('PUBLIC_SITE_URL')

    if (!G2PAY_MERCHANT_ID || !G2PAY_SIGNATURE_KEY || !G2PAY_DIRECT_API_URL || !SITE_URL) {
      throw new Error('G2Pay configuration missing: G2PAY_MERCHANT_ID, G2PAY_SIGNATURE_KEY, G2PAY_DIRECT_API_URL, and SITE_URL are required')
    }

    // Verify JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify JWT using anon client
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
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
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
    const {
      orderRef,
      customerEmail,
      customerPhone,
      cardDetails,
      browserInfo,
    } = await req.json()

    if (!orderRef) {
      return new Response(JSON.stringify({ error: 'orderRef is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate card details if provided
    if (cardDetails) {
      const { cardNumber, expiryMonth, expiryYear, cvv, cardholderName } = cardDetails
      if (!cardNumber || !expiryMonth || !expiryYear || !cvv || !cardholderName) {
        return new Response(JSON.stringify({ error: 'Incomplete card details' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Security: Verify the order exists and belongs to the authenticated user
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, status, total_pence')
      .eq('id', orderRef)
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

    // Security: Ensure authenticated user owns this order
    if (order.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Order does not belong to user' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Idempotency: Check if order is already paid
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
        order_id: orderRef,
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
      console.error('[create-g2pay-hosted-session] Failed to create transaction log:', logError)
    }

    // Get device IP address from request headers
    const deviceIpAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                            req.headers.get('x-real-ip') ||
                            '127.0.0.1'

    // Prepare request data for G2Pay Direct API with 3DS v2 support
    const requestData: Record<string, string | number> = {
      merchantID: G2PAY_MERCHANT_ID,
      action: 'SALE',
      type: 1,
      countryCode: 826, // UK
      currencyCode: 826, // GBP
      amount: order.total_pence,
      orderRef,
      transactionUnique,

      // Enable 3DS v2 authentication (required by merchant account)
      threeDSRequired: 'Y',

      // 3DS v2 Required Fields
      deviceIpAddress, // Customer's IP address (mandatory for 3DS v2)
      threeDSRedirectURL: `${SITE_URL}/payment-return?orderRef=${orderRef}`, // Where ACS redirects after challenge

      // Disable duplicate checking for testing
      duplicateDelay: 0,

      // Webhook callback URL for backend payment confirmation
      callbackURL: `${SUPABASE_URL}/functions/v1/g2pay-webhook`,

      // Optional customer details
      ...(customerEmail && { customerEmail }),
      ...(customerPhone && { customerPhone }),

      // Card details (if provided for direct payment)
      ...(cardDetails && {
        cardNumber: cardDetails.cardNumber.replace(/[\s-]/g, ''), // Remove spaces and dashes
        cardExpiryMonth: String(cardDetails.expiryMonth).padStart(2, '0'),
        cardExpiryYear: String(cardDetails.expiryYear).slice(-2), // Use last 2 digits (YY format)
        cardCVV: cardDetails.cvv,
        customerName: cardDetails.cardholderName,
      }),

      // Browser/Device information for 3DS v2 (mandatory)
      ...(browserInfo && {
        deviceChannel: browserInfo.deviceChannel || 'browser',
        deviceIdentity: browserInfo.deviceIdentity || '',
        deviceTimeZone: browserInfo.deviceTimeZone || '0',
        deviceCapabilities: browserInfo.deviceCapabilities || '',
        deviceScreenResolution: browserInfo.deviceScreenResolution || '1920x1080x24',
        deviceAcceptContent: browserInfo.deviceAcceptContent || 'text/html',
        deviceAcceptEncoding: browserInfo.deviceAcceptEncoding || 'gzip, deflate, br',
        deviceAcceptLanguage: browserInfo.deviceAcceptLanguage || 'en-GB',
      }),
    }

    // Generate signature
    const signature = await createSignature(requestData, G2PAY_SIGNATURE_KEY)

    // Add signature to request
    const finalRequest = {
      ...requestData,
      signature,
    }

    console.log('[create-g2pay-direct] Making direct API request:', {
      orderRef,
      amount: order.total_pence,
      transactionUnique,
      deviceIpAddress,
      apiUrl: G2PAY_DIRECT_API_URL,
    })

    // Make direct POST request to G2Pay API
    const g2payResponse = await fetch(G2PAY_DIRECT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(finalRequest as Record<string, string>).toString(),
    })

    if (!g2payResponse.ok) {
      console.error('[create-g2pay-direct] G2Pay API request failed:', g2payResponse.status, g2payResponse.statusText)
      throw new Error(`G2Pay API request failed: ${g2payResponse.status} ${g2payResponse.statusText}`)
    }

    // Parse response (G2Pay returns form-urlencoded response)
    const responseText = await g2payResponse.text()
    console.log('[create-g2pay-direct] Raw G2Pay response:', responseText)

    const responseParams = new URLSearchParams(responseText)
    const responseData: Record<string, string> = {}

    responseParams.forEach((value, key) => {
      responseData[key] = value
    })

    console.log('[create-g2pay-direct] Parsed G2Pay response:', responseData)
    console.log('[create-g2pay-direct] G2Pay API response:', {
      responseCode: responseData.responseCode,
      responseMessage: responseData.responseMessage,
      transactionID: responseData.transactionID,
      threeDSRequired: responseData.threeDSRequired,
      threeDSURL: responseData.threeDSURL,
    })

    // Check if 3DS authentication is required (responseCode '65802' = 3DS required)
    if (responseData.responseCode === '65802' || responseData.threeDSRequired === 'Y') {
      console.log('[create-g2pay-direct] 3DS authentication required')

      // Update transaction log to pending 3DS
      if (transactionLog?.id) {
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            transaction_id: responseData.transactionID,
            response_code: responseData.responseCode,
            response_message: responseData.responseMessage,
            status: 'pending_3ds',
            response_data: responseData,
          })
          .eq('id', transactionLog.id)
      }

      return new Response(
        JSON.stringify({
          success: true,
          requires3DS: true,
          threeDSURL: responseData.threeDSURL,
          threeDSRequest: responseData.threeDSRequest,
          threeDSMD: responseData.threeDSMD,
          threeDSACSURL: responseData.threeDSACSURL,
          transactionID: responseData.transactionID,
          transactionUnique: responseData.transactionUnique || transactionUnique,
          orderRef: responseData.orderRef || orderRef,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check payment status (responseCode '0' = success)
    if (responseData.responseCode === '0') {
      console.log('[create-g2pay-direct] ✅ Payment successful')

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
          orderRef: responseData.orderRef || orderRef,
          message: responseData.responseMessage,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Payment failed
    console.error('[create-g2pay-direct] Payment failed:', {
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

    // Map common error codes to helpful messages
    const errorMessages: Record<string, string> = {
      '65550': '3D Secure authentication required but failed. Please try again.',
      '65566': 'Invalid card number. Please verify your card details are correct.',
      '65551': 'Invalid expiry date. Please check the expiration date.',
      '65552': 'Invalid CVV. Please check your card security code.',
      '5': 'Card declined. Please try a different payment method.',
    }

    const helpfulMessage = errorMessages[responseData.responseCode] || responseData.responseMessage || 'Payment failed'

    return new Response(
      JSON.stringify({
        success: false,
        error: helpfulMessage,
        responseCode: responseData.responseCode,
        rawMessage: responseData.responseMessage,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('[create-g2pay-hosted-session] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create payment session',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
