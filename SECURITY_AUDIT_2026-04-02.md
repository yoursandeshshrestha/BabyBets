# SECURITY AUDIT REPORT
**Date**: 2026-04-02  
**Project**: BabyBets Competition Platform  
**Severity**: CRITICAL - Production Financial Vulnerabilities Identified

---

## EXECUTIVE SUMMARY

A comprehensive security audit has identified **8 critical and high-severity vulnerabilities** that allow users to manipulate prices, discounts, and wallet credits during checkout. These vulnerabilities pose **immediate financial risk** and require urgent remediation.

**Key Findings**:
- ❌ Client-controlled pricing allows purchasing £100 tickets for £0.01
- ❌ Discount manipulation enables 100% discounts on any order
- ❌ Wallet credit amounts can be arbitrarily inflated
- ❌ No server-side validation of financial calculations
- ❌ Wheel prize system allows claiming unlimited credits
- ❌ Storage upload permissions not restricted to admins

**Root Cause**: Financial calculations occur client-side and are trusted server-side without validation.

---

## CRITICAL VULNERABILITIES

### 1. Order Price Manipulation
**Severity**: 🔴 CRITICAL  
**File**: `src/pages/Client/Checkout/Checkout.tsx:489-523`  
**CVSS Score**: 9.8 (Critical)

**Description**:  
Orders are created with client-controlled prices from localStorage. Users can manipulate `pricePerTicket` and `totalPrice` in their cart, then create orders with these fraudulent prices.

**Attack Vector**:
```javascript
// User adds item to cart at correct price (£10)
// Then manipulates localStorage
const cart = JSON.parse(localStorage.getItem('cart-storage'))
cart.state.items[0].pricePerTicket = 0.01  // Change to £0.01
cart.state.items[0].totalPrice = 0.01
localStorage.setItem('cart-storage', JSON.stringify(cart))
// Complete checkout - pays £0.01 instead of £10
```

**Impact**:
- Unlimited financial loss
- Users can purchase any tickets at arbitrary prices
- Payment gateway processes the manipulated amount

**Affected Code**:
```typescript
// Lines 511-517: Client prices used directly
const orderItems = items.map((item) => ({
  order_id: order.id,
  competition_id: item.competitionId,
  ticket_count: item.quantity,
  price_per_ticket_pence: Math.round(item.pricePerTicket * 100), // ← CLIENT CONTROLLED
  total_pence: Math.round(item.totalPrice * 100), // ← CLIENT CONTROLLED
}))
```

**Fix Status**: ✅ FIXED

---

### 2. Promo Code Discount Manipulation
**Severity**: 🔴 CRITICAL  
**File**: `src/pages/Client/Checkout/Checkout.tsx:258-331, 477`  
**CVSS Score**: 9.1 (Critical)

**Description**:  
Promo code validation occurs in the frontend, but the discount calculation happens client-side. Users can validate a legitimate 10% discount code, then manipulate the state to apply a 100% discount.

**Attack Vector**:
```javascript
// Apply valid 10% promo code
// Then modify React state or localStorage
// promoDiscount is stored as 0.1 (10%)
// User changes it to 1.0 (100%)
```

**Impact**:
- Free orders using minimal discounts
- Discount validation completely bypassed
- Financial loss on all discounted orders

**Affected Code**:
```typescript
// Line 83: Client-side calculation
const discountAmount = totalPrice * promoDiscount // ← CLIENT STATE

// Line 477: Used in order creation
discount_pence: Math.round(discountAmount * 100) // ← TRUSTS CLIENT
```

**Fix Status**: ✅ FIXED

---

### 3. Wallet Credit Manipulation
**Severity**: 🔴 CRITICAL  
**File**: `src/pages/Client/Checkout/Checkout.tsx:341-348, 420-427`  
**CVSS Score**: 8.9 (High)

**Description**:  
The amount of wallet credit applied to an order is controlled by client-side React state. Users can manipulate `appliedCredit` to claim more credits than they have.

**Attack Vector**:
```javascript
// User has £5 wallet credit
// Manipulates appliedCredit state to £9,999
// Order created with credit_applied_pence: 999900
// Credits deducted, but order reflects inflated discount
```

**Impact**:
- Users can claim unlimited wallet credits
- Order totals don't match actual credit availability
- Double-spending of wallet credits possible

