import { getEmailLayout } from './layout.ts'

export function getWithdrawalRequestHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Withdrawal Request Received</h2>
    <p>Hi ${name},</p>
    <p>We've received your withdrawal request and it's being processed.</p>

    <div class="info-box">
      <h3 style="margin-top: 0;">Withdrawal Details</h3>
      <table>
        <tr>
          <td>Amount:</td>
          <td><strong>£${data.amount || '0.00'}</strong></td>
        </tr>
        <tr>
          <td>Request Date:</td>
          <td>${data.requestDate || new Date().toLocaleDateString()}</td>
        </tr>
        <tr>
          <td>Status:</td>
          <td><strong>Pending Review</strong></td>
        </tr>
      </table>
    </div>

    <p>Our team will review your request within 1-3 business days. You'll receive another email once your withdrawal has been approved.</p>

    <a href="${data.statusUrl || 'https://babybets.co.uk/account/withdrawals'}" class="button">Check Status</a>

    <p>If you have any questions, please contact our support team.</p>
    <p>The BabyBets Team</p>
  `
  return getEmailLayout('Withdrawal Request', content, logoUrl)
}

export function getWithdrawalRequestText(name: string, data: Record<string, unknown>): string {
  return `
Withdrawal Request Received

Hi ${name},

We've received your withdrawal request and it's being processed.

Withdrawal Details:
- Amount: £${data.amount || '0.00'}
- Request Date: ${data.requestDate || new Date().toLocaleDateString()}
- Status: Pending Review

Our team will review your request within 1-3 business days.

Check status: ${data.statusUrl || 'https://babybets.co.uk/account/withdrawals'}

The BabyBets Team
  `
}
