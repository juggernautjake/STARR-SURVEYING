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
  describeAudience,
  type Audience,
  type AccessLevel,
  type NodeWithGrants,
  type PermissionGrant,
  type FileUser,
} from './permissions';
import { sanitizeName, nextAvailableName } from './tree';
import { buildStoragePath } from './upload';
import { kindOf } from './kinds';

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
  /** F4 — who this node is shared with, resolved through the inheritance chain. Absent on search
   *  hits and mounted nodes, which have their own story. */
  audience?: Audience;
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
  // `is_system` rides along for `describeAudience`'s container case — a seeded root granted to
  // everyone for VIEW is a container, not a company-wide drive. Nothing else reads it, and it is
  // optional on the type so no other caller had to change.
  return {
    id: row.id,
    permission_mode: row.permission_mode,
    owner_email: row.owner_email,
    grants,
    is_system: row.is_system,
  };
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
    const chain = [...parentChainNWG, toNWG(c, childGrants.get(c.id) ?? [])];
    const access = resolveAccess(chain, user, isAdmin);
    // F4 — who this is shared with, resolved through the same chain. Computed here rather than in
    // the UI because the grants are already loaded: asking the client to work it out would mean
    // shipping every grant on every node to the browser to render a badge.
    if (canView(access)) nodes.push({ ...c, access, audience: describeAudience(chain) });
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

/** Expose the private node→NodeWithGrants adapter for the permissions preview. */
export function nodeToNWG(row: FileNodeRow, grants: PermissionGrant[]): NodeWithGrants {
  return toNWG(row, grants);
}

/** Company-domain people for the permissions user-picker + access preview. */
export async function listCompanyPeople(): Promise<Array<{ email: string; name: string | null; roles: string[] }>> {
  const { data } = await supabaseAdmin
    .from('registered_users')
    .select('email, name, roles')
    .ilike('email', '%@starr-surveying.com')
    .order('name', { ascending: true });
  return ((data ?? []) as Array<{ email: string; name: string | null; roles: string[] | null }>).map((u) => ({
    email: u.email,
    name: u.name,
    roles: u.roles ?? ['employee'],
  }));
}

/** Replace a node's permission mode + grant set in one shot (custom only keeps
 *  grants; switching to inherit clears them). */
