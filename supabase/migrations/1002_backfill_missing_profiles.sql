-- ============================================
-- BACKFILL MISSING PROFILES
-- Description: Create profiles for any auth.users that don't have them
-- Date: 2026-04-06
-- ============================================

-- Function to backfill missing profiles
CREATE OR REPLACE FUNCTION public.backfill_missing_profiles()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  created BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_created BOOLEAN;
  v_error TEXT;
BEGIN
  -- Loop through all auth.users that don't have profiles
  FOR v_user IN
    SELECT
      u.id,
      u.email,
      u.raw_user_meta_data,
      u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    BEGIN
      -- Try to create the profile
      INSERT INTO public.profiles (
        id,
        email,
        first_name,
        last_name,
        avatar_url,
        created_at,
        updated_at
      ) VALUES (
        v_user.id,
        COALESCE(v_user.email, ''),
        COALESCE(
          v_user.raw_user_meta_data->>'first_name',
          v_user.raw_user_meta_data->>'given_name'
        ),
        COALESCE(
          v_user.raw_user_meta_data->>'last_name',
          v_user.raw_user_meta_data->>'family_name'
        ),
        COALESCE(
          v_user.raw_user_meta_data->>'avatar_url',
          v_user.raw_user_meta_data->>'picture'
        ),
        v_user.created_at,
        NOW()
      );

      v_created := TRUE;
      v_error := NULL;

      user_id := v_user.id;
      email := v_user.email;
      created := v_created;
      error := v_error;
      RETURN NEXT;

    EXCEPTION WHEN others THEN
      v_created := FALSE;
      v_error := SQLERRM;

      user_id := v_user.id;
      email := v_user.email;
      created := v_created;
      error := v_error;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$$;

-- Run the backfill function
DO $$
DECLARE
  v_result RECORD;
  v_success_count INTEGER := 0;
  v_error_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting profile backfill...';

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

-- Check if there are still any users without profiles
DO $$
DECLARE
  v_orphaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphaned_count
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL;

  IF v_orphaned_count > 0 THEN
    RAISE WARNING 'Still % auth.users without profiles after backfill', v_orphaned_count;
  ELSE
    RAISE NOTICE 'All auth.users now have profiles!';
  END IF;
END $$;
