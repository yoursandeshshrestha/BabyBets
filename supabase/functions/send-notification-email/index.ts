import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getPrizeWinHTML, getPrizeWinText } from './templates/prize-win.ts'
import { getOrderConfirmationHTML, getOrderConfirmationText } from './templates/order-confirmation.ts'
import { getWithdrawalRequestHTML, getWithdrawalRequestText } from './templates/withdrawal-request.ts'
import { getWithdrawalApprovedHTML, getWithdrawalApprovedText } from './templates/withdrawal-approved.ts'
import { getWithdrawalRejectedHTML, getWithdrawalRejectedText } from './templates/withdrawal-rejected.ts'
import { getCompetitionEndingHTML, getCompetitionEndingText } from './templates/competition-ending.ts'
import { getWelcomeHTML, getWelcomeText } from './templates/welcome.ts'
import { getInfluencerApplicationSubmittedHTML, getInfluencerApplicationSubmittedText } from './templates/influencer-application-submitted.ts'
import { getInfluencerApprovedHTML, getInfluencerApprovedText } from './templates/influencer-approved.ts'
import { getInfluencerApprovedWithPasswordHTML, getInfluencerApprovedWithPasswordText } from './templates/influencer-approved-with-password.ts'
import { getInfluencerRejectedHTML, getInfluencerRejectedText } from './templates/influencer-rejected.ts'
import { getPrizeFulfillmentUpdateHTML, getPrizeFulfillmentUpdateText } from './templates/prize-fulfillment-update.ts'
import { getWalletCreditHTML, getWalletCreditText } from './templates/wallet-credit.ts'
import { getWheelPrizeHTML, getWheelPrizeText } from './templates/wheel-prize.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailNotification {
  type: 'prize_win' | 'order_confirmation' | 'withdrawal_request' | 'withdrawal_approved' | 'withdrawal_rejected' | 'competition_ending' | 'welcome' | 'influencer_application_submitted' | 'influencer_approved' | 'influencer_approved_with_password' | 'influencer_rejected' | 'prize_fulfillment_update' | 'wallet_credit' | 'wheel_prize' | 'custom'
  recipientEmail: string
  recipientName?: string
  data: Record<string, unknown>
}

/**
 * Get email template based on notification type
 * Templates are imported from separate files in ./templates/
 */
async function getEmailTemplate(notification: EmailNotification, supabaseClient: ReturnType<typeof createClient>): Promise<{ subject: string; html: string; text: string }> {
  const { type, recipientName, data } = notification
  const firstName = recipientName || 'there'

  // Fetch email logo from system settings
  let emailLogoUrl: string | undefined
  try {
    const { data: settingsData } = await supabaseClient
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'email_logo')
      .single()

    if (settingsData && settingsData.setting_value && typeof settingsData.setting_value === 'object' && !Array.isArray(settingsData.setting_value)) {
      const emailLogoSettings = settingsData.setting_value as { url?: string | null }
      emailLogoUrl = emailLogoSettings.url || undefined
    }
  } catch (error) {
    console.warn('Failed to fetch email logo from settings, using default:', error)
  }

  switch (type) {
    case 'prize_win':
      return {
        subject: `🎉 Congratulations! You've Won ${data.prizeName || 'a Prize'}!`,
        html: getPrizeWinHTML(firstName, data, emailLogoUrl),
        text: getPrizeWinText(firstName, data),
      }

    case 'order_confirmation':
      return {
        subject: `Order Confirmation - ${data.orderNumber || 'Your Order'}`,
        html: getOrderConfirmationHTML(firstName, data, emailLogoUrl),
        text: getOrderConfirmationText(firstName, data),
      }

    case 'withdrawal_request':
      return {
        subject: 'Withdrawal Request Received',
        html: getWithdrawalRequestHTML(firstName, data, emailLogoUrl),
        text: getWithdrawalRequestText(firstName, data),
      }

    case 'withdrawal_approved':
      return {
        subject: '✅ Withdrawal Approved - Payment Processing',
        html: getWithdrawalApprovedHTML(firstName, data, emailLogoUrl),
        text: getWithdrawalApprovedText(firstName, data),
      }

    case 'withdrawal_rejected':
      return {
        subject: 'Withdrawal Request Declined',
        html: getWithdrawalRejectedHTML(firstName, data, emailLogoUrl),
        text: getWithdrawalRejectedText(firstName, data),
      }

    case 'competition_ending':
      return {
        subject: `⏰ Last Chance! ${data.competitionTitle || 'Competition'} Ending Soon`,
        html: getCompetitionEndingHTML(firstName, data, emailLogoUrl),
        text: getCompetitionEndingText(firstName, data),
      }

    case 'welcome':
      return {
        subject: '🎉 Welcome to BabyBets!',
        html: getWelcomeHTML(firstName, data, emailLogoUrl),
        text: getWelcomeText(firstName, data),
      }

    case 'influencer_application_submitted':
      return {
        subject: 'BabyBets Partner Application Received',
        html: getInfluencerApplicationSubmittedHTML(firstName, data, emailLogoUrl),
        text: getInfluencerApplicationSubmittedText(firstName, data),
      }

    case 'influencer_approved':
      return {
        subject: '🎉 Welcome to BabyBets Partners!',
        html: getInfluencerApprovedHTML(firstName, data, emailLogoUrl),
        text: getInfluencerApprovedText(firstName, data),
      }

    case 'influencer_approved_with_password':
      return {
        subject: '🎉 Welcome to BabyBets Partners - Your Account Details',
        html: getInfluencerApprovedWithPasswordHTML(firstName, data, emailLogoUrl),
        text: getInfluencerApprovedWithPasswordText(firstName, data),
      }

    case 'influencer_rejected':
      return {
        subject: 'BabyBets Partner Application Update',
        html: getInfluencerRejectedHTML(firstName, data, emailLogoUrl),
        text: getInfluencerRejectedText(firstName, data),
      }

    case 'prize_fulfillment_update':
      return {
        subject: `Prize Update: ${data.prizeName || 'Your Prize'}`,
        html: getPrizeFulfillmentUpdateHTML(firstName, data, emailLogoUrl),
        text: getPrizeFulfillmentUpdateText(firstName, data),
      }

    case 'wallet_credit':
      return {
        subject: `£${data.amount || '0.00'} Added to Your BabyBets Wallet!`,
        html: getWalletCreditHTML(firstName, data, emailLogoUrl),
        text: getWalletCreditText(firstName, data),
      }

    case 'wheel_prize':
      return {
        subject: `🎉 You Won ${data.prizeLabel || 'a Prize'}!`,
        html: getWheelPrizeHTML(firstName, data, emailLogoUrl),
        text: getWheelPrizeText(firstName, data),
      }

    case 'custom':
      return {
        subject: (data.subject as string) || 'Notification from BabyBets',
        html: (data.html as string) || (data.text as string) || '',
        text: (data.text as string) || '',
      }

    default:
      throw new Error(`Unknown notification type: ${type}`)
  }
}