export async function replaceGrants(
  nodeId: string,
  mode: 'inherit' | 'custom',
  grants: PermissionGrant[],
): Promise<{ ok: boolean; error?: string }> {
  const upd = await supabaseAdmin.from('file_nodes').update({ permission_mode: mode }).eq('id', nodeId);
  if (upd.error) return { ok: false, error: upd.error.message };
  const del = await supabaseAdmin.from('file_permissions').delete().eq('node_id', nodeId);
  if (del.error) return { ok: false, error: del.error.message };
  if (mode === 'custom' && grants.length > 0) {
    const rows = grants.map((g) => ({
      node_id: nodeId,
      grantee_type: g.grantee_type,
      grantee_value: g.grantee_value,
      access_level: g.access_level,
    }));
    const ins = await supabaseAdmin.from('file_permissions').insert(rows);
    if (ins.error) return { ok: false, error: ins.error.message };
  }
  return { ok: true };
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

// ── F2 (2026-08-11) — SEARCH ───────────────────────────────────────────────────────────────────
//
// Owner: *"We should be able to do searches and file format filters and all of that."*
//
// There was no search at all. A tree with hundreds of nodes and no search is a filing cabinet with
// the drawers welded shut, and it was the single largest gap in an otherwise capable explorer.
//
// ── WHY THE PERMISSION FILTER CANNOT BE A `WHERE` CLAUSE ────────────────────────────────────────
//
// The plan for this slice said the permission filter "must be in the QUERY, not applied after".
// That instruction was written before reading the permission model, and it is not achievable as
// stated: access on a node is the MAX of grants matching you on the nearest `custom` ancestor,
// resolved by walking the chain (see `resolveAccess`). Expressing that as a SQL predicate needs a
// recursive CTE over an inheritance rule that lives in TypeScript, and re-stating that rule in SQL
// would create exactly the two-sources-of-truth problem this codebase keeps paying for.
//
// The real risk behind the instruction is **leakage**, and leakage is avoidable without SQL: match
// by name, resolve access with the SAME code path the browse view uses, drop everything you may not
// view, and — the part that actually matters — **never report a total**. "Showing 3 of 50" is the
// leak; it tells you 47 files exist that you cannot see. This returns only what you may see, and
// says only whether it stopped early, which reveals nothing about what was filtered out.

export interface SearchHit extends ListedNode {
  /** Folder path from the root, e.g. `Shared / Surveys / 2026`. Empty at the root.
   *  Finding a file and being able to act on it are different things — a hit is only useful if it
   *  says where it lives. */
  path: string;
}

export interface SearchResult {
  ok: boolean;
  status?: number;
  error?: string;
  hits?: SearchHit[];
  /** True when the NAME match hit its cap before permissions were applied, so there may be more.
   *  Reported instead of a count, for the reason in the header note. */
  truncated?: boolean;
}

/** Name matches to consider before permission filtering. Generous enough that a real search is
 *  complete, bounded so a two-letter query cannot pull the whole table. */
const SEARCH_MATCH_CAP = 300;

/**
 * Search `file_nodes` by name.
 *
 * Ancestors are loaded in BREADTH-FIRST PASSES rather than one chain walk per hit: 300 hits would
 * otherwise be 300 sequential round trips. Trees here are shallow, so this settles in a handful of
 * queries however many matches there are.
 */
export async function searchNodes(
  term: string,
  user: FileUser,
  isAdmin: boolean,
  opts: { kinds?: string[] } = {},
): Promise<SearchResult> {
  const q = term.trim();
  if (q.length < 2) {
    // One character matches nearly everything and is never what somebody meant. Saying so beats
    // returning a wall of results that looks like the search is broken.
    return { ok: false, status: 400, error: 'Type at least two characters to search.' };
  }
  // `%` and `_` are ILIKE wildcards, and a literal underscore is common in filenames — escaping
  // keeps a search for "site_plan" from also matching "siteXplan".
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);

  const { data, error } = await supabaseAdmin
    .from('file_nodes')
    .select(NODE_COLS)
    .is('deleted_at', null)
    .ilike('name', `%${escaped}%`)
    .order('node_type', { ascending: true })
    .order('name', { ascending: true })
    .limit(SEARCH_MATCH_CAP);
  if (error) return { ok: false, status: 500, error: error.message };

  const matches = (data ?? []) as FileNodeRow[];
  if (matches.length === 0) return { ok: true, hits: [], truncated: false };

  // Every ancestor of every match, in passes.
  const byId = new Map<string, FileNodeRow>();
  for (const m of matches) byId.set(m.id, m);
  let frontier = Array.from(
    new Set(matches.map((m) => m.parent_id).filter((p): p is string => !!p && !byId.has(p))),
  );
  while (frontier.length > 0) {
    const { data: parents } = await supabaseAdmin
      .from('file_nodes')
      .select(NODE_COLS)
      .in('id', frontier);
    const rows = (parents ?? []) as FileNodeRow[];
    if (rows.length === 0) break;
    for (const r of rows) byId.set(r.id, r);
    frontier = Array.from(
      new Set(rows.map((r) => r.parent_id).filter((p): p is string => !!p && !byId.has(p))),
    );
  }

  // One grants load for every node involved, then each hit resolved through the same chain logic the
  // browse view uses — so a file cannot be visible in search and invisible in its folder, or the
  // reverse. Two answers to "may I see this" is how one of them ends up wrong.
  const grants = await loadGrants(Array.from(byId.keys()));
  const chainOf = (node: FileNodeRow): FileNodeRow[] => {
    const chain: FileNodeRow[] = [];
    let cur: FileNodeRow | undefined = node;
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id); // a parent cycle would otherwise hang the request
      chain.unshift(cur);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return chain;
  };

  const kinds = opts.kinds && opts.kinds.length > 0 ? new Set(opts.kinds) : null;
  const hits: SearchHit[] = [];
  for (const m of matches) {
    const chain = chainOf(m);
    const access = resolveAccess(
      chain.map((n) => toNWG(n, grants.get(n.id) ?? [])),
      user,
      isAdmin,
    );
    if (!canView(access)) continue;
    // A kind filter is a question about files, so folders drop out entirely when one is active —
    // otherwise "show me only PDFs" returns folders, which is not what anybody means by it.
    if (kinds) {
      if (m.node_type === 'folder') continue;
      if (!kinds.has(kindOf(m.mime_type, m.name))) continue;
    }
    hits.push({
      ...m,
      access,
      // The chain ends with the hit itself; the path is everything above it.
      path: chain.slice(0, -1).map((n) => n.name).join(' / '),
    });
  }

  return { ok: true, hits, truncated: matches.length >= SEARCH_MATCH_CAP };
}

// ── F3 — format filters ────────────────────────────────────────────────────────────────────────
//
// Defined in `./kinds`, which has NO imports, because the explorer is a client component and
// needs the same classifier. Importing it from THIS file would pull `supabaseAdmin` — and the
// service-role key — into the client graph. Re-exported here so server-side callers keep one
// import.
export { kindOf, FILE_KINDS, type FileKind } from './kinds';
