import { getEmailLayout } from './layout.ts'

export function getInfluencerApplicationSubmittedHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Partner Application Received</h2>
    <p>Hi ${name},</p>
    <p>Thank you for applying to become a BabyBets Partner! We're excited that you want to join our community.</p>

    <div class="info-box">
      <h3>Application Details</h3>
      <table>
        <tr>
          <td>Partner Name</td>
          <td>${data.displayName || name}</td>
        </tr>
        <tr>
          <td>Application Date</td>
          <td>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
        </tr>
        <tr>
          <td>Status</td>
          <td><span class="highlight">Under Review</span></td>
        </tr>
      </table>
    </div>

    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 20px; margin: 24px 0; border-radius: 8px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #1e40af;">What happens next?</h3>
      <ul style="margin: 0; padding-left: 20px; color: #1e40af; font-size: 14px; line-height: 1.8;">
        <li>Our team will review your application within 1-3 business days</li>
        <li>We'll verify your profile and social media presence</li>
        <li>You'll receive an email once we've made a decision</li>
      </ul>
    </div>

    <p>While you wait, feel free to browse our current competitions and familiarize yourself with how BabyBets works!</p>

    <a href="https://babybets.co.uk/competitions" class="button">Browse Competitions</a>

    <p style="margin-top: 24px; font-size: 13px; color: #71717a;">
      Questions about your application? Contact us at <a href="mailto:partners@babybets.co.uk" style="color: #3f3f46; font-weight: 600;">partners@babybets.co.uk</a>
    </p>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Partner Application Received', content, logoUrl)
}

export function getInfluencerApplicationSubmittedText(name: string, data: Record<string, unknown>): string {
  return `
Partner Application Received

Hi ${name},

Thank you for applying to become a BabyBets Partner! We're excited that you want to join our community.

Application Details:
- Partner Name: ${data.displayName || name}
- Application Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
- Status: Under Review

What happens next?
- Our team will review your application within 1-3 business days
- We'll verify your profile and social media presence
- You'll receive an email once we've made a decision

While you wait, feel free to browse our current competitions and familiarize yourself with how BabyBets works!

Browse competitions: https://babybets.co.uk/competitions

Questions about your application? Contact us at partners@babybets.co.uk

The BabyBets Team
  `
}
