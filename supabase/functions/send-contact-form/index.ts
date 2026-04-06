import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  const requestOrigin = req.headers.get('Origin') || undefined
  const corsHeaders = getCorsHeaders(false, requestOrigin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, email, subject, message } = await req.json()

    // Basic validation
    if (!name || !email || !subject || !message) {
      return new Response(
        JSON.stringify({ error: 'All fields are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create HTML and text versions
    const html = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br />')}</p>
    `

    const text = `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage:\n${message}`

    // Get webhook secret from database (same as other email functions)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: webhookConfig, error: configError } = await supabaseAdmin
      .from('webhook_config')
      .select('webhook_secret, supabase_url')
      .limit(1)
      .single()

    if (configError || !webhookConfig?.webhook_secret) {
      console.error('Failed to get webhook config:', configError)
      throw new Error('Email configuration not available')
    }

    // Send email via unified send-email function
    const emailPayload = {
      type: 'custom',
      recipientEmail: 'hello@babybets.co.uk',
      data: {
        subject: `Contact Form: ${subject}`,
        html,
        text
      }
    }

    const emailResponse = await fetch(
      `${webhookConfig.supabase_url}/functions/v1/send-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhookConfig.webhook_secret,
        },
        body: JSON.stringify(emailPayload),
      }
    )

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      console.error('Email send error:', errorText)
      throw new Error('Failed to send email')
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Contact form submitted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
