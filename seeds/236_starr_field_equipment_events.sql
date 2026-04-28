-- seeds/236_starr_field_equipment_events.sql
--
-- Phase F10.0a-iv: equipment_events — universal append-only audit
-- log for every state change on an inventory unit (§5.12.1 + §5.12.6
-- + §5.12.11.K).
--
-- The plan calls this out repeatedly:
--   * §5.12.1: "Per-row event log: equipment_events table records
--     every state change (assigned / checked-out / checked-in /
--     maintenance / loaned-out / damaged / retired) with actor,
--     timestamp, and free-form note. IRS-grade audit trail and
--     also feeds the §5.12.6 reconcile dashboard."
--   * §5.12.6: "Every transition emits a row into the §5.12.1
--     equipment_events audit log so a future 'who had this when it
--     broke?' query is one join away."
--   * §5.12.11.K (litigation hold): chain-of-custody PDF — every
--     check-out / check-in / damage / cal event for every piece of
--     gear used on the contested job, plus the operator history.
--
-- This table is the source of truth for "what happened to this
-- equipment row, in what order, by whom." Soft-deleted rows
-- (`retired_at IS NOT NULL` on equipment_inventory) keep their
-- event history for IRS retention; the litigation-hold action
-- freezes the events from any retention sweep.
--
-- Append-only by convention — no UPDATE / DELETE policies for
-- authenticated users. Service-role only operations land here via
-- the §5.12.6 RPC + the §5.12.5 reservation engine.
--
-- Apply AFTER seeds/233-235. Idempotent.
--
-- Subsequent F10.0a:
--   * 237 — equipment_templates + items + versions

BEGIN;

-- ── 1. The audit-log table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The inventory row this event belongs to. NOT NULL — every event
  -- is about exactly one unit. ON DELETE CASCADE because if a row
  -- ever does get hard-deleted (it shouldn't — soft-delete is the
  -- contract), its event history goes with it.
  equipment_id UUID NOT NULL,

  -- Open string for forward-compatibility — the audit log MUST NOT
  -- fail because a new code path emits a previously-unseen event
  -- type. Comment lists the canonical values; new ones land
  -- silently with no migration needed.
  --
  -- Canonical values (current as of Phase F10 spec):
  --   * created · imported · updated · retired · restored
  --     (§5.12.7.3 inventory CRUD)
  --   * assigned · reservation_held · reservation_cancelled
  --     (§5.12.5 reservations engine)
  --   * pre_staged (§5.12.7.1 evening prep)
  --   * checked_out · checked_in (§5.12.6 daily ritual)
  --   * damaged_returned · lost_returned (§5.12.6 condition paths)
  --   * maintenance_scheduled · maintenance_started ·
  --     maintenance_completed · maintenance_qa_failed · calibrated
  --     (§5.12.8 service lifecycle)
  --   * loaned_out · loan_returned (§5.12.11.B)
  --   * transferred (§5.12.11.D cross-office)
  --   * borrowed_during_field_work (§5.12.9.4 surveyor self-service)
  --   * override_applied (§5.12.5 soft-override)
  --   * litigation_hold_applied · litigation_hold_released
  --     (§5.12.11.K)
  event_type TEXT NOT NULL,

  -- Who did the thing. NULL only for system-emitted events
  -- (e.g. cron-driven maintenance auto-creation). The §5.12.7.4
  -- "Recently overridden past-cal" rollup keys off NOT NULL.
  actor_user_id UUID,

  -- Optional cross-link to a job. Drives the §5.12.11.K litigation
  -- chain-of-custody PDF for "every event for every piece of gear
  -- used on Job #427."
  job_id UUID,

  -- Optional cross-link to a reservation row. Lands once
  -- equipment_reservations exists (seeds/238). Stored as UUID
  -- with no FK constraint at this seed boundary so the table can
  -- be applied before the reservations table is created.
  reservation_id UUID,

  -- Optional cross-link to a maintenance event row. Lands once
  -- maintenance_events exists (seeds/240). Same FK-deferred
  -- pattern as reservation_id.
  maintenance_event_id UUID,

  -- Free-form context label. Override reasons, condition notes,
  -- damage descriptions, "left it on Truck 3 by mistake." Indexed
  -- via tsvector when full-text search lands as v2 polish.
  notes TEXT,

  -- Structured payload — per-event-type extra context (condition
  -- photo URLs, override reason category, before/after status, etc.).
  -- jsonb so per-event handlers can evolve without schema migrations.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Append-only — set on insert, never updated.
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ── 2. FK guards (DO blocks for idempotent re-apply) ──────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_events_equipment_fk'
     ) THEN
    ALTER TABLE equipment_events
      ADD CONSTRAINT equipment_events_equipment_fk
        FOREIGN KEY (equipment_id)
        REFERENCES equipment_inventory(id)
        ON DELETE CASCADE;
  END IF;
