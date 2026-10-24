-- seeds/676_record_activity.sql — what was touched last, and a change log for every job and project.
--
-- Owner, 2026-10-11: *"whatever project was last modified should show up first at the top of the
-- list. If someone has gone into a project and uploaded a file or changed/updated information about
-- the job, then it should be updated to the top of the list. All file additions and changes for each
-- project and job should be tracked and logged."* And: *"It is more helpful to see jobs that are
-- being actively viewed and modified."*
--
-- ── WHY THIS LIVES IN THE DATABASE ──────────────────────────────────────────────────────────────
--
-- `job_files` is written by at least eight server routes AND by the mobile app straight through
-- Supabase (its upload queue), which no API route ever sees. A "touch the job" call sprinkled
-- through the routes would miss the phone — the place most site photos come from — and the next
-- route somebody writes. Triggers see every write, whoever makes it.
--
-- ── WHAT IS HERE ────────────────────────────────────────────────────────────────────────────────
--
--   job_activity / project_activity — one row per job / project: when it was last MODIFIED (and by
--     whom), when it was last VIEWED (and by whom), and `last_activity_at`, the later of the two,
--     which is what the lists sort by. Kept OFF the `jobs` / `projects` rows on purpose: `jobs` has
--     an `updated_at` trigger, so stamping a view onto it would make every page open look like an
--     edit, and would push a sync to every phone holding the job.
--
--   record_changes — the change log. One row per real change to a job, a project, a job/project
--     file, a job folder or a job's team: who, when, what kind, and for an edit the fields that moved
--     (from → to). Read by the job Activity tab and the project History section.
--
-- ── WHO DID IT ──────────────────────────────────────────────────────────────────────────────────
--
-- Server routes write with the service role, so the database cannot see the person. Each audited
-- table gets a write-only `change_actor` column: a route puts the signed-in email in it, the BEFORE
-- trigger reads it into a transaction-local setting and blanks it, and the AFTER trigger logs it. It
-- is blanked so a later write that does NOT name anybody cannot inherit the previous person. The
-- phone writes as a signed-in Supabase user, so its email comes from the JWT. Neither → 'system'.
--
-- Idempotent.

BEGIN;

-- ── The actor hint column ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.jobs             ADD COLUMN IF NOT EXISTS change_actor text;
ALTER TABLE public.projects         ADD COLUMN IF NOT EXISTS change_actor text;
ALTER TABLE public.job_files        ADD COLUMN IF NOT EXISTS change_actor text;
ALTER TABLE public.job_file_folders ADD COLUMN IF NOT EXISTS change_actor text;
ALTER TABLE public.job_team         ADD COLUMN IF NOT EXISTS change_actor text;

COMMENT ON COLUMN public.jobs.change_actor IS
  'Write-only: the email of whoever is making this write, for the change log (seeds/676). Always blank once stored.';

-- ── Last modified / last viewed ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_activity (
  job_id           uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  last_modified_at timestamptz,
  last_modified_by text,
  last_viewed_at   timestamptz,
  last_viewed_by   text,
  last_activity_at timestamptz GENERATED ALWAYS AS (GREATEST(last_modified_at, last_viewed_at)) STORED
);
CREATE INDEX IF NOT EXISTS job_activity_recent_idx ON public.job_activity (last_activity_at DESC);

CREATE TABLE IF NOT EXISTS public.project_activity (
  project_id       uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  last_modified_at timestamptz,
  last_modified_by text,
  last_viewed_at   timestamptz,
  last_viewed_by   text,
  last_activity_at timestamptz GENERATED ALWAYS AS (GREATEST(last_modified_at, last_viewed_at)) STORED
);
CREATE INDEX IF NOT EXISTS project_activity_recent_idx ON public.project_activity (last_activity_at DESC);

COMMENT ON TABLE public.job_activity IS
  'When each job was last modified and last viewed (seeds/676). Modified is kept by triggers on jobs, job_files, job_file_folders and job_team; viewed by POST /api/admin/jobs/<id>/open. The jobs list sorts by last_activity_at.';
COMMENT ON TABLE public.project_activity IS
  'When each project was last modified (itself, any of its jobs, or any of their files) and last viewed (seeds/676). The projects list sorts by last_activity_at.';

