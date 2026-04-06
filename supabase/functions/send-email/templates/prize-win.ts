import { getEmailLayout } from './layout.ts'

export function getPrizeWinHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Congratulations, ${name}!</h2>
    <p>Great news! You've won a prize in our competition.</p>

    <div class="info-box">
      <h3 style="margin-top: 0;">Your Prize</h3>
      <div class="prize-value">${data.prizeName || 'Prize'}</div>
      ${data.prizeValue ? `<p style="font-size: 18px; font-weight: 600; color: #09090b;">Value: £${data.prizeValue}</p>` : ''}
      ${data.prizeDescription ? `<p style="color: #3f3f46;">${data.prizeDescription}</p>` : ''}
    </div>

    <div class="info-box">
      <table>
        ${data.ticketNumber ? `<tr><td>Winning Ticket</td><td>${data.ticketNumber}</td></tr>` : ''}
        ${data.competitionTitle ? `<tr><td>Competition</td><td>${data.competitionTitle}</td></tr>` : ''}
        <tr><td>Claim Deadline</td><td>30 days from today</td></tr>
      </table>
    </div>

    <p>To claim your prize, please log in to your account and follow the claim instructions.</p>
    <a href="${data.claimUrl || 'https://babybets.co.uk/account/prizes'}" class="button">Claim Your Prize</a>

    <p>If you have any questions about your prize, our support team is here to help.</p>
    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Prize Win Notification', content, logoUrl)
}

export function getPrizeWinText(name: string, data: Record<string, unknown>): string {
  return `
Congratulations, ${name}!

Great news! You've won a prize in our competition.

Your Prize: ${data.prizeName || 'Prize'}
${data.prizeValue ? `Value: £${data.prizeValue}` : ''}

${data.ticketNumber ? `Winning Ticket: ${data.ticketNumber}` : ''}
${data.competitionTitle ? `Competition: ${data.competitionTitle}` : ''}
Claim Deadline: 30 days from today

To claim your prize, please log in to your account:
${data.claimUrl || 'https://babybets.co.uk/account/prizes'}

If you have any questions about your prize, our support team is here to help.

The BabyBets Team
  `
}
