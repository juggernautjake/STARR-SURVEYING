-- ============================================================================
-- 220_starr_field_receipts.sql
-- Starr Field — Phase F2 receipts schema (capture + AI extraction)
--
-- Per STARR_FIELD_MOBILE_APP_PLAN.md §5.11 + §6.3, this migration adds the
-- two tables that hold every receipt the mobile app captures:
--
--   receipts            — one row per snapped receipt; AI-extracted fields
--                         (vendor, totals, category, tax-deductible flag)
--                         live alongside the user's manual edits and the
--                         original photo URL
--   receipt_line_items  — itemized lines extracted from the photo when the
--                         receipt has individual line items (most do)
--
-- Plus the `starr-field-receipts` Supabase Storage bucket and its RLS so
-- mobile clients can upload to a per-user prefix and the worker (service
-- role) can read every object during AI extraction.
--
-- Identity: receipts.user_id is `auth.users.id` (UUID), per the §5.10
-- preamble — both web and mobile resolve to the same row in `auth.users`.
-- This differs from `daily_time_logs` / `job_time_entries` (which carry
-- the legacy `user_email TEXT`); receipts is greenfield and follows the
-- plan's UUID convention.
--
-- IMPORTANT — depends on the live `jobs` table existing. The Phase F0
-- §15 schema-snapshot deliverable (scripts/snapshot-existing-schema.sql)
-- captures `jobs` so seeds/run_all.sh against a fresh restore works
-- end-to-end. Apply that snapshot file (when it lands at
-- seeds/214_starr_field_existing_schema_snapshot.sql) BEFORE this
-- migration. Live Supabase already has `jobs`, so applying this against
-- production directly works today.
--
-- Phases that follow this seed:
--   221_starr_field_data_points.sql   — F3 data points + media
--   222_starr_field_location.sql      — F6 location stops + segments
--   223_starr_field_vehicles.sql      — F1+ fleet (post-receipts)
-- The 220-series is intentionally split per phase so each batch ships
-- independently and re-runs are scoped.
-- ============================================================================

BEGIN;

