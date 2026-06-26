// lib/files/server.ts
//
// F2 of FILE_EXPLORER_2026-06-25 — server-side data layer for the file explorer:
// load nodes + their ancestor chains + grants, and resolve a user's effective
// access. The HTTP routes call these; permission math lives in permissions.ts.

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import {
  resolveAccess,
  canView,
  canDownload,
  canEdit,
  type AccessLevel,
  type NodeWithGrants,
  type PermissionGrant,
  type FileUser,
} from './permissions';
import { sanitizeName, nextAvailableName } from './tree';
import { buildStoragePath } from './upload';

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

/** Insert a single copy of `src` under `parentId` with the given name. For files,
 *  the storage object is copied to a fresh key first; copies always start with a
 *  clean inherited permission set (no grants carried over). */
async function insertCopy(
  src: FileNodeRow,
  parentId: string | null,
  name: string,
  user: FileUser,
): Promise<FileNodeRow | null> {
  let storageBucket: string | null = null;
  let storagePath: string | null = null;
  if (src.node_type === 'file' && src.storage_bucket && src.storage_path) {
    const newPath = buildStoragePath(randomUUID(), src.name);
    const { error } = await supabaseAdmin.storage.from(src.storage_bucket).copy(src.storage_path, newPath);
    if (error) return null;
    storageBucket = src.storage_bucket;
    storagePath = newPath;
  }
  const { data } = await supabaseAdmin
    .from('file_nodes')
    .insert({
      parent_id: parentId,
      node_type: src.node_type,
      name,
      owner_email: user.email,
      created_by: user.email,
      permission_mode: 'inherit',
      storage_bucket: storageBucket,
      storage_path: storagePath,
      mime_type: src.mime_type,
      size_bytes: src.size_bytes,
    })
    .select(NODE_COLS)
    .single();
  return (data as FileNodeRow | null) ?? null;
}

export interface CopyResult {
  ok: boolean;
  status?: number;
  error?: string;
  node?: FileNodeRow;
  copied?: number;
  skipped?: number;
}

/** Copy a node (and, for folders, its subtree) into `destParentId`. When
 *  `destParentId` matches the source's own parent this is a "duplicate". Source
 *  nodes are gated by the user's effective access — files need download, folders
 *  need view; any descendant the user cannot reach is skipped (never silently
 *  re-exposed). Copies inherit the destination's permissions. */
export async function copySubtree(
  sourceId: string,
  destParentId: string | null,
  user: FileUser,
  isAdmin: boolean,
  overrideName?: string,
): Promise<CopyResult> {
  const src = await accessForNode(sourceId, user, isAdmin);
  if (src.chain.length === 0) return { ok: false, status: 404, error: 'Item not found.' };
  const root = src.chain[src.chain.length - 1];
  if (root.is_system || root.is_personal_root) {
    return { ok: false, status: 400, error: 'System folders cannot be copied.' };
  }
  const rootOk = root.node_type === 'file' ? canDownload(src.access) : canView(src.access);
  if (!rootOk) return { ok: false, status: 403, error: 'You cannot copy this item.' };

  if (destParentId) {
    const dest = await accessForNode(destParentId, user, isAdmin);
    if (dest.chain.length === 0) return { ok: false, status: 404, error: 'Destination not found.' };
    if (dest.chain[dest.chain.length - 1].node_type !== 'folder') {
      return { ok: false, status: 400, error: 'Destination is not a folder.' };
    }
    if (!canEdit(dest.access)) return { ok: false, status: 403, error: 'You cannot copy into that folder.' };
  } else if (!isAdmin) {
    return { ok: false, status: 403, error: 'Only admins can copy to the top level.' };
  }

  const desired = sanitizeName(overrideName ?? root.name) || root.name;
  const finalName = nextAvailableName(desired, await siblingNames(destParentId, root.node_type));

  const rootCopy = await insertCopy(root, destParentId, finalName, user);
  if (!rootCopy) return { ok: false, status: 500, error: 'Could not copy this item.' };
  let copied = 1;
  let skipped = 0;

  if (root.node_type === 'folder') {
    // BFS over the source subtree, carrying the source-chain grants so each
    // descendant's access is evaluated correctly. Source siblings are unique by
    // the DB index, so no collision handling is needed inside the new tree.
    const queue: Array<{ srcId: string; newId: string; chainNWG: NodeWithGrants[] }> = [
      { srcId: root.id, newId: rootCopy.id, chainNWG: src.nwg },
    ];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const { data } = await supabaseAdmin
        .from('file_nodes')
        .select(NODE_COLS)
        .eq('parent_id', cur.srcId)
        .is('deleted_at', null);
      const children = (data ?? []) as FileNodeRow[];
      const grants = await loadGrants(children.map((c) => c.id));
      for (const child of children) {
        if (child.is_system || child.is_personal_root) {
          skipped++;
          continue;
        }
        const childNWG = toNWG(child, grants.get(child.id) ?? []);
        const access = resolveAccess([...cur.chainNWG, childNWG], user, isAdmin);
        const ok = child.node_type === 'file' ? canDownload(access) : canView(access);
        if (!ok) {
          skipped++;
          continue;
        }
        const childCopy = await insertCopy(child, cur.newId, child.name, user);
        if (!childCopy) {
          skipped++;
          continue;
        }
        copied++;
        if (child.node_type === 'folder') {
          queue.push({ srcId: child.id, newId: childCopy.id, chainNWG: [...cur.chainNWG, childNWG] });
        }
      }
    }
  }

  return { ok: true, node: rootCopy, copied, skipped };
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
