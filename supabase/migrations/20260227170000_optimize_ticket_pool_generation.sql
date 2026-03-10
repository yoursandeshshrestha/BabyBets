-- ============================================
-- OPTIMIZE TICKET POOL GENERATION
-- Description: Improve performance and add timeout handling for large ticket pools
-- Created: 2026-02-27
-- ============================================

-- Drop existing function
DROP FUNCTION IF EXISTS public.generate_ticket_pool(UUID);

-- Create optimized ticket pool generation function
CREATE OR REPLACE FUNCTION public.generate_ticket_pool(
  p_competition_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300s' -- 5 minutes timeout
AS $$
DECLARE
  v_competition RECORD;
  v_prize RECORD;
  v_ticket_ids UUID[];
  v_prize_tickets UUID[];
  v_random_index INTEGER;
  v_generated_count INTEGER := 0;
  v_prizes_allocated INTEGER := 0;
  v_i INTEGER;
  v_batch_size INTEGER := 1000; -- Generate tickets in batches for better performance
  v_batches INTEGER;
  v_current_batch INTEGER;
  v_batch_start INTEGER;
  v_batch_end INTEGER;
BEGIN
  RAISE NOTICE 'Starting ticket pool generation for competition: %', p_competition_id;

  -- Check admin role using is_admin() helper
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can generate ticket pools';
  END IF;

  -- Get competition details
  SELECT * INTO v_competition
  FROM competitions
  WHERE id = p_competition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competition not found';
  END IF;

  RAISE NOTICE 'Competition found: % (type: %, max_tickets: %)', v_competition.title, v_competition.competition_type, v_competition.max_tickets;

  -- Check if pool is already locked
  IF v_competition.ticket_pool_locked = true THEN
    RAISE EXCEPTION 'Ticket pool is already locked for this competition';
  END IF;

  -- Check if any tickets already sold
  IF v_competition.tickets_sold > 0 THEN
    RAISE EXCEPTION 'Cannot generate pool: tickets already sold';
  END IF;

  -- Delete any existing unsold tickets (for regeneration)
  DELETE FROM ticket_allocations
  WHERE competition_id = p_competition_id
    AND is_sold = false;

  RAISE NOTICE 'Generating % alphanumeric tickets in batches...', v_competition.max_tickets;

  -- Calculate number of batches needed
  v_batches := CEIL(v_competition.max_tickets::NUMERIC / v_batch_size);
  RAISE NOTICE 'Will generate in % batches of up to % tickets each', v_batches, v_batch_size;

  -- Generate tickets in batches for better performance
  FOR v_current_batch IN 1..v_batches LOOP
    v_batch_start := (v_current_batch - 1) * v_batch_size + 1;
    v_batch_end := LEAST(v_current_batch * v_batch_size, v_competition.max_tickets);

    RAISE NOTICE 'Generating batch % of %: tickets % to %', v_current_batch, v_batches, v_batch_start, v_batch_end;

    -- Generate batch of tickets using set-based operation
    -- This is MUCH faster than row-by-row insertion
    INSERT INTO ticket_allocations (
      competition_id,
      ticket_number,
      prize_id,
      is_sold,
      sold_at,
      sold_to_user_id,
      is_revealed
    )
    SELECT
      p_competition_id,
      generate_alphanumeric_code(7),
      NULL,
      false,
      NULL,
      NULL,
      false
    FROM generate_series(v_batch_start, v_batch_end);

    v_generated_count := v_batch_end;

    RAISE NOTICE 'Batch % complete. Total tickets generated: %', v_current_batch, v_generated_count;
  END LOOP;

  -- Handle potential duplicate ticket numbers
  -- Remove duplicates keeping the first occurrence
  WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY ticket_number ORDER BY id) as rn
    FROM ticket_allocations
    WHERE competition_id = p_competition_id
  )
  DELETE FROM ticket_allocations
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  -- If we deleted duplicates, regenerate them
  DECLARE
    v_missing_count INTEGER;
    v_ticket_number TEXT;
    v_max_attempts INTEGER := 100;
    v_attempt INTEGER;
    v_code_exists BOOLEAN;
  BEGIN
    SELECT v_competition.max_tickets - COUNT(*)
    INTO v_missing_count
    FROM ticket_allocations
    WHERE competition_id = p_competition_id;

    IF v_missing_count > 0 THEN
      RAISE NOTICE 'Regenerating % duplicate tickets', v_missing_count;

      FOR v_i IN 1..v_missing_count LOOP
        v_attempt := 0;
        v_code_exists := true;

        -- Generate unique code (retry if collision occurs)
        WHILE v_code_exists AND v_attempt < v_max_attempts LOOP
          v_ticket_number := generate_alphanumeric_code(7);

          -- Check if code already exists in this competition
          SELECT EXISTS(
            SELECT 1 FROM ticket_allocations
            WHERE competition_id = p_competition_id
              AND ticket_number = v_ticket_number
          ) INTO v_code_exists;

          v_attempt := v_attempt + 1;
        END LOOP;

        -- If still exists after max attempts, raise error
        IF v_code_exists THEN
          RAISE EXCEPTION 'Failed to generate unique ticket code after % attempts', v_max_attempts;
        END IF;

        INSERT INTO ticket_allocations (
          competition_id,
          ticket_number,
          prize_id,
          is_sold,
          sold_at,
          sold_to_user_id,
          is_revealed
        ) VALUES (
          p_competition_id,
          v_ticket_number,
          NULL,
          false,
          NULL,
          NULL,
          false
        );
      END LOOP;
    END IF;
  END;

  RAISE NOTICE 'All % tickets generated successfully', v_competition.max_tickets;

  -- Collect all ticket IDs for prize distribution
  SELECT array_agg(id ORDER BY RANDOM())
  INTO v_ticket_ids
  FROM ticket_allocations
  WHERE competition_id = p_competition_id;

  -- Distribute instant win prizes randomly across the pool
  -- Only for instant win competitions
  IF v_competition.competition_type IN ('instant_win', 'instant_win_with_end_prize') THEN
    RAISE NOTICE 'Competition type is %, starting prize allocation', v_competition.competition_type;

    FOR v_prize IN
      SELECT * FROM competition_instant_win_prizes
      WHERE competition_id = p_competition_id
      ORDER BY tier ASC  -- Allocate higher tier prizes first
    LOOP
      RAISE NOTICE 'Allocating prize: % (quantity: %)', v_prize.id, v_prize.total_quantity;

      -- Allocate each prize quantity times
      FOR v_i IN 1..v_prize.total_quantity LOOP
        -- Find tickets without prizes assigned
        SELECT array_agg(id)
        INTO v_prize_tickets
        FROM ticket_allocations
        WHERE competition_id = p_competition_id
          AND prize_id IS NULL;

        -- Exit if no more tickets available
        IF v_prize_tickets IS NULL OR array_length(v_prize_tickets, 1) = 0 THEN
          RAISE WARNING 'Not enough tickets to allocate all prizes';
          EXIT;
        END IF;

        -- Select random ticket using cryptographically secure randomness
        v_random_index := (
          (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint::numeric % array_length(v_prize_tickets, 1))::integer
        ) + 1;

        -- Assign prize to random ticket
        UPDATE ticket_allocations
        SET prize_id = v_prize.id
        WHERE id = v_prize_tickets[v_random_index];

        v_prizes_allocated := v_prizes_allocated + 1;

        -- Log progress every 100 prizes
        IF v_prizes_allocated % 100 = 0 THEN
          RAISE NOTICE 'Allocated % prizes...', v_prizes_allocated;
        END IF;
      END LOOP;
    END LOOP;

    RAISE NOTICE 'Prize allocation complete. Total allocated: %', v_prizes_allocated;
  ELSE
    RAISE NOTICE 'Competition type is %, skipping prize allocation', v_competition.competition_type;
  END IF;

  -- Lock the ticket pool
  UPDATE competitions
  SET
    ticket_pool_locked = true,
    ticket_pool_generated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_competition_id;

  -- Return success result
  RAISE NOTICE 'Ticket pool generation complete. Tickets: %, Prizes: %', v_generated_count, v_prizes_allocated;

  RETURN jsonb_build_object(
    'success', true,
    'competition_id', p_competition_id,
    'tickets_generated', v_competition.max_tickets,
    'prizes_allocated', v_prizes_allocated,
    'pool_locked_at', NOW(),
    'message', FORMAT('Successfully generated %s alphanumeric tickets with %s instant win prizes', v_competition.max_tickets, v_prizes_allocated)
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Rollback ticket pool lock on error
    UPDATE competitions
    SET ticket_pool_locked = false
    WHERE id = p_competition_id;

    RAISE EXCEPTION 'Error generating ticket pool: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.generate_ticket_pool(UUID) IS
  'Generates pre-allocated ticket pool with random 7-character alphanumeric codes (0-9, A-Z, a-z) and random prize distribution (admin only). Optimized for large ticket pools with batch processing and 5-minute timeout.';

-- Grant execute permission to authenticated users (function checks admin role internally)
GRANT EXECUTE ON FUNCTION public.generate_ticket_pool(UUID) TO authenticated;
