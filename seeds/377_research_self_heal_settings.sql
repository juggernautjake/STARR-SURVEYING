-- ============================================================================
-- 377_research_self_heal_settings.sql
--
-- Slice 1 of docs/planning/in-progress/research-self-heal-slice-1-manual-
-- sweep-2026-06-22.md.
--
-- A single-row settings table the admin UI reads + writes to toggle the
-- self-healing automation. The pure `apply-policy.ts` module already
-- defaults autoapply OFF; this gives an admin-editable override so the
-- user can flip it from the dashboard without a redeploy.
--
-- DEFAULTS ARE OFF, by user instruction:
--   - autoapply_enabled  = FALSE   (no AI proposal ever auto-applies)
--   - schedule_enabled   = FALSE   (no background cron runs)
--   - manual_sweep_enabled = TRUE  (the "Run check now" button still works
--                                   even with both other flags off — manual
--                                   is the explicit fallback)
--
-- Depends on: seeds/371_research_health_check_tables.sql.
-- Idempotent: re-runnable; CREATE IF NOT EXISTS + ON CONFLICT.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.research_self_heal_settings (
  -- Singleton row pattern: id is a constant so there's always exactly
  -- one row of settings. Reads + writes target the same id.
  id                              TEXT PRIMARY KEY DEFAULT 'singleton',
  autoapply_enabled               BOOLEAN NOT NULL DEFAULT FALSE,
  autoapply_confidence_threshold  NUMERIC(4,3) NOT NULL DEFAULT 0.9,
  reviewer_confidence_threshold   NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  require_canary_pass             BOOLEAN NOT NULL DEFAULT TRUE,
  schedule_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
  manual_sweep_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  last_manual_sweep_at            TIMESTAMPTZ,
  last_manual_sweep_by            TEXT,
  notes                           TEXT,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                      TEXT,
  -- Enforce single-row.
  CONSTRAINT research_self_heal_settings_singleton CHECK (id = 'singleton')
);

INSERT INTO public.research_self_heal_settings (id)
VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.research_self_heal_settings IS
  'Singleton row of admin-editable self-healing automation settings. Defaults are all-OFF; manual sweep button works regardless.';

COMMIT;