-- ── The change log ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.record_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Both set whenever known, so a project's history is one query that includes its jobs'.
  project_id  uuid,
  job_id      uuid,
  subject     text NOT NULL CHECK (subject IN ('project', 'job', 'file', 'folder', 'team')),
  subject_id  uuid,
  -- created · updated · deleted · restored · renamed · moved · removed · purged
  action      text NOT NULL,
  actor       text NOT NULL DEFAULT 'system',
  -- The fields that moved: { "<column>": { "from": …, "to": … } }. Long text is trimmed.
  changes     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The subject's name at the time (file name, folder name, team member), so a row still reads
  -- correctly after the thing is renamed or purged.
  label       text
);
CREATE INDEX IF NOT EXISTS record_changes_job_idx     ON public.record_changes (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS record_changes_project_idx ON public.record_changes (project_id, created_at DESC);

COMMENT ON TABLE public.record_changes IS
  'Change log for jobs, projects, their files, job folders and job teams (seeds/676) — written only by triggers, so the mobile app''s direct uploads are logged too.';

ALTER TABLE public.job_activity     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_changes   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.job_activity;
CREATE POLICY service_role_all ON public.job_activity FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.project_activity;
CREATE POLICY service_role_all ON public.project_activity FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.record_changes;
CREATE POLICY service_role_all ON public.record_changes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

-- The person behind the current write: the route's hint, else the signed-in phone user, else system.
CREATE OR REPLACE FUNCTION public.rc_actor(hint text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims text := current_setting('request.jwt.claims', true);
  email  text;
BEGIN
  IF hint IS NOT NULL AND btrim(hint) <> '' THEN RETURN btrim(hint); END IF;
  IF claims IS NOT NULL AND claims <> '' THEN
    BEGIN
      email := claims::jsonb ->> 'email';
    EXCEPTION WHEN others THEN
      email := NULL;
    END;
  END IF;
  RETURN COALESCE(NULLIF(email, ''), 'system');
END $$;

-- The fields that differ between two versions of a row, minus the ones nobody edits by hand.
CREATE OR REPLACE FUNCTION public.rc_diff(old_row jsonb, new_row jsonb, ignored text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object(
           'from', CASE WHEN jsonb_typeof(old_row -> k) = 'string' AND length(old_row ->> k) > 300
                        THEN to_jsonb(left(old_row ->> k, 300) || '…') ELSE old_row -> k END,
           'to',   CASE WHEN jsonb_typeof(new_row -> k) = 'string' AND length(new_row ->> k) > 300
                        THEN to_jsonb(left(new_row ->> k, 300) || '…') ELSE new_row -> k END)),
         '{}'::jsonb)
  FROM jsonb_object_keys(new_row) AS k
  WHERE NOT (k = ANY (ignored))
    AND (old_row -> k) IS DISTINCT FROM (new_row -> k);
$$;

-- Stamp "modified now by <actor>" on a job and/or a project.
CREATE OR REPLACE FUNCTION public.rc_touch(p_job uuid, p_project uuid, p_actor text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj uuid := p_project;
BEGIN
  IF p_job IS NOT NULL THEN
    INSERT INTO public.job_activity (job_id, last_modified_at, last_modified_by)
    SELECT p_job, now(), p_actor WHERE EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job)
    ON CONFLICT (job_id) DO UPDATE SET last_modified_at = now(), last_modified_by = EXCLUDED.last_modified_by;
    IF proj IS NULL THEN SELECT project_id INTO proj FROM public.jobs WHERE id = p_job; END IF;
  END IF;
  IF proj IS NOT NULL THEN
    INSERT INTO public.project_activity (project_id, last_modified_at, last_modified_by)
    SELECT proj, now(), p_actor WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = proj)
    ON CONFLICT (project_id) DO UPDATE SET last_modified_at = now(), last_modified_by = EXCLUDED.last_modified_by;
  END IF;
END $$;

-- BEFORE INSERT/UPDATE on every audited table: take the actor hint and blank the column.
CREATE OR REPLACE FUNCTION public.rc_take_actor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('starr.change_actor', public.rc_actor(NEW.change_actor), true);
  NEW.change_actor := NULL;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.rc_current_actor()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('starr.change_actor', true), ''), public.rc_actor(NULL));
$$;

-- ── jobs ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rc_jobs_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who  text := public.rc_current_actor();
  diff jsonb;
  act  text := 'updated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.record_changes (project_id, job_id, subject, subject_id, action, actor, label)
    VALUES (NEW.project_id, NEW.id, 'job', NEW.id, 'created', who, NEW.name);
    PERFORM public.rc_touch(NEW.id, NEW.project_id, who);
    RETURN NULL;
  END IF;
  diff := public.rc_diff(to_jsonb(OLD), to_jsonb(NEW),
    ARRAY['updated_at', 'change_actor', 'stage_changed_at', 'centroid_lat', 'centroid_lon']);
  IF diff = '{}'::jsonb THEN RETURN NULL; END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN act := 'deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN act := 'restored';
  END IF;
  INSERT INTO public.record_changes (project_id, job_id, subject, subject_id, action, actor, changes, label)
  VALUES (NEW.project_id, NEW.id, 'job', NEW.id, act, who, diff, NEW.name);
  PERFORM public.rc_touch(NEW.id, NEW.project_id, who);
  -- A job moved to another project changes the project it left, too.
  IF OLD.project_id IS DISTINCT FROM NEW.project_id AND OLD.project_id IS NOT NULL THEN
    PERFORM public.rc_touch(NULL, OLD.project_id, who);
  END IF;
  RETURN NULL;
