// lib/files/server.ts
//
// F2 of FILE_EXPLORER_2026-06-25 — server-side data layer for the file explorer:
// load nodes + their ancestor chains + grants, and resolve a user's effective
// access. The HTTP routes call these; permission math lives in permissions.ts.

import { supabaseAdmin } from '@/lib/supabase';
import {
  resolveAccess,
  canView,
  type AccessLevel,
  type NodeWithGrants,
  type PermissionGrant,
  type FileUser,
} from './permissions';

export interface FileNodeRow {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  owner_email: string | null;
  is_personal_root: boolean;
  is_system: boolean;
  permission_mode: 'inherit' | 'custom';
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListedNode extends FileNodeRow {
  access: AccessLevel;
}

export const NODE_COLS =
  'id, parent_id, node_type, name, owner_email, is_personal_root, is_system, permission_mode, storage_bucket, storage_path, mime_type, size_bytes, created_by, created_at, updated_at';

export async function getNode(id: string): Promise<FileNodeRow | null> {
  const { data } = await supabaseAdmin
    .from('file_nodes')
    .select(NODE_COLS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as FileNodeRow | null) ?? null;
}

/** Ancestor chain ROOT-first, TARGET-last (inclusive). Cycle-guarded. */
export async function getNodeChain(id: string): Promise<FileNodeRow[]> {
  const chain: FileNodeRow[] = [];
  const seen = new Set<string>();
  let cur = await getNode(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    if (!cur.parent_id) break;
    cur = await getNode(cur.parent_id);
  }
  return chain;
}

export async function loadGrants(nodeIds: string[]): Promise<Map<string, PermissionGrant[]>> {
  const map = new Map<string, PermissionGrant[]>();
  if (nodeIds.length === 0) return map;
  const { data } = await supabaseAdmin
    .from('file_permissions')
    .select('node_id, grantee_type, grantee_value, access_level')
    .in('node_id', nodeIds);
  for (const r of (data ?? []) as Array<{ node_id: string } & PermissionGrant>) {
    const list = map.get(r.node_id) ?? [];
    list.push({ grantee_type: r.grantee_type, grantee_value: r.grantee_value, access_level: r.access_level });
    map.set(r.node_id, list);
  }
  return map;
}

function toNWG(row: FileNodeRow, grants: PermissionGrant[]): NodeWithGrants {
  return { id: row.id, permission_mode: row.permission_mode, owner_email: row.owner_email, grants };
}

/** Resolve a user's access to a single node (loads its chain + grants). */
export async function accessForNode(
  id: string,
  user: FileUser,
  isAdmin: boolean,
): Promise<{ chain: FileNodeRow[]; nwg: NodeWithGrants[]; access: AccessLevel }> {
  const chain = await getNodeChain(id);
  if (chain.length === 0) return { chain, nwg: [], access: 'none' };
  const grants = await loadGrants(chain.map((n) => n.id));
  const nwg = chain.map((n) => toNWG(n, grants.get(n.id) ?? []));
  return { chain, nwg, access: resolveAccess(nwg, user, isAdmin) };
}

export interface ListResult {
  ok: boolean;
  status?: number;
  error?: string;
  nodes?: ListedNode[];
  breadcrumb?: Array<{ id: string; name: string }>;
  parentAccess?: AccessLevel;
}

/** List the children of a folder (or the roots when parentId is null),
 *  filtered to the children the user can at least view. */
export async function listChildren(parentId: string | null, user: FileUser, isAdmin: boolean): Promise<ListResult> {
  let parentChainNWG: NodeWithGrants[] = [];
  let breadcrumb: Array<{ id: string; name: string }> = [];
  let parentAccess: AccessLevel = 'manage'; // virtual root: anyone may see roots they're granted

  if (parentId) {
    const chain = await getNodeChain(parentId);
    if (chain.length === 0) return { ok: false, status: 404, error: 'Folder not found.' };
    const target = chain[chain.length - 1];
    if (target.node_type !== 'folder') return { ok: false, status: 400, error: 'Not a folder.' };
    const grants = await loadGrants(chain.map((n) => n.id));
    parentChainNWG = chain.map((n) => toNWG(n, grants.get(n.id) ?? []));
    parentAccess = resolveAccess(parentChainNWG, user, isAdmin);
    if (!canView(parentAccess)) return { ok: false, status: 403, error: 'You do not have access to this folder.' };
    breadcrumb = chain.map((n) => ({ id: n.id, name: n.name }));
  }

  const base = supabaseAdmin
    .from('file_nodes')
    .select(NODE_COLS)
    .is('deleted_at', null)
    .order('node_type', { ascending: true })
    .order('name', { ascending: true });
  const { data, error } = parentId ? await base.eq('parent_id', parentId) : await base.is('parent_id', null);
  if (error) return { ok: false, status: 500, error: error.message };

  const children = (data ?? []) as FileNodeRow[];
  const childGrants = await loadGrants(children.map((c) => c.id));
  const nodes: ListedNode[] = [];
  for (const c of children) {
    const access = resolveAccess([...parentChainNWG, toNWG(c, childGrants.get(c.id) ?? [])], user, isAdmin);
    if (canView(access)) nodes.push({ ...c, access });
  }
  return { ok: true, nodes, breadcrumb, parentAccess };
}

/** Live sibling names under a parent (case used as-is) for collision checks. */
export async function siblingNames(parentId: string | null, nodeType: 'folder' | 'file'): Promise<string[]> {
  const base = supabaseAdmin.from('file_nodes').select('name').is('deleted_at', null).eq('node_type', nodeType);
  const { data } = parentId ? await base.eq('parent_id', parentId) : await base.is('parent_id', null);
  return ((data ?? []) as Array<{ name: string }>).map((r) => r.name);
}

/** Collect a node id + all its live descendant ids (BFS) for subtree ops. */
export async function collectSubtreeIds(rootId: string): Promise<string[]> {
  const all = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const { data } = await supabaseAdmin
      .from('file_nodes')
      .select('id')
      .in('parent_id', frontier)
      .is('deleted_at', null);
    const next = ((data ?? []) as Array<{ id: string }>).map((r) => r.id).filter((id) => !all.has(id));
    next.forEach((id) => all.add(id));
    frontier = next;
  }
  return [...all];
}
