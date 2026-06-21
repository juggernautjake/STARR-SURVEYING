-- ============================================================================
-- 371_research_health_check_tables.sql
--
-- §9.2 + §9.3 + §9.4 of
-- docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md
--
-- The self-healing layer's data model. Three tables — all idempotent —
-- hanging off the research_site_adapters table from seed 370:
--
--   - research_adapter_canaries          §9.2 golden records captured
--                                        at registration; the
--                                        "what the adapter should
--                                        return when working" baseline.
--   - research_adapter_health_checks     §9.3 timestamped check runs;
--                                        one row per scheduled or
--                                        failure-triggered execution.
--   - research_adapter_change_proposals  §9.4 AI-diagnosed repair
--                                        proposals waiting for review
--                                        (or auto-applied behind the
--                                        feature flag).
--
-- The pure helpers from slices 7 (canary-diff) and 8 (dom-fingerprint)
-- write into the jsonb columns on these tables. The §9.4 agent reads
-- the failed health-check row + the canary + the live page snapshot
-- and writes a proposal row.
--
-- Depends on: seeds/370_research_adapter_registry.sql (this seed only
-- adds tables; no migration to the seed-370 tables).
-- ============================================================================

BEGIN;

-- ── Health-check status enum ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.research_health_status_enum AS ENUM
    ('healthy', 'degraded', 'broken', 'no_record', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Change-proposal status enum ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.research_change_proposal_status_enum AS ENUM
    ('proposed', 'approved', 'rejected', 'applied', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §9.2 research_adapter_canaries ───────────────────────────────────────
-- Golden record per adapter captured at registration (§8.5). When the
-- adapter is re-baselined after an approved repair (§9.5), a new row is
-- inserted with a fresher captured_at; older rows are kept (is_active =
-- FALSE on prior rows) so we have history of "what we thought working
-- looked like" at each baseline.
CREATE TABLE IF NOT EXISTS public.research_adapter_canaries (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id               UUID NOT NULL REFERENCES public.research_site_adapters(id) ON DELETE CASCADE,
  query_input              JSONB NOT NULL DEFAULT '{}',     -- {parcel_id, address, owner_name}
  expected_fields          JSONB NOT NULL DEFAULT '{}',     -- subset of CanonicalProperty
  baseline_dom_hash        TEXT,                            -- SHA-256 from fingerprintHtml() (slice 8)
  baseline_dom_skeleton    TEXT,                            -- the canonicalized skeleton string
  baseline_screenshot_ref  TEXT,                            -- storage URL / object key
  notes                    TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  captured_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               TEXT,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_research_adapter_canaries_adapter_active
  ON public.research_adapter_canaries(adapter_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_research_adapter_canaries_captured
  ON public.research_adapter_canaries(adapter_id, captured_at DESC);
COMMENT ON TABLE public.research_adapter_canaries IS
  '§9.2 — canary golden records. One active row per adapter; history is preserved (is_active=FALSE on prior baselines).';


-- ── §9.3 research_adapter_health_checks ─────────────────────────────────
-- One row per check run. layer_results is a structured rollup of the
-- three §9.1 layers (structural / visual / semantic). diff_summary is
-- the human-readable single-line for the §9.8 dashboard. cost_tokens
-- tracks AI spend per check so we can budget the scheduled cadence
-- (§9.7) once that's flagged on.
CREATE TABLE IF NOT EXISTS public.research_adapter_health_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id          UUID NOT NULL REFERENCES public.research_site_adapters(id) ON DELETE CASCADE,
  canary_id           UUID REFERENCES public.research_adapter_canaries(id) ON DELETE SET NULL,
  ran_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_by        TEXT NOT NULL DEFAULT 'scheduled',    -- scheduled / manual / failure / registration
  status              public.research_health_status_enum NOT NULL,
  -- {structural: {severity, similarity, removed[], added[]},
  --  semantic:   {severity, produced_record, missing_fields[], changed_fields[]},
  --  visual:     {severity, ai_vision_verdict}}
  layer_results       JSONB NOT NULL DEFAULT '{}',
  diff_summary        TEXT,
  screenshot_ref      TEXT,
  http_status         INTEGER,
  cost_tokens         INTEGER DEFAULT 0,
  error_message       TEXT,
  duration_ms         INTEGER,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_research_adapter_health_checks_adapter_ran
  ON public.research_adapter_health_checks(adapter_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_adapter_health_checks_failures
  ON public.research_adapter_health_checks(adapter_id, ran_at DESC)
  WHERE status IN ('degraded', 'broken', 'error');
COMMENT ON TABLE public.research_adapter_health_checks IS
  '§9.3 — timestamped health-check runs. layer_results stores per-§9.1-layer outcomes.';


-- ── §9.4 research_adapter_change_proposals ──────────────────────────────
-- AI-diagnosed repair proposals. When a health check trips broken, the
-- §9.4 diagnose-and-repair agent loads the failed page snapshot,
-- compares to the canary, proposes a new adapter config / field_map,
-- tests it against the canary, and writes one row here. §9.5 controls
-- whether the proposal auto-applies (RESEARCH_SELF_HEAL_AUTOAPPLY flag
-- + confidence threshold) or waits in the review queue.
CREATE TABLE IF NOT EXISTS public.research_adapter_change_proposals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id          UUID NOT NULL REFERENCES public.research_site_adapters(id) ON DELETE CASCADE,
  health_check_id     UUID REFERENCES public.research_adapter_health_checks(id) ON DELETE SET NULL,
  prior_config        JSONB NOT NULL DEFAULT '{}',          -- snapshot for rollback
  prior_field_map     JSONB NOT NULL DEFAULT '{}',
  proposed_config     JSONB NOT NULL DEFAULT '{}',
  proposed_field_map  JSONB NOT NULL DEFAULT '{}',
  diff                JSONB NOT NULL DEFAULT '{}',          -- structured diff for the dashboard
  rationale           TEXT NOT NULL,                        -- agent's plain-text explanation
  confidence          NUMERIC(4,3) NOT NULL DEFAULT 0,      -- 0..1
  canary_test_passed  BOOLEAN,                              -- nullable until tested
  canary_test_summary TEXT,
  status              public.research_change_proposal_status_enum NOT NULL DEFAULT 'proposed',
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT,
  applied_at          TIMESTAMPTZ,
  cost_tokens         INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_research_adapter_change_proposals_pending
  ON public.research_adapter_change_proposals(adapter_id, created_at DESC)
  WHERE status = 'proposed';
CREATE INDEX IF NOT EXISTS idx_research_adapter_change_proposals_adapter
  ON public.research_adapter_change_proposals(adapter_id, created_at DESC);
COMMENT ON TABLE public.research_adapter_change_proposals IS
  '§9.4 — AI-proposed adapter repairs. prior_config + prior_field_map kept so applies are reversible.';


-- ── updated_at triggers ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_research_adapter_canaries_updated
    BEFORE UPDATE ON public.research_adapter_canaries
    FOR EACH ROW EXECUTE FUNCTION public.research_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_research_adapter_change_proposals_updated
    BEFORE UPDATE ON public.research_adapter_change_proposals
    FOR EACH ROW EXECUTE FUNCTION public.research_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- (health_checks rows are write-once — append-only audit trail. No
-- updated_at trigger; the `ran_at` column is the timeline anchor.)

COMMIT;
