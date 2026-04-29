import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useCartStore } from '@/store/cartStore'
import Header from '@/components/common/Header'
import { Check, X, Loader2 } from 'lucide-react'

interface OrderStatus {
  id: string
  status: 'pending' | 'paid' | 'failed' | 'cancelled'
  user_id: string
}

const PaymentReturn = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { clearCart } = useCartStore()
  const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking')
  const [message, setMessage] = useState('Processing your payment...')
  const [pollAttempts, setPollAttempts] = useState(0)
  const maxPollAttempts = 15 // Poll for 30 seconds (15 attempts * 2 seconds)

  const orderRef = searchParams.get('orderRef')
  const responseCode = searchParams.get('responseCode')

  useEffect(() => {
    if (!orderRef) {
      setStatus('failed')
      setMessage('Missing order reference')
      setTimeout(() => navigate('/checkout'), 3000)
      return
    }

    // If G2Pay returned a failure code, handle immediately
    if (responseCode && responseCode !== '0') {
      setStatus('failed')
      setMessage('Payment was declined or cancelled')
      setTimeout(() => navigate('/checkout?payment=failed'), 3000)
      return
    }

    // Start polling order status
    const checkOrderStatus = async () => {
      try {
        const { data: order, error } = await supabase
          .from('orders')
          .select('id, status, user_id')
          .eq('id', orderRef)
          .single<OrderStatus>()

        if (error) {
          console.error('[PaymentReturn] Error fetching order:', error)

          // If max attempts reached, show error
          if (pollAttempts >= maxPollAttempts) {
            setStatus('failed')
            setMessage('Unable to verify payment status. Please check your account.')
            setTimeout(() => navigate('/account?tab=tickets'), 5000)
          }
          return
        }

        if (!order) {
          setStatus('failed')
          setMessage('Order not found')
          setTimeout(() => navigate('/checkout'), 3000)
          return
        }

        if (order.status === 'paid') {
          // Success! Webhook has processed the payment
          setStatus('success')
          setMessage('Payment successful! Redirecting...')
          clearCart()
          setTimeout(() => navigate(`/payment/success?orderId=${orderRef}`), 2000)
        } else if (order.status === 'failed' || order.status === 'cancelled') {
          // Payment failed or cancelled
          setStatus('failed')
          setMessage('Payment was not completed')
          setTimeout(() => navigate('/checkout?payment=failed'), 3000)
        } else if (order.status === 'pending') {
          // Still pending - webhook hasn't processed yet
          // Continue polling
          setPollAttempts(prev => prev + 1)

          if (pollAttempts >= maxPollAttempts) {
            // Max attempts reached - likely webhook delay
            setStatus('success')
            setMessage('Payment is being processed. Check your account shortly.')
            clearCart()
            setTimeout(() => navigate('/account?tab=tickets&payment=processing'), 3000)
          }
        }
      } catch (error) {
        console.error('[PaymentReturn] Error checking order status:', error)
        setStatus('failed')
        setMessage('An error occurred. Please check your account.')
        setTimeout(() => navigate('/account?tab=tickets'), 5000)
      }
    }

    // Initial check
    checkOrderStatus()

    // Poll every 2 seconds
    const pollInterval = setInterval(() => {
      checkOrderStatus()
    }, 2000)

    // Cleanup interval on unmount
    return () => clearInterval(pollInterval)
  }, [orderRef, responseCode, navigate, clearCart, pollAttempts])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFCF9', color: '#2D251E' }}>
      <Header />

      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] pt-24 pb-16 px-6">
        <div
          className="bg-white p-8 md:p-12 rounded-2xl shadow-xl max-w-md w-full text-center"
          style={{ borderWidth: '1px', borderColor: '#e7e5e4' }}
        >
          {status === 'checking' && (
            <>
              <div className="mb-6">
                <Loader2
                  className="w-16 h-16 mx-auto animate-spin"
                  style={{ color: '#496B71' }}
                />
              </div>
              <h2
                className="text-2xl md:text-3xl font-bold mb-4"
                style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
              >
                Processing Payment
              </h2>
              <p className="text-sm md:text-base mb-4" style={{ color: '#78716c' }}>
                {message}
              </p>
              <p className="text-xs" style={{ color: '#78716c' }}>
                Please wait while we confirm your payment with the payment gateway...
              </p>
              <div className="mt-6 flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#496B71' }}></div>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#496B71', animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#496B71', animationDelay: '0.4s' }}></div>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div
                className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
                style={{ backgroundColor: '#dcfce7' }}
              >
                <Check className="w-8 h-8" style={{ color: '#16a34a' }} />
              </div>
              <h2
                className="text-2xl md:text-3xl font-bold mb-4"
                style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
              >
                Payment Successful!
              </h2>
              <p className="text-sm md:text-base" style={{ color: '#78716c' }}>
                {message}
              </p>
            </>
          )}

          {status === 'failed' && (
            <>
              <div
                className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
                style={{ backgroundColor: '#fee2e2' }}
              >
                <X className="w-8 h-8" style={{ color: '#dc2626' }} />
              </div>
              <h2
                className="text-2xl md:text-3xl font-bold mb-4"
                style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
              >
                Payment Failed
              </h2>
              <p className="text-sm md:text-base" style={{ color: '#78716c' }}>
                {message}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PaymentReturn
