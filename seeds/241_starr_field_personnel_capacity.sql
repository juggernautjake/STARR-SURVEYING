-- seeds/241_starr_field_personnel_capacity.sql
--
-- Phase F10.4-a — personnel assignment + crew capacity schema.
-- The §5.12.4 mirror of §5.12.5: dispatcher assigns crew to a
-- job, the system catches capacity / skill / PTO conflicts, the
-- surveyor confirms or declines via the mobile inbox card.
--
-- Three landing zones in this seed:
--
--   1. ALTER `job_team` — extend the live table with the
--      assignment-window + state-machine columns the §5.12.4
--      flow needs. The plan was deliberate about NOT renaming
--      to job_personnel: the live API
--      (app/api/admin/jobs/team/route.ts) already writes here,
--      and we're additive only.
--
--   2. CREATE `personnel_skills` — per-user catalogue of skills
--      and certifications with optional cert PDF (§5.6 files
--      bucket). Drives the F10.4-b engine's skill check.
--
--   3. CREATE `personnel_unavailability` — PTO / sick /
--      training rows. Drives the F10.4-b engine's
--      unavailability check.
--
-- Race-safety mirrors seeds/239: a GiST EXCLUDE on
-- (user_email, tstzrange(assigned_from, assigned_to, '[)'))
-- WHERE state IN ('proposed','confirmed') AND is_override=false
-- guarantees no two non-override active assignments overlap for
-- the same person. Soft-override slots a second row alongside
-- per the same convention as F10.3-e.
--
-- Crew-lead exactly-one-per-job is enforced by a partial UNIQUE
-- index on `(job_id) WHERE is_crew_lead=true AND state IN
-- ('proposed','confirmed')`. Cancelling or declining the lead
-- frees the slot automatically — the dispatcher then promotes
-- the next person via PATCH or relies on the F10.4-e auto-
-- promote helper.
--
-- Apply AFTER seeds/239 + 240 (so the override semantic vocabulary
-- already exists in the codebase). Personnel tables live in their
-- own number — was provisionally 240 in the plan, but seeds/240
-- shipped with the equipment-override schema; renumbering
-- forward to 241 to keep numeric ordering with the actual ship
-- dates.
--
-- Idempotent (CREATE … IF NOT EXISTS, conditional ALTERs, DO
-- $$ guards on constraints).

BEGIN;

-- btree_gist already created by seeds/239 — left here as a
-- self-documenting marker so a future reader doesn't wonder
-- where the GiST mixed-operator support comes from.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. ALTER job_team — assignment-window + state machine ────
ALTER TABLE job_team
  ADD COLUMN IF NOT EXISTS assigned_from   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slot_role       TEXT,
  ADD COLUMN IF NOT EXISTS state           TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decline_reason  TEXT,
  ADD COLUMN IF NOT EXISTS is_crew_lead    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_override     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- State enum check. Only enforced on rows that opt in (NULL is
-- legal — rows pre-dating F10.4 keep their existing behaviour
-- with NULL state; new F10.4 inserts always supply a value).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_team_state_chk'
  ) THEN
    ALTER TABLE job_team
      ADD CONSTRAINT job_team_state_chk
        CHECK (
          state IS NULL
          OR state IN ('proposed', 'confirmed', 'declined', 'cancelled')
        );
  END IF;
END $$;

-- Window sanity: when both endpoints are set, end > start.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_team_window_chk'
  ) THEN
    ALTER TABLE job_team
      ADD CONSTRAINT job_team_window_chk
        CHECK (
          assigned_from IS NULL
          OR assigned_to IS NULL
          OR assigned_to > assigned_from
        );
  END IF;
END $$;

-- Override-requires-reason — same belt-and-suspenders pattern
-- as seeds/240's equipment override.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_team_override_requires_reason_chk'
  ) THEN
    ALTER TABLE job_team
      ADD CONSTRAINT job_team_override_requires_reason_chk
        CHECK (
          is_override = false
          OR (override_reason IS NOT NULL AND length(trim(override_reason)) > 0)
        );
  END IF;
END $$;

-- ── 2. job_team capacity EXCLUDE — race fence ────────────────
-- Two non-override active rows for the same user with
-- overlapping windows are rejected at the storage layer. The
-- F10.4-c POST /assign handler still pre-checks via the engine
-- to surface clean typed conflicts, but two dispatchers racing
-- on the same person literally cannot win — the second insert
-- raises 23P01 which the route maps to a typed
-- 'capacity_overlap' conflict.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_team_capacity_no_overlap'
  ) THEN
    ALTER TABLE job_team
      ADD CONSTRAINT job_team_capacity_no_overlap
        EXCLUDE USING gist (
          user_email WITH =,
          tstzrange(assigned_from, assigned_to, '[)') WITH &&
        )
        WHERE (
          assigned_from IS NOT NULL
          AND assigned_to IS NOT NULL
          AND state IN ('proposed', 'confirmed')
          AND is_override = false
        );
  END IF;
