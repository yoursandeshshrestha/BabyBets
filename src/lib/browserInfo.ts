/**
 * Collect browser information required for 3D Secure v2 authentication
 * Based on G2Pay's requirements for 3DS
 */

interface BrowserInfo {
  deviceChannel: string
  deviceIdentity: string
  deviceTimeZone: string
  deviceCapabilities: string
  deviceScreenResolution: string
  deviceAcceptContent: string
  deviceAcceptEncoding: string
  deviceAcceptLanguage: string
  deviceAcceptCharset?: string
}

/**
 * Collect comprehensive browser information for 3DS v2
 */
export function collectBrowserInfo(): BrowserInfo {
  const screen = window.screen
  const navigator = window.navigator

  // Get timezone offset in minutes
  const timeZone = new Date().getTimezoneOffset().toString()

  // Device capabilities (javascript enabled, color depth, etc)
  const capabilities = [
    'javascript', // JavaScript is obviously enabled if this is running
    screen.colorDepth ? `colordepth-${screen.colorDepth}` : '',
  ]
    .filter(Boolean)
    .join(',')

  // Screen resolution
  const screenResolution = screen.width && screen.height ? `${screen.width}x${screen.height}x${screen.colorDepth || 24}` : ''

  // Language
  const language = navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en-GB'

  return {
    // Browser is the device channel
    deviceChannel: 'browser',

    // Browser user agent as device identity
    deviceIdentity: navigator.userAgent || '',

    // Timezone offset
    deviceTimeZone: timeZone,

    // Capabilities
    deviceCapabilities: capabilities,

    // Screen resolution
    deviceScreenResolution: screenResolution,

    // Content types browser accepts
    deviceAcceptContent: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',

    // Encoding browser accepts
    deviceAcceptEncoding: 'gzip, deflate, br',

    // Languages browser accepts
    deviceAcceptLanguage: language,
  }
}

/**
 * Get the user's IP address (best effort - will be set server-side)
 * This is a placeholder - the actual IP should be detected server-side
 */
export async function getDeviceIpAddress(): Promise<string> {
  // In practice, the server should detect this from the request headers
  // For now, return empty and let server handle it
  return ''
}
