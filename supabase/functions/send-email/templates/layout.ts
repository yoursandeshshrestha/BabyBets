/**
 * Common email layout wrapper - Matches BabyBets branding
 * Clean, minimal black & white aesthetic
 */
export function getEmailLayout(title: string, content: string, logoUrl?: string): string {
  // Default logo URL if none provided
  const defaultLogoUrl = 'https://eooebphyjhrgzmfroaaq.supabase.co/storage/v1/object/public/babybets-assets/email-logo.png'
  const emailLogoUrl = logoUrl || defaultLogoUrl
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #09090b;
      margin: 0;
      padding: 0;
      background-color: #fafafa;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: #fdf4e9;
      color: #09090b;
      padding: 40px 30px;
      text-align: center;
      border-bottom: 1px solid #f0e6d6;
    }
    .header img {
      max-width: 180px;
      height: auto;
      display: inline-block;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .content {
      padding: 40px 30px;
      color: #09090b;
    }
    .content h2 {
      font-size: 24px;
      font-weight: 600;
      color: #09090b;
      margin: 0 0 16px 0;
      letter-spacing: -0.01em;
    }
    .content p {
      margin: 0 0 16px 0;
      color: #3f3f46;
      font-size: 15px;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background-color: #fdf4e9;
      color: #09090b !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin: 24px 0;
      text-align: center;
      font-size: 15px;
      border: 2px solid #f0e6d6;
      transition: all 0.2s;
    }
    .button:hover {
      background-color: #fbefd9;
      border-color: #e8dcc6;
    }
    .info-box {
      background-color: #fefcf7;
      border: 1px solid #f0e6d6;
      padding: 20px;
      margin: 24px 0;
      border-radius: 8px;
    }
    .info-box h3 {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
      color: #09090b;
    }
    .info-box p {
      margin: 0;
      font-size: 14px;
      color: #3f3f46;
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      color: #71717a;
      font-size: 13px;
      border-top: 1px solid #e5e7eb;
    }
    .footer a {
      color: #3f3f46;
      text-decoration: none;
      font-weight: 500;
    }
    .footer a:hover {
      color: #09090b;
      text-decoration: underline;
    }
    .prize-value {
      font-size: 36px;
      font-weight: 700;
      color: #09090b;
      margin: 16px 0;
      letter-spacing: -0.02em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    table td {
      padding: 12px 0;
      border-bottom: 1px solid #f0e6d6;
      font-size: 14px;
    }
    table td:first-child {
      font-weight: 600;
      color: #3f3f46;
      width: 40%;
    }
    table td:last-child {
      color: #09090b;
    }
    table tr:last-child td {
      border-bottom: none;
    }
    .highlight {
      background-color: #fdf4e9;
      color: #09090b;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${emailLogoUrl}" alt="BabyBets" />
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} BabyBets. All rights reserved.</p>
      <p style="margin-top: 16px;">
        <a href="https://babybets.co.uk">Website</a> •
        <a href="https://babybets.co.uk/account">My Account</a> •
        <a href="https://babybets.co.uk/support">Support</a>
      </p>
    </div>
  </div>
</body>
</html>
  `
}
