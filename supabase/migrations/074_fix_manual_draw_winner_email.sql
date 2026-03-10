-- ============================================
-- FIX MANUAL DRAW WINNER EMAIL
-- Description: Update execute_competition_draw to return winner email and prize details (fixed image_url)
-- Date: 2026-02-24
-- ============================================

-- Update the manual draw function to include winner email in response
CREATE OR REPLACE FUNCTION public.execute_competition_draw(
  p_competition_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_competition RECORD;
  v_ticket_ids UUID[];
  v_ticket_ids_json JSONB;
  v_snapshot_hash TEXT;
  v_snapshot_id UUID;
  v_random_seed TEXT;
  v_winner_index INTEGER;
  v_winning_ticket RECORD;
  v_verification_hash TEXT;
  v_draw_id UUID;
  v_winner_id UUID;
  v_display_name TEXT;
  v_winner_email TEXT;
  v_total_entries INTEGER;
  v_paid_entries INTEGER;
BEGIN
  -- Check admin role using is_admin() function
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can execute draws';
  END IF;

  -- Get competition details
  SELECT * INTO v_competition
  FROM competitions
  WHERE id = p_competition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competition not found';
  END IF;

  -- Check if competition is eligible for draw
  IF v_competition.status NOT IN ('closed', 'active') THEN
    RAISE EXCEPTION 'Competition status must be "closed" or "active" to execute draw. Current status: %', v_competition.status;
  END IF;

  -- Check if draw already exists
  IF EXISTS (SELECT 1 FROM draws WHERE competition_id = p_competition_id) THEN
    RAISE EXCEPTION 'Draw already executed for this competition';
  END IF;

  -- Check if there are any tickets sold
  IF v_competition.tickets_sold = 0 THEN
    RAISE EXCEPTION 'Cannot execute draw: No tickets sold';
  END IF;

  -- Lock competition (set status to 'drawing')
  UPDATE competitions
  SET status = 'drawing', updated_at = NOW()
  WHERE id = p_competition_id;

  -- Fetch all valid sold tickets in deterministic order (by id ASC for reproducibility)
  SELECT array_agg(id ORDER BY id ASC)
  INTO v_ticket_ids
  FROM ticket_allocations
  WHERE competition_id = p_competition_id
    AND is_sold = true
    AND sold_to_user_id IS NOT NULL;

  IF v_ticket_ids IS NULL OR array_length(v_ticket_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No valid tickets found for draw';
  END IF;

  v_total_entries := array_length(v_ticket_ids, 1);
  v_paid_entries := v_total_entries;

  -- Convert to JSONB for storage
  v_ticket_ids_json := to_jsonb(v_ticket_ids);

  -- Create snapshot hash (SHA-256 of ordered ticket IDs)
  v_snapshot_hash := encode(
    digest(v_ticket_ids_json::text, 'sha256'),
    'hex'
  );

  -- Insert snapshot
  INSERT INTO draw_snapshots (
    competition_id,
    snapshot_hash,
    total_entries,
    paid_entries,
    postal_entries,
    promotional_entries,
    ticket_ids_json
  ) VALUES (
    p_competition_id,
    v_snapshot_hash,
    v_total_entries,
    v_paid_entries,
    0,
    0,
    v_ticket_ids_json
  ) RETURNING id INTO v_snapshot_id;

  -- Generate cryptographically secure random seed
  v_random_seed := encode(gen_random_bytes(32), 'hex');

  -- Calculate winner index using modulo
  v_winner_index := (
    ('x' || substring(v_random_seed, 1, 16))::bit(64)::bigint % v_total_entries
  );

  -- Ensure non-negative
  IF v_winner_index < 0 THEN
    v_winner_index := v_winner_index + v_total_entries;
  END IF;

  -- Get winning ticket
  SELECT * INTO v_winning_ticket
  FROM ticket_allocations
  WHERE id = v_ticket_ids[v_winner_index + 1];

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Winning ticket not found at index %', v_winner_index;
  END IF;

  -- Create verification hash
  v_verification_hash := encode(
    digest(v_snapshot_hash || v_random_seed || v_winner_index::text, 'sha256'),
    'hex'
  );

  -- Mark winning ticket
  UPDATE ticket_allocations
  SET is_main_winner = true
  WHERE id = v_winning_ticket.id;

  -- Insert draw record
  INSERT INTO draws (
    competition_id,
    snapshot_id,
    random_seed,
    random_source,
    winner_index,
    winning_ticket_id,
    winning_user_id,
    verification_hash,
    executed_by,
    executed_at
  ) VALUES (
    p_competition_id,
    v_snapshot_id,
    v_random_seed,
    'gen_random_bytes(32)',
    v_winner_index,
    v_winning_ticket.id,
    v_winning_ticket.sold_to_user_id,
    v_verification_hash,
    p_admin_id,
    NOW()
  ) RETURNING id INTO v_draw_id;

  -- Get winner email and display name
  SELECT
    CASE
      WHEN first_name IS NOT NULL AND last_name IS NOT NULL
        THEN first_name || ' ' || LEFT(last_name, 1) || '.'
      WHEN first_name IS NOT NULL
        THEN first_name || ' ' || LEFT(email, 1) || '.'
      ELSE 'Winner ' || LEFT(id::text, 8)
    END,
    email
  INTO v_display_name, v_winner_email
  FROM profiles
  WHERE id = v_winning_ticket.sold_to_user_id;

  -- Create winner record (for main prize)
  INSERT INTO winners (
    user_id,
    display_name,
    prize_name,
    prize_value_gbp,
    prize_image_url,
    competition_id,
    ticket_id,
    win_type,
    is_public,
    show_in_ticker,
    featured,
    won_at
  )
  SELECT
    v_winning_ticket.sold_to_user_id,
    v_display_name,
    COALESCE(
      v_competition.end_prize->>'name',
      v_competition.title || ' - Main Prize'
    ),
    COALESCE(
      (v_competition.end_prize->>'value_gbp')::DECIMAL,
      v_competition.total_value_gbp
    ),
    COALESCE(
      v_competition.end_prize->>'image_url',
      v_competition.image_url
    ),
    p_competition_id,
    v_winning_ticket.id,
    'end_prize',
    true,
    true,
    false,
    NOW()
  RETURNING id INTO v_winner_id;

  -- Create prize fulfillment for end prize winner
  INSERT INTO prize_fulfillments (
    user_id,
    ticket_id,
    competition_id,
    prize_id,
    value_pence,
    status,
    claim_deadline
  ) VALUES (
    v_winning_ticket.sold_to_user_id,
    v_winning_ticket.id,
    p_competition_id,
    NULL,
    ROUND(COALESCE(
      (v_competition.end_prize->>'value_gbp')::DECIMAL,
      v_competition.total_value_gbp
    ) * 100),
    'pending',
    NOW() + INTERVAL '30 days'
  );

  -- Create audit log entry
  INSERT INTO draw_audit_log (
    draw_id,
    competition_id,
    action,
    actor_id,
    details
  ) VALUES (
    v_draw_id,
    p_competition_id,
    'draw_executed',
    p_admin_id,
    jsonb_build_object(
      'total_entries', v_total_entries,
      'winner_index', v_winner_index,
      'verification_hash', v_verification_hash,
      'method', 'manual'
    )
  );

  -- Update competition status to completed
  UPDATE competitions
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_competition_id;

  -- Return result with winner email and prize details
  RETURN jsonb_build_object(
    'success', true,
    'draw_id', v_draw_id,
    'winner_id', v_winner_id,
    'snapshot_id', v_snapshot_id,
    'winning_ticket_id', v_winning_ticket.id,
    'winning_ticket_number', v_winning_ticket.ticket_number,
    'winning_user_id', v_winning_ticket.sold_to_user_id,
    'winner_display_name', v_display_name,
    'winner_email', v_winner_email,
    'winner_index', v_winner_index,
    'total_entries', v_total_entries,
    'verification_hash', v_verification_hash,
    'snapshot_hash', v_snapshot_hash,
    'prize_name', v_competition.title,
    'prize_value', v_competition.total_value_gbp,
    'message', 'Draw executed successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Rollback competition status on error
    UPDATE competitions
    SET status = 'active', updated_at = NOW()
    WHERE id = p_competition_id;

    RAISE;
END;
$$;

COMMENT ON FUNCTION public.execute_competition_draw IS
  'Executes competition draw (manual). Returns winner email and prize details for notifications. Admin only.';
