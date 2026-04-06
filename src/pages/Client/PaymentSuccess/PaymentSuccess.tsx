import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Header from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { CheckCircle, Trophy, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface OrderDetails {
  id: string
  total_pence: number
  created_at: string
  items: Array<{
    competition_id: string
    ticket_count: number
    competition: {
      title: string
      slug: string
    }
  }>
}

function PaymentSuccess() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('orderId')
  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()

  useEffect(() => {
    if (orderId) {
      loadOrderDetails()
    }
  }, [orderId])

  const loadOrderDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          total_pence,
          created_at,
          items:order_items(
            competition_id,
            ticket_count,
            competition:competitions(title, slug)
          )
        `
        )
        .eq('id', orderId!)
        .single()

      if (error) throw error
      setOrder(data as any)

      // Email is sent automatically by the backend Edge Function (complete-g2pay-order or g2pay-webhook)
    } catch (error) {
      console.error('Error loading order:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FFFCF9', color: '#2D251E' }}>
        <Header />
        <div className="pt-24 sm:pt-28 md:pt-32 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="inline-block size-10 sm:size-12 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin"></div>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-gray-600">Loading order details...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFCF9', color: '#2D251E' }}>
      <Header />

      <div className="pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-14 md:pb-16 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          {/* Success Icon */}
          <div className="inline-flex items-center justify-center size-16 sm:size-18 md:size-20 bg-green-100 rounded-full mb-4 sm:mb-5 md:mb-6">
            <CheckCircle className="size-10 sm:size-11 md:size-12 text-green-600" />
          </div>

          {/* Success Message */}
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 sm:mb-4">Payment Successful!</h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 sm:mb-7 md:mb-8">
            Your tickets have been purchased successfully.
          </p>

          {/* Order Details */}
          {order && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-7 md:p-8 text-left mb-6 sm:mb-7 md:mb-8">
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">Order Details</h2>

              <div className="space-y-2.5 sm:space-y-3 mb-5 sm:mb-6">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600">Order ID</span>
                  <span className="font-medium font-mono">{order.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600">Order Date</span>
                  <span className="font-medium">
                    {new Date(order.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600">Total Paid</span>
                  <span className="font-bold text-base sm:text-lg" style={{ color: '#f25100' }}>
                    £{(order.total_pence / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3 sm:pt-4">
                <h3 className="text-sm sm:text-base font-bold mb-2.5 sm:mb-3">Your Tickets</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  {order.items.map((item: any) => (
                    <div
                      key={item.competition_id}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Trophy className="size-3.5 sm:size-4 text-orange-500 shrink-0" />
                        <span className="text-xs sm:text-sm">{item.competition.title}</span>
                      </div>
                      <span className="text-xs sm:text-sm font-medium whitespace-nowrap ml-2">{item.ticket_count} tickets</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 sm:p-6 mb-6 sm:mb-7 md:mb-8">
            <h3 className="text-sm sm:text-base font-bold mb-1.5 sm:mb-2">What's Next?</h3>
            <p className="text-xs sm:text-sm text-gray-700">
              You'll receive a confirmation email shortly. Your tickets are now entered into the
              draw. Good luck!
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-linear-to-r from-orange-500 to-orange-600 text-white font-bold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              Browse More Competitions
              <ArrowRight className="size-3.5 sm:size-4" />
            </Link>
            <Link
              to="/account/orders"
              className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-200 font-bold rounded-lg hover:border-gray-300 transition-colors cursor-pointer"
            >
              View My Orders
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaymentSuccess
