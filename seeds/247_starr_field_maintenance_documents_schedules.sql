-- seeds/247_starr_field_maintenance_documents_schedules.sql
--
-- Phase F10.7-a — completes the §5.12.8 maintenance schema. The
-- `maintenance_events` table shipped in seeds/245 (F10.5-g-i)
-- alongside the damage/lost triage hooks. This seed adds the
-- two companion tables the full F10.7 phase needs:
--
--   maintenance_event_documents
--     PDF / photo attachments per maintenance event — calibration
--     certs (NIST), work orders, parts invoices, before/after
--     photos, QA reports. The §5.6 files-bucket pattern.
--
--   maintenance_schedules
--     Recurring rules attached to a specific equipment row OR a
--     category (e.g., "every total station gets annual NIST
--     cal"). Drives the 3am cron's auto-event-creation +
--     reservation hard-block when calibration lapses.
--
-- Apply AFTER seeds/245. Idempotent.

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. maintenance_event_documents
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_event_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE CASCADE so a deleted maintenance_event drops its
  -- attachments. The maintenance_event itself is rarely deleted
  -- (history matters); cancellation flips state instead. CASCADE
  -- is for the genuinely-bogus-row case.
  event_id        UUID NOT NULL,

  -- §5.12.8 enum — what kind of attachment.
  kind            TEXT NOT NULL
    CHECK (kind IN (
      'calibration_cert',
      'work_order',
      'parts_invoice',
      'before_photo',
      'after_photo',
      'qa_report',
      'other'
    )),

  -- Bucket reference. Re-uses the §5.6 files-bucket pattern with
  -- per-equipment-folder RLS. Calibration certs in particular
  -- need to be retrievable for years (NIST traceability) so the
  -- bucket lifecycle policy is "keep forever" for kind=
  -- calibration_cert.
  storage_url     TEXT NOT NULL,

  -- Original filename — useful for the EM dashboard's
  -- "download cal cert.pdf" link without a second roundtrip.
  filename        TEXT,

  -- Bytes; surfaced in the F10.7-d upload UX as a progress hint.
  size_bytes      BIGINT,

  -- Free-form context — "post-cal accuracy ±0.005 ft per the
  -- attached QA report" / "vendor short-shipped 1× battery".
  description     TEXT,

  uploaded_by     UUID,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_event_documents_event_fk'
  ) THEN
    ALTER TABLE maintenance_event_documents
      ADD CONSTRAINT maintenance_event_documents_event_fk
        FOREIGN KEY (event_id)
        REFERENCES maintenance_events(id)
        ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_event_documents_uploaded_by_fk'
  ) THEN
    ALTER TABLE maintenance_event_documents
      ADD CONSTRAINT maintenance_event_documents_uploaded_by_fk
        FOREIGN KEY (uploaded_by)
        REFERENCES auth.users(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- Per-event drilldown — every history-tab roundtrip reads this.
CREATE INDEX IF NOT EXISTS idx_maintenance_event_documents_event
  ON maintenance_event_documents (event_id, uploaded_at DESC);

-- "All cal certs ever for this instrument" — drives the
-- §5.12.11.K chain-of-custody + the §5.12.7.3 inventory drilldown
-- "service history" tab. JOINs through maintenance_events so the
-- index here is on uploaded_at; the join handles equipment_id.
CREATE INDEX IF NOT EXISTS idx_maintenance_event_documents_kind
  ON maintenance_event_documents (kind, uploaded_at DESC);

COMMENT ON COLUMN maintenance_event_documents.storage_url IS
  '§5.6 files-bucket reference. Per-equipment-folder RLS. Calibration certs (kind=calibration_cert) are kept-forever for NIST traceability; bucket lifecycle policy enforces retention. Other kinds follow the standard project-bundle retention.';

-- ──────────────────────────────────────────────────────────────
-- 2. maintenance_schedules
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- XOR target — schedule attaches to either a specific
  -- equipment unit OR a category (rare to need both; one of
  -- them is the canonical pattern for any given rule).
  --   specific: "Total Station #3 — annual NIST cal" (when the
  --             EM wants to override the category default for
  --             this one unit)
  --   category: "every total_station_kit gets annual cal"
  --             (the dominant pattern; one rule covers N units)
  equipment_inventory_id  UUID,
  category                TEXT,

  -- §5.12.8 kind enum — same set as maintenance_events.kind.
  -- Stored as TEXT so future kinds added to the events enum
  -- don't strand schedules; the F10.7-h cron defends against
  -- mismatched values at write-time.
  kind                TEXT NOT NULL
    CHECK (kind IN (
      'calibration',
      'repair',
      'firmware_update',
      'inspection',
      'cleaning',
      'scheduled_service',
      'damage_triage',
      'recall',
      'software_license'
    )),

  -- 12 = annual; 6 = semi-annual; 3 = quarterly; etc. INT to
  -- avoid float drift in date arithmetic. CHECK > 0 — a
  -- non-positive frequency would auto-create events forever.
  frequency_months    INT NOT NULL CHECK (frequency_months > 0),

  -- How far ahead the EM sees the alert + the 3am cron starts
  -- emitting reminders. Default 30 days.
  lead_time_days      INT NOT NULL DEFAULT 30
    CHECK (lead_time_days >= 0),

  -- When true (default), the F10.3-b status check hard-blocks
  -- reservations whose window extends past the next_due_at. The
  -- §5.12.5 calibration check already does soft-warn under
  -- calibration_overdue; this column escalates to hard-block per
  -- the spec's "calibration_hard_block_days" setting (which is
  -- a runtime override; this column is the per-schedule default).
  is_hard_block       BOOLEAN NOT NULL DEFAULT true,

  -- When true (default), the F10.7-h cron pre-creates a
  -- state='scheduled' maintenance_event when the next_due_at
  -- enters the lead window. When false, the cron only emits the
  -- notification — the EM creates the event manually if/when
  -- they decide to act.
  auto_create_event   BOOLEAN NOT NULL DEFAULT true,

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- XOR enforcement — exactly one of equipment_inventory_id or
-- category is set.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_schedules_target_xor_chk'
  ) THEN
    ALTER TABLE maintenance_schedules
      ADD CONSTRAINT maintenance_schedules_target_xor_chk
        CHECK (
          (equipment_inventory_id IS NOT NULL AND category IS NULL)
          OR
          (equipment_inventory_id IS NULL AND category IS NOT NULL)
        );
  END IF;
