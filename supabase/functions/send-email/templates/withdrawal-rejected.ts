import { getEmailLayout } from './layout.ts'

export function getWithdrawalRejectedHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Withdrawal Request Declined</h2>
    <p>Hi ${name},</p>
    <p>Unfortunately, we're unable to process your withdrawal request at this time.</p>

    <div class="info-box">
      <table>
        <tr>
          <td>Amount Requested</td>
          <td>£${data.amount || '0.00'}</td>
        </tr>
        <tr>
          <td>Declined Date</td>
          <td>${data.rejectedDate || new Date().toLocaleDateString()}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #fef2f2; border: 1px solid: #fecaca; padding: 20px; margin: 24px 0; border-radius: 8px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #991b1b;">Reason for Decline</h3>
      <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.6;">
        ${data.rejectionReason || 'No reason provided'}
      </p>
    </div>

    <p>Your funds remain in your wallet and are available for use. You can:</p>
    <ul style="margin: 16px 0; padding-left: 24px; color: #3f3f46;">
      <li style="margin-bottom: 8px;">Use your balance to purchase competition tickets</li>
      <li style="margin-bottom: 8px;">Submit a new withdrawal request after addressing the issue above</li>
      <li style="margin-bottom: 8px;">Contact our support team if you have questions</li>
    </ul>

    <a href="${data.statusUrl || 'https://babybets.co.uk/account/withdrawals'}" class="button">View Wallet</a>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Withdrawal Request Declined', content, logoUrl)
}

export function getWithdrawalRejectedText(name: string, data: Record<string, unknown>): string {
  return `
Withdrawal Request Declined

Hi ${name},

Unfortunately, we're unable to process your withdrawal request at this time.

Request Details:
- Amount Requested: £${data.amount || '0.00'}
- Declined Date: ${data.rejectedDate || new Date().toLocaleDateString()}

Reason for Decline:
${data.rejectionReason || 'No reason provided'}

Your funds remain in your wallet and are available for use. You can:
- Use your balance to purchase competition tickets
- Submit a new withdrawal request after addressing the issue above
- Contact our support team if you have questions

View your wallet: ${data.statusUrl || 'https://babybets.co.uk/account/withdrawals'}

The BabyBets Team
  `
}
