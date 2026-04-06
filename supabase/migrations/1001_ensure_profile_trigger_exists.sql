-- ============================================
-- ENSURE PROFILE CREATION TRIGGER EXISTS
-- Description: Recreate the trigger and function to ensure profiles are created on signup
-- Date: 2026-04-06
-- ============================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the function with proper permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
  user_first_name TEXT;
  user_last_name TEXT;
  user_avatar TEXT;
  user_full_name TEXT;
BEGIN
  -- Log that we're in the trigger
  RAISE LOG 'handle_new_user trigger fired for user %', NEW.id;

  -- Email extraction
  user_email := COALESCE(NEW.email, '');

  -- Extract names from metadata (handles Google OAuth fields)
  user_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'given_name',
    NULL
  );

  user_last_name := COALESCE(
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'family_name',
    NULL
  );

  -- Split full_name if first/last unavailable
  IF user_first_name IS NULL AND user_last_name IS NULL THEN
    user_full_name := NEW.raw_user_meta_data->>'full_name';
    IF user_full_name IS NOT NULL THEN
      user_first_name := split_part(user_full_name, ' ', 1);
      user_last_name := split_part(user_full_name, ' ', 2);
    END IF;
  END IF;

  -- Extract avatar (supports Google 'picture' and 'avatar_url')
  user_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    NULL
  );

  -- Insert profile with ON CONFLICT handler
  INSERT INTO public.profiles (id, email, first_name, last_name, avatar_url)
  VALUES (NEW.id, user_email, user_first_name, user_last_name, user_avatar)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

  RAISE LOG 'Profile created successfully for user %', NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Error creating profile for user %: %. SQLSTATE: %. Metadata: %',
      NEW.id, SQLERRM, SQLSTATE, NEW.raw_user_meta_data::text;
    RETURN NEW;
END;
$$;

-- Recreate the trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verify the trigger was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
    AND tgrelid = 'auth.users'::regclass
  ) THEN
    RAISE NOTICE 'Trigger on_auth_user_created successfully created on auth.users';
  ELSE
    RAISE EXCEPTION 'Failed to create trigger on_auth_user_created';
  END IF;
END $$;
