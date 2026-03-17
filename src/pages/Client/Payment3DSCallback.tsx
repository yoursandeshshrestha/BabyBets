import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * 3DS ACS Callback Page
 *
 * This page is loaded inside an iframe after the bank's 3DS challenge completes.
 * The ACS (Access Control Server) POSTs the result here.
 * We relay it back to the parent checkout page via postMessage.
 *
 * Flow:
 * 1. G2Pay returns threeDSURL + threeDSRequest
 * 2. Checkout opens iframe, posts form to threeDSURL
 * 3. User completes 3DS challenge in iframe
 * 4. ACS redirects to this page with cres/threeDSMethodData
 * 5. This page sends postMessage to parent window
 * 6. Checkout receives message, calls continue-3ds edge function
 */
const Payment3DSCallback = () => {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    // Collect all URL parameters (the ACS response)
    const threeDSResponse: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      if (key !== 'orderRef') {
        threeDSResponse[key] = value
      }
    })

    // Also check for POST data that might be in the URL hash or body
    // ACS typically sends cres or threeDSMethodData
    const orderRef = searchParams.get('orderRef')

    console.log('[3DS Callback] Received ACS response', {
      orderRef,
      params: Object.keys(threeDSResponse),
    })

    // Send response back to parent window (checkout page)
    if (window.parent && window.parent !== window) {
      console.log('[3DS Callback] Sending postMessage to parent')
      window.parent.postMessage({
        type: 'threeDSResponse',
        response: threeDSResponse,
        orderRef,
      }, '*')
    }

    // Also try opener (popup scenario)
    if (window.opener) {
      console.log('[3DS Callback] Sending postMessage to opener')
      window.opener.postMessage({
        type: 'threeDSResponse',
        response: threeDSResponse,
        orderRef,
      }, '*')
    }
  }, [searchParams])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f3f4f6',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid #e5e7eb',
          borderTopColor: '#496B71',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem',
        }} />
        <p style={{ color: '#6b7280', margin: 0 }}>Completing authentication...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

export default Payment3DSCallback
