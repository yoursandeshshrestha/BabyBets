import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ClaimWheelPrizeRequest {
  email: string
  prizeLabel: string
  prizeValue: string
  prizeType: 'credit' | 'discount' | 'free_entry'
  prizeAmount?: number // For credits: amount in GBP, For discounts: percentage value
}

// SECURITY: Define allowed wheel prize configurations
// Prevents users from claiming arbitrary amounts
const ALLOWED_WHEEL_PRIZES = {
  credit: [1, 2, 5, 10, 20], // Allowed credit amounts in GBP
  discount: [5, 10, 15, 20, 25, 50], // Allowed discount percentages
  free_entry: [1] // Always 1 free entry
}

interface ClaimWheelPrizeResponse {
  success: boolean
  message: string
  alreadyClaimed?: boolean
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create service role client for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const { email, prizeLabel, prizeValue, prizeType, prizeAmount }: ClaimWheelPrizeRequest = await req.json()

    // Validate input
    if (!email || !prizeLabel || !prizeValue || !prizeType) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid email format'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // SECURITY FIX: Validate prizeAmount against allowed configuration
    if (prizeType === 'credit' && prizeAmount) {
      if (!ALLOWED_WHEEL_PRIZES.credit.includes(prizeAmount)) {
        console.error(`[Security] Invalid credit amount attempted: ${prizeAmount}`)
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Invalid prize amount'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          }
        )
      }
    } else if (prizeType === 'discount' && prizeAmount) {
      if (!ALLOWED_WHEEL_PRIZES.discount.includes(prizeAmount)) {
        console.error(`[Security] Invalid discount percentage attempted: ${prizeAmount}`)
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Invalid prize amount'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          }
        )
      }
    } else if (prizeType === 'free_entry' && prizeAmount && prizeAmount !== 1) {
      console.error(`[Security] Invalid free entry amount attempted: ${prizeAmount}`)
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid prize amount'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Check if email has already claimed (use admin client)
    const { data: existingClaim, error: checkError } = await supabaseAdmin
      .from('wheel_claims')
      .select('id, claimed_at')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (checkError) {
      console.error('Error checking existing claim:', checkError)
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Error checking claim eligibility'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    if (existingClaim) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Looks like this email has already claimed a spin prize. This offer is for new customers only.',
          alreadyClaimed: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409
        }
      )
    }

    // Get user ID if logged in (from auth header)
    let userId: string | null = null
    const authHeader = req.headers.get('Authorization')

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        // Try to get the user from the JWT token
        // For anonymous users (using anon key), this will return no user, which is fine
        const token = authHeader.replace('Bearer ', '')

        // Create client with the provided token to check for authenticated user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

        if (!authError && user) {
          userId = user.id
          console.log(`Authenticated user: ${user.id}`)
        } else {
          console.log('Anonymous request (no user session)')
        }
      } catch (error) {
        // Ignore auth errors for anonymous users
        console.log('No valid user session, proceeding as anonymous')
      }
    }

    // Create promo code for discounts or process credits/free entry
    let promoCodeId: string | null = null
    let generatedPromoCode: string | null = null

    if (prizeType === 'discount') {
      // Create a unique promo code with random suffix
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase()
      const promoCode = `${prizeValue.toUpperCase()}-${randomSuffix}`
      generatedPromoCode = promoCode
      const expiresAt = new Date()
      expiresAt.setMinutes(expiresAt.getMinutes() + 60) // 60 minutes expiry

      const { data: promoData, error: promoError } = await supabaseAdmin
        .from('promo_codes')
        .insert({
          code: promoCode,
          type: 'percentage',
          value: prizeAmount || 0,
          max_uses: 1,
          current_uses: 0,
          max_uses_per_user: 1,
          min_order_pence: 0,
          valid_from: new Date().toISOString(),
          valid_until: expiresAt.toISOString(),
          is_active: true,
          competition_ids: [],
          new_customers_only: false,
        })
        .select('id')
        .single()

      if (promoError) {
        console.error('Error creating promo code:', promoError)
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Error creating promo code'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
          }
        )
      }

      promoCodeId = promoData.id
    } else if (prizeType === 'credit' && userId) {
      // Apply credit to user's wallet
      const amountPence = Math.round((prizeAmount || 0) * 100)

      // Set expiry to 1 year from now
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)

      // Create wallet credit
      const { error: creditError } = await supabaseAdmin
        .from('wallet_credits')
        .insert({
          user_id: userId,
          amount_pence: amountPence,
          remaining_pence: amountPence,
          source_type: 'wheel_spin',
          description: `Spin the wheel prize: ${prizeLabel}`,
          expires_at: expiryDate.toISOString(),
          status: 'active',
        })

      if (creditError) {
        console.error('Error creating wallet credit:', creditError)
        // Continue anyway, will send email with instructions
      }
    }

    // Record the claim
    const { error: claimError } = await supabaseAdmin
      .from('wheel_claims')
      .insert({
        email: email.toLowerCase(),
        prize_type: prizeType,
        prize_label: prizeLabel,
        prize_value: prizeValue,
        prize_amount: prizeAmount,
        user_id: userId,
        promo_code_id: promoCodeId,
        email_sent: false,
      })

    if (claimError) {
      console.error('Error recording claim:', claimError)
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Error recording claim'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    // Send email notification
    try {
      const emailData: Record<string, unknown> = {
        prizeLabel,
        prizeValue,
        prizeType,
        prizeAmount,
      }

      if (prizeType === 'discount' && generatedPromoCode) {
        emailData.promoCode = generatedPromoCode
        emailData.expiryMinutes = 60
      }

      // Call email function directly using fetch
      const emailFunctionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification-email`
      const emailResponse = await fetch(emailFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          type: 'wheel_prize',
          recipientEmail: email,
          recipientName: userId ? undefined : 'there',
          data: emailData,
        }),
      })

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text()
        console.error('Error sending email:', errorText)
      } else {
        console.log('Email sent successfully')

        // Update email sent status
        await supabaseAdmin
          .from('wheel_claims')
          .update({
            email_sent: true,
            email_sent_at: new Date().toISOString()
          })
          .eq('email', email.toLowerCase())
          .eq('prize_value', prizeValue)
      }

    } catch (emailError) {
      console.error('Error sending email:', emailError)
      // Don't fail the request if email fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Prize claimed successfully! Check your inbox (and junk folder).',
        alreadyClaimed: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error in claim-wheel-prize function:', error)
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
