-- ============================================================================
-- 225_starr_field_vehicles.sql
-- Starr Field — fleet (vehicles) for IRS mileage attribution.
--
-- Per F6 plan checklist: "Vehicle assignment + driver/passenger." The
-- mileage report (Batch G + /admin/mileage) currently sums every
-- ping-derived mile to the user, treating every clocked-in trip as
-- driving. That works for the solo-surveyor case (Jacob alone in
-- the truck) but breaks the moment a crew of 2+ rides together: only
-- the DRIVER should claim mileage for IRS, and only ONE vehicle is
-- moving even though both phones are pinging.
--
-- This seed lands the vehicles table referenced by the mobile schema
-- (mobile/lib/db/schema.ts has declared it since seeds/220 — server
-- side never landed) plus the FK from job_time_entries.vehicle_id.
-- The mobile vehicle picker on clock-in (F6 #vehicle-picker)
-- populates job_time_entries.vehicle_id + is_driver.
--
-- Single-tenant assumption: company_id is reserved for a future
-- multi-tenant pivot but left nullable. v1 deployments are Starr
-- Surveying-only.
--
-- IMPORTANT — depends on auth.users (Supabase). Optional FK to
-- job_time_entries (added by 220 ALTER) handled defensively.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display name on the picker — "Truck 3" / "Big Red" / "Henry's
  -- F-150." Required.
  name            TEXT NOT NULL,

  -- Optional plate + VIN for IRS docs. plate is denormalised onto
  -- mileage CSV exports so the bookkeeper can match against
  -- registration paperwork.
  license_plate   TEXT,
  vin             TEXT,

  -- Reserved for the future multi-tenant pivot. Leave null in v1.
  company_id      UUID,

  -- Lifecycle. active = false hides from the mobile picker but
  -- preserves historical job_time_entries.vehicle_id references.
  active          BOOLEAN NOT NULL DEFAULT true,

  -- Audit.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT  -- email of the admin who added the vehicle
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_name_chk'
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_name_chk
        CHECK (length(trim(name)) > 0);
  END IF;
END $$;

-- Plate uniqueness across all active vehicles (case-insensitive,
-- trimmed). Inactive vehicles can collide with active ones — when
-- a truck is replaced, archive the old row + add the new one with
-- the same plate, no constraint violation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_active_plate
  ON vehicles (LOWER(TRIM(license_plate)))
  WHERE active = true AND license_plate IS NOT NULL;

-- Mobile picker: "active vehicles, alphabetically." Tiny table; no
-- index needed beyond the active-plate one above for the v1 fleet
-- size (~10 vehicles).
CREATE INDEX IF NOT EXISTS idx_vehicles_active_name
  ON vehicles (active, name);


-- ── Optional FK from job_time_entries.vehicle_id ─────────────────────────────
-- Added by seeds/220 ALTER as plain UUID; we wire the FK now that
-- the vehicles table exists. Defensive — only add when the column
-- exists (guards a fresh-DB run that hasn't applied 220 yet).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'job_time_entries'
       AND column_name = 'vehicle_id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'job_time_entries_vehicle_id_fkey'
  ) THEN
    ALTER TABLE job_time_entries
      ADD CONSTRAINT job_time_entries_vehicle_id_fkey
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- Same FK from location_segments.vehicle_id (mobile schema declares
-- it; seeds/224 created the column).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'location_segments'
       AND column_name = 'vehicle_id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'location_segments_vehicle_id_fkey'
  ) THEN
    ALTER TABLE location_segments
      ADD CONSTRAINT location_segments_vehicle_id_fkey
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON DELETE SET NULL;
  END IF;
END $$;


-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Service role does it all (admin manages the fleet via the web).
-- Authenticated users (mobile clients) get SELECT on active rows
-- only — they need the picker list but never write.
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_vehicles ON vehicles
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY vehicles_authenticated_select ON vehicles
    FOR SELECT TO authenticated
    USING (active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE INSERT, UPDATE, DELETE ON vehicles FROM authenticated;
GRANT  SELECT ON vehicles TO authenticated;

COMMIT;
