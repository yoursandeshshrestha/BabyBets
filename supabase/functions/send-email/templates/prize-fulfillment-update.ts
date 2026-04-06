import { getEmailLayout } from './layout.ts'

export function getPrizeFulfillmentUpdateHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const statusMessages: Record<string, string> = {
    'processing': 'Your prize is being prepared for shipment',
    'shipped': 'Your prize has been shipped!',
    'delivered': 'Your prize has been delivered!',
    'completed': 'Prize fulfillment completed',
  }

  const statusColors: Record<string, string> = {
    'processing': '#f59e0b',
    'shipped': '#3b82f6',
    'delivered': '#16a34a',
    'completed': '#16a34a',
  }

  const status = (data.status as string) || 'processing'
  const statusMessage = statusMessages[status] || 'Prize status updated'
  const statusColor = statusColors[status] || '#71717a'

  const content = `
    <h2>Prize Update</h2>
    <p>Hi ${name},</p>
    <p>Great news! We have an update about your prize.</p>

    <div class="info-box">
      <table>
        <tr>
          <td>Prize</td>
          <td><strong>${data.prizeName || 'Your Prize'}</strong></td>
        </tr>
        <tr>
          <td>Status</td>
          <td><span style="color: ${statusColor}; font-weight: 600; text-transform: capitalize;">${status}</span></td>
        </tr>
        ${data.trackingNumber ? `
        <tr>
          <td>Tracking Number</td>
          <td><span class="highlight">${data.trackingNumber}</span></td>
        </tr>
        ` : ''}
        ${data.estimatedDelivery ? `
        <tr>
          <td>Estimated Delivery</td>
          <td>${data.estimatedDelivery}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="background-color: ${status === 'shipped' || status === 'delivered' ? '#f0fdf4' : '#eff6ff'}; border: 1px solid ${status === 'shipped' || status === 'delivered' ? '#bbf7d0' : '#bfdbfe'}; padding: 20px; margin: 24px 0; border-radius: 8px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: ${statusColor};">${statusMessage}</h3>
      <p style="margin: 0; color: ${statusColor === '#16a34a' ? '#166534' : statusColor === '#3b82f6' ? '#1e40af' : '#92400e'}; font-size: 14px; line-height: 1.6;">
        ${data.notes || (status === 'shipped' ? 'Your prize is on its way! You can track your shipment using the tracking number above.' : status === 'delivered' ? 'We hope you enjoy your prize! Thank you for participating in BabyBets competitions.' : 'Our team is working on getting your prize ready for shipment.')}
      </p>
    </div>

    ${data.trackingUrl ? `
    <a href="${data.trackingUrl}" class="button">Track Shipment</a>
    ` : ''}

    <p style="margin-top: 24px; font-size: 13px; color: #71717a;">
      Questions about your prize? Contact us at <a href="mailto:support@babybets.co.uk" style="color: #3f3f46; font-weight: 600;">support@babybets.co.uk</a>
    </p>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Prize Update', content, logoUrl)
}

export function getPrizeFulfillmentUpdateText(name: string, data: Record<string, unknown>): string {
  const status = (data.status as string) || 'processing'
  return `
Prize Update

Hi ${name},

Great news! We have an update about your prize.

Prize Details:
- Prize: ${data.prizeName || 'Your Prize'}
- Status: ${status}${data.trackingNumber ? `\n- Tracking Number: ${data.trackingNumber}` : ''}${data.estimatedDelivery ? `\n- Estimated Delivery: ${data.estimatedDelivery}` : ''}

${data.notes || (status === 'shipped' ? 'Your prize is on its way! You can track your shipment using the tracking number above.' : status === 'delivered' ? 'We hope you enjoy your prize! Thank you for participating in BabyBets competitions.' : 'Our team is working on getting your prize ready for shipment.')}

${data.trackingUrl ? `Track your shipment: ${data.trackingUrl}\n\n` : ''}

Questions about your prize? Contact us at support@babybets.co.uk

The BabyBets Team
  `
}
