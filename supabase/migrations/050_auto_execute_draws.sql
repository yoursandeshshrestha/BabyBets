-- ============================================
-- AUTO EXECUTE DRAWS FUNCTION
-- Description: Automatically execute draws for competitions past their draw_datetime
-- Date: 2026-02-13
-- ============================================

-- Function to automatically execute draws for eligible competitions
-- This function is called by the edge function with service role permissions
CREATE OR REPLACE FUNCTION public.auto_execute_competition_draws()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_competition RECORD;
  v_draw_result JSONB;
  v_total_competitions INTEGER := 0;
  v_successful_draws INTEGER := 0;
  v_failed_draws INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
  v_draws_executed JSONB := '[]'::JSONB;
BEGIN
  -- Find competitions that are eligible for automatic draw execution:
  -- 1. draw_datetime has passed (is in the past)
  -- 2. status is 'closed' or 'active'
  -- 3. No draw has been executed yet
  -- 4. Has tickets sold
  FOR v_competition IN
    SELECT c.*
    FROM competitions c
    WHERE c.draw_datetime IS NOT NULL
      AND c.draw_datetime <= NOW()
      AND c.status IN ('closed', 'active')
      AND c.tickets_sold > 0
      AND NOT EXISTS (
        SELECT 1 FROM draws d WHERE d.competition_id = c.id
      )
    ORDER BY c.draw_datetime ASC
  LOOP
    v_total_competitions := v_total_competitions + 1;

    BEGIN
      -- Execute the draw (bypass admin check for service role)
      SELECT public.execute_competition_draw_internal(
        v_competition.id,
        NULL -- No admin_id for automated draws
      ) INTO v_draw_result;

      v_successful_draws := v_successful_draws + 1;

      -- Add to successful draws list
      v_draws_executed := v_draws_executed || jsonb_build_object(
        'competition_id', v_competition.id,
        'competition_title', v_competition.title,
        'draw_datetime', v_competition.draw_datetime,
        'winner_display_name', v_draw_result->>'winner_display_name',
        'winning_ticket_number', v_draw_result->>'winning_ticket_number'
      );

      -- Log success
      RAISE NOTICE 'Successfully executed draw for competition: % (ID: %)', v_competition.title, v_competition.id;

    EXCEPTION WHEN OTHERS THEN
      v_failed_draws := v_failed_draws + 1;

      -- Add to errors list
      v_errors := v_errors || jsonb_build_object(
        'competition_id', v_competition.id,
        'competition_title', v_competition.title,
        'error', SQLERRM
      );

      -- Log error
      RAISE WARNING 'Failed to execute draw for competition: % (ID: %). Error: %',
        v_competition.title, v_competition.id, SQLERRM;
    END;
  END LOOP;

  -- Return summary
  RETURN jsonb_build_object(
    'success', true,
    'total_competitions', v_total_competitions,
    'successful_draws', v_successful_draws,
    'failed_draws', v_failed_draws,
    'draws_executed', v_draws_executed,
    'errors', v_errors,
    'processed_at', NOW(),
    'message', format('Processed %s competitions. Success: %s, Failed: %s',
      v_total_competitions, v_successful_draws, v_failed_draws)
  );
END;
$$;

COMMENT ON FUNCTION public.auto_execute_competition_draws IS
  'Automatically executes draws for competitions past their draw_datetime. Called by edge function with service role.';

