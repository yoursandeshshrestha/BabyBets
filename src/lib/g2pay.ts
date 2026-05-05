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

// Payment response (may include 3DS challenge)
export interface PaymentResponse {
  success: boolean
  status?: 'threeDSRequired' | 'success'
  // Direct success
  transactionID?: string
  transactionUnique?: string
  orderRef?: string
  message?: string
  // 3DS challenge
  threeDSRef?: string
  threeDSURL?: string
  threeDSRequest?: string
  xref?: string
  // Error
  error?: string
}

/**
 * Get an authenticated Supabase client with fresh token.
 */
async function getAuthenticatedClient() {
  const {
    data: { session: currentSession },
    error: getSessionError,
  } = await supabase.auth.getSession()

  if (getSessionError) {
    throw new Error('Failed to get authentication session')
  }

  if (!currentSession?.access_token) {
    throw new Error('Not authenticated. Please log in.')
  }

  // Refresh if token expires within 5 minutes
  const expiresAt = currentSession.expires_at
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt && expiresAt - now < 300) {
    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) {
      throw new Error(`Session refresh failed: ${refreshError.message}. Please log in again.`)
    }
  }

  const {
    data: { session: latestSession },
  } = await supabase.auth.getSession()

  if (!latestSession?.access_token) {
    throw new Error('No access token available. Please log in again.')
  }

  return createClient(
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
}

/**
 * SECURITY FIX: Create order with server-side validation
 * Sends only competition IDs and quantities - server validates prices
 */
export interface CreateValidatedOrderRequest {
  items: Array<{ competition_id: string; quantity: number }>
  promo_code?: string
  use_wallet_credit?: boolean
  mobile_number: string
  influencer_id?: string
}

export interface ValidatedOrderResponse {
  success: boolean
  order_id?: string
  subtotal_pence: number
  discount_pence: number
  credit_applied_pence: number
  total_pence: number
  error?: string
}

export const createValidatedOrder = async (
  request: CreateValidatedOrderRequest
): Promise<ValidatedOrderResponse> => {
  const supabaseWithAuth = await getAuthenticatedClient()

  const { data, error } = await supabaseWithAuth.functions.invoke('create-validated-order', {
    body: request,
  })

  if (error) {
    console.error('[G2Pay] Validated order creation error:', error)
    throw new Error(error.message || 'Failed to create order')
  }

  if (data && !data.success) {
    throw new Error(data.error || 'Order validation failed')
  }

  return data
}

/**
 * Create a payment session via Edge Function.
 * Returns either success or 3DS challenge data.
 */
export const createHostedPaymentSession = async (
  orderRef: string,
  customerEmail?: string,
  customerPhone?: string,
  cardDetails?: CardDetails
): Promise<PaymentResponse> => {
  const supabaseWithAuth = await getAuthenticatedClient()

  const { data, error } = await supabaseWithAuth.functions.invoke('create-g2pay-hosted-session', {
    body: { orderRef, customerEmail, customerPhone, cardDetails },
  })

  if (error) {
    console.error('[G2Pay] Edge function error:', error)

    if (error.message?.includes('JWT') || error.message?.includes('401')) {
      throw new Error('Session expired. Please refresh the page and log in again.')
    }

    if (error.context && typeof error.context === 'object') {
      const errorData = error.context as { error?: string }
      if (errorData.error) throw new Error(errorData.error)
    }

    try {
      const errorJson = JSON.parse(error.message)
      if (errorJson.error) throw new Error(errorJson.error)
    } catch {
      // Not JSON
    }

    throw new Error(error.message || 'Failed to create payment session')
  }

  if (data && !data.success) {
    throw new Error(data.error || 'Payment failed')
  }

  return data
}

/**
 * Continue 3DS flow after ACS challenge response.
 */
export const continue3DS = async (
  threeDSRef: string,
  threeDSResponse: Record<string, string>,
  orderRef: string
): Promise<PaymentResponse> => {
  const supabaseWithAuth = await getAuthenticatedClient()

  const { data, error } = await supabaseWithAuth.functions.invoke('continue-3ds', {
    body: { threeDSRef, threeDSResponse, orderRef },
  })

  if (error) {
    console.error('[G2Pay] continue-3ds error:', error)
    throw new Error(error.message || 'Failed to continue 3DS authentication')
  }

  return data
}

