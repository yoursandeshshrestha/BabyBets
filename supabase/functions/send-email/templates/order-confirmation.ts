import { getEmailLayout } from './layout.ts'

export function getOrderConfirmationHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Thank you for your order, ${name}!</h2>
    <p>Your order has been confirmed and your tickets have been allocated.</p>

    <div class="info-box">
      <h3 style="margin-top: 0;">Order Details</h3>
      <table>
        <tr>
          <td>Order Number:</td>
          <td><strong>${data.orderNumber || 'N/A'}</strong></td>
        </tr>
        <tr>
          <td>Order Date:</td>
          <td>${data.orderDate || new Date().toLocaleDateString()}</td>
        </tr>
        <tr>
          <td>Total Tickets:</td>
          <td><strong>${data.totalTickets || 0}</strong></td>
        </tr>
        <tr>
          <td>Order Total:</td>
          <td><strong>£${data.orderTotal || '0.00'}</strong></td>
        </tr>
      </table>
    </div>

    <p>You can view your tickets and check for instant wins in your account.</p>
    <a href="${data.ticketsUrl || 'https://babybets.co.uk/account/tickets'}" class="button">View My Tickets</a>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Order Confirmation', content, logoUrl)
}

export function getOrderConfirmationText(name: string, data: Record<string, unknown>): string {
  return `
Thank you for your order, ${name}!

Your order has been confirmed and your tickets have been allocated.

Order Details:
- Order Number: ${data.orderNumber || 'N/A'}
- Order Date: ${data.orderDate || new Date().toLocaleDateString()}
- Total Tickets: ${data.totalTickets || 0}
- Order Total: £${data.orderTotal || '0.00'}

View your tickets: ${data.ticketsUrl || 'https://babybets.co.uk/account/tickets'}

The BabyBets Team
  `
}
