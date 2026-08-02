-- seeds/530_research_runs.sql — a research run that outlives the process running it (plan R3).
--
-- ── WHAT IS LOST TODAY ─────────────────────────────────────────────────────────────────────────
--
-- `worker/src/index.ts` keeps `activePipelines`, `completedResults` and `completedLogs` in
-- in-process `Map`s. A 25-minute run on a box that restarts, OOMs, or simply gets a deploy loses
-- everything about it — including the fact that it already bought documents. The app polls
-- `/research/status/:projectId`, gets nothing, and shows a run that was half-finished as though it
-- had never been started.
--
-- The documents and extracted data themselves are safe: those go to Supabase as they are produced.
-- What vanishes is the RUN — its phase, its clock, its spend, and whether it finished. That is
-- exactly the part somebody needs to answer "what happened to my research?".
--
-- ── WHY THIS IS NOT A JOB QUEUE ────────────────────────────────────────────────────────────────
--
-- BullMQ and Redis are already dependencies and `infra/job-queue.ts` exists; moving the primary
-- pipeline onto it is a larger change and is still the right end state. This table is the smaller
-- and more urgent half: **a durable record of what a run was doing**, so a restart produces an
-- honest answer instead of silence.
--
-- The distinction matters for what this table promises. It does NOT resume a half-finished
-- pipeline — the pipeline has no checkpoints to resume from. It guarantees that an interrupted run
-- is *visible as interrupted*, with its phase, its elapsed time, and its spend, so a person can
-- decide whether to re-run rather than being told nothing at all.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS research_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_project_id uuid NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  org_id            uuid REFERENCES organizations(id),

  -- running → complete | failed | interrupted | cancelled.
  -- `interrupted` is its own state and not a kind of `failed`: the research did not fail, the
  -- process holding it stopped. Somebody reading a list of failures should not have to work out
  -- which ones were actually deploys.
  status            text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'complete', 'failed', 'interrupted', 'cancelled')),

  county            text,
  address           text,

  -- Where it had got to. Updated at every phase boundary, which is also where the budget is checked.
  phase             text,
  message           text,

  started_at        timestamptz NOT NULL DEFAULT now(),
  -- Touched on every phase update. A `running` row whose heartbeat is old is how a restart detects
  -- a run its predecessor was in the middle of — the process that would have finished it is gone,
  -- and no amount of waiting brings it back.
  heartbeat_at      timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,

  -- What it spent before it stopped. The reason this table exists at all: an interrupted run that
  -- had already bought $12 of plats must not look identical to one that had spent nothing.
  cost_usd          numeric(12,6) NOT NULL DEFAULT 0,
  paid_pages        integer NOT NULL DEFAULT 0,

  -- The ceilings it was given (plan R5), so a run can be explained after the fact.
  limits            jsonb NOT NULL DEFAULT '{}',
  -- Work the budget caused it to skip, with reasons.
  skipped_work      jsonb NOT NULL DEFAULT '[]',
  -- Set when a ceiling ended the run early.
  budget_summary    text,

  failure_reason    text,
  -- Which build was running. An interrupted run is usually a deploy, and this says which one.
  worker_build      text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- "Is anything running for this project" and "what was the last run" — the two questions the status
-- endpoint asks.
CREATE INDEX IF NOT EXISTS idx_research_runs_project
  ON research_runs (research_project_id, started_at DESC);

-- The recovery sweep: rows still marked running when a new process boots.
CREATE INDEX IF NOT EXISTS idx_research_runs_running
  ON research_runs (heartbeat_at) WHERE status = 'running';

COMMENT ON TABLE research_runs IS
  'One row per research run, durable across worker restarts (plan R3). The documents a run produces '
  'are already persisted as they are found; this records the RUN — phase, clock, spend, outcome — so '
  'a restart can report an interrupted run honestly instead of showing nothing.';

COMMENT ON COLUMN research_runs.status IS
  'interrupted is NOT a kind of failed: the research did not fail, the process holding it stopped. '
  'Usually a deploy. Keeping them apart is what stops a deploy looking like a research problem.';

COMMENT ON COLUMN research_runs.cost_usd IS
  'Spend at the moment of the last heartbeat. An interrupted run that had already bought $12 of '
  'plats must not look identical to one that had spent nothing — that difference decides whether '
  'somebody re-runs it.';
