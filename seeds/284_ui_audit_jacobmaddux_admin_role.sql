-- ============================================================================
-- 284_ui_audit_jacobmaddux_admin_role.sql
--
-- U-4 of UI_UX_OVERHAUL.md. Grants the `admin` role (plus the rest
-- of the standard internal-employee roles) to jacobmaddux@starr-surveying.com.
--
-- The audit found that every admin workspace landing
-- (/admin/work, /admin/research-cad, /admin/office, /admin/equipment,
-- /admin/knowledge) showed "0 pages in this workspace — no pages
-- accessible with your current role + access" even though the topbar
-- badge read ADMIN. The badge picks the highest-priority role from
-- the roles array, but the per-route gates check each role
-- individually, so if 'admin' isn't actually IN the array, gates fail.
--
-- Idempotent — only updates when the array doesn't already contain 'admin'.
-- ============================================================================

BEGIN;

UPDATE public.registered_users
   SET roles = ARRAY['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'employee']::text[]
 WHERE email = 'jacobmaddux@starr-surveying.com'
   AND NOT ('admin' = ANY(roles));

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT email, roles, is_approved, is_banned
--     FROM public.registered_users
--    WHERE email = 'jacobmaddux@starr-surveying.com';
--   -- expected: roles array contains 'admin' + others
--
-- After applying:
--   1. Sign OUT of starr-surveying.com (top-right Sign Out button)
--   2. Sign back IN with the same account
--   3. The new JWT picks up the updated roles array
--   4. /admin/work + /admin/research-cad + /admin/office should now
--      populate with their accessible-route cards instead of saying
--      "0 pages accessible"
