// lib/files/adapters/explorer.ts — a File Explorer node (`file_nodes`, or a `mnt:` mount item) as the
// shared viewer sees it. Bytes come from the explorer's own signed-URL route (a 2 h inline URL for
// viewing); rename / move / copy / notes / tags go through the routes the explorer already has.

import type { ViewerFile, ViewerCapabilities, Destination } from '../viewer-model';

export interface ExplorerNodeLike {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  updated_at: string;
  access: string;
  notes?: string | null;
  tags?: string[] | null;
  open_href?: string;
}

export const isMountId = (id: string) => id.startsWith('mnt:');

/** A fresh viewing URL for a node — the same JSON route the explorer's own preview used. */
export async function explorerViewUrl(id: string): Promise<string | null> {
  const res = await fetch(`/api/admin/files/${id}/download?inline=1`);
  if (!res.ok) return null;
  const { url } = await res.json();
  return typeof url === 'string' ? url : null;
}

export function explorerNodeToViewerFile(n: ExplorerNodeLike, url: string | null): ViewerFile {
  return {
    id: n.id,
    name: n.name,
    mime: n.mime_type,
    size: n.size_bytes,
    url,
    createdAt: n.updated_at,
    notes: n.notes ?? null,
    tags: n.tags ?? [],
    meta: isMountId(n.id) ? [{ label: 'Source', value: 'Mounted from another part of the site (read-only here)' }] : [],
  };
}

async function patchNode(id: string, body: Record<string, unknown>): Promise<ExplorerNodeLike> {
  const res = await fetch(`/api/admin/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.node as ExplorerNodeLike;
}

/** Folders a file can be sent to: the breadcrumb's ancestors and the sibling folders of its own folder. */
export async function explorerDestinations(currentParentId: string | null, crumbs: Array<{ id: string | null; name: string }>): Promise<Destination[]> {
  const out: Destination[] = [];
  const seen = new Set<string>();
  for (const c of crumbs) {
    const id = c.id ?? 'root';
    if (id === (currentParentId ?? 'root') || seen.has(id) || isMountId(id)) continue;
    seen.add(id);
    out.push({ id, label: c.name, hint: 'up the tree' });
  }
  const res = await fetch(`/api/admin/files?parent=${encodeURIComponent(currentParentId ?? 'root')}`);
  if (res.ok) {
    const body = await res.json() as { nodes?: ExplorerNodeLike[] };
    for (const n of body.nodes ?? []) {
      if (n.node_type !== 'folder' || isMountId(n.id) || seen.has(n.id)) continue;
      seen.add(n.id);
      out.push({ id: n.id, label: n.name, hint: 'folder here' });
    }
  }
  return out;
}

export interface ExplorerCapabilityHooks {
  canEdit: (node: ExplorerNodeLike) => boolean;
  nodeFor: (id: string) => ExplorerNodeLike | undefined;
  currentParentId: string | null;
  crumbs: Array<{ id: string | null; name: string }>;
  onChanged: () => void;
  onDelete?: (node: ExplorerNodeLike) => Promise<void>;
}

export function explorerCapabilities(hooks: ExplorerCapabilityHooks, url: (id: string) => string | null): ViewerCapabilities {
  const editable = (id: string) => { const n = hooks.nodeFor(id); return Boolean(n && !isMountId(id) && hooks.canEdit(n)); };
  const after = (n: ExplorerNodeLike) => { hooks.onChanged(); return explorerNodeToViewerFile(n, url(n.id)); };
  // Every capability checks at call time: a mount item shows read-only facts and no controls
  // because the viewer shows a control only when the capability exists — so hand it none.
  return {
    rename: async (file, newName) => { if (!editable(file.id)) throw new Error('read-only'); return after(await patchNode(file.id, { name: newName })); },
    updateNotes: async (file, notes) => { if (!editable(file.id)) throw new Error('read-only'); return after(await patchNode(file.id, { notes })); },
    updateTags: async (file, tags) => { if (!editable(file.id)) throw new Error('read-only'); return after(await patchNode(file.id, { tags })); },
    destinations: async () => explorerDestinations(hooks.currentParentId, hooks.crumbs),
    move: async (file, destination) => { if (!editable(file.id)) throw new Error('read-only'); await patchNode(file.id, { parent_id: destination.id === 'root' ? null : destination.id }); hooks.onChanged(); },
    copy: async (file, destination) => {
      const res = await fetch(`/api/admin/files/${file.id}/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_id: destination.id === 'root' ? null : destination.id }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      hooks.onChanged();
    },
    ...(hooks.onDelete ? { delete: async (file) => { const n = hooks.nodeFor(file.id); if (!n || !editable(file.id)) throw new Error('read-only'); await hooks.onDelete!(n); } } : {}),
  };
}
