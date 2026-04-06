-- ============================================
-- FIX WITHDRAWAL FUNCTION PERMISSIONS
-- Description: Restrict withdrawal processing to service role only
-- Date: 2026-04-02
-- Security Fix: Prevents unauthorized users from calling withdrawal function
-- ============================================

-- Revoke from authenticated users
REVOKE EXECUTE ON FUNCTION public.process_withdrawal_payment FROM authenticated;

-- Grant only to service_role (used by admin operations)
-- Processes withdrawal payment: deducts from wallet and marks as paid. Must be approved first. SECURITY: Only service_role can execute.
GRANT EXECUTE ON FUNCTION public.process_withdrawal_payment TO service_role;
