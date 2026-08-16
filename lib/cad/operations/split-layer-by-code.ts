// lib/cad/operations/split-layer-by-code.ts
//
// C7b of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Split one layer into one layer per point code: every feature coded FN01 to a new layer, every
// EP to another, and so on.
//
// ── THE DEFERRAL'S PREMISE WAS WRONG, AND IT IS WORTH SAYING WHY ────────────────────────────────
//
// C7 deferred this with the reason: *"it depends on `autoAssignCodes` — which C5 found inert (set
// to `[]` at creation, no editor, nothing reads it). Splitting by a mapping nobody can populate
// would ship a button that always produces one layer."*
//
// It does not depend on it, and the two are near-opposites. `Layer.autoAssignCodes` is an
// **import-time routing rule**: which layer an incoming code should LAND on. Splitting reads the
// codes the features in front of you are already carrying and groups by them. One is a policy
// written before the data arrives; the other is a question asked of the data afterwards.
//
// `autoAssignCodes` is in fact still inert — every construction site sets it to `[]` and only
// `transferSelectionToLayer` reads it as an allow-list. So had this waited for it, it would still
// be waiting. What it actually needed was a reliable answer to "what code is this feature", and
// C22 built exactly that (`featureCode`) while wiring the code tier of the style cascade. This is
// the same function the canvas already uses to decide what colour to draw a feature, so a layer
// named for a code cannot disagree with the styling of the features on it.
//
// ── WHY UNCODED FEATURES STAY PUT ───────────────────────────────────────────────────────────────
//
// A drawing almost always has some geometry with no code — construction lines, a text note, a
// boundary drawn by hand. The tempting move is to sweep them into an "Uncoded" layer so the split
// is total. That is the wrong default: the surveyor asked to separate the coded features, and
// silently relocating everything else means the layer they were looking at is now empty and their
// hand-drawn work is somewhere they did not ask for. Leaving them makes the source layer mean
// "everything on here that has no code", which is both true and where they already were.

import type { Feature, Layer, UndoOperation } from '../types';
import { featureCode } from '../styles/code-style-resolve';

export interface SplitLayerByCodeInput {
  sourceLayerId: string;
  layers: Readonly<Record<string, Layer>>;
  features: Readonly<Record<string, Feature>>;
  /** Injected so the planner stays pure and its output is reproducible in tests. */
  makeLayerId: (code: string, index: number) => string;
}

export type SplitLayerRefusal =
  | 'SOURCE_MISSING'
  | 'SOURCE_LOCKED'
  | 'NO_CODED_FEATURES'
  | 'SINGLE_CODE';

export interface SplitLayerGroup {
  code: string;
  layerId: string;
  layerName: string;
  featureIds: string[];
}

export interface SplitLayerPlan {
  ok: true;
  sourceName: string;
  /** One per distinct code, in the order the codes first appear in the document. */
  groups: SplitLayerGroup[];
  /** The new layers, ready to add. */
  newLayers: Layer[];
  /** Apply order; undo replays reversed. */
  operations: UndoOperation[];
  /** Features left behind because they carry no code. Surfaced so the confirm can say so. */
  uncodedCount: number;
}

export interface SplitLayerRefused {
  ok: false;
  reason: SplitLayerRefusal;
}

