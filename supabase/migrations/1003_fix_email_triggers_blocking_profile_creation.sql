-- ============================================
-- FIX EMAIL TRIGGERS BLOCKING PROFILE CREATION
-- Description: Make email triggers fail gracefully if app.settings not configured
-- Date: 2026-04-06
-- Security Fix: Prevents email trigger failures from blocking profile creation
-- ============================================

-- Drop the problematic triggers temporarily
DROP TRIGGER IF EXISTS on_profile_created_send_welcome ON profiles;

-- Update send_email_notification to handle missing app.settings gracefully
CREATE OR REPLACE FUNCTION send_email_notification(
  p_type TEXT,
  p_recipient_email TEXT,
  p_recipient_name TEXT,
  p_data JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Try to get app.settings, but don't fail if it doesn't exist
  BEGIN
    v_supabase_url := current_setting('app.settings', true)::json->>'supabase_url';
    v_service_role_key := current_setting('app.settings', true)::json->>'service_role_key';
  EXCEPTION WHEN others THEN
    -- Settings not configured, log and exit gracefully
    RAISE WARNING 'Email notification skipped: app.settings not configured. Type: %, Recipient: %', p_type, p_recipient_email;
    RETURN;
  END;

  -- If settings are missing, exit gracefully
  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE WARNING 'Email notification skipped: app.settings incomplete. Type: %, Recipient: %', p_type, p_recipient_email;
    RETURN;
  END IF;

  -- Call send-email Edge Function via pg_net extension
  BEGIN
    PERFORM
      net.http_post(
        url := v_supabase_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'type', p_type,
          'recipientEmail', p_recipient_email,
          'recipientName', p_recipient_name,
          'data', p_data
        )
      );
  EXCEPTION WHEN others THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to send email: %', SQLERRM;
  END;
END;
$$;

-- Recreate welcome email trigger
CREATE OR REPLACE FUNCTION trigger_send_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url TEXT;
BEGIN
  -- Check if app.settings exists before trying to send email
  BEGIN
    v_supabase_url := current_setting('app.settings', true)::json->>'public_site_url';
  EXCEPTION WHEN others THEN
    -- Settings not configured, skip email but don't fail
    RAISE WARNING 'Welcome email skipped for %: app.settings not configured', NEW.email;
    RETURN NEW;
  END;

  -- Only try to send if settings exist
  IF v_supabase_url IS NOT NULL THEN
    PERFORM send_email_notification(
      'welcome',
      NEW.email,
      COALESCE(NEW.first_name, split_part(NEW.email, '@', 1)),
      jsonb_build_object(
        'competitionsUrl', v_supabase_url || '/competitions'
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Don't let email errors block profile creation
  RAISE WARNING 'Error in welcome email trigger: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_profile_created_send_welcome
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_welcome_email();

-- Now retry the backfill
DO $$
DECLARE
  v_result RECORD;
  v_success_count INTEGER := 0;
  v_error_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Retrying profile backfill after fixing email triggers...';

  FOR v_result IN SELECT * FROM public.backfill_missing_profiles()
  LOOP
    IF v_result.created THEN
      v_success_count := v_success_count + 1;
      RAISE NOTICE 'Created profile for user % (%)', v_result.user_id, v_result.email;
    ELSE
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Failed to create profile for user % (%): %', v_result.user_id, v_result.email, v_result.error;
    END IF;
  END LOOP;

  RAISE NOTICE 'Profile backfill complete. Success: %, Errors: %', v_success_count, v_error_count;
END $$;
