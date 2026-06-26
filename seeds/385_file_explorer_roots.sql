-- seeds/385_file_explorer_roots.sql
--
-- F8 of docs/planning/in-progress/FILE_EXPLORER_2026-06-25.md — provision the
-- two system roots and backfill a personal root for every current company user.
--
--   Shared    system folder, everyone (signed in) = edit  → collaborative drive
--   Personal  system folder, everyone = view             → container only
--     └─ <Name>  one per company user: is_personal_root, owner-only (custom, no
--                grants → owner gets manage, others get nothing, admins manage)
--
-- System roots are protected from rename/move/delete in the API (is_system /
-- is_personal_root). Idempotent — safe to re-run; ongoing new users are
-- provisioned lazily by lib/files/provision.ts on first visit.

BEGIN;

-- Shared root ----------------------------------------------------------------
INSERT INTO file_nodes (name, node_type, is_system, permission_mode, created_by)
SELECT 'Shared', 'folder', true, 'custom', 'system'
WHERE NOT EXISTS (
  SELECT 1 FROM file_nodes
  WHERE parent_id IS NULL AND lower(name) = 'shared' AND node_type = 'folder' AND deleted_at IS NULL
);

-- Personal container ---------------------------------------------------------
INSERT INTO file_nodes (name, node_type, is_system, permission_mode, created_by)
SELECT 'Personal', 'folder', true, 'custom', 'system'
WHERE NOT EXISTS (
  SELECT 1 FROM file_nodes
  WHERE parent_id IS NULL AND lower(name) = 'personal' AND node_type = 'folder' AND deleted_at IS NULL
);

-- System-root grants ---------------------------------------------------------
INSERT INTO file_permissions (node_id, grantee_type, grantee_value, access_level, created_by)
SELECT n.id, 'everyone', NULL, 'edit', 'system'
FROM file_nodes n
WHERE n.parent_id IS NULL AND lower(n.name) = 'shared' AND n.node_type = 'folder' AND n.deleted_at IS NULL
ON CONFLICT (node_id, grantee_type, coalesce(grantee_value, ''), access_level) DO NOTHING;

INSERT INTO file_permissions (node_id, grantee_type, grantee_value, access_level, created_by)
SELECT n.id, 'everyone', NULL, 'view', 'system'
FROM file_nodes n
WHERE n.parent_id IS NULL AND lower(n.name) = 'personal' AND n.node_type = 'folder' AND n.deleted_at IS NULL
ON CONFLICT (node_id, grantee_type, coalesce(grantee_value, ''), access_level) DO NOTHING;

-- Backfill personal roots ----------------------------------------------------
WITH personal AS (
  SELECT id FROM file_nodes
  WHERE parent_id IS NULL AND lower(name) = 'personal' AND node_type = 'folder' AND deleted_at IS NULL
  LIMIT 1
),
people AS (
  SELECT u.email,
         COALESCE(NULLIF(btrim(u.name), ''), split_part(u.email, '@', 1)) AS base
  FROM registered_users u
  WHERE u.email ILIKE '%@starr-surveying.com'
),
numbered AS (
  SELECT email,
         CASE
           WHEN row_number() OVER (PARTITION BY lower(base) ORDER BY email) = 1 THEN base
           ELSE base || ' (' || split_part(email, '@', 1) || ')'
         END AS fname
  FROM people
)
INSERT INTO file_nodes (parent_id, name, node_type, owner_email, is_personal_root, permission_mode, created_by)
SELECT p.id, n.fname, 'folder', lower(n.email), true, 'custom', 'system'
FROM personal p
CROSS JOIN numbered n
WHERE NOT EXISTS (
  SELECT 1 FROM file_nodes e
  WHERE e.parent_id = p.id AND e.is_personal_root = true
    AND lower(e.owner_email) = lower(n.email) AND e.deleted_at IS NULL
);

COMMIT;
