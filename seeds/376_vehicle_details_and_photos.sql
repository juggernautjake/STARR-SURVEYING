-- seeds/376_vehicle_details_and_photos.sql
--
-- vehicle-details-and-photos-2026-06-22 — round out the fleet table
-- so the admin can capture every detail a surveying crew tracks per
-- vehicle:
--   • make / model / year (matches the registration paperwork)
--   • status enum (ok, maintenance_due, in_repair, damaged, out_of_service)
--   • free-text issue notes — what's wrong, what was done, ETA on repair
--   • photo gallery via a new `vehicle_photos` table + storage bucket
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- ON CONFLICT DO NOTHING. Safe to re-run.

BEGIN;

-- ─── 1. Extend the vehicles table ───────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS make         text,
  ADD COLUMN IF NOT EXISTS model        text,
  ADD COLUMN IF NOT EXISTS model_year   int,
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS issue_notes  text,
  ADD COLUMN IF NOT EXISTS primary_photo_path text;

-- Status enum lives as a CHECK constraint so future status additions
-- are a one-line change without an enum migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_status_check'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_status_check
      CHECK (status IN ('ok', 'maintenance_due', 'in_repair', 'damaged', 'out_of_service'));
  END IF;
END $$;

-- model_year sanity (don't bake real bounds in — let the column accept
-- ranges that match every plausible vehicle).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_model_year_check'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_model_year_check
      CHECK (model_year IS NULL OR (model_year BETWEEN 1900 AND 2100));
  END IF;
END $$;

-- ─── 2. Photo gallery ──────────────────────────────────────────────
-- One row per uploaded photo. Caption + uploaded_by drive a simple
-- audit trail; photo_path is the relative path inside the
-- `vehicle-photos` storage bucket below.
CREATE TABLE IF NOT EXISTS public.vehicle_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  photo_path   text NOT NULL,
  caption      text,
  uploaded_by  text,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle
  ON public.vehicle_photos (vehicle_id, uploaded_at DESC);

-- ─── 3. Storage bucket for vehicle photos ──────────────────────────
-- Private bucket; reads go through signed URLs the API generates so
-- we don't leak fleet photos to the public internet.
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-photos', 'vehicle-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Service-role RLS — the API server uses the service-role client, so
-- a single ALL policy gated to `service_role` is enough. Adjust if a
-- future surface needs direct user-session uploads.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND policyname = 'vehicle_photos_service_role_all'
  ) THEN
    CREATE POLICY "vehicle_photos_service_role_all"
      ON storage.objects
      FOR ALL
      TO service_role
      USING      (bucket_id = 'vehicle-photos')
      WITH CHECK (bucket_id = 'vehicle-photos');
  END IF;
END $$;

COMMIT;
