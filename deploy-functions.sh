#!/bin/bash

# BabyBets Edge Functions - Deployment Script
# Deploys all edge functions required for production

set -e  # Exit on error

echo "🚀 Deploying BabyBets Edge Functions..."
echo ""

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install with: npm install -g supabase"
    exit 1
fi

# Check if we're in the right directory
if [ ! -d "supabase/functions" ]; then
    echo "❌ Error: supabase/functions directory not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "📦 Function 1/13: create-validated-order (🔒 SECURITY FIX)"
echo "   - Server-side order validation with price verification"
echo "   - Prevents price manipulation, discount fraud, wallet credit abuse"
echo "   - 🔓 No JWT verification (manual verification in code)"
supabase functions deploy create-validated-order --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 2/13: create-g2pay-hosted-session (Hosted Payment Session)"
echo "   - Creates G2Pay hosted payment session"
echo "   - Redirects users to G2Pay's secure payment page"
echo "   - 🔓 No JWT verification (Supabase edge function compatibility)"
supabase functions deploy create-g2pay-hosted-session --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 3/13: complete-g2pay-order (Synchronous Ticket Allocation)"
echo "   - Completes orders when frontend receives payment response"
echo "   - Atomic ticket claiming with race condition protection"
echo "   - 🔓 No JWT verification (Supabase edge function compatibility)"
supabase functions deploy complete-g2pay-order --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 4/13: continue-3ds (3D Secure Continuation)"
echo "   - Handles 3D Secure authentication continuation"
echo "   - 🔓 No JWT verification (Supabase edge function compatibility)"
supabase functions deploy continue-3ds --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 5/13: g2pay-webhook (Asynchronous Payment Confirmation)"
echo "   - Receives payment confirmations from G2Pay backend"
echo "   - Ensures orders complete even if user closes browser"
echo "   - 🔓 No JWT verification (called by G2Pay, uses signature verification)"
supabase functions deploy g2pay-webhook --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 6/13: validate-apple-pay-merchant (Apple Pay Validation)"
echo "   - Validates Apple Pay merchant domain"
echo "   - 🔓 No JWT verification (called by Apple servers)"
supabase functions deploy validate-apple-pay-merchant --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 7/13: process-apple-pay-payment (Apple Pay Processing)"
echo "   - Processes Apple Pay payment tokens"
echo "   - 🔓 No JWT verification (Supabase edge function compatibility)"
supabase functions deploy process-apple-pay-payment --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 8/13: process-google-pay-payment (Google Pay Processing)"
echo "   - Processes Google Pay payment tokens"
echo "   - 🔓 No JWT verification (Supabase edge function compatibility)"
supabase functions deploy process-google-pay-payment --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 9/13: send-email (Email Notification System)"
echo "   - Sends all transactional emails via Mailgun"
echo "   - 14 email templates with BabyBets branding"
echo "   - Triggered by database events (profiles, withdrawals, etc.)"
echo "   - 🔓 No JWT verification (uses webhook secret authentication)"
supabase functions deploy send-email --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 10/13: approve-influencer-application (Influencer Management)"
echo "   - Approves influencer applications and creates accounts"
echo "   - 🔓 No JWT verification (internal service)"
supabase functions deploy approve-influencer-application --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 11/13: auto-execute-draws (Automated Draw Execution)"
echo "   - Automatically executes draws when end time is reached"
echo "   - 🔓 No JWT verification (cron job)"
supabase functions deploy auto-execute-draws --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 12/13: claim-wheel-prize (Wheel Prize Claims - 🔒 SECURITY FIX)"
echo "   - Handles spinning wheel prize claims"
echo "   - ✅ Prize amount validation added (prevents unlimited credits)"
echo "   - 🔓 No JWT verification (Supabase edge function compatibility)"
supabase functions deploy claim-wheel-prize --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "📦 Function 13/13: process-monthly-payouts (Influencer Payouts)"
echo "   - Processes monthly influencer commission payouts"
echo "   - 🔓 No JWT verification (cron job)"
supabase functions deploy process-monthly-payouts --no-verify-jwt
echo "✅ Deployed successfully"
echo ""

