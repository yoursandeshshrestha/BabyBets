import { getEmailLayout } from './layout.ts'

export function getCompetitionEndingHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Competition Ending Soon</h2>
    <p>Hi ${name},</p>
    <p>This is a reminder that <strong>${data.competitionTitle || 'a competition'}</strong> is ending soon.</p>

    <div class="info-box">
      <table>
        <tr><td>Prize</td><td>${data.prizeName || 'Prize'}</td></tr>
        ${data.prizeValue ? `<tr><td>Value</td><td>£${data.prizeValue}</td></tr>` : ''}
        <tr><td>Ends</td><td>${data.endDate || 'Soon'}</td></tr>
        ${data.ticketsRemaining ? `<tr><td>Tickets Remaining</td><td>${data.ticketsRemaining}</td></tr>` : ''}
      </table>
    </div>

    <p>Don't miss your chance to enter.</p>
    <a href="${data.competitionUrl || 'https://babybets.co.uk/competitions'}" class="button">Enter Competition</a>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Competition Ending Soon', content, logoUrl)
}

export function getCompetitionEndingText(name: string, data: Record<string, unknown>): string {
  return `
Competition Ending Soon

Hi ${name},

This is a reminder that ${data.competitionTitle || 'a competition'} is ending soon.

Prize: ${data.prizeName || 'Prize'}
${data.prizeValue ? `Value: £${data.prizeValue}` : ''}
Ends: ${data.endDate || 'Soon'}
${data.ticketsRemaining ? `Tickets Remaining: ${data.ticketsRemaining}` : ''}

Don't miss your chance to enter:
${data.competitionUrl || 'https://babybets.co.uk/competitions'}

The BabyBets Team
  `
}
