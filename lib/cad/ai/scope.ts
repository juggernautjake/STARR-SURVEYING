// lib/cad/ai/scope.ts — C32, "do this to THESE"
//
// ── WHAT WAS ALREADY TRUE ───────────────────────────────────────────────────────────────────────
//
// The live selection is already sent to the model on every turn and digested by
// `buildSelectionDigest`. So the AI can *see* the selection. The slice asks for something else:
// that the scope be **explicit and visible, not inferred from a prompt**.
//
// Two real problems with "whatever is selected at send time":
//
//   INVISIBLE   the surveyor cannot see what the AI is about to act on before pressing send. Four
//               hundred features from a rubber-band ten minutes ago look exactly like none.
//
//   DRIFTING    the scope is read when the message is sent, not when it was composed. Clicking the
//               canvas mid-sentence — to look at the thing you are describing — silently changes
//               what "these" means. That is the worst kind of bug: the request was right, the
//               answer was right for a different question, and nothing looks wrong afterwards.
//
// So a scope can be PINNED: frozen at the moment the surveyor said "this is what I mean", and
// visibly so.

import type { DrawingDocument, Feature } from '../types';

export interface ScopeSummary {
  ids: string[];
  count: number;
  /** Feature type → how many, for the chip. */
  byType: Record<string, number>;
  /** Layers the scope touches, named. Empty when the scope is empty. */
  layers: string[];
  /** One line for the chip: "12 features · 3 POINT, 9 LINE · BOUNDARY, FENCE". */
  label: string;
}

/** Ids that no longer exist are dropped, and the count reflects that. A pinned scope outlives the
 *  features in it — the surveyor can pin twelve, delete four, then send — and a scope claiming
 *  twelve while acting on eight would be a lie in the one place this feature exists to prevent one. */
export function summariseScope(doc: DrawingDocument, ids: string[]): ScopeSummary {
  const byType: Record<string, number> = {};
  const layers = new Set<string>();
  const live: string[] = [];

  for (const id of ids) {
    const f: Feature | undefined = doc.features[id];
    if (!f) continue;
    live.push(id);
    byType[f.type] = (byType[f.type] ?? 0) + 1;
    layers.add(doc.layers[f.layerId]?.name ?? f.layerId);
  }

  const layerList = [...layers].sort();
  return {
    ids: live,
    count: live.length,
    byType,
    layers: layerList,
    label: buildLabel(live.length, byType, layerList),
  };
}

const MAX_LABEL_LAYERS = 3;

function buildLabel(count: number, byType: Record<string, number>, layers: string[]): string {
  if (count === 0) return 'Nothing selected';
  const types = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
  // Layers are truncated rather than wrapped: the chip is one line by design, and a scope spanning
  // nine layers is a fact the surveyor needs at a glance, not a list they need to read.
  const shown = layers.slice(0, MAX_LABEL_LAYERS).join(', ');
  const more = layers.length > MAX_LABEL_LAYERS ? ` +${layers.length - MAX_LABEL_LAYERS}` : '';
  return `${count} feature${count === 1 ? '' : 's'} · ${types} · ${shown}${more}`;
}

/**
 * Which ids a turn should act on.
 *
 * A pinned scope wins over the live selection, which is the whole point of pinning: the surveyor
 * said "these", and then went on looking at the drawing. Returning the live selection instead would
 * make the pin decorative.
 */
export function resolveScopeIds(
  pinned: string[] | null,
  liveSelection: string[],
): string[] {
  return pinned ?? liveSelection;
}

/**
 * Whether a pinned scope has gone stale — some of what was pinned no longer exists.
 *
 * Reported rather than auto-corrected. Silently shrinking the scope would mean the surveyor sends
 * "move these twelve" and eight move, with the chip having quietly agreed with itself. Saying
 * "4 of these are gone" lets them re-pin or proceed deliberately.
 */
export function scopeStaleCount(doc: DrawingDocument, pinned: string[] | null): number {
  if (!pinned) return 0;
  let missing = 0;
  for (const id of pinned) if (!doc.features[id]) missing += 1;
  return missing;
}
