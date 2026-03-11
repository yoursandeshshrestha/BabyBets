import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// G2Pay Payment Gateway Configuration
export const G2PAY_CONFIG = {
  merchantId: import.meta.env.VITE_G2PAY_MERCHANT_ID,
  environment: import.meta.env.MODE === 'production' ? 'production' : 'sandbox',
  edgeFunctionUrl: import.meta.env.VITE_SUPABASE_URL + '/functions/v1',
}

// Card details interface
export interface CardDetails {
  cardNumber: string
  expiryMonth: string
  expiryYear: string
  cvv: string
  cardholderName: string
}

// Hosted payment session response
interface HostedSessionResponse {
  success: boolean
  hostedPaymentURL?: string
  paymentFormData?: Record<string, string>
  orderRef?: string
  transactionUnique?: string
  error?: string
}

// Create a hosted payment session via Edge Function
// Direct API: collect card details on our page
export const createHostedPaymentSession = async (
  orderRef: string,
  customerEmail?: string,
  customerPhone?: string,
  cardDetails?: CardDetails
): Promise<HostedSessionResponse> => {
  // Get current session
  const {
    data: { session: currentSession },
    error: getSessionError
  } = await supabase.auth.getSession()

  if (getSessionError) {
    console.error('[G2Pay Hosted] Error getting session:', getSessionError)
    throw new Error('Failed to get authentication session')
  }

  if (!currentSession?.access_token) {
    console.error('[G2Pay Hosted] No valid session or access token')
    throw new Error('Not authenticated. Please log in.')
  }

  // Check if token is about to expire (within 5 minutes)
  const expiresAt = currentSession.expires_at
  const now = Math.floor(Date.now() / 1000)
  const timeUntilExpiry = expiresAt ? expiresAt - now : 0
  const shouldRefresh = expiresAt && timeUntilExpiry < 300

  // Refresh if needed
  if (shouldRefresh) {
    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession()

    if (refreshError) {
      console.error('[G2Pay Hosted] Session refresh error:', refreshError)
      throw new Error(`Session refresh failed: ${refreshError.message}. Please log in again.`)
    }

    if (!refreshedSession?.access_token) {
      console.error('[G2Pay Hosted] No valid session after refresh')
      throw new Error('Failed to refresh session. Please log in again.')
    }
  }

  // Get the latest session to ensure we have the most current JWT token
  const {
    data: { session: latestSession },
  } = await supabase.auth.getSession()

  if (!latestSession?.access_token) {
    throw new Error('No access token available. Please log in again.')
  }

  // Create a new Supabase client instance with the specific JWT token
  const supabaseWithAuth = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${latestSession.access_token}`,
        },
      },
    }
  )

  // Call Edge Function to create Direct API payment session
  const { data, error } = await supabaseWithAuth.functions.invoke('create-g2pay-hosted-session', {
    body: {
      orderRef,
      customerEmail,
      customerPhone,
      cardDetails,
    },
  })

  if (error) {
    console.error('[G2Pay Hosted] Edge function error:', error)
    console.error('[G2Pay Hosted] Error details:', {
      message: error.message,
      context: error.context,
      details: error
    })

    // Handle JWT-specific errors
    if (error.message?.includes('JWT') || error.message?.includes('401')) {
      throw new Error('Session expired. Please refresh the page and log in again.')
    }

    // Try to extract error from response body (when edge function returns 400 with error details)
    // The error context might contain the parsed JSON response
    if (error.context && typeof error.context === 'object') {
      const errorData = error.context as { error?: string; rawMessage?: string; responseCode?: string }
      console.log('[G2Pay Hosted] Error context data:', errorData)
      if (errorData.error) {
        throw new Error(errorData.error)
      }
      if (errorData.rawMessage) {
        throw new Error(errorData.rawMessage)
      }
    }

    // Try to parse error message as JSON (sometimes the error message contains the JSON response)
    try {
      const errorJson = JSON.parse(error.message)
      if (errorJson.error) {
        throw new Error(errorJson.error)
      }
    } catch (e) {
      // Not JSON, continue
    }

    throw new Error(error.message || 'Failed to create payment session')
  }

  // Check if the payment failed (edge function returned success: false in the data)
  if (data && !data.success) {
    console.error('[G2Pay Hosted] Payment failed:', data)
    throw new Error(data.error || data.rawMessage || 'Payment failed')
  }

  return data
}
