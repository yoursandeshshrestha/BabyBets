# BabyBets - Supabase Auth Email Templates

Custom email templates for Supabase authentication emails that match BabyBets branding.

## Templates Included

1. **confirm-signup.html** - Email confirmation for new user signups
2. **reset-password.html** - Password reset request
3. **magic-link.html** - Passwordless sign-in link
4. **change-email.html** - Email address change confirmation

## How to Configure in Supabase Dashboard

### Step 1: Enable Custom SMTP

1. Go to **Supabase Dashboard** → Your Project → **Authentication** → **Email Templates**
2. Scroll down to **SMTP Settings**
3. Click **Enable Custom SMTP**
4. Enter the following details:

```
SMTP Host: smtp.mailgun.org
SMTP Port: 587
SMTP Username: postmaster@mail.babybets.co.uk
SMTP Password: [Get from Mailgun Dashboard → Sending → Domain Settings → SMTP Credentials]
Sender Email: noreply@mail.babybets.co.uk
Sender Name: BabyBets
```

### Step 2: Update Email Templates

For each template type, click **Edit** and paste the corresponding HTML:

#### Confirm Signup
- Copy contents from `confirm-signup.html`
- Paste into the **Confirm signup** template editor
- Click **Save**

#### Reset Password
- Copy contents from `reset-password.html`
- Paste into the **Reset password** template editor
- Click **Save**

#### Magic Link
- Copy contents from `magic-link.html`
- Paste into the **Magic Link** template editor
- Click **Save**

#### Change Email
- Copy contents from `change-email.html`
- Paste into the **Change Email Address** template editor
- Click **Save**

## Template Variables

Supabase provides these variables that are automatically replaced in the templates:

- `{{ .ConfirmationURL }}` - The confirmation/action URL
- `{{ .Token }}` - The confirmation token (if needed separately)
- `{{ .TokenHash }}` - Hashed token
- `{{ .SiteURL }}` - Your site URL configured in Supabase
- `{{ .Email }}` - The user's email address

## Branding Details

**Colors:**
- Background: `#fafafa`
- Container: `#ffffff`
- Header/Button: `#fdf4e9` (cream)
- Primary text: `#09090b` (black)
- Secondary text: `#3f3f46` (gray)
- Border: `#f0e6d6`

**Typography:**
- Font: Plus Jakarta Sans
- Headers: 24px, weight 600
- Body: 15px, weight 400

**Logo:**
- URL: `https://eooebphyjhrgzmfroaaq.supabase.co/storage/v1/object/public/babybets-assets/email-logo.png`
- Max width: 180px

## Testing

After configuring:

1. Test signup confirmation:
   - Create a new user account
   - Check the email received

2. Test password reset:
   - Use "Forgot Password" feature
   - Verify the email template

3. Test magic link (if enabled):
   - Use passwordless sign-in
   - Check the email

## Troubleshooting

**Emails still coming from noreply@mail.app.supabase.io?**
- Make sure Custom SMTP is enabled and saved
- Verify SMTP credentials are correct
- Check Mailgun sending logs for errors

**Template not updating?**
- Clear browser cache
- Make sure to click "Save" after pasting template
- Try logging out and back into Supabase dashboard

**SMTP authentication failed?**
- Double-check SMTP password from Mailgun
- Ensure domain is verified in Mailgun
- Check Mailgun sending is not paused

## Support

For issues with:
- **Supabase setup**: [Supabase Documentation](https://supabase.com/docs/guides/auth/auth-smtp)
- **Mailgun setup**: [Mailgun Documentation](https://documentation.mailgun.com/en/latest/user_manual/get_started.html)
- **BabyBets specifics**: Contact development team
