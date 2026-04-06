-- ============================================
-- FIX DEDUCT WALLET CREDITS ENUM VALUE
-- Description: Change 'used' to 'spent' (correct enum value)
-- Date: 2026-04-06
-- ============================================

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

    -- Reduce the remaining amount to deduct
    v_remaining_to_deduct := v_remaining_to_deduct - v_deduction_amount;

    -- Exit if we've deducted everything
    IF v_remaining_to_deduct <= 0 THEN
      EXIT;
    END IF;
  END LOOP;

  -- If we couldn't deduct the full amount, log a warning but don't fail
  -- This could happen if credits expired between order creation and completion
  IF v_remaining_to_deduct > 0 THEN
    RAISE WARNING 'Could not deduct full amount. Requested: %, Deducted: %',
      p_amount_pence, (p_amount_pence - v_remaining_to_deduct);
  END IF;

  RETURN;
END;
$$;
