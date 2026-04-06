import { getEmailLayout } from './layout.ts'

export function getWithdrawalApprovedHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Withdrawal Approved</h2>
    <p>Hi ${name},</p>
    <p>Your withdrawal request has been approved and is being processed.</p>

    <div class="info-box">
      <table>
        <tr>
          <td>Amount</td>
          <td>£${data.amount || '0.00'}</td>
        </tr>
        <tr>
          <td>Approved Date</td>
          <td>${data.approvedDate || new Date().toLocaleDateString()}</td>
        </tr>
        <tr>
          <td>Payment Method</td>
          <td>${data.paymentMethod || 'Bank Transfer'}</td>
        </tr>
        <tr>
          <td>Expected Arrival</td>
          <td>${data.expectedArrival || '3-5 business days'}</td>
        </tr>
      </table>
    </div>

    <p>Your payment is being processed and should arrive within the expected timeframe.</p>

    <a href="${data.statusUrl || 'https://babybets.co.uk/account/withdrawals'}" class="button">View Details</a>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Withdrawal Approved', content, logoUrl)
}

export function getWithdrawalApprovedText(name: string, data: Record<string, unknown>): string {
  return `
Withdrawal Approved

Hi ${name},

Your withdrawal request has been approved and is being processed.

Payment Details:
- Amount: £${data.amount || '0.00'}
- Approved Date: ${data.approvedDate || new Date().toLocaleDateString()}
- Payment Method: ${data.paymentMethod || 'Bank Transfer'}
- Expected Arrival: ${data.expectedArrival || '3-5 business days'}

Your payment is being processed and should arrive within the expected timeframe.

View details: ${data.statusUrl || 'https://babybets.co.uk/account/withdrawals'}

The BabyBets Team
  `
}
