-- seeds/246_starr_field_self_checkout_flag.sql
--
-- Phase F10.5-h-ii — `equipment_self_checkout` flag on
-- registered_users. Lets non-admin / non-equipment_manager
-- crew leads scan gear out of the office before/after Equipment
-- Manager hours per the §5.12.6 self-service after-hours
-- protocol.
--
-- Defaults to false: nobody is grandfathered in. Hank flips the
-- flag manually for trusted crew leads (Henry, Jacob, etc.) via
-- the /admin/users page (UI hook lands as F10.5-h-iii polish).
--
-- The audit trail captures every self-service check-out via the
-- F10.5-h-ii route logging — equipment_events.actor_user_id
-- already records who scanned, and the
-- privileged-bypass=false log line distinguishes a flag-driven
-- check-out from an admin/EM walk-up. Equipment Manager
-- reconciles after-hours actions on the §5.12.7 dashboard.
--
-- Apply AFTER the registered_users table exists (it ships in
-- the base schema and predates F10).
-- Idempotent.

BEGIN;

ALTER TABLE registered_users
  ADD COLUMN IF NOT EXISTS equipment_self_checkout BOOLEAN NOT NULL DEFAULT false;

-- Read-path index — the F10.5-h-ii /check-out gate looks up the
-- flag once per attempted check-out when the actor isn't
-- admin/equipment_manager. Partial index on the truthy subset
-- keeps the lookup tight (most users will be false).
CREATE INDEX IF NOT EXISTS idx_registered_users_self_checkout
  ON registered_users (email)
  WHERE equipment_self_checkout = true;

COMMENT ON COLUMN registered_users.equipment_self_checkout IS
  'When true, this user can scan equipment out via POST /api/admin/equipment/check-out without admin or equipment_manager roles. Set per-user by Hank for trusted crew leads. The audit trail captures every self-service check-out as privileged_bypass=false in the route logs.';

COMMIT;
