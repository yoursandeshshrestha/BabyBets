-- ============================================
-- ADD INFLUENCER EMAIL TRIGGERS
-- Description: Send emails when influencer applications are submitted
-- Date: 2026-04-06
-- ============================================

-- Trigger function: Send email when influencer application is submitted
CREATE OR REPLACE FUNCTION trigger_send_influencer_application_email()
RETURNS TRIGGER AS $$
DECLARE
  v_profile RECORD;
  v_public_site_url TEXT;
BEGIN
  -- Get applicant's profile info
  SELECT email, first_name INTO v_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- Get public site URL from config
  SELECT public_site_url INTO v_public_site_url
  FROM public.webhook_config
  LIMIT 1;

  -- Send confirmation email to applicant
  PERFORM send_email_notification(
    'influencer_application_submitted',
    v_profile.email,
    COALESCE(v_profile.first_name, NEW.display_name, split_part(v_profile.email, '@', 1)),
    jsonb_build_object(
      'displayName', NEW.display_name,
      'applicationUrl', COALESCE(v_public_site_url, 'https://www.babybets.co.uk') || '/influencer/dashboard'
    )
  );

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Don't fail application submission if email fails
  RAISE WARNING 'Error sending influencer application email: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on influencers table (fires when new application created)
DROP TRIGGER IF EXISTS on_influencer_application_submitted ON influencers;
CREATE TRIGGER on_influencer_application_submitted
  AFTER INSERT ON influencers
  FOR EACH ROW
  WHEN (NEW.is_active = false) -- Only for new applications (not yet approved)
  EXECUTE FUNCTION trigger_send_influencer_application_email();

-- Note: The influencer_approved and influencer_rejected emails are handled
-- by the approve-influencer-application edge function, not by database triggers
