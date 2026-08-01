// lib/dnd/maps/assets.ts — what a DM can put on a map, and the order to offer it in (M4-3).
//
// M4-3: *"Reuse the existing File Explorer / media plumbing rather than a new uploader. Campaign-scoped
// asset tray with search; recently-used first, because placing forty trees means using the same asset
// forty times."*
//
// ── NO NEW UPLOADER, AND NO NEW TABLE ──────────────────────────────────────────────────────────────
//
// `dnd_media` already stores every image this campaign has, with a `kind`, a label, gallery tags and a
// DM-only flag, and `POST /api/dnd/media` already uploads with a quota, a size cap and a rate limit. A
// second uploader would be a second set of all four, and the first one to get a fix would be whichever
// the author had open — the two `MAX_BYTES` lesson this repo has already learned once.
//
// ── "RECENTLY USED" IS MEASURED FROM THE MAPS, NOT FROM A CLICK LOG ────────────────────────────────
//
// The tempting implementation is a `last_used_at` column the tray writes on every placement. It would
// be wrong in a way that shows up immediately: a DM who places forty trees and then UNDOES them has not
// stopped using trees, and one who imports a map full of an asset has used it forty times without ever
// touching the tray. Counting `asset_url` on the campaign's own map objects answers the real question —
// *what is actually on my maps* — and needs nothing kept in sync.

import { supabaseAdmin } from '@/lib/supabase';

export interface MapAsset {
  id: string;
  url: string;
  thumbUrl: string | null;
  label: string;
  kind: string;
  /** How many objects across this campaign's maps already use it. Drives the ordering. */
  uses: number;
  createdAt: string;
}

/** Media kinds that make sense ON a map. A character portrait belongs to a token, not to the scenery. */
const MAP_KINDS = new Set(['map', 'art', 'handout', 'reveal']);

/**
 * Order: most-used first, then newest.
 *
 * Pure and exported so the ordering is assertable without a database — the "recently used first" rule is
 * the whole point of the slice, and a rule only exercised through I/O is one nobody notices breaking.
 *
 * Ties break on `createdAt` descending and then on `id`, so the tray does not silently reshuffle between
 * renders. A DM reaching for "the third one" twice must get the same asset twice.
 */
export function orderAssets(assets: readonly MapAsset[]): MapAsset[] {
  return [...assets].sort(
    (a, b) => b.uses - a.uses || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Filter by a typed query.
 *
 * Matches the LABEL only, never the URL. A storage URL contains a content hash and a campaign uuid, so
 * searching it turns half the tray into a match for any hex digit the DM types — which reads as the
 * search being broken rather than as it being too clever.
 */
export function searchAssets(assets: readonly MapAsset[], q: string): MapAsset[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [...assets];
  return assets.filter((a) => a.label.toLowerCase().includes(needle));
}

/** A readable name for a media row that never got one — better than an empty chip. */
export function labelFor(row: { label: string | null; caption: string | null; kind: string | null }): string {
  return row.label?.trim() || row.caption?.trim() || `Untitled ${row.kind ?? 'image'}`;
}

/**
 * Every image this campaign could put on a map, ordered by how much it is already using them.
 *
 * DM-ONLY IN PRACTICE, and the caller enforces that: this reads the campaign's whole media library
 * including rows a player has never been shown, so it must not be called on a player's behalf. The tray
 * that uses it is inside the page's `isDm` branch for the same reason `dm_notes` is.
 */
export async function loadMapAssets(campaignId: string): Promise<MapAsset[]> {
  const { data: media } = await supabaseAdmin
    .from('dnd_media')
    .select('id, url, thumb_url, label, caption, kind, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  const rows = ((media ?? []) as Array<{
    id: string; url: string; thumb_url: string | null; label: string | null;
    caption: string | null; kind: string | null; created_at: string;
  }>).filter((r) => r.url && MAP_KINDS.has(r.kind ?? ''));
  if (!rows.length) return [];

  // Usage, counted across the campaign's own nodes. Two queries rather than a join, because PostgREST
  // cannot express this one and a view for it would be a schema object nobody else needs.
  const { data: nodes } = await supabaseAdmin
    .from('dnd_map_nodes').select('id').eq('campaign_id', campaignId);
  const nodeIds = ((nodes ?? []) as Array<{ id: string }>).map((n) => n.id);

  const uses = new Map<string, number>();
  if (nodeIds.length) {
    const { data: objects } = await supabaseAdmin
      .from('dnd_map_objects').select('asset_url').in('map_node_id', nodeIds).not('asset_url', 'is', null);
    for (const o of (objects ?? []) as Array<{ asset_url: string | null }>) {
      if (o.asset_url) uses.set(o.asset_url, (uses.get(o.asset_url) ?? 0) + 1);
    }
  }

  return orderAssets(rows.map((r) => ({
    id: r.id,
    url: r.url,
    thumbUrl: r.thumb_url,
    label: labelFor(r),
    kind: r.kind ?? 'image',
    uses: uses.get(r.url) ?? 0,
    createdAt: r.created_at,
  })));
}