/**
 * Complete order after successful payment — marks as paid + claims tickets.
 */
export const completeOrder = async (orderId: string): Promise<{ success: boolean; error?: string }> => {
  const supabaseWithAuth = await getAuthenticatedClient()

  const { data, error } = await supabaseWithAuth.functions.invoke('complete-g2pay-order', {
    body: { orderId },
  })

  if (error) {
    console.error('[G2Pay] complete-order error:', error)
    throw new Error(error.message || 'Failed to complete order')
  }

  return data
}

/**
 * Validate Apple Pay merchant via edge function.
 */
export const validateAppleMerchant = async (
  validationURL: string,
  displayName: string
): Promise<{ merchantSession: object }> => {
  const supabaseWithAuth = await getAuthenticatedClient()

  const { data, error } = await supabaseWithAuth.functions.invoke('validate-apple-pay-merchant', {
    body: { validationURL, displayName },
  })

  if (error) {
    console.error('[ApplePay] validate-merchant error:', error)
    throw new Error(error.message || 'Merchant validation failed')
  }

  if (!data?.success || !data?.merchantSession) {
    throw new Error(data?.error || 'Merchant validation failed')
  }

  return data
}

/**
 * Process Apple Pay payment via edge function.
 */
export const processApplePayPayment = async (
  orderId: string,
  paymentToken: object,
  customerEmail?: string,
  customerPhone?: string
): Promise<PaymentResponse> => {
  const supabaseWithAuth = await getAuthenticatedClient()

  const { data, error } = await supabaseWithAuth.functions.invoke('process-apple-pay-payment', {
    body: { orderId, paymentToken, customerEmail, customerPhone },
  })

  if (error) {
    console.error('[ApplePay] process-payment error:', error)
    throw new Error(error.message || 'Apple Pay payment failed')
  }

  return data
}

/**
 * Process Google Pay payment via edge function.
 */
export const processGooglePayPayment = async (
  orderId: string,
  paymentToken: string,
  customerEmail?: string,
  customerPhone?: string
): Promise<PaymentResponse> => {
  const supabaseWithAuth = await getAuthenticatedClient()

  const { data, error } = await supabaseWithAuth.functions.invoke('process-google-pay-payment', {
    body: { orderId, paymentToken, customerEmail, customerPhone },
  })

  if (error) {
    console.error('[GooglePay] process-payment error:', error)
    throw new Error(error.message || 'Google Pay payment failed')
  }

  return data
}

/**
 * Handle the full 3DS challenge flow.
 * Shows iframe, waits for ACS response, continues with G2Pay.
 * Supports recursive challenges (method URL → challenge URL).
 */
