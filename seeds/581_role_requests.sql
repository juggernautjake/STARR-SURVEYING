-- seeds/581_role_requests.sql
--
-- ASK FOR ACCESS WITHOUT A PHONE CALL (E2, 2026-08-11)
-- ════════════════════════════════════════════════════
--
-- Owner: *"Users should also be able to request role changes or the addition of roles to their
-- account."*
--
-- Today roles are granted in exactly one place — an admin editing somebody on /admin/users — and
-- there is no way to ASK. A new drawer who needs CAD access has to catch somebody in person, and the
-- request leaves no record: not who asked, not when, not why, not who said yes.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────────
--
-- It is not a second way to grant a role. A row here is a REQUEST; the grant still happens through
-- the one path that already exists, and approving simply calls it. Two ways to change somebody's
-- access is how one of them stops being audited, and access control is the last place to accept a
-- second code path.

CREATE TABLE IF NOT EXISTS role_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who is asking. Email rather than a FK to registered_users.id because every other
  -- people-shaped table in this product keys on email, and a request should survive the account
  -- row being recreated.
  requester_email TEXT NOT NULL,

  /**
   * The roles being asked for — the ADDITIONS, not the resulting set.
   *
   * Storing the delta rather than the final list matters: between asking and approving, an admin may
   * have granted something else. Replaying a stored "final list" would silently revoke it. The
   * approve path adds these to whatever the person holds at that moment.
   */
  requested_roles TEXT[] NOT NULL,

  -- Why. Free text, and required by the UI rather than the schema: an empty reason is a decision
  -- somebody has to make with no information, but a NOT NULL here would break the seed for any
  -- historical import.
  reason         TEXT,

  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'denied', 'withdrawn')),

  -- The decision. Null while pending.
  decided_by     TEXT,
  decided_at     TIMESTAMPTZ,
  decision_note  TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The queue's only question: what is waiting on me? Partial, because decided rows are history and
-- the index exists to serve the queue rather than the archive.
CREATE INDEX IF NOT EXISTS idx_role_requests_pending
  ON role_requests (created_at DESC)
  WHERE status = 'pending';

-- "What have I asked for?" — the requester's own view.
CREATE INDEX IF NOT EXISTS idx_role_requests_requester
  ON role_requests (requester_email, created_at DESC);

/**
 * One pending request per person, per role.
 *
 * Without this, tapping "Request" twice on a slow connection produces two identical rows, an admin
 * approves one, and the second sits in the queue for ever asking for something the person already
 * has. The constraint is on the PENDING state only — asking again after a denial is legitimate, and
 * a history of asks is worth keeping.
 */
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_requests_one_pending
  ON role_requests (requester_email, requested_roles)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION role_requests_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_role_requests_updated_at ON role_requests;
CREATE TRIGGER trg_role_requests_updated_at
  BEFORE UPDATE ON role_requests
  FOR EACH ROW EXECUTE FUNCTION role_requests_set_updated_at();

ALTER TABLE role_requests ENABLE ROW LEVEL SECURITY;

-- Every read and write goes through the API on the service-role client, which checks the session
-- and the admin flag itself. Matching the pattern in seeds/220 and 384: RLS on, service_role
-- allowed, no anon policy.
DO $$ BEGIN
  CREATE POLICY service_role_full_access_role_requests ON role_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE role_requests IS
  'E2 — a person asking for extra roles. A row is a REQUEST, never a grant: approving calls the one existing role-update path so access never has two writers.';