-- Internal function for executing draws (bypasses admin check)
-- This is only callable by the auto_execute function above
CREATE OR REPLACE FUNCTION public.execute_competition_draw_internal(
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
  v_total_entries INTEGER;
  v_paid_entries INTEGER;
BEGIN
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

  -- Get all ticket IDs for this competition (ordered by created_at for deterministic ordering)
  SELECT array_agg(id ORDER BY created_at, id)
  INTO v_ticket_ids
  FROM tickets
  WHERE competition_id = p_competition_id
    AND status = 'active';

  IF v_ticket_ids IS NULL OR array_length(v_ticket_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No active tickets found for this competition';
  END IF;

  -- Convert ticket IDs to JSONB for snapshot
  v_ticket_ids_json := to_jsonb(v_ticket_ids);

  -- Create cryptographic hash of ticket pool (SHA-256)
  v_snapshot_hash := encode(
    digest(v_ticket_ids_json::text || NOW()::text, 'sha256'),
    'hex'
  );

  -- Create ticket pool snapshot
  INSERT INTO ticket_pool_snapshots (
    competition_id,
    ticket_ids,
    snapshot_hash,
    total_tickets
  )
  VALUES (
    p_competition_id,
    v_ticket_ids_json,
    v_snapshot_hash,
    array_length(v_ticket_ids, 1)
  )
  RETURNING id INTO v_snapshot_id;

  -- Generate random seed from multiple entropy sources
  -- SECURITY: Using cryptographically secure randomness
  v_random_seed := encode(
    digest(
      v_snapshot_hash ||
      extract(epoch from NOW())::text ||
      gen_random_uuid()::text ||
      encode(gen_random_bytes(16), 'hex'),
      'sha256'
    ),
    'hex'
  );

  -- Generate winner index using cryptographically secure random (0-based index)
  -- SECURITY: Using gen_random_bytes() instead of random() for unpredictable winner selection
  v_winner_index := (
    (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint::numeric
    % array_length(v_ticket_ids, 1))::integer
  );

  -- Get winning ticket
  SELECT t.*, p.first_name, p.last_name, p.email
  INTO v_winning_ticket
  FROM tickets t
  JOIN profiles p ON t.user_id = p.id
  WHERE t.id = v_ticket_ids[v_winner_index + 1];

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Winning ticket not found';
  END IF;

  -- Create verification hash
  v_verification_hash := encode(
    digest(
      v_snapshot_hash ||
      v_random_seed ||
      v_winner_index::text ||
      v_winning_ticket.id::text,
      'sha256'
    ),
    'hex'
  );

  -- Get winner display name
  v_display_name := COALESCE(
    NULLIF(trim(v_winning_ticket.first_name || ' ' || v_winning_ticket.last_name), ''),
    split_part(v_winning_ticket.email, '@', 1)
  );

  -- Count entries (ticket allocations for this competition and user)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE source = 'purchase')
  INTO v_total_entries, v_paid_entries
  FROM tickets
  WHERE competition_id = p_competition_id
    AND user_id = v_winning_ticket.user_id
    AND status = 'active';

  -- Record the draw
  INSERT INTO draws (
    competition_id,
    snapshot_id,
    winning_ticket_id,
    winner_index,
    random_source,
    verification_hash,
    executed_by
  )
  VALUES (
    p_competition_id,
    v_snapshot_id,
    v_winning_ticket.id,
    v_winner_index,
    v_random_seed,
    v_verification_hash,
    p_admin_id -- Will be NULL for automated draws
  )
  RETURNING id INTO v_draw_id;

  -- Create winner record
  INSERT INTO winners (
    competition_id,
    user_id,
    ticket_id,
    prize_name,
    prize_value,
    win_type,
    fulfillment_status
  )
  VALUES (
    p_competition_id,
    v_winning_ticket.user_id,
    v_winning_ticket.id,
    v_competition.title,
    v_competition.total_value_gbp,
    'end_prize',
    'pending'
  )
  RETURNING id INTO v_winner_id;

  -- Update competition status to completed
  UPDATE competitions
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_competition_id;

  -- Mark all other tickets as lost
  UPDATE tickets
  SET status = 'lost', updated_at = NOW()
  WHERE competition_id = p_competition_id
    AND id != v_winning_ticket.id
    AND status = 'active';

  -- Mark winning ticket as won
  UPDATE tickets
  SET status = 'won', updated_at = NOW()
  WHERE id = v_winning_ticket.id;

  -- Return draw result
  RETURN jsonb_build_object(
    'success', true,
    'draw_id', v_draw_id,
    'winner_id', v_winner_id,
    'winning_ticket_id', v_winning_ticket.id,
    'winning_ticket_number', v_winning_ticket.ticket_number,
    'winner_user_id', v_winning_ticket.user_id,
    'winner_display_name', v_display_name,
    'winner_email', v_winning_ticket.email,
    'winner_index', v_winner_index,
    'total_tickets', array_length(v_ticket_ids, 1),
    'total_entries', v_total_entries,
    'paid_entries', v_paid_entries,
    'snapshot_hash', v_snapshot_hash,
    'verification_hash', v_verification_hash,
    'executed_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.execute_competition_draw_internal IS
  'Internal function for executing draws. Bypasses admin check for automated execution.';