**Affected Code**:
```typescript
// Line 376: Client state used
const creditPence = Math.round(appliedCredit * 100) // ← CLIENT STATE

// Line 383-385: Used in order
orderData = {
  credit_applied_pence: creditPence, // ← TRUSTS CLIENT
}

// Line 421-427: Deduction uses client value
await supabase.rpc('debit_wallet_credits', {
  p_amount_pence: creditPence // ← CLIENT CONTROLLED
})
```

**Fix Status**: ✅ FIXED

---

### 4. No Server-Side Price Validation
**Severity**: 🔴 CRITICAL  
**Files**: All payment edge functions  
**CVSS Score**: 9.8 (Critical)

**Description**:  
All payment processing edge functions (`create-g2pay-hosted-session`, `process-apple-pay-payment`, `process-google-pay-payment`, `complete-g2pay-order`) fetch the order from the database but **never validate** that prices match current competition prices.

**Attack Vector**:
- User creates order with manipulated prices (Vuln #1)
- Edge function fetches order.total_pence from database
- Processes payment for manipulated amount
- No validation against competitions.base_ticket_price_pence

**Impact**:
- Root cause vulnerability affecting all payment methods
- All financial calculations trusted from client
- No defense in depth

**Affected Code**:
```typescript
// create-g2pay-hosted-session/index.ts:150-154
const { data: order } = await supabaseAdmin
  .from('orders')
  .select('id, user_id, status, total_pence') // ← Fetches manipulated price
  .eq('id', orderRef)
// No validation that total_pence is correct
```

**Fix Status**: ✅ FIXED

---

### 5. Wheel Prize Amount Manipulation
**Severity**: 🟠 HIGH  
**File**: `supabase/functions/claim-wheel-prize/index.ts:42, 179-181`  
**CVSS Score**: 7.5 (High)

**Description**:  
The wheel prize claim endpoint accepts `prizeAmount` from the client without validating it against configured wheel prizes. Users can claim arbitrary credit amounts.

**Attack Vector**:
```javascript
// Normal spin wins £5
// POST to claim-wheel-prize with:
{
  "email": "user@example.com",
  "prizeType": "credit",
  "prizeAmount": 999999, // ← CLIENT CONTROLLED
  "prizeLabel": "Credit Prize"
}
// Receives £9,999.99 in wallet credits
```

**Impact**:
- Unlimited wallet credits via wheel spin
- Bypasses wheel prize configuration entirely
- Financial loss through credit redemption

**Affected Code**:
```typescript
// Line 42: Accepts from client
const { prizeAmount }: ClaimWheelPrizeRequest = await req.json()

// Line 181: Used directly
const amountPence = Math.round((prizeAmount || 0) * 100) // ← NO VALIDATION
```

**Fix Status**: ✅ FIXED

---

### 6. Race Condition (TOCTOU)
**Severity**: 🟡 MEDIUM  
**File**: `src/pages/Client/Checkout/Checkout.tsx:151-161 vs 432-523`  
**CVSS Score**: 5.3 (Medium)

**Description**:  
Cart validation occurs on page load but not immediately before payment. Users can exploit price changes between validation and order creation.

**Attack Timeline**:
1. User adds items to cart at current price (£10)
2. Opens checkout - validation passes
3. Admin changes competition price to £15
4. User completes checkout - still pays £10 (cached in cart)

**Impact**:
- Users can lock in old prices during sales
- Price changes don't apply to in-progress checkouts
- Financial loss during price increases

**Fix Status**: ✅ FIXED

---

## HIGH SEVERITY VULNERABILITIES

### 7. Storage Upload - No Admin Verification
**Severity**: 🟠 HIGH  
**File**: `supabase/migrations/005_storage.sql:36-51`  
**CVSS Score**: 6.5 (Medium)

**Description**:  
Storage bucket policies allow any authenticated user to upload, update, and delete images in admin-controlled buckets (`competition-images`, `prize-images`, `winner-photos`).

**Attack Vector**:
- Any logged-in user can upload malicious images
- Can overwrite existing competition/prize images
- Can delete winner photos or competition galleries

**Impact**:
- Content manipulation and vandalism
- Potential XSS via SVG uploads
- Business disruption by deleting critical assets

**Affected Buckets**:
- `competition-images`
- `prize-images`
- `winner-photos`
- `public-assets`

**Fix Status**: ✅ FIXED

---

### 8. Withdrawal Function Granted to All Users
**Severity**: 🟠 HIGH  
**File**: `supabase/migrations/025_process_withdrawal_function.sql:67`  
**CVSS Score**: 4.3 (Medium)

**Description**:  
The `process_withdrawal_payment` function is granted to all authenticated users, though RLS policies likely prevent direct execution.

**Affected Code**:
```sql
-- Line 67: Too permissive
GRANT EXECUTE ON FUNCTION public.process_withdrawal_payment TO authenticated;
```

**Impact**:
- Potential privilege escalation if RLS bypassed
- Unnecessary attack surface
- Defense in depth violation

**Fix Status**: ✅ FIXED

---

## ROOT CAUSE ANALYSIS

### Architecture Flaw

```
┌─────────────────────────────────────────────────────────────┐
│ CURRENT (VULNERABLE) ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Client Calculates:                                      │
│     - Prices (from localStorage cart)                       │
│     - Discounts (from React state)                          │
│     - Credits (from React state)                            │
│     ↓                                                        │
│  2. Client Creates Order:                                   │
│     - INSERT into orders with client values                 │
│     - INSERT into order_items with client prices            │
│     ↓                                                        │
│  3. Server Processes Payment:                               │
│     - Fetches order.total_pence                             │
│     - Trusts stored value                                   │
│     - NO VALIDATION against competitions table              │
│     ↓                                                        │
│  4. Payment Gateway:                                        │
│     - Charges manipulated amount                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SECURE ARCHITECTURE (IMPLEMENTED)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Client Sends:                                           │
│     - competition_id + quantity only                        │
│     - Promo code (if any)                                   │
│     - Use wallet credit: boolean                            │
│     ↓                                                        │
│  2. Server Calculates:                                      │
│     - Fetches competition.base_ticket_price_pence           │
│     - Validates + recalculates promo discount               │
│     - Validates + calculates available wallet credit        │
│     - Computes final total server-side                      │
│     ↓                                                        │
│  3. Server Creates Order:                                   │
│     - INSERT with SERVER-CALCULATED values                  │
│     ↓                                                        │
│  4. Payment Gateway:                                        │
│     - Charges validated amount                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle**: **Never trust client-side financial calculations.**

---

## FIXES IMPLEMENTED

### Summary of Changes

| # | Vulnerability | Fix Location | Status |
|---|--------------|--------------|--------|
| 1 | Order Price Manipulation | Server-side validation function | ✅ FIXED |
| 2 | Promo Discount Manipulation | Server-side promo validation | ✅ FIXED |
| 3 | Wallet Credit Manipulation | Server-side credit calculation | ✅ FIXED |
| 4 | No Server Validation | New validation edge function | ✅ FIXED |
| 5 | Wheel Prize Manipulation | Prize amount validation | ✅ FIXED |
| 6 | TOCTOU Race Condition | Re-validate before payment | ✅ FIXED |
| 7 | Storage Upload Permissions | Admin-only policies | ✅ FIXED |
| 8 | Withdrawal Function Grant | Restricted to service role | ✅ FIXED |

---

## VERIFICATION CHECKLIST

- [x] All critical vulnerabilities addressed
- [x] Server-side validation implemented
- [x] Client sends only competition IDs and quantities
- [x] Promo codes validated server-side
- [x] Wallet credits calculated server-side
- [x] Storage policies restricted to admins
- [x] Edge functions validate prices against database
- [x] Race conditions eliminated with re-validation
- [x] Function permissions restricted appropriately

---

## TESTING RECOMMENDATIONS

### Manual Testing
1. ✅ Attempt to manipulate localStorage cart prices
2. ✅ Try changing promo discount after validation
3. ✅ Test wallet credit manipulation
4. ✅ Verify wheel prize amounts are validated
5. ✅ Confirm non-admin users cannot upload to storage buckets
6. ✅ Test price changes during checkout process

### Automated Testing
1. Integration tests for order validation
2. Unit tests for price calculation functions
3. API tests for edge function validation
4. Penetration testing on payment flow

---

## CONCLUSION

All **8 critical and high-severity vulnerabilities** have been **successfully remediated**. The system now:

✅ Validates all prices server-side  
✅ Recalculates discounts from database  
✅ Verifies wallet credit availability  
✅ Restricts storage uploads to admins  
✅ Validates wheel prize configurations  
✅ Re-validates cart before payment  

**Recommendation**: Deploy fixes immediately and monitor payment transactions for anomalies.

---

**Audited By**: Claude Code Security Analysis  
**Report Date**: 2026-04-02  
**Status**: ALL VULNERABILITIES FIXED ✅
