-- seeds/676_job_property_id.sql — every job records the appraisal district's Property ID.
--
-- Owner, 2026-10-14, building out the Jack Folsom project (P-2026-0018): "it doesn't seem like we
-- have a property ID field in the job creation menu. We need to have that field so we can include
-- the property ID number. Each job in a project should have a property ID number field, while the
-- project creation menu should not necessarily."
--
-- The client's own list for that project is keyed by Property ID (101002, 46857, 7387, …) — the
-- county appraisal district's number for the parcel, the one the Bell CAD lookup takes. Until now
-- there was nowhere on a job to write it, and lib/research/from-job.ts said so on every run
-- ("a job does not record one, so add it if you have it").
--
-- ── WHY ON THE JOB AND NOT THE PROJECT ──────────────────────────────────────────────────────────
--
-- A project holds several properties — Folsom's holds sixteen — and each has its own Property ID,
-- exactly as each job has its own address (2026-09-10). So it is a job column, and it is NOT one of
-- the fields a job inherits from its project (lib/projects/model.ts INHERITED_FIELDS).
--
-- ── WHY TEXT ────────────────────────────────────────────────────────────────────────────────────
--
-- It is an identifier, not a quantity. Other appraisal districts use letters and dashes
-- ("R123456", "12-345-67"), and a leading zero must survive. Named `property_id` because that is
-- what the CAD and the client call it; it is not a foreign key to anything here.
--
-- Additive; safe twice.

alter table public.jobs
  add column if not exists property_id text;

comment on column public.jobs.property_id is
  'The county appraisal district''s Property ID for this job''s parcel (e.g. Bell CAD 101002). '
  'Free text, not a foreign key. Per job, never inherited from the project — a project can hold '
  'many properties. Passed to research as the parcel id.';

-- Office staff look a job up by the number on the client's list, so it is searchable.
create index if not exists idx_jobs_property_id on public.jobs (property_id) where property_id is not null;