/** `"Topo"` + `"FN01"` → `"Topo — FN01"`, made unique against the names already in the drawing. */
function uniqueName(base: string, code: string, taken: Set<string>): string {
  const wanted = `${base} — ${code}`;
  if (!taken.has(wanted.toLowerCase())) return wanted;
  // A drawing that has been split before already holds "Topo — FN01". Numbering the collision is
  // better than refusing the whole split or, worse, merging into the existing layer — which would
  // quietly mix a second survey's shots into the first one's layer.
  for (let n = 2; ; n += 1) {
    const candidate = `${wanted} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Plan a split without performing it.
 *
 * Pure, and separated from the store write for the reason `planLayerMerge` is: the refusals and the
 * operation ordering are the parts that can be wrong, and they are testable without an editor.
 */
export function planLayerSplitByCode(input: SplitLayerByCodeInput): SplitLayerPlan | SplitLayerRefused {
  const { sourceLayerId, layers, features, makeLayerId } = input;

  const source = layers[sourceLayerId];
  if (!source) return { ok: false, reason: 'SOURCE_MISSING' };
  // Splitting re-parents every coded feature off this layer, which is a write to geometry the lock
  // is there to protect. The same rule `planLayerMerge` applies to its source.
  if (source.locked) return { ok: false, reason: 'SOURCE_LOCKED' };

  const onLayer = Object.values(features).filter((f) => f.layerId === sourceLayerId);

  // Grouped by the code EXACTLY as carried, apart from case. `FN01` and `fn01` are the same code —
  // a field crew types both — and splitting them into two layers would be a bug that looks like a
  // feature until somebody notices the drawing has two fence layers.
  const byCode = new Map<string, { code: string; featureIds: string[] }>();
  let uncodedCount = 0;
  for (const f of onLayer) {
    const code = featureCode(f);
    if (!code) { uncodedCount += 1; continue; }
    const key = code.toUpperCase();
    const bucket = byCode.get(key);
    if (bucket) bucket.featureIds.push(f.id);
    // The first spelling seen names the layer, so the label matches what is in the drawing rather
    // than an upper-cased normalisation the surveyor never typed.
    else byCode.set(key, { code, featureIds: [f.id] });
  }

  if (byCode.size === 0) return { ok: false, reason: 'NO_CODED_FEATURES' };
  // One code means one layer, which is the layer they already have. Refusing is better than
  // producing an identical copy and deleting nothing — the "button that always produces one layer"
  // C7 was right to want avoided, just for a different reason than it gave.
  if (byCode.size === 1) return { ok: false, reason: 'SINGLE_CODE' };

  const taken = new Set(Object.values(layers).map((l) => l.name.toLowerCase()));
  const groups: SplitLayerGroup[] = [];
  const newLayers: Layer[] = [];
  let index = 0;

  for (const { code, featureIds } of byCode.values()) {
    const layerId = makeLayerId(code, index);
    const layerName = uniqueName(source.name, code, taken);
    taken.add(layerName.toLowerCase());
    // Every visual property is inherited from the source. A split is a REORGANISATION, not a
    // restyle: if the new layers picked their own colours, splitting would change how the drawing
    // looks, and a surveyor doing this to tidy a plat would have to re-style everything they just
    // separated. The code tier still styles the features themselves (C22), so the layers agreeing
    // with the source costs nothing.
    newLayers.push({
      ...source,
      id: layerId,
      name: layerName,
      isDefault: false,
      // Never inherited: a protected copy could not be deleted, so an accidental split would leave
      // permanent layers behind.
      isProtected: false,
      autoAssignCodes: [],
      sortOrder: source.sortOrder + index + 1,
      featureCount: undefined,
    });
    groups.push({ code, layerId, layerName, featureIds });
    index += 1;
  }

  // Layers first: on undo these are replayed in reverse, so the features are moved back to the
  // source BEFORE the layers they were on are removed. The other order strands them on a layer
  // mid-deletion, and `getVisibleFeatures` drops a feature whose layer is missing silently — the
  // invisible-geometry failure `planLayerMerge` documents.
  const operations: UndoOperation[] = newLayers.map((l) => ({
    type: 'ADD_LAYER',
    data: l as unknown as Record<string, unknown>,
  }));
  for (const g of groups) {
    for (const id of g.featureIds) {
      operations.push({
        type: 'MODIFY_FEATURE',
        data: { id, before: { layerId: sourceLayerId }, after: { layerId: g.layerId } },
      });
    }
  }

  return { ok: true, sourceName: source.name, groups, newLayers, operations, uncodedCount };
}

/** Human-readable reason, for the surveyor rather than the log. */
export function describeSplitRefusal(reason: SplitLayerRefusal): string {
  switch (reason) {
    case 'SOURCE_MISSING':
      return 'That layer no longer exists.';
    case 'SOURCE_LOCKED':
      return 'That layer is locked, and splitting moves its features. Unlock it first.';
    case 'NO_CODED_FEATURES':
      return 'Nothing on this layer carries a point code, so there is nothing to split it by.';
    case 'SINGLE_CODE':
      return 'Everything on this layer shares one point code — splitting would just copy it.';
  }
}
