-- seeds/664_time_log_events.sql — every event in the life of an hours entry, kept forever.
--
-- Owner, 2026-10-05: "We need to keep an audit trail of deletions and modifications and approvals
-- and rejections for hours always … We need to know who posts their hours, and then who reviews them
-- and makes the decisions for them." And: "We also need to be able to retrieve the hours if deleted."
--
-- Why it is a TRIGGER and not a line in each route: four days of one employee's clock-outs
-- (2026-09-28 … 10-02) were deleted on 10-03 by another admin's "My time" edit form, which had been
-- handed everybody's rows. Nothing recorded the deletes; the hours were recovered only because the
-- approver notifications happened to quote them. A log written by the routes protects only the
-- routes somebody remembered. A trigger sees every write — API, script, SQL editor — and keeps the
-- whole row, so a deleted day can be put back exactly as it was.
--
-- WHO did it: the service role is the database user for every API write, so Postgres cannot know the
-- person. The API stamps `last_actor` / `last_action` / `last_stamp_at` on the row in the same
-- statement as the change (or, for a delete, in an update immediately before it). The trigger trusts
-- the stamp only when THIS statement changed `last_stamp_at` — a stale stamp from an earlier action is
-- never attributed to a later one. A write that carries no stamp is still logged, with actor NULL,
-- which the history screen shows as "outside the app".
--
-- The trigger can never be the reason somebody's hours fail to save: its body is wrapped so any
-- error inside it becomes a WARNING and the write proceeds.
--
-- `client_submission_id`: a key the device generates when somebody clocks out. A clock-out that is
-- saved on the device and retried later (no signal, dead battery, server error) carries the same key
-- every time, and the unique index makes the second arrival a no-op instead of a second copy.
--
-- Additive, idempotent: safe to apply at any time and safe to apply twice.

BEGIN;

ALTER TABLE public.daily_time_logs ADD COLUMN IF NOT EXISTS last_actor text;
ALTER TABLE public.daily_time_logs ADD COLUMN IF NOT EXISTS last_action text;
ALTER TABLE public.daily_time_logs ADD COLUMN IF NOT EXISTS last_stamp_at timestamptz;
ALTER TABLE public.daily_time_logs ADD COLUMN IF NOT EXISTS client_submission_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_time_logs_client_submission
  ON public.daily_time_logs (client_submission_id)
  WHERE client_submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.time_log_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No foreign key, on purpose: the event must outlive the row it describes.
  time_log_id      uuid NOT NULL,
  employee_email   text NOT NULL,
  -- NULL = the write did not come through the app (SQL editor, script) and nobody stamped it.
  actor_email      text,
  -- submitted | entered_by_office | resubmitted | edited | approved | rejected | adjusted | disputed
  -- | paid | modified | deleted | replaced | restored
  action           text NOT NULL,
  log_date         date,
  hours_before     numeric,
  hours_after      numeric,
  status_before    text,
  status_after     text,
  before_row       jsonb,
  after_row        jsonb,
  -- Set when a deleted entry is put back, so it cannot be restored twice.
  restored_at      timestamptz,
  restored_by      text,
  org_id           uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_log_events_employee ON public.time_log_events (employee_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_log_events_log ON public.time_log_events (time_log_id, created_at);
CREATE INDEX IF NOT EXISTS idx_time_log_events_created ON public.time_log_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_log_events_action ON public.time_log_events (action, created_at DESC);

-- Only the service role writes here (through the trigger or the API). Nobody edits history.
ALTER TABLE public.time_log_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_time_log_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
  v_actor  text;
  v_fresh  boolean;
  v_old    jsonb;
  v_new    jsonb;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      v_action := COALESCE(NEW.last_action,
                           CASE WHEN NEW.entered_by IS NOT NULL THEN 'entered_by_office' ELSE 'submitted' END);
      v_actor  := COALESCE(NEW.last_actor, NEW.entered_by, NEW.user_email);
      INSERT INTO public.time_log_events
        (time_log_id, employee_email, actor_email, action, log_date,
         hours_before, hours_after, status_before, status_after, before_row, after_row, org_id)
      VALUES
        (NEW.id, NEW.user_email, v_actor, v_action, NEW.log_date,
         NULL, NEW.hours, NULL, NEW.status, NULL, to_jsonb(NEW), NEW.org_id);
      RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
      v_old := to_jsonb(OLD) - 'last_actor' - 'last_action' - 'last_stamp_at' - 'updated_at';
      v_new := to_jsonb(NEW) - 'last_actor' - 'last_action' - 'last_stamp_at' - 'updated_at';
      -- A stamp-only update (the API marking who is about to delete the row) is not an event.
      IF v_old = v_new THEN RETURN NEW; END IF;
      v_fresh := NEW.last_stamp_at IS DISTINCT FROM OLD.last_stamp_at;
      v_action := CASE
        WHEN v_fresh AND NEW.last_action IS NOT NULL THEN NEW.last_action
        WHEN NEW.status IS DISTINCT FROM OLD.status THEN COALESCE(NEW.status, 'modified')
        WHEN NEW.paid_at IS DISTINCT FROM OLD.paid_at AND NEW.paid_at IS NOT NULL THEN 'paid'
        ELSE 'modified' END;
      v_actor := CASE
        WHEN v_fresh THEN NEW.last_actor
        WHEN NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN NEW.approved_by
        WHEN NEW.paid_by IS DISTINCT FROM OLD.paid_by THEN NEW.paid_by
        ELSE NULL END;
      INSERT INTO public.time_log_events
        (time_log_id, employee_email, actor_email, action, log_date,
         hours_before, hours_after, status_before, status_after, before_row, after_row, org_id)
      VALUES
        (NEW.id, NEW.user_email, v_actor, v_action, NEW.log_date,
         COALESCE(OLD.adjusted_hours, OLD.hours), COALESCE(NEW.adjusted_hours, NEW.hours),
         OLD.status, NEW.status, to_jsonb(OLD), to_jsonb(NEW), NEW.org_id);
      RETURN NEW;

    ELSE -- DELETE
      -- The API stamps the row moments before deleting it. A stamp older than a minute, or one that
      -- names some other action, belongs to an earlier event and is not evidence of who deleted it.
      v_fresh := OLD.last_action IN ('deleted', 'replaced')
                 AND OLD.last_stamp_at IS NOT NULL
                 AND OLD.last_stamp_at > now() - interval '1 minute';
      INSERT INTO public.time_log_events
        (time_log_id, employee_email, actor_email, action, log_date,
         hours_before, hours_after, status_before, status_after, before_row, after_row, org_id)
      VALUES
        (OLD.id, OLD.user_email, CASE WHEN v_fresh THEN OLD.last_actor END,
         CASE WHEN v_fresh THEN OLD.last_action ELSE 'deleted' END, OLD.log_date,
         COALESCE(OLD.adjusted_hours, OLD.hours), NULL, OLD.status, NULL, to_jsonb(OLD), NULL, OLD.org_id);
      RETURN OLD;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'record_time_log_event failed (% on %): %', TG_OP, COALESCE(NEW.id, OLD.id), SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_time_log_event ON public.daily_time_logs;
CREATE TRIGGER trg_record_time_log_event
  AFTER INSERT OR UPDATE OR DELETE ON public.daily_time_logs
  FOR EACH ROW EXECUTE FUNCTION public.record_time_log_event();

COMMIT;
