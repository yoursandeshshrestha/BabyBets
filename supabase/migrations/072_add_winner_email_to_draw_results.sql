-- ============================================
-- ADD WINNER EMAIL TO DRAW RESULTS
-- Description: Update auto_execute_competition_draws to return winner email and prize details for email notifications
-- Date: 2026-02-24
-- ============================================

-- Drop and recreate the function with winner email in results
DROP FUNCTION IF EXISTS public.auto_execute_competition_draws();

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
  -- Find competitions that are eligible for automatic draw execution
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
      -- Execute the draw
      SELECT public.execute_competition_draw_internal(
        v_competition.id,
        NULL -- No admin_id for automated draws
      ) INTO v_draw_result;

      v_successful_draws := v_successful_draws + 1;

      -- Add to successful draws list with email and prize details
      v_draws_executed := v_draws_executed || jsonb_build_object(
        'competition_id', v_competition.id,
        'competition_title', v_competition.title,
        'draw_datetime', v_competition.draw_datetime,
        'winner_display_name', v_draw_result->>'winner_display_name',
        'winning_ticket_number', v_draw_result->>'winning_ticket_number',
        'winner_email', v_draw_result->>'winner_email',
        'prize_name', v_competition.title,
        'prize_value', v_competition.total_value_gbp
      );

      RAISE NOTICE 'Successfully executed draw for competition: % (ID: %)', v_competition.title, v_competition.id;

    EXCEPTION WHEN OTHERS THEN
      v_failed_draws := v_failed_draws + 1;

      -- Add to errors list
      v_errors := v_errors || jsonb_build_object(
        'competition_id', v_competition.id,
        'competition_title', v_competition.title,
        'error', SQLERRM
      );

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
  'Automatically executes draws for competitions past their draw_datetime. Returns winner email and prize details for notifications.';
