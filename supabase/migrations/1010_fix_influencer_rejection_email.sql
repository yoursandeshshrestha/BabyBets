-- ============================================
-- FIX INFLUENCER REJECTION EMAIL TRIGGER
-- Description: Update rejection trigger to use webhook_config
-- Date: 2026-04-06
-- ============================================

-- Fix influencer rejection email trigger
CREATE OR REPLACE FUNCTION trigger_send_influencer_rejected_email()
RETURNS TRIGGER AS $$
DECLARE
  v_email TEXT;
  v_name TEXT;
BEGIN
  -- Get email from either influencer record or linked profile
  v_email := COALESCE(OLD.email, (SELECT email FROM profiles WHERE id = OLD.user_id));
  v_name := COALESCE(
    (SELECT first_name FROM profiles WHERE id = OLD.user_id),
    OLD.display_name,
    split_part(v_email, '@', 1)
  );

  IF v_email IS NOT NULL THEN
    PERFORM send_email_notification(
      'influencer_rejected',
      v_email,
      v_name,
      jsonb_build_object(
        'displayName', OLD.display_name,
        'rejectionReason', 'We appreciate your interest, but we are unable to approve your application at this time.'
      )
    );
  END IF;

  RETURN OLD;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in influencer rejection email trigger: %', SQLERRM;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_influencer_rejected ON influencers;
CREATE TRIGGER on_influencer_rejected
  BEFORE DELETE ON influencers
  FOR EACH ROW
  WHEN (OLD.is_active = false OR OLD.is_active IS NULL)
  EXECUTE FUNCTION trigger_send_influencer_rejected_email();
