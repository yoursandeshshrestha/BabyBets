import { getEmailLayout } from './layout.ts'

export function getInfluencerApprovedWithPasswordHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const commissionTier = data.commissionTier || 1
  const commissionRate = commissionTier === 1 ? '10%' :
                        commissionTier === 2 ? '15%' :
                        commissionTier === 3 ? '20%' : '25%'

  const content = `
    <h2>🎉 Welcome to BabyBets Partners!</h2>
    <p>Hi ${name},</p>
    <p>Congratulations! Your application to become a BabyBets Partner has been <strong style="color: #16a34a;">approved</strong>!</p>
    <p>We've created your partner account with a temporary password. You can now log in to access your exclusive dashboard.</p>

    <div style="background-color: #fef3c7; border: 2px solid #fbbf24; padding: 20px; margin: 24px 0; border-radius: 8px;">
      <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #78350f;">🔐 Your Login Credentials</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #78350f; font-size: 14px; font-weight: 600;">Email:</span>
          </td>
          <td style="padding: 8px 0;">
            <span style="color: #78350f; font-size: 14px; font-family: 'Courier New', monospace;">${data.recipientEmail || ''}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #78350f; font-size: 14px; font-weight: 600;">Temporary Password:</span>
          </td>
          <td style="padding: 8px 0;">
            <span style="color: #78350f; font-size: 16px; font-weight: bold; font-family: 'Courier New', monospace; background-color: #fef9c3; padding: 8px 12px; border-radius: 4px; display: inline-block;">${data.temporaryPassword || ''}</span>
          </td>
        </tr>
      </table>
      <p style="margin: 16px 0 0 0; color: #dc2626; font-size: 14px; font-weight: 600;">
        ⚠️ IMPORTANT: Please change your password immediately after logging in for security purposes.
      </p>
    </div>

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
          <td>Commission Rate</td>
          <td><strong>${commissionRate}</strong></td>
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
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #166534;">Next Steps</h3>
      <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 14px; line-height: 1.8;">
        <li>Log in using the credentials above</li>
        <li>Change your password for security</li>
        <li>Complete your profile in the dashboard</li>
        <li>Get your unique referral link</li>
        <li>Start sharing and earning commissions!</li>
      </ul>
    </div>

    <a href="${data.loginUrl || 'https://babybets.co.uk/login'}" class="button">Log In to Your Dashboard</a>

    <p style="margin-top: 24px;">
      If you have any questions or need assistance, feel free to reach out to our team. We're here to help you succeed!
    </p>

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">Welcome aboard! 🚀<br>The BabyBets Team</p>
  `
  return getEmailLayout('Welcome to BabyBets Partners - Your Account Details', content, logoUrl)
}

export function getInfluencerApprovedWithPasswordText(
  firstName: string,
  data: Record<string, unknown>
): string {
  const displayName = data.displayName || 'there'
  const slug = data.slug || ''
  const temporaryPassword = data.temporaryPassword || ''
  const loginUrl = data.loginUrl || 'https://babybets.co.uk/login'
  const commissionTier = data.commissionTier || 1

  const commissionRate = commissionTier === 1 ? '10%' :
                        commissionTier === 2 ? '15%' :
                        commissionTier === 3 ? '20%' : '25%'

  return `
🎉 Congratulations ${firstName}!

Your BabyBets Partner Application Has Been Approved!

We're thrilled to welcome you to the BabyBets Partner Program! Your application has been reviewed and approved.

We've created your partner account, and you can now log in to access your exclusive dashboard.

YOUR LOGIN CREDENTIALS
----------------------
Email: ${data.recipientEmail || ''}
Temporary Password: ${temporaryPassword}

⚠️ IMPORTANT: Please change your password immediately after logging in for security purposes.

YOUR PARTNER DETAILS
--------------------
Display Name: ${displayName}
Partner Slug: /${slug}
Commission Rate: ${commissionRate}

Log in here: ${loginUrl}

NEXT STEPS:
1. Log in using the credentials above
2. Change your password for security
3. Complete your profile in the dashboard
4. Get your unique referral link
5. Start sharing and earning commissions!

If you have any questions or need assistance, feel free to reach out to our team. We're here to help you succeed!

Welcome aboard,
The BabyBets Team

---
This email was sent to you because your BabyBets Partner application was approved.
© ${new Date().getFullYear()} BabyBets. All rights reserved.
  `.trim()
}
