import { getEmailLayout } from './layout.ts'

export function getInfluencerRejectedHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const content = `
    <h2>Partner Application Update</h2>
    <p>Hi ${name},</p>
    <p>Thank you for your interest in becoming a BabyBets Partner. After careful review, we're unable to approve your application at this time.</p>

    ${data.rejectionReason ? `
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 20px; margin: 24px 0; border-radius: 8px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #991b1b;">Feedback</h3>
      <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.6;">
        ${data.rejectionReason}
      </p>
    </div>
    ` : ''}

    <div class="info-box">
      <h3>What you can do</h3>
      <ul style="margin: 0; padding-left: 20px; color: #3f3f46; font-size: 14px; line-height: 1.8;">
        <li>Continue enjoying BabyBets competitions as a valued customer</li>
        <li>Build your social media presence and engagement</li>
        <li>Reapply in the future once you meet our partner criteria</li>
      </ul>
    </div>

    <p>We appreciate your interest in partnering with BabyBets. While we can't offer you a partnership at this time, we'd love to see you participate in our competitions!</p>

    <a href="https://babybets.co.uk/competitions" class="button">Browse Competitions</a>

    <p style="margin-top: 24px; font-size: 13px; color: #71717a;">
      Questions? Contact us at <a href="mailto:partners@babybets.co.uk" style="color: #3f3f46; font-weight: 600;">partners@babybets.co.uk</a>
    </p>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('Partner Application Update', content, logoUrl)
}

export function getInfluencerRejectedText(name: string, data: Record<string, unknown>): string {
  return `
Partner Application Update

Hi ${name},

Thank you for your interest in becoming a BabyBets Partner. After careful review, we're unable to approve your application at this time.

${data.rejectionReason ? `Feedback:\n${data.rejectionReason}\n\n` : ''}

What you can do:
- Continue enjoying BabyBets competitions as a valued customer
- Build your social media presence and engagement
- Reapply in the future once you meet our partner criteria

We appreciate your interest in partnering with BabyBets. While we can't offer you a partnership at this time, we'd love to see you participate in our competitions!

Browse competitions: https://babybets.co.uk/competitions

Questions? Contact us at partners@babybets.co.uk

The BabyBets Team
  `
}
