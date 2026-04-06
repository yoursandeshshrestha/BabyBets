-- ============================================
-- FIX PROFILE CREATION FROM TRIGGER
-- Description: Allow trigger to create profiles by adding permissive RLS policy
-- Date: 2026-04-06
-- Security Fix: Allows handle_new_user() trigger to create profiles
-- ============================================

-- The issue: The "Users can insert own profile" policy only allows authenticated users
-- where auth.uid() = id. However, the trigger runs before the user is authenticated,
-- so auth.uid() returns NULL and the insert fails.

-- Solution: Add a policy that allows inserts when the ID matches an existing auth.users entry
-- This is safe because it only allows creating profiles for users that exist in auth.users

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Create new policy that allows anyone to insert a profile IF:
-- 1. The id matches the current user (auth.uid()), OR
-- 2. The id exists in auth.users (for trigger context where auth.uid() is NULL)
CREATE POLICY "Allow profile creation on signup"
ON public.profiles FOR INSERT
WITH CHECK (
  -- Allow authenticated users to insert their own profile
  (auth.uid() = id) OR
  -- Allow trigger to insert profile for newly created auth.users
  -- This works because the trigger runs AFTER INSERT on auth.users,
  -- so the user exists in auth.users but hasn't authenticated yet
  (
    auth.uid() IS NULL AND
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = profiles.id)
  )
);
