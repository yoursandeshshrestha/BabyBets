import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Webhook endpoint - receives payment confirmations from G2Pay backend
// This provides reliability even if user closes browser after payment

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verify G2Pay response signature using raw response body
// Per G2Pay support: Only exclude signature field, sort alphabetically, keep URL-encoded
async function verifyG2PaySignature(
  rawBody: string,
  signatureKey: string
): Promise<boolean> {
  // Extract signature first
  const signatureMatch = rawBody.match(/(?:^|&)signature=([^&]+)/)
  if (!signatureMatch) {
    console.error('[Webhook] No signature found in request')
    return false
  }

  const receivedSignature = signatureMatch[1]

  // Per G2Pay support: Only exclude signature field (NOT __ fields), then sort alphabetically
  const fields = rawBody
    .split('&')
    .filter(pair => !pair.startsWith('signature='))
    .sort() // Sort alphabetically at root level
    .join('&')

  const messageToHash = fields + signatureKey

  const buffer = new TextEncoder().encode(messageToHash)
  const digest = await crypto.subtle.digest('SHA-512', buffer)
  const expectedSignature = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const isValid = expectedSignature === receivedSignature

  if (!isValid) {
    console.error('[Webhook] Signature verification failed')
  }

  return isValid
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Get environment variables
    const G2PAY_SIGNATURE_KEY = Deno.env.get('G2PAY_SIGNATURE_KEY')
    if (!G2PAY_SIGNATURE_KEY) {
      throw new Error('G2Pay signature key not configured')
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

    // Parse the form-encoded webhook payload
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      console.error('[Webhook] Invalid content type:', contentType)
      return new Response(JSON.stringify({ error: 'Invalid content type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const requestText = await req.text()

    // CRITICAL: Verify signature using raw body
    const signatureVerified = await verifyG2PaySignature(requestText, G2PAY_SIGNATURE_KEY)

    if (!signatureVerified) {
      console.error('[Webhook] Signature verification failed - rejecting webhook')

      // Parse data for logging only
      const webhookData: Record<string, string> = {}
      const pairs = requestText.split('&')
      for (const pair of pairs) {
        const eqIndex = pair.indexOf('=')
        if (eqIndex > 0) {
          const key = decodeURIComponent(pair.substring(0, eqIndex))
          const value = decodeURIComponent(pair.substring(eqIndex + 1).replace(/\+/g, ' '))
          webhookData[key] = value
        }
      }

      // Log failed webhook attempt to database
      await supabaseAdmin
        .from('payment_transactions')
        .insert({
          transaction_unique: webhookData.transactionUnique,
          status: 'webhook_signature_failed',
          response_code: webhookData.responseCode,
          response_message: webhookData.responseMessage,
          signature_verified: false,
          signature_mismatch_reason: 'Webhook signature verification failed',
          response_data: webhookData,
        })

      // SECURITY: Reject webhook with invalid signature
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse webhook data for processing
    const webhookData: Record<string, string> = {}
    const pairs = requestText.split('&')
    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=')
      if (eqIndex > 0) {
        const key = decodeURIComponent(pair.substring(0, eqIndex))
        const value = decodeURIComponent(pair.substring(eqIndex + 1).replace(/\+/g, ' '))
        webhookData[key] = value
      }
    }

    // Extract order details
    const orderId = webhookData.orderRef
    const responseCode = webhookData.responseCode
    const transactionID = webhookData.transactionID
    const transactionUnique = webhookData.transactionUnique

    if (!orderId) {
      console.error('[Webhook] Missing orderRef in webhook data')
      return new Response(JSON.stringify({ error: 'Missing orderRef' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check payment status (responseCode 0 = success)
    if (responseCode !== '0') {
      // Log failed payment webhook
      await supabaseAdmin
        .from('payment_transactions')
        .insert({
          order_id: orderId,
          transaction_unique: transactionUnique,
          transaction_id: transactionID,
          status: 'webhook_payment_failed',
          response_code: responseCode,
          response_message: webhookData.responseMessage,
          signature_verified: true,
          response_data: webhookData,
        })

      return new Response(JSON.stringify({
        success: false,
        message: 'Payment failed',
        responseCode,
      }), {
        status: 200, // Return 200 to acknowledge webhook receipt
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, status, total_pence')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('[Webhook] Order not found:', orderId)

      // Log webhook for unknown order
      await supabaseAdmin
        .from('payment_transactions')
        .insert({
          transaction_unique: transactionUnique,
          transaction_id: transactionID,
          status: 'webhook_order_not_found',
          response_code: responseCode,
          response_message: webhookData.responseMessage,
          signature_verified: true,
          response_data: webhookData,
          error_message: `Order ${orderId} not found`,
        })

      return new Response(JSON.stringify({
        success: false,
        message: 'Order not found'
      }), {
        status: 200, // Return 200 to acknowledge webhook receipt
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Idempotency check: If order already paid, acknowledge but don't process again
    if (order.status === 'paid') {
      // Log duplicate webhook
      await supabaseAdmin
        .from('payment_transactions')
        .insert({
          order_id: orderId,
          user_id: order.user_id,
          transaction_unique: transactionUnique,
          transaction_id: transactionID,
          amount_pence: order.total_pence,
          status: 'webhook_duplicate',
          response_code: responseCode,
          response_message: 'Order already completed',
          signature_verified: true,
          response_data: webhookData,
        })

      return new Response(JSON.stringify({
        success: true,
        message: 'Order already completed',
        alreadyProcessed: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update order status to paid
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('[Webhook] Failed to update order status:', updateError)
      throw new Error(`Failed to update order: ${updateError.message}`)
    }

    // Get order items to allocate tickets
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)

    if (itemsError) {
      console.error('[Webhook] Failed to fetch order items:', itemsError)
      throw new Error('Failed to fetch order items')
    }

    // Allocate tickets for each item using atomic function
    for (const item of orderItems || []) {
      const ticketCount = item.ticket_count

      // Get competition details
      const { data: competition, error: compError } = await supabaseAdmin
        .from('competitions')
        .select('id, title, ticket_pool_locked, tickets_sold, max_tickets')
        .eq('id', item.competition_id)
        .single()

      if (compError || !competition) {
        console.error('[Webhook] Competition not found:', compError)
        throw new Error('Failed to fetch competition')
      }

      if (!competition.ticket_pool_locked) {
        throw new Error(`Ticket pool not generated for competition: ${competition.title}`)
      }

      // Atomically claim tickets using database function with row-level locking
      const { data: claimedTickets, error: claimError } = await supabaseAdmin.rpc(
        'claim_tickets_atomic',
        {
          p_competition_id: item.competition_id,
          p_user_id: order.user_id,
          p_order_id: orderId,
          p_ticket_count: ticketCount,
        }
      )

      if (claimError) {
        console.error('[Webhook] Failed to claim tickets:', claimError)
        throw new Error(`Failed to claim tickets: ${claimError.message}`)
      }

      if (!claimedTickets || claimedTickets.length !== ticketCount) {
        throw new Error(
          `Failed to claim all tickets. Expected: ${ticketCount}, Got: ${claimedTickets?.length || 0}`
        )
      }

      // SECURITY NOTE: tickets_sold counter is automatically incremented
      // atomically within claim_tickets_atomic() to prevent race conditions
    }

    // Log successful webhook processing
    await supabaseAdmin
      .from('payment_transactions')
      .insert({
        order_id: orderId,
        user_id: order.user_id,
        transaction_unique: transactionUnique,
        transaction_id: transactionID,
        amount_pence: order.total_pence,
        status: 'webhook_success',
        response_code: responseCode,
        response_message: webhookData.responseMessage,
        signature_verified: true,
        response_data: webhookData,
      })

    // Send order confirmation email (non-blocking)
    supabaseAdmin
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', order.user_id)
      .single()
      .then(({ data: profile }) => {
        if (profile && profile.email) {
          // Calculate total tickets
          const totalTickets = (orderItems || []).reduce((sum, item) => sum + item.ticket_count, 0)

          // Get order with created_at timestamp
          supabaseAdmin
            .from('orders')
            .select('created_at')
            .eq('id', orderId)
            .single()
            .then(({ data: orderWithDate }) => {
              const recipientName = profile.first_name || profile.email.split('@')[0]

              // Call send-notification-email edge function (fire and forget)
              const emailPayload = {
                type: 'order_confirmation',
                recipientEmail: profile.email,
                recipientName,
                data: {
                  orderNumber: orderId.slice(0, 8).toUpperCase(),
                  orderDate: orderWithDate?.created_at
                    ? new Date(orderWithDate.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : new Date().toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }),
                  totalTickets,
                  orderTotal: (order.total_pence / 100).toFixed(2),
                  ticketsUrl: `${Deno.env.get('SITE_URL') || 'https://babybets.co.uk'}/account?tab=tickets`
                }
              }

              fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification-email`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                  },
                  body: JSON.stringify(emailPayload),
                }
              ).then(() => {
                console.log('[Webhook] Order confirmation email queued')
              }).catch((err) => {
                console.error('[Webhook] Error queueing order confirmation email:', err)
              })
            })
        }
      })
      .catch((err) => {
        console.error('[Webhook] Error fetching profile for email:', err)
      })

    return new Response(JSON.stringify({
      success: true,
      message: 'Order completed and tickets allocated',
      orderId,
      transactionID,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to process webhook',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
