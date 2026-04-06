import { getEmailLayout } from './layout.ts'

export function getInfluencerApprovedHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const commissionTier = data.commissionTier || 1
  const content = `
    <h2>🎉 Welcome to BabyBets Partners!</h2>
    <p>Hi ${name},</p>
    <p>Congratulations! Your application to become a BabyBets Partner has been <strong style="color: #16a34a;">approved</strong>!</p>

    <div class="info-box">
      <h3>Your Partner Details</h3>
      <table>
        <tr>
          <td>Partner Name</td>
          <td><strong>${data.displayName || name}</strong></td>
        </tr>
        <tr>
          <td>Partner Code</td>
          <td><span class="highlight">${data.slug || 'N/A'}</span></td>
        </tr>
        <tr>
          <td>Commission Tier</td>
          <td>Tier ${commissionTier}</td>
        </tr>
        <tr>
          <td>Status</td>
          <td><span style="color: #16a34a; font-weight: 600;">Active</span></td>
        </tr>
      </table>
    </div>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; margin: 24px 0; border-radius: 8px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #166534;">Getting Started</h3>
      <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 14px; line-height: 1.8;">
        <li>Share your unique partner code: <strong>${data.slug || 'N/A'}</strong></li>
        <li>Direct your audience to: <strong>babybets.co.uk/partner/${data.slug || 'your-code'}</strong></li>
        <li>Earn commission on every sale through your link</li>
        <li>Track your earnings and performance in your dashboard</li>
      </ul>
    </div>

    <a href="${data.dashboardUrl || 'https://babybets.co.uk/influencer/dashboard'}" class="button">Go to Dashboard</a>

    <p style="margin-top: 24px;">
      Need help getting started? Check out our <a href="https://babybets.co.uk/partner-guide" style="color: #3f3f46; font-weight: 600; text-decoration: underline;">Partner Guide</a> or contact our support team.
    </p>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">Welcome aboard! 🚀<br>The BabyBets Team</p>
  `
  return getEmailLayout('Welcome to BabyBets Partners!', content, logoUrl)
}

export function getInfluencerApprovedText(name: string, data: Record<string, unknown>): string {
  const commissionTier = data.commissionTier || 1
  return `
Welcome to BabyBets Partners!

Hi ${name},

Congratulations! Your application to become a BabyBets Partner has been approved!

Your Partner Details:
- Partner Name: ${data.displayName || name}
- Partner Code: ${data.slug || 'N/A'}
- Commission Tier: Tier ${commissionTier}
- Status: Active

Getting Started:
- Share your unique partner code: ${data.slug || 'N/A'}
- Direct your audience to: babybets.co.uk/partner/${data.slug || 'your-code'}
- Earn commission on every sale through your link
- Track your earnings and performance in your dashboard

Access your dashboard: ${data.dashboardUrl || 'https://babybets.co.uk/influencer/dashboard'}

Need help getting started? Check out our Partner Guide at https://babybets.co.uk/partner-guide or contact our support team.

Welcome aboard!
The BabyBets Team
  `
}
