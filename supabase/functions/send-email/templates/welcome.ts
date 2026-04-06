import { getEmailLayout } from './layout.ts'

export function getWelcomeHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Welcome to BabyBets, ${name}</h2>
    <p>Thank you for joining our community. We're excited to have you here.</p>

    <p>BabyBets is the UK's premier competition platform where you can win amazing prizes. Here's what you can do:</p>

    <div class="info-box">
      <ul style="margin: 0; padding-left: 20px; color: #3f3f46;">
        <li style="margin-bottom: 8px;">Enter exciting competitions with fantastic prizes</li>
        <li style="margin-bottom: 8px;">Play instant win games with immediate results</li>
        <li style="margin-bottom: 8px;">Track your tickets and wins in your account</li>
        <li>Secure payments and fair, transparent draws</li>
      </ul>
    </div>

    <p>Ready to get started?</p>
    <a href="${data.competitionsUrl || 'https://babybets.co.uk/competitions'}" class="button">Browse Competitions</a>

    <p>If you have any questions, our support team is here to help.</p>
    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Welcome to BabyBets', content, logoUrl)
}

export function getWelcomeText(name: string, data: Record<string, unknown>): string {
  return `
Welcome to BabyBets, ${name}

Thank you for joining our community. We're excited to have you here.

BabyBets is the UK's premier competition platform where you can win amazing prizes. Here's what you can do:

- Enter exciting competitions with fantastic prizes
- Play instant win games with immediate results
- Track your tickets and wins in your account
- Secure payments and fair, transparent draws

Ready to get started?
Browse competitions: ${data.competitionsUrl || 'https://babybets.co.uk/competitions'}

If you have any questions, our support team is here to help.

The BabyBets Team
  `
}
