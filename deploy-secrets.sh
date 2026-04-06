#!/bin/bash

# BabyBets Edge Functions - Secrets Deployment Script
# Sets all required environment variables for edge functions

set -e  # Exit on error

echo "🔐 Deploying BabyBets Edge Function Secrets..."
echo ""

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install with: npm install -g supabase"
    exit 1
fi

# Check if .env.supabase file exists
if [ ! -f ".env.supabase" ]; then
    echo "❌ Error: .env.supabase file not found"
    echo "Please create a .env.supabase file with all required secrets"
    echo ""
    echo "Required secrets:"
    echo "  - MAILGUN_API_KEY"
    echo "  - MAILGUN_DOMAIN"
    echo "  - SMTP_FROM"
    echo "  - G2PAY_MERCHANT_ID"
    echo "  - G2PAY_SIGNATURE_KEY"
    echo "  - G2PAY_DIRECT_API_URL"
    echo "  - G2PAY_HOSTED_URL (optional, for Apple Pay merchant validation)"
    echo "  - SUPABASE_URL"
    echo "  - SUPABASE_ANON_KEY"
    echo "  - SUPABASE_SERVICE_ROLE_KEY"
    echo "  - PUBLIC_SITE_URL"
    echo "  - WEBHOOK_SECRET (generated during database migration)"
    echo ""
    echo "See .env.example for template"
    exit 1
fi

# Source .env.supabase file
echo "📄 Loading secrets from .env.supabase file..."
set -a
source .env.supabase
set +a

# Validate required secrets
REQUIRED_SECRETS=(
    "MAILGUN_API_KEY"
    "MAILGUN_DOMAIN"
    "SMTP_FROM"
    "G2PAY_MERCHANT_ID"
    "G2PAY_SIGNATURE_KEY"
    "G2PAY_DIRECT_API_URL"
    "SUPABASE_URL"
    "SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
    "PUBLIC_SITE_URL"
    "WEBHOOK_SECRET"
)

MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
    if [ -z "${!secret}" ]; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo "❌ Missing required secrets:"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo "   - $secret"
    done
    echo ""
    echo "Please add these to your .env.supabase file"
    exit 1
fi

echo "✅ All required secrets found"
echo ""

# Deploy Email Notification Secrets
echo "📧 Deploying Email Notification Secrets..."
supabase secrets set MAILGUN_API_KEY="$MAILGUN_API_KEY"
supabase secrets set MAILGUN_DOMAIN="$MAILGUN_DOMAIN"
supabase secrets set SMTP_FROM="$SMTP_FROM"
echo "✅ Email secrets deployed"
echo ""

# Deploy G2Pay Payment Secrets (Production Credentials)
echo "💳 Deploying G2Pay Payment Secrets (Direct API Integration)..."
supabase secrets set G2PAY_MERCHANT_ID="$G2PAY_MERCHANT_ID"
supabase secrets set G2PAY_SIGNATURE_KEY="$G2PAY_SIGNATURE_KEY"
supabase secrets set G2PAY_DIRECT_API_URL="$G2PAY_DIRECT_API_URL"

# Deploy G2Pay Hosted URL for Apple Pay merchant validation
if [ ! -z "$G2PAY_HOSTED_URL" ]; then
    supabase secrets set G2PAY_HOSTED_URL="$G2PAY_HOSTED_URL"
    echo "✅ Deployed G2PAY_HOSTED_URL"
fi

echo "✅ Payment secrets deployed"
echo ""
echo "📋 G2Pay Production Configuration:"
echo "   • Merchant ID: $G2PAY_MERCHANT_ID"
echo "   • Direct API URL: $G2PAY_DIRECT_API_URL"
echo "   • Signature Key: [HIDDEN]"
echo ""

# Supabase Configuration (automatically available in edge functions)
echo "🔧 Supabase Configuration (Auto-provided)..."
echo "   ℹ️  SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY"
echo "   ℹ️  are automatically available in all edge functions"
echo "✅ No deployment needed"
echo ""

# Deploy Public Site URL
echo "🌐 Deploying Public Site Configuration..."
supabase secrets set PUBLIC_SITE_URL="$PUBLIC_SITE_URL"
echo "✅ Public site URL deployed"
echo ""

# Deploy Webhook Secret (for database triggers)
echo "🔐 Deploying Webhook Secret (for database triggers)..."
supabase secrets set WEBHOOK_SECRET="$WEBHOOK_SECRET"
echo "✅ Webhook secret deployed"
echo ""

echo "🎉 All secrets deployed successfully!"
echo ""
echo "📋 Deployed Secrets:"
echo "   ✓ MAILGUN_API_KEY - Mailgun API authentication"
echo "   ✓ MAILGUN_DOMAIN - Email sending domain"
echo "   ✓ SMTP_FROM - From email address"
echo "   ✓ G2PAY_MERCHANT_ID - G2Pay production merchant ID"
echo "   ✓ G2PAY_SIGNATURE_KEY - G2Pay webhook signature verification"
echo "   ✓ G2PAY_DIRECT_API_URL - G2Pay direct API endpoint"
echo "   ✓ G2PAY_HOSTED_URL - G2Pay hosted endpoint (for Apple Pay merchant validation)"
echo "   ✓ PUBLIC_SITE_URL - Public website URL (for emails and redirects)"
echo "   ✓ WEBHOOK_SECRET - Database trigger authentication (for automated emails)"
echo ""
echo "💳 Payment Integration Notes:"
echo "   • Using G2Pay Direct API Integration"
echo "   • Payment processed server-to-server with G2Pay"
echo "   • 3DS authentication supported when required"
echo "   • Payment methods:"
echo "     - Credit/Debit Cards (with 3DS support)"
echo "     - Apple Pay (direct integration via Direct API)"
echo "     - Google Pay (direct integration via Direct API)"
echo "   • Hosted payment page available for fallback"
echo ""
echo "📋 Next Steps:"
echo "1. Run ./deploy-functions.sh to deploy edge functions"
echo "2. Test email notifications (signup, orders, withdrawals)"
echo "3. Test payment flows:"
echo "   a) Hosted Payment Page:"
echo "      - Create order → create-g2pay-hosted-session"
echo "      - User redirects to G2Pay hosted page"
echo "      - Complete payment → Redirect back to site"
echo "   b) Direct Card Payment:"
echo "      - Create order → Process payment via direct API"
echo "      - Handle 3DS redirect if required"
echo "      - Payment success → complete-g2pay-order"
echo "   c) Apple Pay Direct:"
echo "      - Validate merchant → validate-apple-pay-merchant"
echo "      - Process payment → process-apple-pay-payment"
echo "   d) Google Pay Direct:"
echo "      - Process payment → process-google-pay-payment"
echo "4. Test Apple Pay on Safari/iOS device"
echo "5. Test Google Pay on Chrome/Android device"
echo "6. Monitor webhook at: $SUPABASE_URL/functions/v1/g2pay-webhook"
echo ""
echo "💡 To view all secrets: supabase secrets list"
echo "💡 To unset a secret: supabase secrets unset SECRET_NAME"
echo ""
echo "✨ Your secrets are secure and ready!"
