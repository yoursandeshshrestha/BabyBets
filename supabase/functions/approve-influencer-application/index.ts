import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ApproveInfluencerRequest {
  influencerId: string
}

// Helper function to generate random password
function generateRandomPassword(length: number = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Create Supabase client with user's auth token for checking permissions
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin (check user_metadata.role)
    const userRole = user.user_metadata?.role
    if (!userRole || (userRole !== 'admin' && userRole !== 'super_admin')) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { influencerId }: ApproveInfluencerRequest = await req.json()

    if (!influencerId) {
      return new Response(
        JSON.stringify({ error: 'Missing influencerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get influencer record
    const { data: influencer, error: influencerFetchError } = await supabaseAdmin
      .from('influencers')
      .select('*')
      .eq('id', influencerId)
      .single()

    if (influencerFetchError || !influencer) {
      return new Response(
        JSON.stringify({ error: 'Influencer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if this is a new application (user_id is null)
    if (influencer.user_id) {
      // Already has a user account, just reactivate
      const { error: approveError } = await supabaseAdmin.rpc(
        'approve_influencer_application',
        {
          p_influencer_id: influencerId,
          p_user_id: influencer.user_id
        }
      )

      if (approveError) throw approveError

      // Update profile role
      await supabaseAdmin
        .from('profiles')
        .update({ role: 'influencer' })
        .eq('id', influencer.user_id)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Influencer reactivated',
          requiresPasswordEmail: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // New application - need to create user account
    if (!influencer.email) {
      return new Response(
        JSON.stringify({ error: 'Cannot approve: email address is missing' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user already exists with this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users.find(u => u.email === influencer.email)

    let userId: string
    let tempPassword: string | null = null
    let requiresPasswordEmail = false

    if (existingUser) {
      // User already exists - just link them to the influencer record
      userId = existingUser.id

      // Update user metadata to include influencer role
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingUser.user_metadata,
          role: 'influencer'
        }
      })

      requiresPasswordEmail = false
    } else {
      // Create new user account
      tempPassword = generateRandomPassword(12)

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: influencer.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: influencer.display_name,
          role: 'influencer'
        }
      })

      if (authError || !authData.user) {
        console.error('Error creating user account:', authError)
        return new Response(
          JSON.stringify({
            error: `Failed to create user account: ${authError?.message || 'Unknown error'}`
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      userId = authData.user.id
      requiresPasswordEmail = true
    }

    // Use the SECURITY DEFINER function to approve the influencer
    // This bypasses the field protection trigger
    const { error: approveError } = await supabaseAdmin.rpc(
      'approve_influencer_application',
      {
        p_influencer_id: influencerId,
        p_user_id: userId
      }
    )

    if (approveError) {
      console.error('Error approving influencer:', approveError)
      throw approveError
    }

    // Update profile role to 'influencer'
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ role: 'influencer' })
      .eq('id', userId)

    if (profileError) {
      console.error('Error updating profile:', profileError)
      throw profileError
    }

    // Send appropriate approval email
    let emailStatus = 'not_sent'
    let emailError = null

    try {
      const siteUrl = Deno.env.get('SITE_URL')
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

      if (!siteUrl || !supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing configuration: SITE_URL, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required')
      }

      let emailNotification: any

      if (requiresPasswordEmail && tempPassword) {
        emailNotification = {
          type: 'influencer_approved_with_password',
          recipientEmail: influencer.email,
          recipientName: influencer.display_name || 'there',
          data: {
            recipientEmail: influencer.email,
            displayName: influencer.display_name,
            slug: influencer.slug,
            temporaryPassword: tempPassword,
            loginUrl: `${siteUrl}/login`,
            dashboardUrl: `${siteUrl}/influencer/dashboard`,
            commissionTier: influencer.commission_tier || 1
          }
        }
      } else {
        emailNotification = {
          type: 'influencer_approved',
          recipientEmail: influencer.email,
          recipientName: influencer.display_name || 'there',
          data: {
            recipientEmail: influencer.email,
            displayName: influencer.display_name,
            slug: influencer.slug,
            dashboardUrl: `${siteUrl}/influencer/dashboard`,
            commissionTier: influencer.commission_tier || 1
          }
        }
      }

      console.log('Sending email notification:', JSON.stringify(emailNotification))

      const emailResponse = await fetch(
        `${supabaseUrl}/functions/v1/send-notification-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify(emailNotification),
        }
      )

      const emailResult = await emailResponse.json()

      if (emailResponse.ok) {
        emailStatus = 'sent'
        console.log('Email sent successfully:', emailResult)
      } else {
        emailStatus = 'failed'
        emailError = emailResult.error || 'Unknown error'
        console.error('Email sending failed:', emailResult)
      }
    } catch (err) {
      emailStatus = 'failed'
      emailError = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to send approval email:', err)
      // Don't throw - email failure shouldn't block the operation
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: requiresPasswordEmail
          ? 'Application approved! User account created and login credentials sent'
          : 'Application approved! Existing user account linked',
        email: influencer.email,
        userId: userId,
        requiresPasswordEmail: requiresPasswordEmail,
        emailStatus: emailStatus,
        emailError: emailError
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in approve-influencer-application:', error)

    // Detailed error logging
    let errorMessage = 'Unknown error'
    let errorDetails = {}

    if (error instanceof Error) {
      errorMessage = error.message
      errorDetails = {
        name: error.name,
        stack: error.stack,
      }
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error)
      errorDetails = error
    } else {
      errorMessage = String(error)
    }

    console.error('Detailed error:', { errorMessage, errorDetails })

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: errorDetails
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
