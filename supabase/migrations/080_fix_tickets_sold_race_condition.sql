-- Fix tickets_sold race condition with atomic increment
CREATE OR REPLACE FUNCTION public.claim_tickets_atomic(
  p_competition_id UUID,
  p_user_id UUID,
  p_order_id UUID,
  p_ticket_count INTEGER
)
RETURNS TABLE(id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id UUID;
  v_claimed_count INTEGER := 0;
  v_current_tickets_sold INTEGER;
  v_max_tickets INTEGER;
BEGIN
  -- Validate inputs
  IF p_ticket_count <= 0 THEN
    RAISE EXCEPTION 'Ticket count must be greater than 0';
  END IF;

  -- SECURITY: Get competition details with row lock to prevent race conditions
  SELECT tickets_sold, max_tickets
  INTO v_current_tickets_sold, v_max_tickets
  FROM competitions
  WHERE id = p_competition_id
  FOR UPDATE;  -- Lock the row

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competition not found';
  END IF;

  -- SECURITY: Check if enough tickets available (prevent overselling)
  IF v_current_tickets_sold + p_ticket_count > v_max_tickets THEN
    RAISE EXCEPTION 'Not enough tickets available. Requested: %, Available: %',
      p_ticket_count, (v_max_tickets - v_current_tickets_sold);
  END IF;

  -- Use FOR UPDATE SKIP LOCKED to:
  -- 1. Lock the rows we're about to claim (prevents other transactions)
  -- 2. Skip rows already locked by other transactions
  -- 3. Makes concurrent requests safe
  FOR v_ticket_id IN
    SELECT ta.id
    FROM ticket_allocations ta
    WHERE ta.competition_id = p_competition_id
      AND ta.is_sold = false
    ORDER BY ta.id
    LIMIT p_ticket_count
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Update the ticket to mark it as sold
    UPDATE ticket_allocations
    SET
      is_sold = true,
      sold_at = NOW(),
      sold_to_user_id = p_user_id,
      order_id = p_order_id
    WHERE ticket_allocations.id = v_ticket_id;

    -- Return the claimed ticket ID
    id := v_ticket_id;
    RETURN NEXT;

    v_claimed_count := v_claimed_count + 1;
  END LOOP;

  -- Verify we claimed the requested number
  IF v_claimed_count < p_ticket_count THEN
    RAISE EXCEPTION 'Insufficient tickets available. Requested: %, Claimed: %',
      p_ticket_count, v_claimed_count;
  END IF;

  -- SECURITY FIX: Atomically increment tickets_sold within the same transaction
  -- This prevents race conditions where two orders could both read the same value
  UPDATE competitions
  SET tickets_sold = tickets_sold + p_ticket_count
  WHERE id = p_competition_id;

  RETURN;
END;
$$;
