// lib/cad/branch/diff.ts
//
// cad-branching — pure change-summary between two drawing documents.
//
// CAD geometry has no natural line-by-line merge, so a branch review is a
// "take theirs vs keep mine" decision. To make that decision informed, we
// show the reviewer a summary of what the branch changed relative to the
// main drawing: features + layers added / removed / modified.
//
// Both inputs are plain JSON (a DrawingDocument or its `features`/`layers`
// records), so this file stays dependency-free and is unit-tested in node.

export interface DrawingDiff {
  featuresAdded: string[];
  featuresRemoved: string[];
  featuresModified: string[];
  layersAdded: string[];
  layersRemoved: string[];
  layersModified: string[];
  /** True when the branch differs from the base in any way. */
  hasChanges: boolean;
}

/** Minimal shape we read off a document — defensive against partial JSON. */
interface DocLike {
  features?: Record<string, unknown> | null;
  layers?: Record<string, unknown> | null;
}

/**
 * Deterministic JSON with recursively sorted object keys, so two feature
 * objects that carry the same data in a different key order do NOT read as
 * "modified". Arrays keep their order (order is meaningful for vertices).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function diffRecord(
  base: Record<string, unknown> | null | undefined,
  head: Record<string, unknown> | null | undefined,
): { added: string[]; removed: string[]; modified: string[] } {
  const b = base ?? {};
  const h = head ?? {};
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const id of Object.keys(h)) {
    if (!(id in b)) added.push(id);
    else if (stableStringify(h[id]) !== stableStringify(b[id])) modified.push(id);
  }
  for (const id of Object.keys(b)) {
    if (!(id in h)) removed.push(id);
  }
  // Stable, human-friendly ordering.
  added.sort();
  removed.sort();
  modified.sort();
  return { added, removed, modified };
}

/**
 * Summarise how `head` (the branch) differs from `base` (the main drawing).
 * `base` is the "before", `head` is the "after".
 */
export function diffDrawingDocuments(base: DocLike | null | undefined, head: DocLike | null | undefined): DrawingDiff {
  const feats = diffRecord(base?.features, head?.features);
  const lyrs = diffRecord(base?.layers, head?.layers);
  const hasChanges =
    feats.added.length > 0 ||
    feats.removed.length > 0 ||
    feats.modified.length > 0 ||
    lyrs.added.length > 0 ||
    lyrs.removed.length > 0 ||
    lyrs.modified.length > 0;
  return {
    featuresAdded: feats.added,
    featuresRemoved: feats.removed,
    featuresModified: feats.modified,
    layersAdded: lyrs.added,
    layersRemoved: lyrs.removed,
    layersModified: lyrs.modified,
    hasChanges,
  };
}

/**
 * A short one-line summary like "12 added · 3 changed · 1 removed" for the
 * feature delta, or "No feature changes" when nothing changed. Used in the
 * branch/review UI chips.
 */
export function summarizeCounts(added: number, modified: number, removed: number, noun = 'change'): string {
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (modified) parts.push(`${modified} changed`);
  if (removed) parts.push(`${removed} removed`);
  if (parts.length === 0) return `No ${noun}s`;
  return parts.join(' · ');
}