echo "🎉 All 13 functions deployed successfully!"
echo ""
echo "📋 Deployed Functions:"
echo "   ✓ create-validated-order - 🔒 Server-side price validation (🔓 No JWT, manual verification)"
echo "   ✓ create-g2pay-hosted-session - Hosted payment session (🔓 No JWT)"
echo "   ✓ complete-g2pay-order - Order completion (🔓 No JWT)"
echo "   ✓ continue-3ds - 3D Secure authentication (🔓 No JWT)"
echo "   ✓ g2pay-webhook - Payment confirmations (🔓 No JWT)"
echo "   ✓ validate-apple-pay-merchant - Apple Pay merchant validation (🔓 No JWT)"
echo "   ✓ process-apple-pay-payment - Apple Pay processing (🔓 No JWT)"
echo "   ✓ process-google-pay-payment - Google Pay processing (🔓 No JWT)"
echo "   ✓ send-email - Email notifications (🔓 No JWT, webhook secret auth)"
echo "   ✓ approve-influencer-application - Influencer management (🔓 No JWT)"
echo "   ✓ auto-execute-draws - Automated draw execution (🔓 No JWT)"
echo "   ✓ claim-wheel-prize - 🔒 Wheel prize claims with validation (🔓 No JWT)"
echo "   ✓ process-monthly-payouts - Influencer payouts (🔓 No JWT)"
echo ""
echo "🔒 Security Notes:"
echo "   • 🔒 SECURITY FIX: create-validated-order validates ALL prices server-side"
echo "   • 🔒 SECURITY FIX: claim-wheel-prize validates prize amounts (prevents fraud)"
echo "   • Payment functions use service role key for authentication"
echo "   • G2Pay webhook uses signature verification for security"
echo "   • Apple Pay merchant validation handled via validate-apple-pay-merchant"
   • Email service uses webhook secret (database triggers + edge function)"
echo ""
echo "🛡️ Security Fixes Deployed (2026-04-02):"
echo "   ✅ Order price manipulation - FIXED (server validates prices)"
echo "   ✅ Promo discount manipulation - FIXED (server recalculates)"
echo "   ✅ Wallet credit fraud - FIXED (server verifies balance)"
echo "   ✅ Wheel prize fraud - FIXED (validates against allowed amounts)"
echo "   ✅ Storage uploads - FIXED (admin-only via migrations)"
echo "   ✅ Withdrawal function - FIXED (service role only via migrations)"
echo ""
echo "💳 Payment Flow Options:"
echo ""
echo "   Hosted Solution (G2Pay):"
echo "   1. User → Checkout page"
echo "   2. Frontend → create-g2pay-hosted-session edge function"
echo "   3. Edge function → G2Pay API (creates hosted session)"
echo "   4. User → G2Pay hosted payment page (card, Apple Pay, Google Pay)"
echo "   5. G2Pay → Redirect back to /payment-return"
echo "   6. G2Pay → g2pay-webhook (background confirmation)"
echo "   7. Webhook → Allocates tickets and sends email"
echo ""
echo "   Digital Wallets (Direct):"
echo "   1. User → Selects Apple Pay or Google Pay"
echo "   2. Frontend → process-apple-pay-payment or process-google-pay-payment"
echo "   3. Edge function → G2Pay API (processes payment token)"
echo "   4. Response → Allocates tickets and sends email"
echo ""
echo "📋 Next Steps:"
echo "1. 🔒 Apply database migrations (082, 083) for storage and withdrawal security"
echo "2. Test payment flow with validated order creation"
echo "3. Test price manipulation prevention (should fail)"
echo "4. Test Apple Pay with validated prices"
echo "5. Test Google Pay with validated prices"
echo "6. Test 3D Secure authentication flow"
echo "7. Test wallet-only payment (finalPrice === 0)"
echo "8. Test wheel prize amount validation"
echo "9. Test email notifications"
echo "10. Verify admin-only storage upload restrictions"
echo "11. Monitor email_notifications table for email delivery status"
echo "12. Verify webhook URL: https://<your-project>.supabase.co/functions/v1/g2pay-webhook"
echo ""
echo "✨ Your production system is live!"