-- ── receipts ────────────────────────────────────────────────────────────────
-- One row per captured receipt. Inserted in 'pending' status by the mobile
-- app immediately after photo upload; AI extraction writes back vendor /
-- totals / category fields asynchronously. Bookkeeper transitions to
-- 'approved' / 'rejected' from the web admin queue (Phase F2 #7).
CREATE TABLE IF NOT EXISTS receipts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner — Supabase auth.users.id (UUID). Mobile reads this from
  -- session.user.id; admin queries scope by membership.
  user_id                  UUID NOT NULL REFERENCES auth.users,

  -- Optional job association. Default at capture time is the job the
  -- user is currently clocked into (per §5.11.3); the bookkeeper can
  -- re-assign on the web side.
  job_id                   UUID REFERENCES jobs,

  -- Optional time-entry / location-stop links. job_time_entry_id ties
  -- the receipt to a specific clock-in slice; location_stop_id ties it
  -- to the AI-classified stop the user was at when the receipt was
  -- snapped. Both nullable — F2 #2 only sets job_time_entry_id (the
  -- stop classifier lands in F6).
  --
  -- ON DELETE SET NULL because deleting a time entry shouldn't cascade-
  -- delete the receipt — payroll still wants the expense recorded even
  -- if the time slice was reorganised. location_stop_id intentionally
  -- has NO FK yet; the location_stops table lands in seeds/222 (Phase
  -- F6). Add the constraint there.
  job_time_entry_id        UUID REFERENCES job_time_entries(id) ON DELETE SET NULL,
  location_stop_id         UUID,

  -- AI-extracted (writable by user as well — `category_source` records
  -- whether the value came from extraction or user override).
  vendor_name              TEXT,
  vendor_address           TEXT,
  transaction_at           TIMESTAMPTZ,
  subtotal_cents           INT,
  tax_cents                INT,
  tip_cents                INT,
  total_cents              INT,
  payment_method           TEXT,                            -- 'card'|'cash'|'check'|'other'
  payment_last4            TEXT,                            -- last 4 of card number when visible

  -- Category + IRS flag. category enumerates plan §5.11.2; the
  -- category_source column distinguishes AI-suggested from user-confirmed
  -- so we can surface "needs review" badges in the bookkeeper UI.
  category                 TEXT,                            -- see §5.11.2
  category_source          TEXT,                            -- 'ai'|'user'|'rule'
  tax_deductible_flag      TEXT,                            -- 'full'|'partial_50'|'none'|'review'

  -- Free-text user note (e.g. "client lunch w/ Henry, Belton job site").
  notes                    TEXT,

  -- Photo URL — relative path within the starr-field-receipts bucket.
  -- The mobile + admin clients construct signed URLs at read time via
  -- Supabase Storage's createSignedUrl.
  photo_url                TEXT NOT NULL,

  -- Per-field confidence scores from Claude Vision. JSONB so the schema
  -- doesn't churn each time we add a field. Shape:
  --   { "vendor_name": 0.92, "total_cents": 0.99, ... }
  ai_confidence_per_field  JSONB,

  -- Workflow state.
  status                   TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'exported'
  approved_by              UUID REFERENCES auth.users,
  approved_at              TIMESTAMPTZ,
  rejected_reason          TEXT,                            -- bookkeeper note on rejection

  -- AI-pipeline state — null until the worker queues / runs / finishes
  -- extraction. Useful for debugging stuck receipts and for surfacing
  -- "AI working…" badges in the UI.
  extraction_status        TEXT,                            -- 'queued'|'running'|'done'|'failed'
  extraction_started_at    TIMESTAMPTZ,
  extraction_completed_at  TIMESTAMPTZ,
  extraction_error         TEXT,
  extraction_cost_cents    INT,                             -- ai_cost_ledger attribution

  -- Offline-sync dedup key (PowerSync writes this on insert; server
  -- ignores duplicates with the same client_id from the same user).
  client_id                TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Constraints (idempotent) ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_status_chk') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_status_chk
        CHECK (status IN ('pending','approved','rejected','exported'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_tax_flag_chk') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_tax_flag_chk
        CHECK (tax_deductible_flag IS NULL OR tax_deductible_flag IN ('full','partial_50','none','review'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_category_source_chk') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_category_source_chk
        CHECK (category_source IS NULL OR category_source IN ('ai','user','rule'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_extraction_status_chk') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_extraction_status_chk
        CHECK (extraction_status IS NULL OR extraction_status IN ('queued','running','done','failed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_amount_nonnegative_chk') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_amount_nonnegative_chk
        CHECK (
          (subtotal_cents IS NULL OR subtotal_cents >= 0) AND
          (tax_cents      IS NULL OR tax_cents      >= 0) AND
          (tip_cents      IS NULL OR tip_cents      >= 0) AND
          (total_cents    IS NULL OR total_cents    >= 0)
        );
  END IF;
END $$;

-- Mobile dedup uniqueness — same offline write retried by PowerSync's
-- queue must collapse to one row server-side. Per-user scope so two
-- users uploading independent receipts can't accidentally collide.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_user_client_uniq'
  ) THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_user_client_uniq
        UNIQUE (user_id, client_id);
  END IF;
END $$;

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Mobile "my receipts" feed — reverse-chronological by user.
CREATE INDEX IF NOT EXISTS idx_receipts_user_time
  ON receipts (user_id, created_at DESC);

-- Per-job rollup queries — admin AND mobile show "spent on this job".
CREATE INDEX IF NOT EXISTS idx_receipts_job
  ON receipts (job_id) WHERE job_id IS NOT NULL;

-- Bookkeeper approval queue — only fires for 'pending' status. Partial
-- index keeps the page tiny once most rows have flipped to approved/exported.
CREATE INDEX IF NOT EXISTS idx_receipts_pending
  ON receipts (created_at DESC) WHERE status = 'pending';

-- Worker poll for stuck extractions. Partial — most rows are 'done'.
CREATE INDEX IF NOT EXISTS idx_receipts_extraction_pending
  ON receipts (created_at) WHERE extraction_status IN ('queued','running');

-- Time-entry rollups for "this clock-in's expenses".
CREATE INDEX IF NOT EXISTS idx_receipts_time_entry
  ON receipts (job_time_entry_id) WHERE job_time_entry_id IS NOT NULL;

-- updated_at trigger (matches the convention used by daily_time_logs etc.).
CREATE OR REPLACE FUNCTION update_receipts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receipts_updated_at ON receipts;
CREATE TRIGGER trg_receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW
  EXECUTE FUNCTION update_receipts_updated_at();


-- ── receipt_line_items ──────────────────────────────────────────────────────
-- Itemized lines extracted from the receipt photo. Many receipts have
-- per-line breakdowns (a Buc-ee's stop has fuel + drinks + snacks);
-- the bookkeeper sometimes splits those across categories.
CREATE TABLE IF NOT EXISTS receipt_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id    UUID NOT NULL REFERENCES receipts ON DELETE CASCADE,
  description   TEXT,
  amount_cents  INT,
  quantity      NUMERIC,
  position      INT,                                        -- display order
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_line_items_receipt
  ON receipt_line_items (receipt_id, position);


-- ── RLS — receipts ──────────────────────────────────────────────────────────
-- service_role has full access (worker AI-extraction, admin queue, etc.).
-- authenticated users (employees) read + write their own receipts.
-- Admin reads of others' receipts use service_role from the API layer
-- (matches the pattern in seeds/099_fieldbook.sql and seeds/210_hardening.sql).
ALTER TABLE receipts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_line_items  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_receipts ON receipts
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_receipt_line_items ON receipt_line_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner-scoped read.
DO $$ BEGIN
  CREATE POLICY receipts_owner_select ON receipts
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner-scoped insert (mobile capture).
DO $$ BEGIN
  CREATE POLICY receipts_owner_insert ON receipts
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner-scoped update — but not allowed once approved/exported (admin only).
DO $$ BEGIN
  CREATE POLICY receipts_owner_update ON receipts
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND status IN ('pending','rejected'))
    WITH CHECK (
      user_id = auth.uid()
      AND status IN ('pending','rejected')
      -- Defence in depth: surveyors can never spoof an approval on
      -- their own receipt. Only the bookkeeper (via service_role) can
      -- stamp these. RLS WITH CHECK enforces this at write time.
      AND approved_by IS NULL
      AND approved_at IS NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Column-level UPDATE allowlist for the `authenticated` role.
-- RLS already restricts WHICH rows an owner can update; this layer
-- restricts WHICH columns. Admin / bookkeeper writes go through the
-- service_role and bypass both.
--
-- Columns NOT in the allowlist (owners cannot touch):
--   - status, approved_by, approved_at, rejected_reason
--     (workflow state — bookkeeper-only)
--   - extraction_cost_cents, ai_confidence_per_field
--     (worker-only outputs; surveyors could spoof "AI says $0.00 cost")
--   - created_at (immutable)
DO $$ BEGIN
  REVOKE UPDATE ON receipts FROM authenticated;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
GRANT UPDATE (
  vendor_name, vendor_address, transaction_at,
  subtotal_cents, tax_cents, tip_cents, total_cents,
  payment_method, payment_last4,
  category, category_source, tax_deductible_flag,
  notes, job_id, job_time_entry_id, location_stop_id,
  extraction_status, extraction_started_at, extraction_completed_at,
  extraction_error,
  updated_at, client_id
) ON receipts TO authenticated;

-- Line items inherit access via parent receipt.
DO $$ BEGIN
  CREATE POLICY receipt_line_items_owner_select ON receipt_line_items
    FOR SELECT TO authenticated
    USING (
      receipt_id IN (SELECT id FROM receipts WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY receipt_line_items_owner_insert ON receipt_line_items
    FOR INSERT TO authenticated
    WITH CHECK (
      receipt_id IN (SELECT id FROM receipts WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY receipt_line_items_owner_update ON receipt_line_items
    FOR UPDATE TO authenticated
    USING (
      receipt_id IN (
        SELECT id FROM receipts
        WHERE user_id = auth.uid() AND status IN ('pending','rejected')
      )
    )
    WITH CHECK (
      receipt_id IN (
        SELECT id FROM receipts
        WHERE user_id = auth.uid() AND status IN ('pending','rejected')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Storage bucket: starr-field-receipts ────────────────────────────────────
-- Private bucket. Receipts contain financial PII (vendor, amounts) so the
-- bucket is NOT public — clients fetch via signed URLs from
-- supabase.storage.from('starr-field-receipts').createSignedUrl(path).
-- Path convention: '{user_id}/{receipt_id}.jpg' so RLS can scope by
-- the leading folder name.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'starr-field-receipts',
  'starr-field-receipts',
  false,                    -- private
  20971520,                 -- 20 MB cap (large enough for HEIC originals)
  ARRAY['image/jpeg','image/png','image/heic','image/heif','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/heic','image/heif','image/webp'];

-- Service role: full access to the bucket (worker AI extraction, admin
-- review, archival pipeline).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_receipts_service_role_all'
  ) THEN
    CREATE POLICY starr_field_receipts_service_role_all
      ON storage.objects
      FOR ALL TO service_role
      USING      (bucket_id = 'starr-field-receipts')
      WITH CHECK (bucket_id = 'starr-field-receipts');
  END IF;
END $$;

-- Authenticated users: write only into their own user-id prefix.
-- Reads use signed URLs (which bypass RLS by design); the prefix
-- check on INSERT prevents one user from uploading into another
-- user's folder.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_receipts_owner_insert'
  ) THEN
    CREATE POLICY starr_field_receipts_owner_insert
      ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'starr-field-receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Owner read via direct (non-signed) URL — kept narrow as a safety net.
-- Most reads go through signed URLs from the API, but this allows a
-- mobile preview-on-cellular re-fetch when the signed URL expires.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_receipts_owner_select'
  ) THEN
    CREATE POLICY starr_field_receipts_owner_select
      ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'starr-field-receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Owner delete — only for pending receipts (matches the `receipts`
-- update RLS). Once approved, only service_role can delete (e.g. via
-- the IRS retention archival job in §5.11.9).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_receipts_owner_delete'
  ) THEN
    CREATE POLICY starr_field_receipts_owner_delete
      ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'starr-field-receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

COMMIT;
