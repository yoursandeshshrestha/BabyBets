-- ============================================
-- FIX STORAGE UPLOAD PERMISSIONS
-- Description: Restrict file uploads to admin users only
-- Date: 2026-04-02
-- Security Fix: Prevents unauthorized users from uploading/modifying images
-- ============================================

-- ============================================
-- COMPETITION IMAGES BUCKET
-- ============================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload competition images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update competition images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete competition images" ON storage.objects;

-- Create admin-only policies
CREATE POLICY "Admin can upload competition images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'competition-images' AND
  public.is_admin()
);

CREATE POLICY "Admin can update competition images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'competition-images' AND
  public.is_admin()
);

CREATE POLICY "Admin can delete competition images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'competition-images' AND
  public.is_admin()
);

-- ============================================
-- PRIZE IMAGES BUCKET
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can upload prize images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update prize images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete prize images" ON storage.objects;

CREATE POLICY "Admin can upload prize images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'prize-images' AND
  public.is_admin()
);

CREATE POLICY "Admin can update prize images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'prize-images' AND
  public.is_admin()
);

CREATE POLICY "Admin can delete prize images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'prize-images' AND
  public.is_admin()
);

-- ============================================
-- WINNER PHOTOS BUCKET
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can upload winner photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update winner photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete winner photos" ON storage.objects;

CREATE POLICY "Admin can upload winner photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'winner-photos' AND
  public.is_admin()
);

CREATE POLICY "Admin can update winner photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'winner-photos' AND
  public.is_admin()
);

CREATE POLICY "Admin can delete winner photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'winner-photos' AND
  public.is_admin()
);

-- ============================================
-- PUBLIC ASSETS BUCKET
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can upload public assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own public assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own public assets" ON storage.objects;

CREATE POLICY "Admin can upload public assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public-assets' AND
  public.is_admin()
);

CREATE POLICY "Admin can update public assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'public-assets' AND
  public.is_admin()
);

CREATE POLICY "Admin can delete public assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'public-assets' AND
  public.is_admin()
);

COMMENT ON POLICY "Admin can upload competition images" ON storage.objects IS
  'Security: Only admins can upload competition images';

COMMENT ON POLICY "Admin can upload prize images" ON storage.objects IS
  'Security: Only admins can upload prize images';

COMMENT ON POLICY "Admin can upload winner photos" ON storage.objects IS
  'Security: Only admins can upload winner photos';

COMMENT ON POLICY "Admin can upload public assets" ON storage.objects IS
  'Security: Only admins can upload public assets';
