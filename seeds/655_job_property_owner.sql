-- seeds/655_job_property_owner.sql — the person who OWNS the land is not the person who hired us.
--
-- Owner, 2026-09-21: "current owner and client should be two different fields." He is right, and
-- the cost of them being one field is already on the books.
--
-- ── WHAT HAPPENED ON JOB 26144 ──────────────────────────────────────────────────────────────────
--
-- The job is "ROUND ROCK HOUSING AUTHORITY CUSHING DRIVE", at 1007 Cushing Drive in Round Rock.
-- Its `client_name` is EBBY GREEN — a person who works at the housing authority, and the only
-- name-shaped field a job had. The research prefill therefore handed "EBBY GREEN" to the county
-- clerk as the owner, spent all three of its name searches on it, and found nothing.
--
-- Nothing was broken. A grantor index records who signed a deed; it does not record the employee
-- who telephoned a surveyor. The record owner was CITY OF ROUND ROCK all along, and the firm's own
-- job title said the housing authority in capital letters two fields away.
--
-- `lib/research/owner-candidates.ts` now infers a better name from the job title and the client's
-- email domain, and that inference is worth keeping — most jobs will never have this column filled
-- in. But an inference is a guess, and when somebody at the office KNOWS who owns the land there
-- has been nowhere to write it down. This is that place.
--
-- ── WHY A COLUMN AND NOT A NOTE ─────────────────────────────────────────────────────────────────
--
-- The alternative was to keep reading the owner out of the job's title. That works until a title is
-- written for people rather than parsers — "SMITH TRACT REVISION", "LOT 4 RESURVEY", "THE ONE BY
-- THE WATER TOWER" — and it cannot be corrected by the person who spots the error, because there is
-- no field to correct. A run that searched the wrong name leaves no trace of having done so.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────────
--
-- It does not become required, and it does not out-rank the appraisal district. The research run
-- identifies the record owner from the county's own data and that answer wins; this column is the
-- starting point for the clerk's grantor/grantee search when the office already knows it, and a
-- correction when the inference is wrong. Left blank, nothing changes: the candidate inference
-- runs exactly as it does today.
--
-- `county` is deliberately not touched here. It already exists on `jobs`, the new-job form already
-- collects it, and `researchPrefillFromJob` already reads it — job 26144 simply has it blank, which
-- is a data problem on one row rather than a missing field.

alter table public.jobs
  add column if not exists owner_name text;

comment on column public.jobs.owner_name is
  'The CURRENT RECORD OWNER of the property, when the office knows it. Distinct from client_name, '
  'which is who hired us — on job 26144 those were "CITY OF ROUND ROCK" and "EBBY GREEN", and '
  'searching the clerk for the latter found nothing. Optional: when blank, the research run infers '
  'candidates from the job title and client email domain (lib/research/owner-candidates.ts), and in '
  'every case the county appraisal district''s answer outranks both.';

-- No index. This is read once when a research project is prefilled from a job, by primary key —
-- never searched across, never joined on.
