-- seeds/384_file_explorer.sql
--
-- F1 of docs/planning/in-progress/FILE_EXPLORER_2026-06-25.md — the virtual
-- filesystem for the Starr file explorer.
--
--   file_nodes        folders + files (parent_id tree). Files point at Supabase
--                     Storage via storage_bucket + storage_path.
--   file_permissions  per-node grants: everyone|role|user x view|download|edit|manage.
--                     Inheritance is resolved in lib/files/permissions.ts; the API
--                     enforces it via the service role (RLS = service-role only).
-- Idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION files_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS file_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  parent_id UUID REFERENCES file_nodes(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('folder', 'file')),
  name TEXT NOT NULL,
  owner_email TEXT,
  is_personal_root BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  -- 'inherit' = use the nearest 'custom' ancestor's grants; 'custom' = break
  -- inheritance and use this node's own grants.
  permission_mode TEXT NOT NULL DEFAULT 'inherit' CHECK (permission_mode IN ('inherit', 'custom')),
  -- file-only:
  storage_bucket TEXT,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- One live name per (parent, type), case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_nodes_unique_name
  ON file_nodes (parent_id, lower(name), node_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_file_nodes_parent ON file_nodes (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_file_nodes_owner ON file_nodes (owner_email) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS file_nodes_set_updated_at ON file_nodes;
CREATE TRIGGER file_nodes_set_updated_at
  BEFORE UPDATE ON file_nodes
  FOR EACH ROW EXECUTE FUNCTION files_set_updated_at();

CREATE TABLE IF NOT EXISTS file_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
  grantee_type TEXT NOT NULL CHECK (grantee_type IN ('everyone', 'role', 'user')),
  grantee_value TEXT, -- role name or user email; NULL for 'everyone'
  access_level TEXT NOT NULL CHECK (access_level IN ('view', 'download', 'edit', 'manage')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_permissions_node ON file_permissions (node_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_permissions_unique
  ON file_permissions (node_id, grantee_type, coalesce(grantee_value, ''), access_level);

ALTER TABLE file_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full_access_file_nodes ON file_nodes;
CREATE POLICY service_role_full_access_file_nodes ON file_nodes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_full_access_file_permissions ON file_permissions;
CREATE POLICY service_role_full_access_file_permissions ON file_permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE file_nodes IS
  'Virtual filesystem for the Starr file explorer (folders + files, parent_id tree; files point at Supabase Storage). F1 of FILE_EXPLORER_2026-06-25.';
COMMENT ON TABLE file_permissions IS
  'Per-node access grants (everyone|role|user x view|download|edit|manage). Inheritance resolved in lib/files/permissions.ts. F1.';

COMMIT;
