import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DrawExecutionResult {
  success: boolean
  total_competitions: number
  successful_draws: number
  failed_draws: number
  draws_executed: Array<{
    competition_id: string
    competition_title: string
    draw_datetime: string
    winner_display_name: string
    winning_ticket_number: number
    winner_email: string
    prize_name: string
    prize_value: number
  }>
  errors: Array<{
    competition_id: string
    competition_title: string
    error: string
  }>
  processed_at: string
  message: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // SECURITY: Verify service role key for automated/cron job access
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!authHeader || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the Authorization header matches the service role key
    const expectedAuth = `Bearer ${serviceRoleKey}`
    if (authHeader !== expectedAuth) {
      console.error('[auto-execute-draws] Unauthorized access attempt')
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    console.log('Starting automatic draw execution...')

    // Call the database function to auto-execute draws
    const { data, error } = await supabaseClient.rpc('auto_execute_competition_draws')

    if (error) {
      console.error('Error executing automatic draws:', error)
      throw error
    }

    const result = data as DrawExecutionResult

    console.log('Automatic draw execution completed:', result.message)
    console.log(`Total: ${result.total_competitions}, Successful: ${result.successful_draws}, Failed: ${result.failed_draws}`)

    // Log each successful draw and send winner emails (non-blocking)
    if (result.draws_executed.length > 0) {
      console.log('Draws executed:')

      for (const draw of result.draws_executed) {
        console.log(`  - ${draw.competition_title}: Winner #${draw.winning_ticket_number} (${draw.winner_display_name})`)

        // Send prize win email to winner (fire and forget)
        const emailPayload = {
          type: 'prize_win',
          recipientEmail: draw.winner_email,
          recipientName: draw.winner_display_name,
          data: {
            prizeName: draw.prize_name || draw.competition_title,
            prizeValue: draw.prize_value,
            prizeDescription: draw.competition_title,
            ticketNumber: draw.winning_ticket_number.toString(),
            competitionTitle: draw.competition_title,
            claimUrl: `${Deno.env.get('PUBLIC_SITE_URL') || 'https://babybets.co.uk'}/account?tab=prizes`
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
        ).then((emailResponse) => {
          if (!emailResponse.ok) {
            console.error(`  ⚠️  Failed to queue prize win email to ${draw.winner_email}`)
          } else {
            console.log(`  ✅ Prize win email queued for ${draw.winner_email}`)
          }
        }).catch((emailError) => {
          console.error(`  ⚠️  Error queueing prize win email:`, emailError)
        })
      }
    }

    // Log errors if any
    if (result.errors.length > 0) {
      console.error('Errors encountered:')
      result.errors.forEach((error) => {
        console.error(`  - ${error.competition_title}: ${error.error}`)
      })
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in auto-execute-draws function:', error)

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
