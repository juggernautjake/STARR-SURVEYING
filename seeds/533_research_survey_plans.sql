-- 533_research_survey_plans.sql — the gameplan, kept (plan R21).
--
-- `generateSurveyPlan()` says it in its own docstring: "The plan is generated fresh each time (no DB
-- caching) because the underlying data changes as analysis progresses." Three consequences:
--
--   1. Regenerating silently discards the previous plan. Anything a person added to it is gone.
--   2. There is no record of what the plan SAID when the crew went to the field — which is the
--      version that matters if the survey is ever questioned.
--   3. Nothing can be compared, so "what changed since last time" has no answer.
--
-- ── THE AI ORIGINAL IS IMMUTABLE ────────────────────────────────────────────────────────────────
--
-- `ai_plan` is written once and never updated. Human changes go in `edits` as a separate overlay,
-- exactly the contract `rendered_drawings.user_annotations` already honours for markup: the source
-- is never modified, so "what did the machine actually say" remains answerable after a person has
-- reworked it. Merging the two at write time would destroy the only copy of the original.

CREATE TABLE IF NOT EXISTS research_survey_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,

    -- Monotonic per project. Version 1 is the first plan ever generated for the property.
    version             INTEGER NOT NULL,

    -- The machine's plan, as generated. NEVER updated after insert.
    ai_plan             JSONB NOT NULL,
    -- A person's overlay: changed fields, added items, removed items. Null until somebody edits.
    edits               JSONB,

    -- Why this version exists — "first plan", "re-run after buying the 1968 deed", "regenerated
    -- after the replat was found". Without it a version list is a list of timestamps.
    reason              TEXT,

    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_by        TEXT,
    edited_at           TIMESTAMPTZ,
    edited_by           TEXT,

    -- The version a field crew is working from. At most one per project, enforced below: two
    -- "current" plans is precisely the ambiguity this table exists to remove.
    is_current          BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_plans_version
    ON research_survey_plans (research_project_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_plans_one_current
    ON research_survey_plans (research_project_id)
    WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_survey_plans_project
    ON research_survey_plans (research_project_id, version DESC);