END $$;

-- ── 3. Crew-lead exactly-one-per-job ─────────────────────────
-- Partial UNIQUE on (job_id) WHERE the row is the lead AND is
-- still live. Cancel / decline frees the slot automatically.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_job_team_crew_lead
  ON job_team (job_id)
  WHERE is_crew_lead = true
    AND state IN ('proposed', 'confirmed');

-- ── 4. Read-path indexes ─────────────────────────────────────
-- The F10.4-b engine's hottest query — capacity overlap by
-- person across active states.
CREATE INDEX IF NOT EXISTS idx_job_team_capacity
  ON job_team
  USING gist (
    user_email,
    tstzrange(assigned_from, assigned_to, '[)')
  )
  WHERE state IN ('proposed', 'confirmed')
    AND assigned_from IS NOT NULL;

-- "Show me every assignment for a job" — the apply-flow preview
-- and the §5.12.7 capacity calendar drilldown.
CREATE INDEX IF NOT EXISTS idx_job_team_job_state
  ON job_team (job_id, state, assigned_from);

-- "Show me overrides last week" — admin audit panel parallel to
-- equipment_reservations idx_equipment_reservations_overrides.
CREATE INDEX IF NOT EXISTS idx_job_team_overrides
  ON job_team (created_at DESC)
  WHERE is_override = true;

-- ── 5. CREATE personnel_skills ───────────────────────────────
CREATE TABLE IF NOT EXISTS personnel_skills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email          TEXT NOT NULL,
  -- Open enum — rpls / lsit / field_tech / party_chief /
  -- drone_pilot_part_107 / osha_30 / flagger / cdl_class_a /
  -- instrument_specialist_total_station / instrument_specialist_gnss
  -- / custom strings allowed. Lower-cased on insert by the
  -- F10.4 admin UI; no DB-level CHECK to keep additions cheap.
  skill_code          TEXT NOT NULL,
  acquired_at         DATE,
  -- NULL = doesn't expire (e.g. internal training); non-NULL =
  -- the F10.4-b engine reads this against the assignment
  -- window to fire the cert-expiry-during-window check.
  expires_at          DATE,
  -- §5.6 files bucket URL for the cert PDF. The F10.4 admin
  -- skills page surfaces a link/preview; OBE on revoke.
  cert_document_url   TEXT,
  state               TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'expired', 'revoked')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Skill lookup by person — the engine's first read for every
-- slot validation.
CREATE INDEX IF NOT EXISTS idx_personnel_skills_user_state
  ON personnel_skills (user_email, state, skill_code);

-- Reverse: "who has this skill?" — typeahead picker filter on
-- the apply-flow slot widgets.
CREATE INDEX IF NOT EXISTS idx_personnel_skills_active_skill
  ON personnel_skills (skill_code)
  WHERE state = 'active';

-- Cert-expiry sweep — drives the future "skills expiring in
-- the next 30 days" admin reminder.
CREATE INDEX IF NOT EXISTS idx_personnel_skills_expires
  ON personnel_skills (expires_at)
  WHERE expires_at IS NOT NULL AND state = 'active';

-- ── 6. CREATE personnel_unavailability ───────────────────────
CREATE TABLE IF NOT EXISTS personnel_unavailability (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email          TEXT NOT NULL,
  unavailable_from    TIMESTAMPTZ NOT NULL,
  unavailable_to      TIMESTAMPTZ NOT NULL,
  kind                TEXT NOT NULL
    CHECK (kind IN ('pto', 'sick', 'training', 'doctor', 'other')),
  reason              TEXT,
  is_paid             BOOLEAN NOT NULL DEFAULT false,
  approved_by         TEXT,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (unavailable_to > unavailable_from)
);

-- Overlap queries by person — the engine's unavailability check.
CREATE INDEX IF NOT EXISTS idx_personnel_unavailability_window
  ON personnel_unavailability
  USING gist (
    user_email,
    tstzrange(unavailable_from, unavailable_to, '[)')
  );

-- "Show me PTO this week" admin views.
CREATE INDEX IF NOT EXISTS idx_personnel_unavailability_window_btree
  ON personnel_unavailability (user_email, unavailable_from);

-- ── 7. updated_at triggers ───────────────────────────────────
CREATE OR REPLACE FUNCTION personnel_capacity_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_personnel_skills_touch_updated_at
  ON personnel_skills;
CREATE TRIGGER trg_personnel_skills_touch_updated_at
  BEFORE UPDATE ON personnel_skills
  FOR EACH ROW EXECUTE FUNCTION personnel_capacity_touch_updated_at();

DROP TRIGGER IF EXISTS trg_personnel_unavailability_touch_updated_at
  ON personnel_unavailability;
CREATE TRIGGER trg_personnel_unavailability_touch_updated_at
  BEFORE UPDATE ON personnel_unavailability
  FOR EACH ROW EXECUTE FUNCTION personnel_capacity_touch_updated_at();

COMMIT;
