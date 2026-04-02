import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PayoutResult {
  success: boolean
  total_influencers: number
  successful_payouts: number
  failed_payouts: number
  total_amount_pence: number
  total_amount_gbp: number
  errors: Array<{
    influencer_id: string
    influencer_name: string
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
      console.error('[process-monthly-payouts] Unauthorized access attempt')
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    console.log('Starting monthly influencer commission payouts...')

    // Call the database function to process payouts
    const { data, error } = await supabaseClient.rpc('process_monthly_influencer_payouts')

    if (error) {
      console.error('Error processing monthly payouts:', error)
      throw error
    }

    const result = data as PayoutResult

    console.log('Monthly payout process completed:', result.message)
    console.log(`Total: ${result.total_influencers}, Successful: ${result.successful_payouts}, Failed: ${result.failed_payouts}`)
    console.log(`Total amount paid: £${result.total_amount_gbp.toFixed(2)}`)

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
    console.error('Error in process-monthly-payouts function:', error)

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
