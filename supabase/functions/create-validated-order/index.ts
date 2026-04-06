import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

interface OrderItem {
  competition_id: string
  quantity: number
}

interface CreateValidatedOrderRequest {
  items: OrderItem[]
  promo_code?: string
  use_wallet_credit?: boolean
  mobile_number: string
  influencer_id?: string
}

interface ValidatedOrderResponse {
  success: boolean
  order_id?: string
  subtotal_pence: number
  discount_pence: number
  credit_applied_pence: number
  total_pence: number
  error?: string
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

    // Parse request body
    const {
      items,
      promo_code,
      use_wallet_credit,
      mobile_number,
      influencer_id
    }: CreateValidatedOrderRequest = await req.json()

    // Validate input
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No items provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!mobile_number) {
      return new Response(
        JSON.stringify({ error: 'Mobile number required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 1: Fetch current competition prices and validate availability
    let subtotalPence = 0
    const validatedItems: Array<{
      competition_id: string
      ticket_count: number
      price_per_ticket_pence: number
      total_pence: number
    }> = []

    for (const item of items) {
      // Fetch competition with current price
      const { data: competition, error: compError } = await supabaseAdmin
        .from('competitions')
        .select('id, base_ticket_price_pence, status, max_tickets, tickets_sold, max_tickets_per_user')
        .eq('id', item.competition_id)
        .single()

      if (compError || !competition) {
        return new Response(
          JSON.stringify({ error: `Competition ${item.competition_id} not found` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate competition is active
      if (competition.status !== 'active') {
        return new Response(
          JSON.stringify({ error: `Competition is ${competition.status}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate quantity
      if (item.quantity <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid quantity' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check ticket availability
      const availableTickets = competition.max_tickets - (competition.tickets_sold || 0)
      if (availableTickets < item.quantity) {
        return new Response(
          JSON.stringify({ error: `Only ${availableTickets} tickets available` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check user's current tickets for this competition
      const { data: userTickets } = await supabaseAdmin
        .from('ticket_allocations')
        .select('id', { count: 'exact', head: true })
        .eq('competition_id', item.competition_id)
        .eq('sold_to_user_id', user.id)
        .eq('is_sold', true)

      const userCurrentTickets = userTickets || 0
      const maxPerUser = competition.max_tickets_per_user || competition.max_tickets

      if (userCurrentTickets + item.quantity > maxPerUser) {
        return new Response(
          JSON.stringify({
            error: `Maximum ${maxPerUser} tickets per user. You already have ${userCurrentTickets}`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // SERVER-SIDE PRICE CALCULATION - Use database price, not client price
      const itemTotalPence = competition.base_ticket_price_pence * item.quantity
      subtotalPence += itemTotalPence

      validatedItems.push({
        competition_id: item.competition_id,
        ticket_count: item.quantity,
        price_per_ticket_pence: competition.base_ticket_price_pence,
        total_pence: itemTotalPence,
      })
    }

    // Step 2: Validate and calculate promo code discount
    let discountPence = 0
    let promoCodeData = null

    if (promo_code) {
      const { data: promo, error: promoError } = await supabaseAdmin
        .from('promo_codes')
        .select('*')
        .eq('code', promo_code.toUpperCase())
        .eq('is_active', true)
        .single()

      if (promoError || !promo) {
        return new Response(
          JSON.stringify({ error: 'Invalid promo code' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate promo code date range
      const now = new Date()
      if (promo.valid_from && new Date(promo.valid_from) > now) {
        return new Response(
          JSON.stringify({ error: 'Promo code not yet valid' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (promo.valid_until && new Date(promo.valid_until) < now) {
        return new Response(
          JSON.stringify({ error: 'Promo code has expired' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate usage limits
      if (promo.max_uses && (promo.current_uses ?? 0) >= promo.max_uses) {
        return new Response(
          JSON.stringify({ error: 'Promo code usage limit reached' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate minimum order
      if (promo.min_order_pence && subtotalPence < promo.min_order_pence) {
        return new Response(
          JSON.stringify({ error: `Minimum order £${(promo.min_order_pence / 100).toFixed(2)} required` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // SERVER-SIDE DISCOUNT CALCULATION
      if (promo.type === 'percentage') {
        discountPence = Math.round((subtotalPence * promo.value) / 100)
      } else if (promo.type === 'fixed_value') {
        discountPence = Math.min(promo.value, subtotalPence)
      } else if (promo.type === 'free_tickets') {
        const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0)
        const avgPricePerTicket = totalTickets > 0 ? subtotalPence / totalTickets : 0
        const freeTicketsValue = Math.round(avgPricePerTicket * promo.value)
        discountPence = Math.min(freeTicketsValue, subtotalPence)
      }

      promoCodeData = promo
    }

    const priceAfterDiscount = subtotalPence - discountPence

    // Step 3: Calculate available wallet credit
    let creditAppliedPence = 0

    if (use_wallet_credit) {
      // SERVER-SIDE: Fetch actual available balance
      const { data: walletData } = await supabaseAdmin
        .from('wallet_credits')
        .select('remaining_pence')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('remaining_pence', 0)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

      const availableBalance = (walletData || []).reduce((sum, credit) => sum + credit.remaining_pence, 0)

      // Apply up to the available balance, not exceeding order total
      creditAppliedPence = Math.min(availableBalance, priceAfterDiscount)
    }

    const finalTotalPence = priceAfterDiscount - creditAppliedPence

    // Step 4: Create order with SERVER-VALIDATED values
    const orderData: any = {
      user_id: user.id,
      subtotal_pence: subtotalPence,
      discount_pence: discountPence,
      credit_applied_pence: creditAppliedPence,
      total_pence: finalTotalPence,
      status: 'pending',
    }

    // Add influencer if provided
    if (influencer_id) {
      const { data: influencer } = await supabaseAdmin
        .from('influencers')
        .select('user_id')
        .eq('id', influencer_id)
        .eq('is_active', true)
        .single()

      if (influencer) {
        orderData.influencer_id = influencer.user_id
      }
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert(orderData)
      .select()
      .single()

    if (orderError) {
      console.error('Order creation error:', orderError)
      throw new Error('Failed to create order')
    }

    // Insert order items with SERVER-VALIDATED prices
    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(
        validatedItems.map(item => ({
          ...item,
          order_id: order.id,
        }))
      )

    if (itemsError) {
      console.error('Order items error:', itemsError)
      // Rollback order
      await supabaseAdmin.from('orders').delete().eq('id', order.id)
      throw new Error('Failed to create order items')
    }

    // Update phone number
    const cleanedPhone = mobile_number.replace(/\s/g, '')
    await supabaseAdmin
      .from('profiles')
      .update({ phone: cleanedPhone })
      .eq('id', user.id)

    // Increment promo code usage
    if (promoCodeData) {
      await supabaseAdmin
        .from('promo_codes')
        .update({ current_uses: (promoCodeData.current_uses ?? 0) + 1 })
        .eq('id', promoCodeData.id)
    }

    console.log(`✅ Order ${order.id} created with validated prices:`, {
      subtotal_pence: subtotalPence,
      discount_pence: discountPence,
      credit_applied_pence: creditAppliedPence,
      total_pence: finalTotalPence,
    })

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        subtotal_pence: subtotalPence,
        discount_pence: discountPence,
        credit_applied_pence: creditAppliedPence,
        total_pence: finalTotalPence,
      } as ValidatedOrderResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error creating validated order:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create order',
      } as ValidatedOrderResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
