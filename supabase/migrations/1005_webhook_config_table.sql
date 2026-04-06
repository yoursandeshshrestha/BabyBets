-- ============================================
-- WEBHOOK CONFIGURATION TABLE
-- Description: Secure storage for webhook secrets (better than app.settings)
-- Date: 2026-04-06
-- Security: Accessible only by service role and security definer functions
-- ============================================

-- Create config table for webhook secrets
CREATE TABLE IF NOT EXISTS public.webhook_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_secret TEXT NOT NULL,
  supabase_url TEXT NOT NULL,
  public_site_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.webhook_config ENABLE ROW LEVEL SECURITY;

-- Only allow service role and security definer functions to read
CREATE POLICY "Service role can read webhook config"
ON public.webhook_config FOR SELECT
TO service_role
USING (true);

-- Generate and insert webhook secret (only if not exists)
DO $$
DECLARE
  v_webhook_token TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Check if config already exists
  SELECT EXISTS(SELECT 1 FROM public.webhook_config LIMIT 1) INTO v_exists;

  IF NOT v_exists THEN
    -- Generate cryptographically secure random token using gen_random_uuid
    v_webhook_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    -- Insert config
    INSERT INTO public.webhook_config (webhook_secret, supabase_url, public_site_url)
    VALUES (
      v_webhook_token,
      'https://jyhxiheknwwikyfzbgaz.supabase.co',
      'https://babybets.co.uk'
    );

    -- Display the webhook token
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'WEBHOOK SECRET GENERATED!';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Add this environment variable to your send-email Edge Function:';
    RAISE NOTICE 'WEBHOOK_SECRET=%', v_webhook_token;
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'In Supabase Dashboard:';
    RAISE NOTICE '1. Go to Edge Functions → send-email → Settings';
    RAISE NOTICE '2. Add: WEBHOOK_SECRET = %', v_webhook_token;
    RAISE NOTICE '=================================================================';
  ELSE
    RAISE NOTICE 'Webhook config already exists, skipping generation';
  END IF;
END $$;

-- Update send_email_notification to read from webhook_config table
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
  v_config RECORD;
BEGIN
  -- Get webhook config from table
  SELECT webhook_secret, supabase_url INTO v_config
  FROM public.webhook_config
  LIMIT 1;

  IF NOT FOUND OR v_config.webhook_secret IS NULL THEN
    RAISE WARNING 'Email notification skipped: webhook config not found. Type: %, Recipient: %', p_type, p_recipient_email;
    RETURN;
  END IF;

  -- Call send-email Edge Function with webhook secret
  BEGIN
    PERFORM
      net.http_post(
        url := v_config.supabase_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Webhook-Secret', v_config.webhook_secret
        ),
        body := jsonb_build_object(
          'type', p_type,
          'recipientEmail', p_recipient_email,
          'recipientName', p_recipient_name,
          'data', p_data
        )
      );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Failed to send email: %', SQLERRM;
  END;
END;
$$;

-- Update welcome email trigger
CREATE OR REPLACE FUNCTION trigger_send_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  v_public_site_url TEXT;
BEGIN
  -- Get public site URL from config
  SELECT public_site_url INTO v_public_site_url
  FROM public.webhook_config
  LIMIT 1;

  IF v_public_site_url IS NOT NULL THEN
    PERFORM send_email_notification(
      'welcome',
      NEW.email,
      COALESCE(NEW.first_name, split_part(NEW.email, '@', 1)),
      jsonb_build_object(
        'competitionsUrl', v_public_site_url || '/competitions'
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in welcome email trigger: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_profile_created_send_welcome ON profiles;
CREATE TRIGGER on_profile_created_send_welcome
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_welcome_email();
