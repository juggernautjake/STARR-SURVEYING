-- seeds/601_projects.sql — the container the firm actually works in
--
-- Owner, 2026-08-19: *"We have it so that we can create a new job or edit jobs, but what I want is
-- for us to be able to create new projects, and then within the project we can create a new job. We
-- would then be able to have multiple jobs within a project."*
--
-- ── WHY THIS IS A NEW TABLE AND NOT A COLUMN ────────────────────────────────────────────────────
--
-- A surveying engagement is rarely one job. The Smith Tract is bought, and it needs a boundary
-- survey, then a topo, then construction staking, then an as-built — four jobs, one client, one
-- parcel, one relationship, spread over months. Today each of those is an unrelated row that
-- happens to repeat the same client name and address, typed in four times, with four chances to
-- disagree. Nothing in the schema knows they are the same piece of work.
--
-- `jobs.project_id` alone would not have fixed that: the shared facts still would have had no
-- home, so the fourth job would still be a retyped copy of the first. The project OWNS the client
-- and the site; a job inherits them at creation and may override.
--
-- ── NUMBERING ───────────────────────────────────────────────────────────────────────────────────
--
-- Job numbers are LEFT ALONE. `2026-0007` is already on quotes, invoices, drawings and file names,
-- and renumbering it inside a project (`2026-014.1`) would change the meaning of paper the firm has
-- already sent out. Projects get a separate, visibly different sequence — `P-2026-0014` — so a
-- number can never be mistaken for the other kind.
--
-- ── THE NOT NULL, AND WHY IT COMES LAST ─────────────────────────────────────────────────────────
--
-- Every job belongs to a project (owner's decision, 2026-08-19). That is enforced in the database,
-- not just in the form, because a rule enforced only in one route is a rule that the next route
-- forgets. But a NOT NULL cannot be added to a populated table: the column is added nullable, every
-- existing job is given a project built from its own client and site data, and only then is the
-- constraint applied. Doing it in the other order fails on the first row.

BEGIN;

-- ── The table ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,

  project_number text UNIQUE,
  name text NOT NULL,
  description text,

  -- active | on_hold | complete | cancelled. Deliberately NOT derived from the jobs inside it: a
  -- project can be on hold while a job in it is still being closed out, and a status that is
  -- computed cannot be set by the person who knows.
  status text NOT NULL DEFAULT 'active',

  -- ── The client, owned here and inherited by every job ─────────────────────────────────────────
  customer_id uuid,
  client_name text,
  client_email text,
  client_phone text,
  client_company text,
  client_address text,

  -- ── The site, likewise ───────────────────────────────────────────────────────────────────────
  address text,
  city text,
  state text,
  zip text,
  county text,
  subdivision text,
  abstract_number text,
  lot_number text,
  acreage numeric,
  latitude double precision,
  longitude double precision,

  lead_rpls_email text,
  notes text,
  is_archived boolean NOT NULL DEFAULT false,
  is_priority boolean NOT NULL DEFAULT false,

  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.projects IS
  'A client engagement on a parcel. Owns the client and site facts; its jobs inherit them. Money is NOT stored here — it is summed from the jobs, so the two can never disagree.';

CREATE INDEX IF NOT EXISTS projects_live_idx ON public.projects (deleted_at, is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_customer_idx ON public.projects (customer_id);
CREATE INDEX IF NOT EXISTS projects_number_idx ON public.projects (project_number);

-- ── The link ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS project_id uuid;

-- ── Backfill: one project per existing job, built from that job's own facts ─────────────────────
--
-- One-per-job rather than a single "Unassigned" bucket, because a shared bucket would put unrelated
-- clients and parcels in one container and somebody would later have to guess which job belonged
-- with which. A project of one job is honest and can be merged by hand; a project of everything is
-- a lie that cannot be undone.
--
-- Numbered from the job's own year so the sequence looks deliberate rather than backfilled.
INSERT INTO public.projects (
  id, org_id, project_number, name, description, status,
  customer_id, client_name, client_email, client_phone, client_company, client_address,
  address, city, state, zip, county, subdivision, abstract_number, lot_number, acreage,
  latitude, longitude, lead_rpls_email, is_archived, created_by, created_at, updated_at, deleted_at
)
SELECT
  gen_random_uuid(),
  j.org_id,
  'P-' || to_char(COALESCE(j.created_at, now()), 'YYYY') || '-'
       || lpad((row_number() OVER (PARTITION BY to_char(COALESCE(j.created_at, now()), 'YYYY')
                                   ORDER BY j.created_at, j.id))::text, 4, '0'),
  j.name,
  'Created automatically so an existing job had a project to belong to.',
  CASE WHEN j.deleted_at IS NOT NULL THEN 'cancelled'
       WHEN j.is_archived THEN 'complete'
       ELSE 'active' END,
  j.customer_id, j.client_name, j.client_email, j.client_phone, j.client_company, j.client_address,
  j.address, j.city, j.state, j.zip, j.county, j.subdivision, j.abstract_number, j.lot_number, j.acreage,
  j.latitude, j.longitude, j.lead_rpls_email, COALESCE(j.is_archived, false),
  j.created_by, COALESCE(j.created_at, now()), now(),
  -- A project whose only job is in the bin belongs in the bin too, or the project list fills with
  -- containers for work that was thrown away.
  j.deleted_at
FROM public.jobs j
WHERE j.project_id IS NULL;

-- Point each job at the project just made from it. Matched on the fields that came from the job,
-- which is exact here because the insert above created exactly one row per job.
UPDATE public.jobs j
SET project_id = p.id
FROM public.projects p
WHERE j.project_id IS NULL
  AND p.name = j.name
  AND p.created_at = COALESCE(j.created_at, p.created_at)
  AND p.description = 'Created automatically so an existing job had a project to belong to.';

-- ── Only now can the rule be enforced ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jobs WHERE project_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill missed % job(s); refusing to add NOT NULL',
      (SELECT count(*) FROM public.jobs WHERE project_id IS NULL);
  END IF;
END $$;

ALTER TABLE public.jobs ALTER COLUMN project_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_project_id_fkey'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_project_id_fkey FOREIGN KEY (project_id)
      REFERENCES public.projects(id) ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON COLUMN public.jobs.project_id IS
  'The project this job belongs to. NOT NULL by owner decision 2026-08-19: every job has a project. ON DELETE RESTRICT so a project cannot be hard-deleted out from under its jobs.';

CREATE INDEX IF NOT EXISTS jobs_project_idx ON public.jobs (project_id, deleted_at);

COMMIT;
