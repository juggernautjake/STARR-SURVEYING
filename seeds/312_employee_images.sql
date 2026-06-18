-- ============================================================================
-- 312_employee_images.sql
--
-- Slice EP4 (employee-profile-buildout-2026-06-17) — the "About
-- me" image gallery the user asked for: "make it so that they can
-- add images, change their profile pic". Profile pic landed in
-- EP3; this table backs the broader gallery a surveyor can curate
-- on their own profile.
--
-- user_email   The owning employee.
-- image_url    Public bucket URL written when the upload lands.
-- storage_path The bucket-relative key so DELETE can prune the
--              object without re-parsing the public URL.
-- caption      Optional short caption (≤ 280 chars; enforced in
--              the API).
-- sort_order   Surveyor-controlled order; smaller comes first.
--              POST defaults to (max sort_order) + 1 so new
--              uploads land at the bottom of the grid.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   TEXT NOT NULL,
  image_url    TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption      TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.employee_images IS
  '"About me" gallery images per employee. Backed by a public
   bucket; image_url is the resolved getPublicUrl() value.';

CREATE INDEX IF NOT EXISTS idx_employee_images_user
  ON public.employee_images(user_email);

CREATE INDEX IF NOT EXISTS idx_employee_images_user_sort
  ON public.employee_images(user_email, sort_order);

COMMIT;

-- Verification:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'employee_images'
--    ORDER BY ordinal_position;
