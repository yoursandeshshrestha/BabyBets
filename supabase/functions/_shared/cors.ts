/**
 * CORS Configuration for Edge Functions
 * SECURITY: Restricts cross-origin requests to authorized domains only
 *
 * Configuration:
 * - Set PUBLIC_SITE_URL in environment variables (e.g., https://babybets.co.uk)
 * - For development, also include http://localhost:7001
 * - Webhook endpoints (g2pay-webhook) keep wildcard for external service access
 */

/**
 * Get CORS headers with dynamic origin based on environment
 * @param allowWildcard - Set to true for webhook/external endpoints only
 * @param requestOrigin - The Origin header from the incoming request
 */
export function getCorsHeaders(allowWildcard: boolean = false, requestOrigin?: string): Record<string, string> {
  if (allowWildcard) {
    // Only for external service webhooks (G2Pay, Apple Pay validation, etc.)
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    }
  }

  // Get allowed origins from environment
  const publicSiteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://babybets.co.uk'
  const allowedOrigins = [
    publicSiteUrl,
    'http://localhost:7001', // Development
    'http://localhost:5173', // Vite dev server
  ]

  // CORS spec: Access-Control-Allow-Origin must be a single origin, not a list
  // If request origin is in allowed list, return it; otherwise return first allowed origin
  const origin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0]

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Get security headers for all responses
 * Implements defense-in-depth security measures
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    // CSP for edge functions (restrictive)
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'",
  }
}

/**
 * Get complete response headers (CORS + Security)
 * @param allowWildcard - Set to true for webhook/external endpoints only
 * @param requestOrigin - The Origin header from the incoming request
 */
export function getResponseHeaders(allowWildcard: boolean = false, requestOrigin?: string): Record<string, string> {
  return {
    ...getCorsHeaders(allowWildcard, requestOrigin),
    ...getSecurityHeaders(),
    'Content-Type': 'application/json',
  }
}
