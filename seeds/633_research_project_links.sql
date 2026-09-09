-- seeds/633_research_project_links.sql — a research project belongs to a PROJECT and to any of its JOBS.
--
-- Owner, 2026-09-09 (the New Research Project modal redesign):
--   "the user can choose to add the research project to a job project so that they are linked. Job
--    projects can have multiple research projects linked to them. … if there are multiple jobs in
--    that project, those jobs will be shown, and the user can check which of the jobs the new
--    research project relates to. They can check all of the jobs within the project if they want to."
--
-- ── WHAT EXISTED ────────────────────────────────────────────────────────────────────────────────
--
-- `research_projects.job_id` (seed 090) — ONE job, nullable, with an index. Since seed 601 every job
-- belongs to a project (`jobs.project_id NOT NULL`), so a research project has been reachable from a
-- project only through whichever single job it named. A boundary survey and the topo on the same
-- tract share one piece of research; the column could record one of them.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────────────────────────
--
--   research_projects.project_id      the project the research is attached to (nullable — research
--                                     may exist before any engagement does)
--   research_project_jobs             which of that project's jobs the research relates to; zero,
--                                     some, or all of them
--
-- `job_id` is KEPT and mirrored to the first linked job, because the job page's research tab, the
-- research packet route and the project header all read it today. It stops being the source of
-- truth; the join table is. Nothing that reads `job_id` breaks, and nothing new should read it.
--
-- Backfill: every existing link (`job_id`) becomes a join row, and the project is taken from the job.

BEGIN;

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_research_projects_project ON research_projects(project_id);

COMMENT ON COLUMN research_projects.project_id IS
  'The engagement (public.projects) this research is attached to. Nullable: research may be started before a project exists. Set from the New Research Project modal (2026-09-09) or from a job deep link.';

CREATE TABLE IF NOT EXISTS research_project_jobs (
  research_project_id uuid NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  job_id              uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (research_project_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_research_project_jobs_job ON research_project_jobs(job_id);

COMMENT ON TABLE research_project_jobs IS
  'Which jobs a research project relates to — zero, some or all of the jobs in research_projects.project_id. The source of truth for the research ⇄ job link since 2026-09-09; research_projects.job_id mirrors the first row for older readers.';

-- ── Backfill from the single-job column ─────────────────────────────────────────────────────────
INSERT INTO research_project_jobs (research_project_id, job_id)
SELECT rp.id, rp.job_id
FROM research_projects rp
JOIN public.jobs j ON j.id = rp.job_id
WHERE rp.job_id IS NOT NULL
ON CONFLICT (research_project_id, job_id) DO NOTHING;

UPDATE research_projects rp
SET project_id = j.project_id
FROM public.jobs j
WHERE rp.job_id = j.id
  AND rp.project_id IS NULL
  AND j.project_id IS NOT NULL;

COMMIT;
