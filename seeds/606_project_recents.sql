-- seeds/606_project_recents.sql — which projects were touched most recently, and by whom
--
-- Owner, 2026-08-19: *"make there be a section for recent projects that shows the 5 most recent
-- projects that have been opened/created/worked on, and make there be search functionality so that
-- we can search for projects by date or range of time or key words like owner name or by who was
-- assigned to it."*
--
-- ── WHY "OPENED" NEEDS A TABLE ──────────────────────────────────────────────────────────────────
--
-- Two of the three verbs were already recorded. `projects.created_at` covers *created*, and
-- `updated_at` — on the project and on each of its jobs — covers *worked on*.
--
-- **Opened is not written down anywhere.** Reading a project changes nothing, which is exactly why
-- it is worth recording separately: the project somebody opened five times this week without
-- editing is the one they are actually working, and by every stored timestamp it looks untouched.
--
-- One row per person per project, upserted. Not an append-only log: the question is "when did you
-- last open this", and a log would grow without bound to answer a question that only ever needs the
-- newest row. `activity_log` was considered and rejected for the same reason — thousands of view
-- rows would bury the file and job events that table exists to keep.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_opens (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  open_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, user_email)
);

COMMENT ON TABLE public.project_opens IS
  'When each person last opened each project. Upserted, one row per (project, person) — the question is "when did you last open this", which only ever needs the newest value. `open_count` is kept because "opened eleven times" distinguishes a project being worked from one glanced at once.';

-- Ordered by recency, per person, which is how the Recent strip reads it.
CREATE INDEX IF NOT EXISTS project_opens_recent_idx
  ON public.project_opens (user_email, opened_at DESC);
-- And across everybody, for the firm-wide fallback when somebody has opened nothing yet.
CREATE INDEX IF NOT EXISTS project_opens_any_idx
  ON public.project_opens (opened_at DESC);

COMMIT;
