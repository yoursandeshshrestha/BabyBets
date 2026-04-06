/**
 * Production-safe logger
 * Only logs in development, silent in production
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

class Logger {
  private isDev = import.meta.env.DEV

  private log(level: LogLevel, ...args: unknown[]) {
    if (this.isDev) {
      console[level](...args)
    }
  }

  /**
   * General logging (dev only)
   */
  info(...args: unknown[]) {
    this.log('log', ...args)
  }

  /**
   * Warning messages (dev only)
   */
  warn(...args: unknown[]) {
    this.log('warn', ...args)
  }

  /**
   * Debug messages (dev only)
   */
  debug(...args: unknown[]) {
    this.log('debug', ...args)
  }

  /**
   * Error logging (always logged, also sent to Sentry in prod)
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>) {
    if (this.isDev) {
      console.error(message, error, context)
    } else {
      // In production, send to Sentry
      if (import.meta.env.PROD && error instanceof Error) {
        // Lazy load Sentry to avoid bundle bloat
        import('./sentry').then(({ captureError }) => {
          captureError(error, { message, ...context })
        })
      }
    }
  }

  /**
   * Critical errors that should always be visible
   */
  critical(...args: unknown[]) {
    console.error('🔴 CRITICAL ERROR:', ...args)
    // Always log critical errors, even in production
  }
}

export const logger = new Logger()

/**
 * Usage:
 *
 * import { logger } from '@/lib/logger'
 *
 * logger.info('User logged in')           // Dev only
 * logger.warn('API rate limit approaching') // Dev only
 * logger.debug('State updated:', state)    // Dev only
 * logger.error('Payment failed', error)    // Dev + Sentry in prod
 * logger.critical('Database connection lost') // Always visible
 */
