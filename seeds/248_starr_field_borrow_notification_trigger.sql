-- seeds/248_starr_field_borrow_notification_trigger.sql
--
-- Phase F10.8 — fires notifications when a mobile-originated
-- "borrowed_during_field_work" event lands in equipment_events.
-- The admin endpoint POST /api/admin/equipment/borrow-from-other-
-- crew already does its own notifyMany() fan-out; this trigger
-- covers the mobile path (which uses Supabase auth and so can't
-- hit that endpoint). Source-tag check guarantees we don't
-- double-fire when both code paths converge.
--
-- Recipients = (current job's crew leads) + (origin job's crew
-- leads, when payload.borrowed_from_job_id is set) + (admin /
-- equipment_manager broadcast). Deduped via DISTINCT.
--
-- Apply AFTER seeds/236 (equipment_events) AND seeds/222
-- (notifications schema). Idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION notify_mobile_borrow_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_equipment_name      TEXT;
  v_current_job_label   TEXT;
  v_origin_job_label    TEXT;
  v_borrowed_from_job   UUID;
  v_actor_email         TEXT;
  v_recipient           TEXT;
BEGIN
  -- Only fire for mobile-borrow rows. The admin endpoint emits its
  -- own notifyMany so a mobile-only filter prevents double-fire.
  IF NEW.event_type IS DISTINCT FROM 'borrowed_during_field_work' THEN
    RETURN NEW;
  END IF;
  IF (NEW.payload->>'source') IS DISTINCT FROM 'mobile_scanner_fab' THEN
    RETURN NEW;
  END IF;

  -- Resolve display fields. Fallbacks keep the body readable when
  -- the join misses (deleted job, missing equipment row).
  SELECT name INTO v_equipment_name
    FROM equipment_inventory
    WHERE id = NEW.equipment_id;
  IF v_equipment_name IS NULL THEN
    v_equipment_name := NEW.equipment_id::TEXT;
  END IF;

  SELECT
    CASE
      WHEN job_number IS NOT NULL THEN job_number || ' ' || COALESCE(name, '')
      ELSE COALESCE(name, '')
    END
  INTO v_current_job_label
    FROM jobs
    WHERE id = NEW.job_id;
  IF v_current_job_label IS NULL OR v_current_job_label = '' THEN
    v_current_job_label := 'a job';
  END IF;

  -- Optional borrowed_from_job_id; trim any whitespace before
  -- casting so a stray '' from JSONB doesn't blow up.
  v_borrowed_from_job := NULLIF(NEW.payload->>'borrowed_from_job_id', '')::UUID;
  IF v_borrowed_from_job IS NOT NULL THEN
    SELECT
      CASE
        WHEN job_number IS NOT NULL THEN job_number || ' ' || COALESCE(name, '')
        ELSE COALESCE(name, '')
      END
    INTO v_origin_job_label
      FROM jobs
      WHERE id = v_borrowed_from_job;
  END IF;

  v_actor_email := COALESCE(NEW.payload->>'actor_email', 'unknown user');

  -- Insert one notification per recipient. Crew leads on either
  -- job + every admin / equipment_manager. DISTINCT dedupes.
  FOR v_recipient IN
    SELECT DISTINCT user_email FROM (
      SELECT jt.user_email
        FROM job_team jt
       WHERE jt.is_crew_lead = true
         AND jt.job_id IN (NEW.job_id, v_borrowed_from_job)
      UNION
      SELECT email AS user_email
        FROM registered_users
       WHERE 'admin' = ANY(roles)
          OR 'equipment_manager' = ANY(roles)
    ) r
    WHERE user_email IS NOT NULL
  LOOP
    INSERT INTO notifications (
      user_email, type, title, body, icon,
      escalation_level, source_type, source_id, link
    ) VALUES (
      v_recipient,
      'equipment_borrowed_in',
      format('Borrow logged: %s', v_equipment_name),
      format(
        '%s borrowed %s for %s%s. The reservation isn''t auto-rewritten — reconcile in the audit log.',
        v_actor_email,
        v_equipment_name,
        v_current_job_label,
        CASE WHEN v_origin_job_label IS NOT NULL AND v_origin_job_label <> ''
             THEN ' from ' || v_origin_job_label
             ELSE ''
        END
      ),
      '🔄',
      'normal',
      'equipment_event',
      NEW.id::TEXT,
      format('/admin/equipment/%s', NEW.equipment_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mobile_borrow ON equipment_events;
CREATE TRIGGER trg_notify_mobile_borrow
  AFTER INSERT ON equipment_events
  FOR EACH ROW
  EXECUTE FUNCTION notify_mobile_borrow_event();

COMMENT ON FUNCTION notify_mobile_borrow_event() IS
  'Phase F10.8 — fires notifications for mobile-originated borrow events. Source-tag filter (payload.source = ''mobile_scanner_fab'') prevents double-fire alongside the admin endpoint''s own notifyMany call.';

COMMIT;