export function handle3DSChallenge(
  threeDSURL: string,
  threeDSRequest: string,
  threeDSRef: string,
  orderRef: string,
  iframeId: string
): Promise<PaymentResponse> {
  return new Promise((resolve) => {
    let resolved = false
    let autoContinueTimer: ReturnType<typeof setTimeout> | null = null

    // 3DS method URLs (e.g. /3dsMethod) do silent device fingerprinting and
    // typically don't postMessage back. We have to auto-continue after a
    // short window. Challenge URLs do require user interaction and a real
    // postMessage from the ACS callback page.
    const urlLower = (threeDSURL || '').toLowerCase()
    const isMethodUrl = urlLower.includes('method') && !urlLower.includes('challenge')

    // Listen for postMessage from 3DS callback page
    const messageHandler = async (event: MessageEvent) => {
      if (event.data?.type !== 'threeDSResponse' || resolved) return
      resolved = true

      if (autoContinueTimer) {
        clearTimeout(autoContinueTimer)
        autoContinueTimer = null
      }

      window.removeEventListener('message', messageHandler)

      console.log('[G2Pay 3DS] Received ACS response', event.data)

      try {
        // Send ACS response back to G2Pay via edge function
        const result = await continue3DS(threeDSRef, event.data.response || {}, orderRef)

        if (result.status === 'threeDSRequired' && result.threeDSURL && result.threeDSRef) {
          // Recursive challenge — another 3DS step required (threeDSRequest
          // can be empty for a follow-up method URL)
          console.log('[G2Pay 3DS] Additional challenge required')
          const recursiveResult = await handle3DSChallenge(
            result.threeDSURL,
            result.threeDSRequest || '',
            result.threeDSRef,
            orderRef,
            iframeId
          )
          resolve(recursiveResult)
        } else {
          resolve(result)
        }
      } catch (err: any) {
        resolve({ success: false, error: err.message })
      }
    }

    window.addEventListener('message', messageHandler)

    // Build the form once; only the iframe target may not exist immediately
    // because React's render cycle hasn't committed show3DSModal yet. Retry
    // up to 5 times with exponential backoff to match VincentVanGogh's
    // submitWithRetry pattern in useGooglePay.
    const submitForm = (): boolean => {
      const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null
      if (!iframe) return false

      const form = document.createElement('form')
      form.method = 'POST'
      form.action = threeDSURL
      form.target = iframeId
      form.style.display = 'none'

      // Parse threeDSRequest (URL-encoded or JSON). For method URLs this is
      // often empty — that's fine, we just submit the form with no body.
      let params: Record<string, string> = {}
      if (typeof threeDSRequest === 'string' && threeDSRequest) {
        try {
          const searchParams = new URLSearchParams(threeDSRequest)
          searchParams.forEach((value, key) => { params[key] = value })
        } catch {
          try {
            params = JSON.parse(threeDSRequest)
          } catch {
            params['threeDSRequest'] = threeDSRequest
          }
        }
      }

      Object.entries(params).forEach(([key, value]) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = key
        input.value = String(value)
        form.appendChild(input)
      })

      document.body.appendChild(form)
      form.submit()
      document.body.removeChild(form)

      console.log('[G2Pay 3DS] Form submitted to iframe', {
        threeDSURL,
        isMethodUrl,
        params: Object.keys(params),
      })
      return true
    }

    const submitWithRetry = (attempts: number) => {
      if (resolved) return
      const ok = submitForm()
      if (!ok && attempts < 5) {
        setTimeout(() => submitWithRetry(attempts + 1), 100 * attempts)
      } else if (!ok) {
        resolved = true
        window.removeEventListener('message', messageHandler)
        if (autoContinueTimer) {
          clearTimeout(autoContinueTimer)
          autoContinueTimer = null
        }
        console.error('[G2Pay 3DS] Failed to submit form to iframe after retries')
        resolve({ success: false, error: '3DS iframe not found' })
      }
    }

    // Wait for React to commit the iframe before first submit attempt.
    setTimeout(() => {
      submitWithRetry(1)

      // Method URL: auto-continue after 10s if the iframe never posts back.
      // Mirrors the pattern in VincentVanGogh's useGooglePay composable —
      // method URL does silent device fingerprinting then either redirects
      // (which postMessages via /payment-3ds) or finishes silently. Either
      // way, calling continue-3ds with an empty response lets G2Pay decide
      // whether the fingerprint succeeded.
      if (isMethodUrl) {
        autoContinueTimer = setTimeout(async () => {
          if (resolved) return
          resolved = true
          window.removeEventListener('message', messageHandler)
          autoContinueTimer = null
          console.log('[G2Pay 3DS] Method URL auto-continue (10s) — sending threeDSCompInd=U')
          try {
            // BabyBets is a Vite SPA so the threeDSMethodNotificationURL POST
            // body is dropped at the browser. Tell Cardstream the method URL
            // result is unavailable; gateway falls back to challenge URL or
            // frictionless authentication.
            const result = await continue3DS(threeDSRef, { threeDSCompInd: 'U' }, orderRef)
            if (result.status === 'threeDSRequired' && result.threeDSURL && result.threeDSRef) {
              const recursiveResult = await handle3DSChallenge(
                result.threeDSURL,
                result.threeDSRequest || '',
                result.threeDSRef,
                orderRef,
                iframeId
              )
              resolve(recursiveResult)
            } else {
              resolve(result)
            }
          } catch (err: any) {
            resolve({ success: false, error: err.message })
          }
        }, 10000)
      }
    }, 100)
  })
}
