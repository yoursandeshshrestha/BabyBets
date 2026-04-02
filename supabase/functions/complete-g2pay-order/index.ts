import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {

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
      console.error('JWT verification failed:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }


    // Get request body
    const { orderId } = await req.json()
    if (!orderId) {
      throw new Error('Order ID is required')
    }


    // Create service role client for all operations (bypasses RLS)
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

    // Get order details (includes user_id)
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('Order not found:', orderError)
      throw new Error('Order not found')
    }


    // Security check: Ensure authenticated user owns this order
    if (order.user_id !== user.id) {
      console.error(`User ${user.id} attempted to complete order ${orderId} owned by ${order.user_id}`)
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Order does not belong to user' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check if already completed
    if (order.status === 'paid') {
      return new Response(
        JSON.stringify({ success: true, message: 'Order already completed' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (order.status !== 'pending') {
      throw new Error(`Cannot complete order with status: ${order.status}`)
    }

    // Update order to paid
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Error updating order:', {
        error: updateError,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code,
      })
      throw new Error(`Failed to update order status: ${updateError.message || JSON.stringify(updateError)}`)
    }


    // Get order items to allocate tickets
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)

    if (itemsError) {
      console.error('Error fetching order items:', itemsError)
      throw new Error('Failed to fetch order items')
    }


    // Process each item - claim tickets from pre-generated pool
    for (const item of orderItems || []) {
      const ticketCount = item.ticket_count


      // Get competition details
      const { data: competition, error: compError } = await supabaseAdmin
        .from('competitions')
        .select('id, title, ticket_pool_locked, tickets_sold, max_tickets')
        .eq('id', item.competition_id)
        .single()

      if (compError || !competition) {
        console.error('Error fetching competition:', compError)
        throw new Error('Failed to fetch competition')
      }

      // Check if ticket pool is locked (required for claiming)


      if (!competition.ticket_pool_locked) {
        throw new Error(`Ticket pool not generated for competition: ${competition.title}`)
      }

      // Atomically claim tickets using database function with row-level locking
      // This prevents race conditions where two orders try to claim the same tickets

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
        console.error('Error claiming tickets atomically:', {
          error: claimError,
          message: claimError.message,
          details: claimError.details,
          hint: claimError.hint,
          code: claimError.code,
          competitionId: item.competition_id,
          requestedTickets: ticketCount,
        })
        throw new Error(`Failed to claim tickets: ${claimError.message || JSON.stringify(claimError)}`)
      }

      // Verify we claimed the correct number of tickets
      if (!claimedTickets || claimedTickets.length !== ticketCount) {
        throw new Error(
          `Failed to claim all requested tickets. Expected: ${ticketCount}, Got: ${claimedTickets?.length || 0}`
        )
      }

      // SECURITY NOTE: tickets_sold counter is automatically incremented
      // atomically within claim_tickets_atomic() to prevent race conditions

    }

    // Send order confirmation email (non-blocking)
    supabaseAdmin
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', order.user_id)
      .single()
      .then(({ data: profile }) => {
        if (profile && profile.email) {
          // Calculate total tickets
          const totalTickets = (orderItems || []).reduce((sum: number, item: { ticket_count: number }) => sum + item.ticket_count, 0)

          // Get order with created_at timestamp
          supabaseAdmin
            .from('orders')
            .select('created_at, total_pence')
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
                  orderTotal: ((orderWithDate?.total_pence || 0) / 100).toFixed(2),
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
                console.log('[Complete Order] Order confirmation email queued')
              }).catch((err: Error) => {
                console.error('[Complete Order] Error queueing order confirmation email:', err)
              })
            })
        }
      })
      .catch((err: Error) => {
        console.error('[Complete Order] Error fetching profile for email:', err)
      })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Order completed and tickets allocated',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error completing order:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to complete order',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
