-- Email Triggers - Automatically send emails when database events occur
-- All emails go through the unified send-email Edge Function

-- Helper function to call send-email Edge Function
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
BEGIN
  -- Call send-email Edge Function via pg_net extension
  PERFORM
    net.http_post(
      url := current_setting('app.settings')::json->>'supabase_url' || '/functions/v1/send-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (current_setting('app.settings')::json->>'service_role_key')
      ),
      body := jsonb_build_object(
        'type', p_type,
        'recipientEmail', p_recipient_email,
        'recipientName', p_recipient_name,
        'data', p_data
      )
    );
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the transaction
  RAISE WARNING 'Failed to send email: %', SQLERRM;
END;
$$;

-- 1. Welcome Email - When new profile is created
CREATE OR REPLACE FUNCTION trigger_send_welcome_email()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM send_email_notification(
    'welcome',
    NEW.email,
    COALESCE(NEW.first_name, split_part(NEW.email, '@', 1)),
    jsonb_build_object(
      'competitionsUrl', (current_setting('app.settings')::json->>'public_site_url') || '/competitions'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_send_welcome ON profiles;
CREATE TRIGGER on_profile_created_send_welcome
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_welcome_email();

-- 2. Withdrawal Request Email - When withdrawal request is created
CREATE OR REPLACE FUNCTION trigger_send_withdrawal_request_email()
RETURNS TRIGGER AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT email, first_name INTO v_profile
  FROM profiles
  WHERE id = NEW.user_id;

  PERFORM send_email_notification(
    'withdrawal_request',
    v_profile.email,
    COALESCE(v_profile.first_name, split_part(v_profile.email, '@', 1)),
    jsonb_build_object(
      'amount', (NEW.amount_pence / 100.0)::text,
      'requestDate', to_char(NEW.created_at, 'DD Month YYYY'),
      'statusUrl', (current_setting('app.settings')::json->>'public_site_url') || '/account/withdrawals'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_withdrawal_request_created ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_request_created
  AFTER INSERT ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_withdrawal_request_email();

-- 3. Withdrawal Approved/Rejected Email - When status changes
CREATE OR REPLACE FUNCTION trigger_send_withdrawal_status_email()
RETURNS TRIGGER AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Only send if status changed to approved or rejected
  IF NEW.status != OLD.status AND (NEW.status = 'approved' OR NEW.status = 'rejected') THEN
    SELECT email, first_name INTO v_profile
    FROM profiles
    WHERE id = NEW.user_id;

    IF NEW.status = 'approved' THEN
      PERFORM send_email_notification(
        'withdrawal_approved',
        v_profile.email,
        COALESCE(v_profile.first_name, split_part(v_profile.email, '@', 1)),
        jsonb_build_object(
          'amount', (NEW.amount_pence / 100.0)::text,
          'approvedDate', to_char(NOW(), 'DD Month YYYY'),
          'statusUrl', (current_setting('app.settings')::json->>'public_site_url') || '/account/withdrawals'
        )
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM send_email_notification(
        'withdrawal_rejected',
        v_profile.email,
        COALESCE(v_profile.first_name, split_part(v_profile.email, '@', 1)),
        jsonb_build_object(
          'amount', (NEW.amount_pence / 100.0)::text,
          'rejectedDate', to_char(NOW(), 'DD Month YYYY'),
          'rejectionReason', COALESCE(NEW.admin_notes, 'Please contact support for more information'),
          'statusUrl', (current_setting('app.settings')::json->>'public_site_url') || '/account/withdrawals'
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_withdrawal_status_changed ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_status_changed
  AFTER UPDATE ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_withdrawal_status_email();

-- 4. Wallet Credit Email - When wallet credit is added
CREATE OR REPLACE FUNCTION trigger_send_wallet_credit_email()
RETURNS TRIGGER AS $$
DECLARE
  v_profile RECORD;
  v_new_balance NUMERIC;
BEGIN
  SELECT email, first_name INTO v_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- Calculate new balance
  SELECT COALESCE(SUM(remaining_pence), 0) INTO v_new_balance
  FROM wallet_credits
  WHERE user_id = NEW.user_id AND status = 'active';

  PERFORM send_email_notification(
    'wallet_credit',
    v_profile.email,
    COALESCE(v_profile.first_name, split_part(v_profile.email, '@', 1)),
    jsonb_build_object(
      'amount', (NEW.amount_pence / 100.0)::text,
      'description', COALESCE(NEW.source_description, 'Admin credit added'),
      'expiryDate', COALESCE(to_char(NEW.expires_at, 'DD Month YYYY'), 'No expiry'),
      'newBalance', (v_new_balance / 100.0)::text,
      'transactionsUrl', (current_setting('app.settings')::json->>'public_site_url') || '/account/transactions'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_wallet_credit_added ON wallet_credits;
CREATE TRIGGER on_wallet_credit_added
  AFTER INSERT ON wallet_credits
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_wallet_credit_email();

-- 5. Prize Fulfillment Update Email - When fulfillment status changes
CREATE OR REPLACE FUNCTION trigger_send_fulfillment_update_email()
RETURNS TRIGGER AS $$
DECLARE
  v_winner RECORD;
  v_prize RECORD;
BEGIN
  -- Only send if status changed
  IF NEW.status != OLD.status THEN
    SELECT
      p.email,
      p.first_name,
      d.prize_name
    INTO v_winner
    FROM draws d
    JOIN profiles p ON p.id = d.winner_user_id
    WHERE d.id = NEW.draw_id;

    PERFORM send_email_notification(
      'prize_fulfillment_update',
      v_winner.email,
      COALESCE(v_winner.first_name, split_part(v_winner.email, '@', 1)),
      jsonb_build_object(
        'prizeName', v_winner.prize_name,
        'status', NEW.status,
        'trackingNumber', NEW.tracking_number,
        'trackingUrl', NEW.tracking_url,
        'notes', NEW.notes
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_fulfillment_updated ON prize_fulfillments;
CREATE TRIGGER on_fulfillment_updated
  AFTER UPDATE ON prize_fulfillments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_fulfillment_update_email();

-- 6. Influencer Rejection Email - When influencer is deleted
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_influencer_rejected ON influencers;
CREATE TRIGGER on_influencer_rejected
  BEFORE DELETE ON influencers
  FOR EACH ROW
  WHEN (OLD.is_active = false OR OLD.is_active IS NULL)
  EXECUTE FUNCTION trigger_send_influencer_rejected_email();

-- Configure app settings (run this manually or via separate migration)
-- ALTER DATABASE postgres SET app.settings TO '{"supabase_url": "https://your-project.supabase.co", "service_role_key": "your-service-role-key", "public_site_url": "https://babybets.co.uk"}';
