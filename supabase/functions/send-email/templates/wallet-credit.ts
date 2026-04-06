import { getEmailLayout } from './layout.ts'

export function getWalletCreditHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const amount = data.amount as string
  const description = data.description as string
  const expiryDate = data.expiryDate as string
  const newBalance = data.newBalance as string
  const transactionsUrl = data.transactionsUrl as string | undefined

  const content = `
    <h2>Wallet Credited</h2>
    <p>Hi ${name},</p>
    <p>Great news! Your BabyBets wallet has been credited.</p>

    <div class="info-box" style="text-align: center; border: 2px solid #10b981; background-color: #f0fdf4;">
      <div style="font-size: 14px; color: #3f3f46; margin-bottom: 8px;">Amount Credited</div>
      <div style="font-size: 36px; font-weight: 700; color: #10b981; letter-spacing: -0.02em;">£${amount}</div>
    </div>

    <table>
      <tr>
        <td>Description:</td>
        <td><strong>${description}</strong></td>
      </tr>
      <tr>
        <td>New Balance:</td>
        <td><strong>£${newBalance}</strong></td>
      </tr>
      <tr>
        <td>Expires On:</td>
        <td><strong>${expiryDate}</strong></td>
      </tr>
    </table>

    <p>You can now use this balance to enter exciting competitions and win amazing prizes!</p>

    ${transactionsUrl ? `
    <a href="${transactionsUrl}" class="button">View Transaction History</a>
    ` : ''}

    <p style="font-size: 13px; color: #71717a; margin-top: 24px;">
      This credit will expire on ${expiryDate}. Make sure to use it before then!
    </p>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Wallet Credited', content, logoUrl)
}

export function getWalletCreditText(name: string, data: Record<string, unknown>): string {
  const amount = data.amount as string
  const description = data.description as string
  const expiryDate = data.expiryDate as string
  const newBalance = data.newBalance as string
  const transactionsUrl = data.transactionsUrl as string | undefined

  return `
Wallet Credited

Hi ${name},

Great news! Your BabyBets wallet has been credited.

Amount Credited: £${amount}
Description: ${description}
New Balance: £${newBalance}
Expires On: ${expiryDate}

You can now use this balance to enter exciting competitions and win amazing prizes!

${transactionsUrl ? `View your transaction history: ${transactionsUrl}` : ''}

This credit will expire on ${expiryDate}. Make sure to use it before then!

The BabyBets Team
  `.trim()
}
