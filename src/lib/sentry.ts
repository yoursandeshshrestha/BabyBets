import * as Sentry from '@sentry/react'

/**
 * Initialize Sentry for error tracking
 * Only enables in production to avoid noise during development
 */
export function initSentry() {
  // Only initialize in production
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,

      // Set environment
      environment: import.meta.env.MODE || 'production',

      // Performance monitoring
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],

      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% of transactions

      // Session Replay (for debugging)
      replaysSessionSampleRate: 0.1, // 10% of sessions
      replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

      // Filter out sensitive data
      beforeSend(event, hint) {
        // Don't send errors in development
        if (import.meta.env.DEV) {
          return null
        }

        // Remove sensitive data from event
        if (event.request) {
          delete event.request.cookies
          delete event.request.headers
        }

        // Filter out known browser extension errors
        const error = hint.originalException as Error
        if (error?.message?.includes('Extension context invalidated')) {
          return null
        }

        return event
      },

      // Ignore specific errors
      ignoreErrors: [
        // Browser extension errors
        'Extension context invalidated',
        'chrome-extension://',
        'moz-extension://',

        // Network errors (handle gracefully in UI)
        'Failed to fetch',
        'NetworkError',
        'Network request failed',

        // ResizeObserver (benign)
        'ResizeObserver loop',
      ],
    })

    console.log('🔍 Sentry initialized for production monitoring')
  } else if (import.meta.env.DEV) {
    console.log('📍 Sentry disabled in development mode')
  }
}

/**
 * Manually capture an error
 */
export function captureError(error: Error, context?: Record<string, unknown>) {
  if (import.meta.env.PROD) {
    Sentry.captureException(error, {
      extra: context,
    })
  } else {
    console.error('Error:', error, 'Context:', context)
  }
}

/**
 * Set user context for better error tracking
 */
export function setUserContext(user: { id: string; email?: string }) {
  if (import.meta.env.PROD) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
    })
  }
}

/**
 * Clear user context (on logout)
 */
export function clearUserContext() {
  if (import.meta.env.PROD) {
    Sentry.setUser(null)
  }
}
