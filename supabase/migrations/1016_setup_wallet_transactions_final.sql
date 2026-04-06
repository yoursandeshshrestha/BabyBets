-- ============================================
-- SETUP WALLET TRANSACTIONS (FINAL)
-- Description: Backfill, trigger, and deduct function
-- Date: 2026-04-06
-- ============================================

-- Backfill existing wallet credits as transactions (if not already done)
INSERT INTO public.wallet_transactions (
  user_id,
  type,
  amount_pence,
  balance_after_pence,
  description,
  credit_id,
  created_at
)
SELECT
  wc.user_id,
  'credit'::wallet_transaction_type as type,
  wc.amount_pence,
  wc.amount_pence as balance_after_pence,
  wc.description,
  wc.id as credit_id,
  wc.created_at
FROM wallet_credits wc
WHERE NOT EXISTS (
  SELECT 1 FROM wallet_transactions wt WHERE wt.credit_id = wc.id AND wt.type = 'credit'
);

-- Create trigger function to automatically create transaction when wallet_credit is added
CREATE OR REPLACE FUNCTION trigger_create_wallet_credit_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_balance_after INTEGER;
BEGIN
  -- Calculate balance after this credit
  SELECT COALESCE(SUM(remaining_pence), 0) INTO v_balance_after
  FROM wallet_credits
  WHERE user_id = NEW.user_id
    AND status = 'active';

  -- Create transaction record
  INSERT INTO wallet_transactions (
    user_id,
    type,
    amount_pence,
    balance_after_pence,
    description,
    credit_id,
    created_at
  ) VALUES (
    NEW.user_id,
    'credit'::wallet_transaction_type,
    NEW.amount_pence,
    v_balance_after,
    NEW.description,
    NEW.id,
    NEW.created_at
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (drop first to avoid conflicts)
DROP TRIGGER IF EXISTS on_wallet_credit_created ON wallet_credits;
CREATE TRIGGER on_wallet_credit_created
  AFTER INSERT ON wallet_credits
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_wallet_credit_transaction();

-- Update deduct function to create transaction records
CREATE OR REPLACE FUNCTION public.deduct_wallet_credits(
  p_user_id UUID,
  p_amount_pence INTEGER,
  p_order_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit RECORD;
  v_remaining_to_deduct INTEGER := p_amount_pence;
  v_deduction_amount INTEGER;
  v_total_deducted INTEGER := 0;
  v_balance_after INTEGER;
BEGIN
  -- Validate inputs
  IF p_amount_pence <= 0 THEN
    RETURN; -- Nothing to deduct
  END IF;

  -- Loop through wallet credits in FIFO order (oldest first)
  FOR v_credit IN
    SELECT wallet_credits.id, wallet_credits.remaining_pence
    FROM wallet_credits
    WHERE wallet_credits.user_id = p_user_id
      AND wallet_credits.status = 'active'
      AND wallet_credits.remaining_pence > 0
      AND (wallet_credits.expires_at IS NULL OR wallet_credits.expires_at > NOW())
    ORDER BY wallet_credits.created_at ASC
    FOR UPDATE
  LOOP
    -- Calculate how much to deduct from this credit
    v_deduction_amount := LEAST(v_credit.remaining_pence, v_remaining_to_deduct);

    -- Update the wallet credit
    UPDATE wallet_credits
    SET
      remaining_pence = remaining_pence - v_deduction_amount,
      status = CASE
        WHEN remaining_pence - v_deduction_amount <= 0 THEN 'spent'::credit_status
        ELSE status
      END,
      updated_at = NOW()
    WHERE wallet_credits.id = v_credit.id;

    -- Track total deducted
    v_total_deducted := v_total_deducted + v_deduction_amount;

    -- Reduce the remaining amount to deduct
    v_remaining_to_deduct := v_remaining_to_deduct - v_deduction_amount;

    -- Exit if we've deducted everything
    IF v_remaining_to_deduct <= 0 THEN
      EXIT;
    END IF;
  END LOOP;

  -- Calculate balance after deduction
  SELECT COALESCE(SUM(remaining_pence), 0) INTO v_balance_after
  FROM wallet_credits
  WHERE user_id = p_user_id
    AND status = 'active';

  -- Create a transaction record for the deduction
  IF v_total_deducted > 0 THEN
    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount_pence,
      balance_after_pence,
      description,
      order_id,
      created_at
    ) VALUES (
      p_user_id,
      'debit'::wallet_transaction_type,
      v_total_deducted,
      v_balance_after,
      'Order payment',
      p_order_id,
      NOW()
    );
  END IF;

  -- If we couldn't deduct the full amount, log a warning but don't fail
  IF v_remaining_to_deduct > 0 THEN
    RAISE WARNING 'Could not deduct full amount. Requested: %, Deducted: %',
      p_amount_pence, v_total_deducted;
  END IF;

  RETURN;
END;
$$;
