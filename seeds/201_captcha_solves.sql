-- ============================================================================
-- 201_captcha_solves.sql
-- STARR RECON — CAPTCHA solve telemetry table
--
-- Migration not yet applied; activates when CapSolver is provisioned.
--
-- Records every CAPTCHA solve attempt (success or failure) made by
-- worker/src/lib/captcha-solver.ts. Used for cost attribution per county/job
-- and for retry/escalation analytics.
--
-- Lifecycle:
--   - Phase 0 / current: stub solver no-ops recordSolveAttempt() —
--     no rows are written and this migration is intentionally NOT applied
--     against the live Supabase project.
--   - Phase A (CapSolver provisioned): recordSolveAttempt() writes one row
--     per attempt. This migration must be applied before flipping
--     CAPTCHA_PROVIDER=capsolver in production. See
--     docs/planning/in-progress/PHASE_A_INTEGRATION_PREP.md §"CapSolver
--     activation checklist" for the activation sequence.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS captcha_solves (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider that produced this attempt: 'capsolver' | 'stub'.
  -- 'stub' rows should never appear in production but are allowed for
  -- regression-testing the schema in lower environments.
  provider        text NOT NULL,

  -- One of: 'turnstile' | 'recaptcha-v2' | 'recaptcha-v2-invisible' |
  --         'recaptcha-v3' | 'recaptcha-enterprise' | 'hcaptcha' |
  --         'datadome' | 'unknown'
  challenge_type  text NOT NULL,

  -- Whether this attempt produced a usable token. Failures are recorded
  -- so we can compute success rate and cost-per-success.
  success         boolean NOT NULL,

  -- Estimated USD cost. Real CapSolver responses include the per-task cost;
  -- stubbed/cached attempts record 0.
  cost_estimate   numeric(10,4),

  -- Proxy URL the solve was bound to (CapSolver requires this for
  -- IP-bound challenges). Stored in URL form (no creds in plaintext —
  -- the solver strips credentials before recording).
  proxy_url       text,

  -- Originating job (research_projects.id) and adapter id (filename stem,
  -- per browser-factory KNOWN_ADAPTER_IDS) for attribution.
  job_id          uuid,
  adapter_id      text,

  -- Populated only for failed attempts. Provider-side error category
  -- (e.g. 'no_capacity', 'timeout', 'invalid_request').
  error_message   text,

  -- Wall-clock time the attempt took (ms). Useful for SLO tracking.
  duration_ms     integer,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot lookups:
--   1. "show me last 24h of solves for cost analysis"
--   2. "what's the success rate for this challenge type"
--   3. "trace a job's CAPTCHA history"
CREATE INDEX IF NOT EXISTS idx_captcha_solves_created_at
  ON captcha_solves (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captcha_solves_challenge_type_success
  ON captcha_solves (challenge_type, success);
CREATE INDEX IF NOT EXISTS idx_captcha_solves_job_id
  ON captcha_solves (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_captcha_solves_adapter_id
  ON captcha_solves (adapter_id) WHERE adapter_id IS NOT NULL;

-- Validity constraints. Kept loose because future challenge types may
-- be added before this migration is updated.
ALTER TABLE captcha_solves
  ADD CONSTRAINT captcha_solves_provider_chk
    CHECK (provider IN ('capsolver', 'stub'));

ALTER TABLE captcha_solves
  ADD CONSTRAINT captcha_solves_cost_nonnegative_chk
    CHECK (cost_estimate IS NULL OR cost_estimate >= 0);

ALTER TABLE captcha_solves
  ADD CONSTRAINT captcha_solves_duration_nonnegative_chk
    CHECK (duration_ms IS NULL OR duration_ms >= 0);

COMMIT;
