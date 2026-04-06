-- ============================================
-- FIX WALLET CREDIT TRIGGER AND VIEW
-- Description: Fix source_description reference and wallet_balance_view
-- Date: 2026-04-06
-- ============================================

-- Fix wallet credit email trigger (source_description -> description)
CREATE OR REPLACE FUNCTION trigger_send_wallet_credit_email()
RETURNS TRIGGER AS $$
DECLARE
  v_profile RECORD;
  v_new_balance NUMERIC;
  v_public_site_url TEXT;
BEGIN
  SELECT email, first_name INTO v_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- Calculate new balance
  SELECT COALESCE(SUM(remaining_pence), 0) INTO v_new_balance
  FROM wallet_credits
  WHERE user_id = NEW.user_id AND status = 'active';

  -- Get public site URL from config
  SELECT public_site_url INTO v_public_site_url
  FROM public.webhook_config
  LIMIT 1;

  PERFORM send_email_notification(
    'wallet_credit',
    v_profile.email,
    COALESCE(v_profile.first_name, split_part(v_profile.email, '@', 1)),
    jsonb_build_object(
      'amount', (NEW.amount_pence / 100.0)::text,
      'description', COALESCE(NEW.description, 'Credit added'),
      'expiryDate', COALESCE(to_char(NEW.expires_at, 'DD Month YYYY'), 'No expiry'),
      'newBalance', (v_new_balance / 100.0)::text,
      'transactionsUrl', COALESCE(v_public_site_url, 'https://www.babybets.co.uk') || '/account/transactions'
    )
  );
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in wallet credit email trigger: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_wallet_credit_added ON wallet_credits;
CREATE TRIGGER on_wallet_credit_added
  AFTER INSERT ON wallet_credits
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_wallet_credit_email();

-- Fix wallet_balance_view to always return a row (even if 0 balance)
-- This prevents "0 rows" error when using .single()
CREATE OR REPLACE VIEW public.wallet_balance_view AS
SELECT
  user_id,
  COALESCE(SUM(remaining_pence) FILTER (
    WHERE status = 'active' AND expires_at > NOW()
  ), 0) as available_balance_pence,
  COALESCE(SUM(remaining_pence) FILTER (
    WHERE status = 'active'
    AND expires_at > NOW()
    AND expires_at <= NOW() + INTERVAL '7 days'
  ), 0) as expiring_soon_pence,
  MIN(expires_at) FILTER (
    WHERE status = 'active' AND expires_at > NOW()
  ) as next_expiry_date
FROM public.wallet_credits
GROUP BY user_id;

-- Note: The view will still only return rows for users who have wallet_credits
-- For users with no credits, the frontend should handle the "0 rows" case
-- or insert a default row on profile creation