END $$;

-- FKs (conditional on referenced tables per the seeds/234+236
-- defensive pattern).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'maintenance_schedules_inventory_fk'
     ) THEN
    ALTER TABLE maintenance_schedules
      ADD CONSTRAINT maintenance_schedules_inventory_fk
        FOREIGN KEY (equipment_inventory_id)
        REFERENCES equipment_inventory(id)
        ON DELETE CASCADE;
  END IF;
END $$;

-- Read-path indexes
-- Per-equipment lookup ("does this unit have any active
-- schedules?") drives the §5.12.7.3 drilldown's "next due"
-- panel.
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_inventory
  ON maintenance_schedules (equipment_inventory_id)
  WHERE equipment_inventory_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_category
  ON maintenance_schedules (category)
  WHERE category IS NOT NULL;

-- The F10.7-h cron's hot read: "every active schedule, ordered
-- by kind." kind alone is selective enough since N is small.
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_kind
  ON maintenance_schedules (kind);

-- updated_at trigger — uses the same touch helper from
-- seeds/245's maintenance_events table.
DROP TRIGGER IF EXISTS trg_maintenance_schedules_touch_updated_at
  ON maintenance_schedules;
CREATE TRIGGER trg_maintenance_schedules_touch_updated_at
  BEFORE UPDATE ON maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION maintenance_events_touch_updated_at();

COMMIT;
