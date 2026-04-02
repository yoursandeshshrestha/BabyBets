# 🚨 CRITICAL: JWT Verification Security Fix

## Issue Summary
ALL 12 edge functions deployed with `--no-verify-jwt`, but only some have manual JWT verification in code.

## Vulnerable Functions

### 🔴 CRITICAL: send-notification-email
**Status:** Publicly callable, no authentication  
**Risk:** Email spam, phishing, API abuse  
**Impact:** HIGH

**Current state:**
- `verify_jwt = false` in config
- No JWT check in code
- CORS wildcard enabled
- Anyone can send emails via your Mailgun

**Fix:** Add JWT verification OR move to internal-only (service role)

```typescript
// Add at line 26 (after corsHeaders):
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // SECURITY FIX: Verify JWT token
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    }
  )

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // ... rest of function
```

**Better solution:** Make it internal-only
```typescript
// Only accept requests with service role key
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const authHeader = req.headers.get('Authorization')

if (!authHeader || !authHeader.includes(serviceRoleKey)) {
  return new Response('Unauthorized', { status: 401 })
}
```

---

### ⚠️ MEDIUM: auto-execute-draws
**Status:** Cron job, needs verification  
**Risk:** Unauthorized draw execution  
**Impact:** MEDIUM

**Current state:**
- `verify_jwt = false` in config
- Has custom authorization check (line 40-60)
- Uses `Authorization` header with custom token

**Check code:**
```typescript
// Line 40-60 should have something like:
const authHeader = req.headers.get('Authorization')
const expectedToken = Deno.env.get('CRON_SECRET')
if (authHeader !== `Bearer ${expectedToken}`) {
  return 401
}
```

**If missing, add:**
```typescript
// After CORS check
const authHeader = req.headers.get('Authorization')
const CRON_SECRET = Deno.env.get('CRON_SECRET') || 'your-secret-here'

if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
  return new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
```

---

### ⚠️ LOW: process-monthly-payouts
**Status:** Cron job, needs verification  
**Risk:** Unauthorized payout processing  
**Impact:** MEDIUM

**Same fix as auto-execute-draws**

---

## Functions That Are CORRECT (Do Not Change)

### ✅ g2pay-webhook
- `verify_jwt = false` is CORRECT
- Uses signature verification instead
- Called by G2Pay servers, not users

### ✅ validate-apple-pay-merchant
- `verify_jwt = false` is CORRECT
- Called by Apple servers
- No user JWT expected

---

## Deployment Script Fix

**File:** `deploy-functions.sh`

### Remove misleading comment (line 129):
```bash
# BEFORE (WRONG):
echo "   • All functions deployed with --no-verify-jwt for Supabase compatibility"

# AFTER (CORRECT):
echo "   • External webhooks use signature verification instead of JWT"
echo "   • User-facing functions verify JWT manually in code"
echo "   • Cron jobs use secret token authentication"
```

### Update deployment commands:

**Functions that SHOULD have JWT verification (remove --no-verify-jwt):**

```bash
# User-facing functions - DON'T need --no-verify-jwt if manually verified
supabase functions deploy create-g2pay-hosted-session
supabase functions deploy complete-g2pay-order  
supabase functions deploy continue-3ds
supabase functions deploy process-apple-pay-payment
supabase functions deploy process-google-pay-payment
supabase functions deploy claim-wheel-prize
supabase functions deploy approve-influencer-application
```

**Functions that legitimately need --no-verify-jwt:**

```bash
# External webhooks (no JWT expected)
supabase functions deploy g2pay-webhook --no-verify-jwt
supabase functions deploy validate-apple-pay-merchant --no-verify-jwt

# Internal services (use different auth)
supabase functions deploy send-notification-email --no-verify-jwt  # But add service role check!
supabase functions deploy auto-execute-draws --no-verify-jwt       # But add secret token check!
supabase functions deploy process-monthly-payouts --no-verify-jwt  # But add secret token check!
```

---

## Testing After Fix

### 1. Test send-notification-email is protected:
```bash
# Should FAIL (401 Unauthorized)
curl -X POST https://your-project.supabase.co/functions/v1/send-notification-email \
  -H "Content-Type: application/json" \
  -d '{"type":"custom","recipientEmail":"test@test.com"}'

# Should SUCCEED with valid JWT
curl -X POST https://your-project.supabase.co/functions/v1/send-notification-email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"type":"custom","recipientEmail":"test@test.com"}'
```

### 2. Test cron jobs work:
```bash
# Set CRON_SECRET in Supabase dashboard
# Test with secret
curl -X POST https://your-project.supabase.co/functions/v1/auto-execute-draws \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 3. Test webhooks still work:
- Make test payment via G2Pay
- Verify webhook is received and processed
- Check payment_transactions table for new entry

---

## Rollback Plan

If something breaks after removing `--no-verify-jwt`:

```bash
# Re-deploy with --no-verify-jwt temporarily
supabase functions deploy FUNCTION_NAME --no-verify-jwt

# Then fix the JWT verification in code
# Then re-deploy without flag
```

---

## Long-term Solution

### Create config template: `supabase/functions/_template/config.toml`

```toml
# Default: Enable JWT verification
[function]
verify_jwt = true

# Only set to false for:
# - External webhooks (with signature verification)
# - Cron jobs (with secret token verification)
# - Internal services (with service role verification)
```

### Document in README:
```markdown
## Edge Function Authentication

### User-facing functions (JWT required):
- create-g2pay-hosted-session
- complete-g2pay-order
- approve-influencer-application
- etc.

### External webhooks (signature verification):
- g2pay-webhook (SHA-512 HMAC)
- validate-apple-pay-merchant (Apple PKI)

### Internal services (service role):
- send-notification-email (service role key)

### Cron jobs (secret token):
- auto-execute-draws (CRON_SECRET)
- process-monthly-payouts (CRON_SECRET)
```

---

## Priority Order

1. **TODAY:** Fix `send-notification-email` (add service role check)
2. **TODAY:** Verify `auto-execute-draws` has auth check
3. **TODAY:** Verify `process-monthly-payouts` has auth check
4. **This week:** Remove unnecessary `--no-verify-jwt` flags
5. **This week:** Update deployment script comments
6. **This week:** Add testing section to deployment script
7. **Next sprint:** Add monitoring for unauthorized access attempts

---

## Questions to Answer

1. **Why was `--no-verify-jwt` added to ALL functions?**
   - Was there an error during initial setup?
   - Did someone copy-paste the flag everywhere?
   - Is there a misunderstanding about how Supabase JWT works?

2. **Who can access these functions currently?**
   - Check Supabase logs for `send-notification-email` calls
   - Any unauthorized access?
   - Any suspicious activity?

3. **What's calling `send-notification-email` right now?**
   - Other edge functions? (Should use service role)
   - Frontend? (Should verify JWT first)
   - External services? (Should NOT be possible)

---

## References

- Supabase Edge Functions Auth: https://supabase.com/docs/guides/functions/auth
- JWT Verification: https://supabase.com/docs/guides/functions/securing-your-functions
- Row Level Security: https://supabase.com/docs/guides/auth/row-level-security
