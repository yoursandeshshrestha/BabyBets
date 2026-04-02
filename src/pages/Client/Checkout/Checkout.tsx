import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '@/components/common/Header'
import Footer from '@/components/common/Footer'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { useWallet } from '@/hooks/useWallet'
import {
  createHostedPaymentSession,
  handle3DSChallenge,
  completeOrder,
  validateAppleMerchant,
  processApplePayPayment,
  processGooglePayPayment,
  createValidatedOrder,
} from '@/lib/g2pay'
import { supabase } from '@/lib/supabase'
import { getReferral, clearReferral, setReferral } from '@/lib/referralTracking'
import { showErrorToast, showWarningToast } from '@/lib/toast'
import {
  OrderSummary,
  PromoCodeSection,
  WalletCreditSection,
  PriceSummary,
  ContactInformation,
  TermsCheckboxes,
  CardPayment,
} from './components'

// Google Pay client stored outside React state to avoid DataCloneError with postMessage
let googlePayClientInstance: any = null

function Checkout() {
  const navigate = useNavigate()
  const { items, removeItem, clearCart, getTotalPrice, validateCart } = useCartStore()
  const { isAuthenticated, isLoading: authLoading, isInitialized } = useAuthStore()
  const { summary } = useWallet()
  const [loading, setLoading] = useState(false)
  const [purchaseCompleted, setPurchaseCompleted] = useState(false)

  // Referral tracking state (handles both link referrals and manual codes)
  const [activeReferral, setActiveReferral] = useState<{ slug: string; influencerId: string; displayName?: string } | null>(null)
  const [influencerCode, setInfluencerCode] = useState('')

  // Payment state
  const [mobileNumber, setMobileNumber] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [appliedCredit, setAppliedCredit] = useState(0)
  const [promoCode, setPromoCode] = useState('')
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null)
  const [promoCodeType, setPromoCodeType] = useState<'percentage' | 'fixed_value' | null>(null)
  const [promoCodeValue, setPromoCodeValue] = useState(0)
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [useWalletCredit, setUseWalletCredit] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [isUKResident, setIsUKResident] = useState(false)
  const [isOver18, setIsOver18] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [show3DSModal, setShow3DSModal] = useState(false)

  // Digital wallet state
  const [isApplePayAvailable, setIsApplePayAvailable] = useState(false)
  const [isGooglePayAvailable, setIsGooglePayAvailable] = useState(false)

  // Validate UK mobile number format
  const validateMobileNumber = (mobile: string): boolean => {
    const cleaned = mobile.replace(/\s/g, '')
    return /^07\d{9}$/.test(cleaned)
  }

  const isMobileValid = validateMobileNumber(mobileNumber)

  // Validate card details
  const isCardValid = cardNumber.replace(/\s/g, '').length >= 13 &&
                      expiryDate.length === 5 &&
                      cvv.length >= 3 &&
                      cardholderName.trim().length >= 3

  const totalPrice = getTotalPrice()
  const availableCreditGBP = summary.availableBalance / 100
  const discountAmount = totalPrice * promoDiscount
  const priceAfterPromo = totalPrice - discountAmount
  const maxApplicableCredit = Math.min(availableCreditGBP, priceAfterPromo)
  const finalPrice = Math.max(0, priceAfterPromo - appliedCredit)
  const canProceed = finalPrice === 0 ?
    (agreeTerms && isUKResident && isOver18 && isMobileValid) :
    (agreeTerms && isUKResident && isOver18 && isMobileValid && isCardValid)

  const canProceedDigitalWallet = agreeTerms && isUKResident && isOver18 && isMobileValid

  useEffect(() => {
    if (!isInitialized) return
    if (!isAuthenticated) {
      navigate('/login?redirect=/checkout')
      return
    }
    if (items.length === 0 && !purchaseCompleted) {
      navigate('/')
      return
    }
  }, [isAuthenticated, items, isInitialized, purchaseCompleted])

  // Load active referral on mount
  useEffect(() => {
    const loadReferral = async () => {
      const referral = getReferral()
      if (referral) {
        const { data: influencer } = await supabase
          .from('influencers')
          .select('display_name, slug')
          .eq('id', referral.influencerId)
          .maybeSingle()
        if (influencer) {
          setActiveReferral({
            slug: influencer.slug,
            influencerId: referral.influencerId,
            displayName: influencer.display_name
          })
        }
      }
    }
    loadReferral()
  }, [])

  // Load user's existing phone number from profile
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', user.id)
            .single()
          if (profile?.phone) {
            const formatted = profile.phone.replace(/(\d{5})(\d{6})/, '$1 $2')
            setMobileNumber(formatted)
          }
        }
      } catch (error) {
        console.error('Error loading user profile:', error)
      }
    }
    loadUserProfile()
  }, [])

  // Validate cart on mount
  useEffect(() => {
    const validateCartOnLoad = async () => {
      const result = await validateCart()
      if (result.removedCount > 0) {
        showWarningToast(
          `${result.removedCount} item(s) removed from cart: ${result.reasons.join(', ')}`
        )
      }
    }
    validateCartOnLoad()
  }, [])

  // Check Apple Pay availability
  useEffect(() => {
    if (typeof window.ApplePaySession !== 'undefined' && window.ApplePaySession.canMakePayments()) {
      setIsApplePayAvailable(true)
    }
  }, [])

  // Initialize Google Pay
  useEffect(() => {
    const initGooglePay = async () => {
      try {
        // Load script
        if (!window.google?.payments?.api) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://pay.google.com/gp/p/js/pay.js'
            script.async = true
            script.onload = () => resolve()
            script.onerror = () => reject()
            document.head.appendChild(script)
          })
        }

        if (!window.google?.payments?.api) return

        // Store client outside React state to avoid DataCloneError
        googlePayClientInstance = new window.google.payments.api.PaymentsClient({
          environment: 'PRODUCTION',
        })

        const isReadyRequest = JSON.parse(JSON.stringify({
          apiVersion: 2,
          apiVersionMinor: 0,
          allowedPaymentMethods: [{
            type: 'CARD',
            parameters: {
              allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: ['MASTERCARD', 'VISA'],
            },
            tokenizationSpecification: {
              type: 'PAYMENT_GATEWAY',
              parameters: {
                gateway: 'crst',
                gatewayMerchantId: import.meta.env.VITE_GOOGLE_PAY_GATEWAY_MERCHANT_ID,
              },
            },
          }],
        }))

        const { result } = await googlePayClientInstance.isReadyToPay(isReadyRequest)
        setIsGooglePayAvailable(result)
      } catch {
        // Google Pay not available — fail silently
      }
    }

    initGooglePay()
  }, [])

  const handleApplyInfluencerCode = async () => {
    const code = influencerCode.trim().toLowerCase()
    if (!code) {
      showErrorToast('Please enter an influencer code')
      return
    }
    try {
      const { data: influencer, error: influencerError } = await supabase
        .from('influencers')
        .select('id, user_id, slug, display_name, is_active')
        .eq('slug', code)
        .eq('is_active', true)
        .single()
      if (influencerError || !influencer) {
        showErrorToast('Invalid influencer code')
        return
      }
      setReferral(influencer.id, influencer.slug)
      setActiveReferral({
        slug: influencer.slug,
        influencerId: influencer.id,
        displayName: influencer.display_name
      })
      setInfluencerCode('')
    } catch (err) {
      console.error('Error validating influencer code:', err)
      showErrorToast('Failed to validate code')
    }
  }

  const handleRemoveInfluencerCode = () => {
    clearReferral()
    setActiveReferral(null)
    setInfluencerCode('')
  }

  const handleApplyPromoCode = async () => {
    const code = promoCode.toUpperCase().trim()
    if (!code) {
      showErrorToast('Please enter a promo code')
      return
    }
    try {
      const { data: promoCodeData, error: promoCodeError } = await supabase
        .from('promo_codes')
        .select('code, type, value, is_active, valid_from, valid_until, max_uses, current_uses, max_uses_per_user, min_order_pence')
        .eq('code', code)
        .eq('is_active', true)
        .single()

      if (promoCodeError || !promoCodeData) {
        showErrorToast('Invalid promo code')
        return
      }

      const now = new Date()
      const validFrom = promoCodeData.valid_from ? new Date(promoCodeData.valid_from) : null
      const validUntil = promoCodeData.valid_until ? new Date(promoCodeData.valid_until) : null

      if (validFrom && now < validFrom) {
        showErrorToast('This promo code is not yet valid')
        return
      }
      if (validUntil && now > validUntil) {
        showErrorToast('This promo code has expired')
        return
      }
      if (promoCodeData.max_uses && (promoCodeData.current_uses ?? 0) >= promoCodeData.max_uses) {
        showErrorToast('This promo code has reached its usage limit')
        return
      }

      const totalPence = Math.round(totalPrice * 100)
      if (promoCodeData.min_order_pence && totalPence < promoCodeData.min_order_pence) {
        const minOrderGBP = promoCodeData.min_order_pence / 100
        showErrorToast(`Minimum order value of £${minOrderGBP.toFixed(2)} required`)
        return
      }

      if (promoCodeData.type === 'percentage') {
        setAppliedPromoCode(promoCodeData.code)
        setPromoCodeType('percentage')
        setPromoCodeValue(promoCodeData.value)
        setPromoDiscount(promoCodeData.value / 100)
        setPromoCode('')
      } else if (promoCodeData.type === 'fixed_value') {
        const fixedDiscountGBP = promoCodeData.value / 100
        const discountRatio = Math.min(fixedDiscountGBP / totalPrice, 1)
        setAppliedPromoCode(promoCodeData.code)
        setPromoCodeType('fixed_value')
        setPromoCodeValue(promoCodeData.value)
        setPromoDiscount(discountRatio)
        setPromoCode('')
      } else if (promoCodeData.type === 'free_tickets') {
        const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0)
        const averagePricePerTicket = totalTickets > 0 ? totalPrice / totalTickets : 0
        const freeTicketsValue = averagePricePerTicket * promoCodeData.value
        const discountRatio = Math.min(freeTicketsValue / totalPrice, 1)
        setAppliedPromoCode(promoCodeData.code)
        setPromoCodeType('fixed_value')
        setPromoCodeValue(Math.round(freeTicketsValue * 100))
        setPromoDiscount(discountRatio)
        setPromoCode('')
      } else {
        showErrorToast('This promo code type is not supported for checkout')
      }
    } catch (err) {
      console.error('Error validating promo code:', err)
      showErrorToast('Failed to validate promo code')
    }
  }

  const handleRemovePromoCode = () => {
    setAppliedPromoCode(null)
    setPromoCodeType(null)
    setPromoCodeValue(0)
    setPromoDiscount(0)
  }

  const handleWalletToggle = (enabled: boolean) => {
    setUseWalletCredit(enabled)
    if (enabled) {
      setAppliedCredit(maxApplicableCredit)
    } else {
      setAppliedCredit(0)
    }
  }

  /**
   * SECURITY FIX: Create order with server-side validation
   * Sends only competition IDs and quantities - server validates all prices
   */
  const createOrderForPayment = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.refreshSession()

    if (sessionError || !session?.user || !session?.access_token) {
      navigate('/login?redirect=/checkout&error=session_expired')
      throw new Error('Your session has expired. Please log in again.')
    }

    // Prepare order request with ONLY competition IDs and quantities
    // Server will fetch current prices and validate everything
    const orderRequest = {
      items: items.map((item) => ({
        competition_id: item.competitionId,
        quantity: item.quantity,
      })),
      promo_code: appliedPromoCode || undefined,
      use_wallet_credit: useWalletCredit,
      mobile_number: mobileNumber,
      influencer_id: activeReferral?.influencerId,
    }

    // Call validated order creation endpoint
    const validatedOrder = await createValidatedOrder(orderRequest)

    if (!validatedOrder.success || !validatedOrder.order_id) {
      throw new Error(validatedOrder.error || 'Failed to create order')
    }

    // Fetch the created order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', validatedOrder.order_id)
      .single()

    if (fetchError || !order) {
      throw new Error('Failed to fetch created order')
    }

    return { order, session, validatedOrder }
  }

  const handlePayment = async () => {
    try {
      setLoading(true)
      setPaymentError(null)

      if (items.length === 0) throw new Error('Your cart is empty')

      if (!validateMobileNumber(mobileNumber)) {
        throw new Error('Please enter a valid UK mobile number (e.g., 07xxx xxxxxx)')
      }

      // SECURITY FIX: Use validated order creation
      // Server validates prices, discounts, and wallet credits
      const { order, session, validatedOrder } = await createOrderForPayment()

      const finalTotalPence = validatedOrder.total_pence

      // If fully paid with wallet credit
      if (finalTotalPence === 0) {
        const { error: completeError } = await supabase.rpc('complete_order_with_wallet', {
          p_order_id: order.id,
          p_user_id: session.user.id,
        })

        if (completeError) {
          console.error('❌ Error completing wallet order:', completeError)
          throw new Error(completeError.message || 'Failed to process wallet payment')
        }

        import('@/services/email.service').then((emailServiceModule) => {
          const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0)
          emailServiceModule.emailService.sendOrderConfirmationEmail(
            session.user.email || '',
            session.user.email?.split('@')[0] || 'Customer',
            {
              orderNumber: order.id.slice(0, 8).toUpperCase(),
              orderDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
              totalTickets,
              orderTotal: (validatedOrder.subtotal_pence / 100).toFixed(2),
              ticketsUrl: `${window.location.origin}/account?tab=tickets`
            }
          ).catch((err) => { console.error('Failed to send order confirmation email:', err) })
        })

        setPurchaseCompleted(true)
        clearCart()
        navigate('/account?tab=tickets&purchase=success')
        return
      }

      // Continue with card payment for remaining balance
      const [expiryMonth, expiryYear] = expiryDate.split('/')

      const paymentResult = await createHostedPaymentSession(
        order.id,
        session.user.email,
        mobileNumber,
        {
          cardNumber: cardNumber.replace(/\s/g, ''),
          expiryMonth: expiryMonth.trim(),
          expiryYear: expiryYear.trim(),
          cvv: cvv,
          cardholderName: cardholderName,
        }
      )

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || 'Failed to create payment session')
      }

      let finalResult = paymentResult

      if (paymentResult.status === 'threeDSRequired' && paymentResult.threeDSURL && paymentResult.threeDSRequest && paymentResult.threeDSRef) {
        console.log('[Checkout] 3DS challenge required, showing iframe')
        setShow3DSModal(true)

        finalResult = await handle3DSChallenge(
          paymentResult.threeDSURL,
          paymentResult.threeDSRequest,
          paymentResult.threeDSRef,
          order.id,
          'threeds-iframe'
        )

        setShow3DSModal(false)

        if (!finalResult.success) {
          throw new Error(finalResult.error || '3DS authentication failed')
        }
      }

      console.log('[Checkout] Payment successful, completing order...')

      const completeResult = await completeOrder(order.id)
      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Failed to complete order')
      }

      console.log('[Checkout] Order completed successfully')

      setPurchaseCompleted(true)
      clearCart()
      navigate('/account?tab=tickets&purchase=success')
    } catch (err) {
      console.error('Error processing payment:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to process payment'
      setPaymentError(errorMessage)
      showErrorToast(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Apple Pay handler — session.begin() must be called synchronously from click
   */
  const handleApplePay = () => {
    if (!window.ApplePaySession) return
    if (!canProceedDigitalWallet) {
      showErrorToast('Please fill in your mobile number and accept all terms before paying')
      return
    }

    setPaymentError(null)

    const ApplePaySessionClass = window.ApplePaySession

    const paymentRequest = {
      countryCode: 'GB',
      currencyCode: 'GBP',
      supportedNetworks: ['visa', 'masterCard', 'amex'],
      merchantCapabilities: ['supports3DS', 'supportsCredit', 'supportsDebit'],
      total: {
        label: 'BabyBets',
        amount: finalPrice.toFixed(2),
        type: 'final',
      },
    }

    const session = new ApplePaySessionClass(3, paymentRequest)

    session.onvalidatemerchant = async (event: any) => {
      try {
        const { merchantSession } = await validateAppleMerchant(
          event.validationURL,
          'BabyBets',
          window.location.hostname
        )
        session.completeMerchantValidation(merchantSession)
      } catch (err: any) {
        console.error('[ApplePay] Merchant validation failed:', err)
        session.abort()
        setPaymentError('Apple Pay merchant validation failed')
      }
    }

    session.onpaymentauthorized = async (event: any) => {
      try {
        setLoading(true)

        // SECURITY FIX: Create order after user authorises with server validation
        const { order, session: authSession, validatedOrder } = await createOrderForPayment()

        const paymentToken = event.payment.token.paymentData

        const paymentResult = await processApplePayPayment(
          order.id,
          paymentToken,
          authSession.user.email,
          mobileNumber
        )

        if (!paymentResult.success) {
          session.completePayment({ status: ApplePaySessionClass.STATUS_FAILURE })
          throw new Error(paymentResult.error || 'Apple Pay payment failed')
        }

        // Complete order — marks as paid + claims tickets
        const completeResult = await completeOrder(order.id)
        if (!completeResult.success) {
          session.completePayment({ status: ApplePaySessionClass.STATUS_FAILURE })
          throw new Error(completeResult.error || 'Failed to complete order')
        }

        session.completePayment({ status: ApplePaySessionClass.STATUS_SUCCESS })

        setPurchaseCompleted(true)
        clearCart()
        navigate('/account?tab=tickets&purchase=success')
      } catch (err: any) {
        console.error('[ApplePay] Payment failed:', err)
        session.completePayment({ status: ApplePaySessionClass.STATUS_FAILURE })
        setPaymentError(err.message || 'Apple Pay payment failed')
        showErrorToast(err.message || 'Apple Pay payment failed')
      } finally {
        setLoading(false)
      }
    }

    session.oncancel = () => {
      console.log('[ApplePay] Cancelled')
      setLoading(false)
    }

    session.begin()
  }

  /**
   * Google Pay handler
   */
  const handleGooglePay = async () => {
    if (!googlePayClientInstance) return
    if (!canProceedDigitalWallet) {
      showErrorToast('Please fill in your mobile number and accept all terms before paying')
      return
    }

    setPaymentError(null)

    try {
      setLoading(true)

      const paymentDataRequest = JSON.parse(JSON.stringify({
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['MASTERCARD', 'VISA'],
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
              gateway: 'crst',
              gatewayMerchantId: import.meta.env.VITE_GOOGLE_PAY_GATEWAY_MERCHANT_ID,
            },
          },
        }],
        merchantInfo: {
          merchantId: import.meta.env.VITE_GOOGLE_MERCHANT_ID,
          merchantName: import.meta.env.VITE_GOOGLE_PAY_MERCHANT_NAME || 'BabyBets',
        },
        transactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPrice: finalPrice.toFixed(2),
          currencyCode: 'GBP',
          countryCode: 'GB',
        },
      }))

      // User authorises in Google Pay sheet
      const paymentData = await googlePayClientInstance.loadPaymentData(paymentDataRequest)

      // SECURITY FIX: Create order after user authorises with server validation
      const { order, session: authSession, validatedOrder } = await createOrderForPayment()

      const token = paymentData.paymentMethodData.tokenizationData.token

      const paymentResult = await processGooglePayPayment(
        order.id,
        token,
        authSession.user.email,
        mobileNumber
      )

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || 'Google Pay payment failed')
      }

      // Complete order — marks as paid + claims tickets
      const completeResult = await completeOrder(order.id)
      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Failed to complete order')
      }

      setPurchaseCompleted(true)
      clearCart()
      navigate('/account?tab=tickets&purchase=success')
    } catch (err: any) {
      if (err.statusCode === 'CANCELED') {
        setLoading(false)
        return
      }
      console.error('[GooglePay] Payment failed:', err)
      const errorMessage = err.message || 'Google Pay payment failed'
      setPaymentError(errorMessage)
      showErrorToast(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (!isInitialized || authLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FFFCF9', color: '#2D251E' }}>
        <Header />
        <div className="flex items-center justify-center pt-24 pb-16 px-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: '#496B71' }}></div>
            <p className="text-gray-600">Loading checkout...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFCF9', color: '#2D251E' }}>
      <Header />

      {/* Processing Modal */}
      {loading && !show3DSModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-[#FF6B9D]/20 border-t-[#FF6B9D] rounded-full animate-spin"></div>
              <p className="text-sm text-[#2D251E]/60 font-medium">
                {finalPrice === 0 ? 'Processing order...' : 'Processing payment...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3DS Challenge Modal */}
      {show3DSModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#151e20' }}>
                  Secure Authentication
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Please complete verification with your bank
                </p>
              </div>
            </div>
            <div className="p-4">
              <iframe
                id="threeds-iframe"
                name="threeds-iframe"
                className="w-full border border-gray-200 rounded-lg bg-white"
                style={{ height: '400px' }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="pt-20 sm:pt-24 pb-12 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h1
            className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 sm:mb-8 md:mb-10"
            style={{ color: '#151e20', fontFamily: "'Fraunces', serif" }}
          >
            Secure Checkout
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 md:gap-12">
            {/* Order Summary - Left Column */}
            <div className="order-2 lg:order-1 space-y-4 sm:space-y-6">
              <div
                className="p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl shadow-sm"
                style={{ backgroundColor: 'white', borderWidth: '1px', borderColor: '#e7e5e4' }}
              >
                <OrderSummary items={items} onRemoveItem={removeItem} />

                <PromoCodeSection
                  promoCode={promoCode}
                  setPromoCode={setPromoCode}
                  appliedPromoCode={appliedPromoCode}
                  promoCodeType={promoCodeType}
                  promoCodeValue={promoCodeValue}
                  onApplyPromoCode={handleApplyPromoCode}
                  onRemovePromoCode={handleRemovePromoCode}
                  partnerCode={influencerCode}
                  setPartnerCode={setInfluencerCode}
                  activeReferral={activeReferral}
                  onApplyPartnerCode={handleApplyInfluencerCode}
                  onRemovePartnerCode={handleRemoveInfluencerCode}
                />

                <WalletCreditSection
                  availableCreditGBP={availableCreditGBP}
                  useWalletCredit={useWalletCredit}
                  setUseWalletCredit={handleWalletToggle}
                  appliedCredit={appliedCredit}
                  setAppliedCredit={setAppliedCredit}
                  maxApplicableCredit={maxApplicableCredit}
                />

                <PriceSummary
                  totalPrice={totalPrice}
                  discountAmount={discountAmount}
                  promoDiscount={promoDiscount}
                  promoCodeType={promoCodeType}
                  promoCodeValue={promoCodeValue}
                  appliedCredit={appliedCredit}
                  finalPrice={finalPrice}
                />
              </div>
            </div>

            {/* Payment Form - Right Column */}
            <div className="order-1 lg:order-2">
              {finalPrice > 0 && (
                <div
                  className="p-8 rounded-2xl shadow-sm"
                  style={{ backgroundColor: 'white', borderWidth: '1px', borderColor: '#e7e5e4' }}
                >
                  <h2
                    className="text-xl font-bold mb-6"
                    style={{ color: '#151e20', fontFamily: "'Fraunces', serif" }}
                  >
                    Payment Details
                  </h2>

                  {/* Contact & Terms — shared for all payment methods */}
                  <ContactInformation
                    mobileNumber={mobileNumber}
                    setMobileNumber={setMobileNumber}
                    isMobileValid={isMobileValid}
                  />

                  <TermsCheckboxes
                    agreeTerms={agreeTerms}
                    setAgreeTerms={setAgreeTerms}
                    isUKResident={isUKResident}
                    setIsUKResident={setIsUKResident}
                    isOver18={isOver18}
                    setIsOver18={setIsOver18}
                    canProceed={canProceed}
                    isMobileValid={isMobileValid}
                    mobileNumber={mobileNumber}
                  />

                  {/* Digital Wallet Buttons */}
                  {(isApplePayAvailable || isGooglePayAvailable) && (
                    <div className="mb-6">
                      <div className="flex flex-col gap-3">
                        {isApplePayAvailable && (
                          <button
                            onClick={handleApplePay}
                            disabled={loading || !canProceedDigitalWallet}
                            className="w-full h-12 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            style={{
                              WebkitAppearance: '-apple-pay-button' as any,
                              // @ts-ignore
                              '-apple-pay-button-type': 'pay',
                              // @ts-ignore
                              '-apple-pay-button-style': 'black',
                              backgroundColor: '#000',
                            }}
                            aria-label="Pay with Apple Pay"
                          />
                        )}
                        {isGooglePayAvailable && (
                          <button
                            onClick={handleGooglePay}
                            disabled={loading || !canProceedDigitalWallet}
                            className="w-full h-12 rounded-lg flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white"
                            style={{ backgroundColor: '#000' }}
                          >
                            <svg viewBox="0 0 41 17" className="h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M19.526 2.635v4.083h2.518c.6 0 1.096-.202 1.488-.605.403-.402.605-.882.605-1.437 0-.544-.202-1.018-.605-1.422-.392-.413-.888-.619-1.488-.619h-2.518zm0 5.52v4.736h-1.504V1.198h3.99c1.013 0 1.873.337 2.582 1.012.72.675 1.08 1.497 1.08 2.466 0 .991-.36 1.819-1.08 2.482-.697.665-1.559.996-2.583.996h-2.485zM27.194 5.56c1.112 0 1.99.297 2.635.893.645.595.967 1.408.967 2.44v4.938H29.35v-1.112h-.065c-.624.914-1.453 1.372-2.486 1.372-.882 0-1.621-.262-2.217-.784-.595-.523-.893-1.176-.893-1.96 0-.828.313-1.486.938-1.976.625-.49 1.46-.735 2.505-.735 1.014 0 1.847.185 2.5.556v-.39c0-.6-.24-1.115-.718-1.545-.477-.43-1.056-.645-1.736-.645-.997 0-1.786.42-2.365 1.26l-1.112-.702c.784-1.12 1.949-1.61 3.493-1.61zm-2.115 6.283c0 .39.166.718.5.98.334.262.727.393 1.18.393.637 0 1.203-.232 1.698-.697.495-.463.742-1.007.742-1.632-.468-.372-1.12-.557-1.958-.557-.607 0-1.115.147-1.523.44-.41.294-.639.655-.639 1.073zM38.041 5.82l-5.011 11.527H31.49l1.86-4.033-3.294-7.494h1.659l2.381 5.749h.033l2.315-5.749z" fill="white"/>
                              <path d="M13.16 8.467c0-.452-.04-.886-.116-1.3H6.98v2.46h3.476c-.149.806-.6 1.49-1.279 1.949v1.621h2.072c1.213-1.117 1.912-2.76 1.912-4.73z" fill="#4285F4"/>
                              <path d="M6.979 14.5c1.744 0 3.208-.578 4.277-1.563l-2.072-1.621c-.576.387-1.312.616-2.205.616-1.695 0-3.13-1.145-3.642-2.682H1.2v1.674A6.48 6.48 0 006.979 14.5z" fill="#34A853"/>
                              <path d="M3.337 9.25a3.887 3.887 0 010-2.494V5.082H1.2a6.48 6.48 0 000 5.842l2.137-1.674z" fill="#FBBC04"/>
                              <path d="M6.979 4.074c.954 0 1.812.329 2.486.974l1.866-1.866C10.183 2.09 8.72 1.5 6.979 1.5a6.479 6.479 0 00-5.78 3.582l2.137 1.674c.512-1.537 1.947-2.682 3.643-2.682z" fill="#EA4335"/>
                            </svg>
                            Pay with Google Pay
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-xs text-gray-400">or pay with card</span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                    </div>
                  )}

                  {/* Card Payment */}
                  <div className="mb-6">
                    <CardPayment
                      cardNumber={cardNumber}
                      setCardNumber={setCardNumber}
                      expiryDate={expiryDate}
                      setExpiryDate={setExpiryDate}
                      cvv={cvv}
                      setCvv={setCvv}
                      cardholderName={cardholderName}
                      setCardholderName={setCardholderName}
                    />

                    {paymentError && (
                      <div className="mt-4 p-4 rounded-lg border" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
                        <div className="flex items-start">
                          <svg className="w-5 h-5 mr-2 shrink-0" style={{ color: '#dc2626' }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#991b1b' }}>Payment Failed</p>
                            <p className="text-sm mt-1" style={{ color: '#dc2626' }}>{paymentError}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handlePayment}
                    disabled={loading || !canProceed}
                    className="w-full font-bold py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white text-lg"
                    style={{ backgroundColor: '#496B71' }}
                    onMouseEnter={(e) => { if (!loading && canProceed) e.currentTarget.style.backgroundColor = '#3a565a' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#496B71' }}
                  >
                    {loading ? 'Processing...' : `Pay £${finalPrice.toFixed(2)}`}
                  </button>

                  <p className="text-xs text-center mt-4" style={{ color: '#78716c' }}>
                    Your payment is secure and encrypted
                  </p>
                </div>
              )}

              {finalPrice === 0 && (
                <div
                  className="p-8 rounded-2xl shadow-sm"
                  style={{ backgroundColor: 'white', borderWidth: '1px', borderColor: '#e7e5e4' }}
                >
                  <h2
                    className="text-xl font-bold mb-6"
                    style={{ color: '#151e20', fontFamily: "'Fraunces', serif" }}
                  >
                    Complete Order
                  </h2>

                  <div
                    className="p-6 rounded-xl mb-6"
                    style={{ backgroundColor: '#ecfdf5', borderWidth: '1px', borderColor: '#a7f3d0' }}
                  >
                    <p className="text-green-800 text-center font-medium">
                      Your order will be paid in full using wallet credit
                    </p>
                  </div>

                  <ContactInformation
                    mobileNumber={mobileNumber}
                    setMobileNumber={setMobileNumber}
                    isMobileValid={isMobileValid}
                  />

                  <TermsCheckboxes
                    agreeTerms={agreeTerms}
                    setAgreeTerms={setAgreeTerms}
                    isUKResident={isUKResident}
                    setIsUKResident={setIsUKResident}
                    isOver18={isOver18}
                    setIsOver18={setIsOver18}
                    canProceed={canProceed}
                    isMobileValid={isMobileValid}
                    mobileNumber={mobileNumber}
                  />

                  <button
                    onClick={handlePayment}
                    disabled={loading || !canProceed}
                    className="w-full font-bold py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white text-lg"
                    style={{ backgroundColor: '#496B71' }}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#3a565a' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#496B71' }}
                  >
                    {loading ? 'Processing...' : 'Complete Order'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default Checkout