END $$;

-- ── projects ────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rc_projects_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who  text := public.rc_current_actor();
  diff jsonb;
  act  text := 'updated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.record_changes (project_id, subject, subject_id, action, actor, label)
    VALUES (NEW.id, 'project', NEW.id, 'created', who, NEW.name);
    PERFORM public.rc_touch(NULL, NEW.id, who);
    RETURN NULL;
  END IF;
  diff := public.rc_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at', 'change_actor']);
  IF diff = '{}'::jsonb THEN RETURN NULL; END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN act := 'deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN act := 'restored';
  END IF;
  INSERT INTO public.record_changes (project_id, subject, subject_id, action, actor, changes, label)
  VALUES (NEW.id, 'project', NEW.id, act, who, diff, NEW.name);
  PERFORM public.rc_touch(NULL, NEW.id, who);
  RETURN NULL;
END $$;

-- ── job_files (job files AND project documents) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rc_job_files_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who  text := public.rc_current_actor();
  diff jsonb;
  act  text := 'updated';
  r    public.job_files;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  -- A backup copy is the system's own safety net, not somebody's file.
  IF COALESCE(r.is_backup, false) THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.record_changes (project_id, job_id, subject, subject_id, action, actor, label)
    VALUES (r.project_id, r.job_id, 'file', r.id, 'created', who, COALESCE(r.file_name, r.name, r.label));
    PERFORM public.rc_touch(r.job_id, r.project_id, who);
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.record_changes (project_id, job_id, subject, subject_id, action, actor, label)
    VALUES (r.project_id, r.job_id, 'file', r.id, 'purged', who, COALESCE(r.file_name, r.name, r.label));
    PERFORM public.rc_touch(r.job_id, r.project_id, who);
    RETURN NULL;
  END IF;

  -- Thumbnails, upload progress and sync bookkeeping are the machine's, not an edit.
  diff := public.rc_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY[
    'updated_at', 'change_actor', 'thumb_path', 'thumb_bucket', 'thumb_state', 'thumb_updated_at',
    'upload_state', 'uploaded_at', 'file_node_id', 'client_id', 'org_id']);
  IF diff = '{}'::jsonb THEN RETURN NULL; END IF;
  IF NOT COALESCE(OLD.is_deleted, false) AND COALESCE(NEW.is_deleted, false) THEN act := 'deleted';
  ELSIF COALESCE(OLD.is_deleted, false) AND NOT COALESCE(NEW.is_deleted, false) THEN act := 'restored';
  ELSIF diff ?| ARRAY['job_id', 'project_id', 'folder_id', 'section'] THEN act := 'moved';
  ELSIF diff ?| ARRAY['file_name', 'name', 'label'] THEN act := 'renamed';
  END IF;
  INSERT INTO public.record_changes (project_id, job_id, subject, subject_id, action, actor, changes, label)
  VALUES (NEW.project_id, NEW.job_id, 'file', NEW.id, act, who, diff, COALESCE(NEW.file_name, NEW.name, NEW.label));
  PERFORM public.rc_touch(NEW.job_id, NEW.project_id, who);
  -- Moved out of a job or project: the one it left changed too.
  IF OLD.job_id IS DISTINCT FROM NEW.job_id OR OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    PERFORM public.rc_touch(OLD.job_id, OLD.project_id, who);
  END IF;
  RETURN NULL;
END $$;

-- ── job_file_folders ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rc_job_folders_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who  text := public.rc_current_actor();
  diff jsonb;
  act  text := 'updated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.record_changes (job_id, subject, subject_id, action, actor, label, project_id)
    VALUES (NEW.job_id, 'folder', NEW.id, 'created', who, NEW.name,
            (SELECT project_id FROM public.jobs WHERE id = NEW.job_id));
    PERFORM public.rc_touch(NEW.job_id, NULL, who);
    RETURN NULL;
  END IF;
  diff := public.rc_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at', 'change_actor', 'org_id']);
  IF diff = '{}'::jsonb THEN RETURN NULL; END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN act := 'deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN act := 'restored';
  ELSIF diff ?| ARRAY['parent_id', 'parent_key', 'job_id'] THEN act := 'moved';
  ELSIF diff ? 'name' THEN act := 'renamed';
  END IF;
  INSERT INTO public.record_changes (job_id, subject, subject_id, action, actor, changes, label, project_id)
  VALUES (NEW.job_id, 'folder', NEW.id, act, who, diff, NEW.name,
          (SELECT project_id FROM public.jobs WHERE id = NEW.job_id));
  PERFORM public.rc_touch(NEW.job_id, NULL, who);
  RETURN NULL;