END $$;

-- jobs FK — only land if the jobs table is present (live Supabase
-- per §5.2 has it).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'jobs')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_events_job_fk'
     ) THEN
    ALTER TABLE equipment_events
      ADD CONSTRAINT equipment_events_job_fk
        FOREIGN KEY (job_id)
        REFERENCES jobs(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- reservation_id + maintenance_event_id FKs are intentionally
-- deferred to the seeds that create those tables (238, 240) — they
-- ALTER equipment_events to ADD CONSTRAINT once the target tables
-- exist. Keeps this seed self-contained.

-- ── 3. Indexes for the hot reads ──────────────────────────────────────────

-- Per-equipment chain-of-custody — the §5.12.7.3 inventory drilldown
-- "history" tab. Newest-first matches the typical view ordering.
CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment_time
  ON equipment_events (equipment_id, created_at DESC);

-- Per-job chain-of-custody — the §5.12.11.K litigation-hold PDF
-- generator scans every event row whose job_id matches the held
-- job. Partial because most events have job_id IS NULL (admin
-- inventory edits, system-emitted maintenance crons).
CREATE INDEX IF NOT EXISTS idx_equipment_events_job_time
  ON equipment_events (job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

-- Recent activity feed — drives the §5.12.7.1 Today landing page's
-- "what just happened" strip. Default range is last 24h, so the
-- DESC on created_at is the access pattern.
CREATE INDEX IF NOT EXISTS idx_equipment_events_recent
  ON equipment_events (created_at DESC);

-- Per-actor history — supports the rare "what did Henry do today?"
-- query + the §5.12.7.4 "Recently overridden past-cal" rollup.
-- Partial because actor NULL = system-emitted (most maintenance cron
-- rows fall here).
CREATE INDEX IF NOT EXISTS idx_equipment_events_actor_time
  ON equipment_events (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

-- Per-event-type filter — supports the §5.12.7.4 "show me every
-- override_applied this month" analytics query. GIN-on-text would
-- be overkill for a small enum-shaped column; btree is fine.
CREATE INDEX IF NOT EXISTS idx_equipment_events_type
  ON equipment_events (event_type, created_at DESC);

-- ── 4. RLS — append-only for service role ─────────────────────────────────
-- Enable RLS so authenticated users can't touch this table directly.
-- All inserts come through the service-role RPCs (§5.12.5
-- reservation engine + §5.12.6 check-in/out endpoints).
ALTER TABLE equipment_events ENABLE ROW LEVEL SECURITY;

-- Read policy — internal users (admin / equipment_manager / dispatch)
-- can SELECT. Filtering happens in-query at the application layer;
-- admins read everything, surveyors read events on equipment they
-- currently or recently held. v1 keeps this permissive at the SQL
-- layer; the API route gates per-role.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'equipment_events'
       AND policyname = 'equipment_events_authenticated_read'
  ) THEN
    CREATE POLICY equipment_events_authenticated_read
      ON equipment_events FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- No INSERT / UPDATE / DELETE policies for `authenticated` — service
-- role bypasses RLS so the worker + API can write. Authenticated
-- users get a 4xx on any write attempt, which is the correct
-- "append-only audit log" contract.

COMMIT;
