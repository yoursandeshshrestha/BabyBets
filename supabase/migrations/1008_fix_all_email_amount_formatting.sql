-- ============================================
-- FIX ALL EMAIL AMOUNT FORMATTING
-- Description: Format all monetary amounts to 2 decimal places in all email triggers
-- Date: 2026-04-06
-- ============================================

-- Fix withdrawal request email
CREATE OR REPLACE FUNCTION trigger_send_withdrawal_request_email()
RETURNS TRIGGER AS $$
DECLARE
  v_profile RECORD;
  v_public_site_url TEXT;
BEGIN
  SELECT email, first_name INTO v_profile
  FROM profiles
  WHERE id = NEW.user_id;

  SELECT public_site_url INTO v_public_site_url
  FROM public.webhook_config
  LIMIT 1;

  PERFORM send_email_notification(
    'withdrawal_request',
    v_profile.email,
    COALESCE(v_profile.first_name, split_part(v_profile.email, '@', 1)),
    jsonb_build_object(
      'amount', TO_CHAR((NEW.amount_pence / 100.0), 'FM999999990.00'),
      'requestDate', to_char(NEW.created_at, 'DD Month YYYY'),
      'statusUrl', COALESCE(v_public_site_url, 'https://www.babybets.co.uk') || '/account/withdrawals'
    )
  );
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in withdrawal request email trigger: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix withdrawal status email (approved/rejected)
CREATE OR REPLACE FUNCTION trigger_send_withdrawal_status_email()
RETURNS TRIGGER AS $$
DECLARE
  v_profile RECORD;
  v_public_site_url TEXT;
BEGIN
  -- Only send if status changed to approved or rejected
  IF NEW.status != OLD.status AND (NEW.status = 'approved' OR NEW.status = 'rejected') THEN
    SELECT email, first_name INTO v_profile
    FROM profiles
    WHERE id = NEW.user_id;

    SELECT public_site_url INTO v_public_site_url
    FROM public.webhook_config
    LIMIT 1;

    IF NEW.status = 'approved' THEN
      PERFORM send_email_notification(
        'withdrawal_approved',
        v_profile.email,
        COALESCE(v_profile.first_name, split_part(v_profile.email, '@', 1)),
        jsonb_build_object(
          'amount', TO_CHAR((NEW.amount_pence / 100.0), 'FM999999990.00'),
          'approvedDate', to_char(NOW(), 'DD Month YYYY'),
          'statusUrl', COALESCE(v_public_site_url, 'https://www.babybets.co.uk') || '/account/withdrawals'
        )
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM send_email_notification(
        'withdrawal_rejected',
        v_profile.email,
        COALESCE(v_profile.first_name, split_part(v_profile.email, '@', 1)),
        jsonb_build_object(
          'amount', TO_CHAR((NEW.amount_pence / 100.0), 'FM999999990.00'),
          'rejectedDate', to_char(NOW(), 'DD Month YYYY'),
          'rejectionReason', COALESCE(NEW.admin_notes, 'Please contact support for more information'),
          'statusUrl', COALESCE(v_public_site_url, 'https://www.babybets.co.uk') || '/account/withdrawals'
        )
      );
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in withdrawal status email trigger: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate triggers
DROP TRIGGER IF EXISTS on_withdrawal_request_created ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_request_created
  AFTER INSERT ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_withdrawal_request_email();

DROP TRIGGER IF EXISTS on_withdrawal_status_changed ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_status_changed
  AFTER UPDATE ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_withdrawal_status_email();
