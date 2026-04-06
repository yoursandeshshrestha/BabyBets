-- ============================================
-- FIX WALLET CREDIT EMAIL AMOUNT FORMATTING
-- Description: Format amounts to 2 decimal places in emails
-- Date: 2026-04-06
-- ============================================

-- Fix wallet credit email trigger to format amounts properly
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
      'amount', TO_CHAR((NEW.amount_pence / 100.0), 'FM999999990.00'),
      'description', COALESCE(NEW.description, 'Credit added'),
      'expiryDate', COALESCE(to_char(NEW.expires_at, 'DD Month YYYY'), 'No expiry'),
      'newBalance', TO_CHAR((v_new_balance / 100.0), 'FM999999990.00'),
      'transactionsUrl', COALESCE(v_public_site_url, 'https://www.babybets.co.uk') || '/account/transactions'
    )
  );
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in wallet credit email trigger: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Using TO_CHAR with 'FM999999990.00' format ensures:
-- - Exactly 2 decimal places
-- - No leading spaces (FM = Fill Mode)
-- - Comma-separated thousands (optional, not used here)
-- Example: 1000000 pence -> "10000.00"