/**
 * Main handler - Non-blocking email notification service
 * SECURITY: This is an internal-only function that requires service role key authentication
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // SECURITY: Verify service role key to prevent unauthorized email sending
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
      console.error('[send-notification-email] Unauthorized access attempt')
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    )

    const notification: EmailNotification = await req.json()

    if (!notification.recipientEmail || !notification.type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: recipientEmail, type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get email template
    const { subject, html, text } = await getEmailTemplate(notification, supabaseClient)

    // Get Mailgun settings
    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY')
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN')
    const fromEmail = Deno.env.get('SMTP_FROM')

    if (!mailgunApiKey || !mailgunDomain || !fromEmail) {
      throw new Error('Mailgun configuration missing: MAILGUN_API_KEY, MAILGUN_DOMAIN, and SMTP_FROM are required')
    }

    // Log notification
    const { data: loggedNotification } = await supabaseClient
      .from('email_notifications')
      .insert({
        type: notification.type,
        recipient_email: notification.recipientEmail,
        status: 'pending',
        data: notification.data,
      })
      .select()
      .single()

    // Send email via Mailgun and update status
    const formData = new FormData()
    formData.append('from', `BabyBets <${fromEmail}>`)
    formData.append('to', notification.recipientEmail)
    formData.append('subject', subject)
    formData.append('text', text)
    formData.append('html', html)

    try {
      const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`api:${mailgunApiKey}`),
        },
        body: formData,
      })

      if (mailgunResponse.ok) {
        // Update to sent status
        if (loggedNotification) {
          await supabaseClient
            .from('email_notifications')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', loggedNotification.id)
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Email sent successfully',
            notification_id: loggedNotification?.id,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        // Mailgun returned an error
        const errorText = await mailgunResponse.text()
        const errorMessage = `Mailgun error: ${mailgunResponse.status} - ${errorText}`

        if (loggedNotification) {
          await supabaseClient
            .from('email_notifications')
            .update({
              status: 'failed',
              error_message: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', loggedNotification.id)
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: errorMessage,
            notification_id: loggedNotification?.id,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } catch (mailgunError) {
      // Network error or other exception
      const errorMessage = mailgunError instanceof Error ? mailgunError.message : 'Unknown error sending email'
      console.error('Error sending email to Mailgun:', mailgunError)

      if (loggedNotification) {
        await supabaseClient
          .from('email_notifications')
          .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', loggedNotification.id)
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          notification_id: loggedNotification?.id,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('Error in send-notification-email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