END $$;

-- ── job_team ────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rc_job_team_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who  text := public.rc_current_actor();
  diff jsonb;
  act  text := 'updated';
  r    public.job_team;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    act := 'created';
  ELSIF TG_OP = 'DELETE' THEN
    act := 'removed';
  ELSE
    diff := public.rc_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['change_actor', 'org_id']);
    IF diff = '{}'::jsonb THEN RETURN NULL; END IF;
    IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL THEN act := 'removed'; END IF;
  END IF;
  INSERT INTO public.record_changes (job_id, subject, subject_id, action, actor, changes, label, project_id)
  VALUES (r.job_id, 'team', r.id, act, who, COALESCE(diff, '{}'::jsonb),
          COALESCE(NULLIF(r.user_name, ''), r.user_email) || COALESCE(' (' || r.role || ')', ''),
          (SELECT project_id FROM public.jobs WHERE id = r.job_id));
  PERFORM public.rc_touch(r.job_id, NULL, who);
  RETURN NULL;
END $$;

-- ── Wire them up. `rc_` sorts after every existing trigger name on these tables, so the actor is
--    taken after `job_files_fill_project_id_trg` has filled the project. ─────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['jobs', 'projects', 'job_files', 'job_file_folders', 'job_team'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS rc_take_actor_trg ON public.%I', t);
    EXECUTE format('CREATE TRIGGER rc_take_actor_trg BEFORE INSERT OR UPDATE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public.rc_take_actor()', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS rc_log_trg ON public.jobs;
CREATE TRIGGER rc_log_trg AFTER INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.rc_jobs_log();
DROP TRIGGER IF EXISTS rc_log_trg ON public.projects;
CREATE TRIGGER rc_log_trg AFTER INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.rc_projects_log();
DROP TRIGGER IF EXISTS rc_log_trg ON public.job_files;
CREATE TRIGGER rc_log_trg AFTER INSERT OR UPDATE OR DELETE ON public.job_files
  FOR EACH ROW EXECUTE FUNCTION public.rc_job_files_log();
DROP TRIGGER IF EXISTS rc_log_trg ON public.job_file_folders;
CREATE TRIGGER rc_log_trg AFTER INSERT OR UPDATE ON public.job_file_folders
  FOR EACH ROW EXECUTE FUNCTION public.rc_job_folders_log();
DROP TRIGGER IF EXISTS rc_log_trg ON public.job_team;
CREATE TRIGGER rc_log_trg AFTER INSERT OR UPDATE OR DELETE ON public.job_team
  FOR EACH ROW EXECUTE FUNCTION public.rc_job_team_log();

-- rc_touch is SECURITY DEFINER and not a trigger: server-only (see seeds/668).
REVOKE EXECUTE ON FUNCTION public.rc_touch(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rc_touch(uuid, uuid, text) TO service_role;

-- ── Backfill: the newest thing already known about each job and project ─────────────────────────
INSERT INTO public.job_activity (job_id, last_modified_at)
SELECT j.id, GREATEST(
         j.updated_at, j.created_at,
         (SELECT max(GREATEST(f.created_at, f.updated_at, f.uploaded_at)) FROM public.job_files f
           WHERE f.job_id = j.id AND NOT COALESCE(f.is_backup, false)),
         (SELECT max(GREATEST(d.created_at, d.updated_at)) FROM public.job_file_folders d WHERE d.job_id = j.id),
         (SELECT max(a.created_at) FROM public.activity_log a
           WHERE a.entity_type = 'job' AND a.entity_id = j.id::text))
FROM public.jobs j
ON CONFLICT (job_id) DO NOTHING;

INSERT INTO public.project_activity (project_id, last_modified_at, last_viewed_at)
SELECT p.id,
       GREATEST(
         p.updated_at, p.created_at,
         (SELECT max(ja.last_modified_at) FROM public.job_activity ja
            JOIN public.jobs j ON j.id = ja.job_id WHERE j.project_id = p.id),
         (SELECT max(GREATEST(f.created_at, f.updated_at, f.uploaded_at)) FROM public.job_files f
           WHERE f.project_id = p.id AND NOT COALESCE(f.is_backup, false))),
       (SELECT max(o.opened_at) FROM public.project_opens o WHERE o.project_id = p.id)
FROM public.projects p
ON CONFLICT (project_id) DO NOTHING;

COMMIT;
