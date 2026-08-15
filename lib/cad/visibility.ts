// lib/cad/visibility.ts — C23, one answer to "why can't I see this?"
//
// ── WHY THIS EXISTS (decision D3) ───────────────────────────────────────────────────────────────
//
// There are five independent ways for something to be invisible on this canvas, and every one of
// them is a different field on a different object:
//
//   Layer.visible = false        the layer is switched off
//   Layer.frozen = true          the layer is frozen — also excluded from snap and selection
//   Layer.opacity = 0            fully transparent, and NOTHING in the UI calls this "hidden"
//   Feature.hidden = true        right-click → Hide, on one feature
//   geometry.hiddenSegments      individual edges of a polyline/polygon suppressed
//
// A surveyor looking at a gap in their linework cannot tell which of the five did it, and "unhide
// everything" would have to mean five different reversals. D3's rule: **P6 starts in the model, not
// the panel** — a hidden-items panel built over five flags is a prettier version of the same
// confusion, because it still cannot say what to undo.
//
// So this module answers with a REASON, and each reason names the exact control that reverses it.
// C24 renders those; C25 counts them; C26 uses the same vocabulary for isolate.
//
// Pure: no store, no React, no canvas. Everything it needs is passed in.

import type { Feature, Layer } from './types';

/** Why something cannot be seen. Ordered by which reversal to offer first — see `visibility`. */
export type HiddenReason =
  | 'layer-frozen'
  | 'layer-hidden'
  | 'layer-transparent'
  | 'feature-hidden';

export interface Visibility {
  /** True only when nothing is suppressing the feature. Partial edge hiding does NOT make this
   *  false — the feature is still on screen, just missing some edges. */
  visible: boolean;
  /** Why not, when `visible` is false. Null when visible. */
  reason: HiddenReason | null;
  /** The layer the reason lives on, when it is a layer-level reason. Lets a panel offer "turn this
   *  layer back on" without re-deriving which layer to act on. */
  layerId: string | null;
  /** Edge indices suppressed on an otherwise-visible feature. Empty when none.
   *
   *  Deliberately NOT a `visible: false` case: a polygon with one boundary edge hidden still fills
   *  its full area and still reads as present. Calling that "hidden" would put every fill-styled
   *  polygon in the hidden-items panel, which is how a panel meant to reduce confusion becomes the
   *  confusion. */
  hiddenSegments: number[];
}

const VISIBLE: Visibility = { visible: true, reason: null, layerId: null, hiddenSegments: [] };

/**
 * Resolve why a feature is or is not visible.
 *
 * **Reason order is a product decision, not an implementation detail.** A feature can be suppressed
 * more than one way at once — hidden individually *on* a frozen layer — and the reason returned is
 * the one whose reversal the surveyor has to perform FIRST. Unhiding the feature while its layer is
 * still frozen changes nothing on screen, and a panel that offered that button would be the third
 * thing in a row that appeared to do nothing.
 *
 * Layer reasons therefore outrank the feature reason, and among them: frozen (which also kills snap
 * and selection, so it is the most consequential) beats hidden beats transparent.
 *
 * A missing layer counts as hidden rather than throwing: a feature whose layer was deleted is
 * exactly the kind of thing this panel exists to surface, and a crash would surface nothing.
 */
export function visibility(feature: Feature, layer: Layer | undefined | null): Visibility {
  const segs = feature.geometry.hiddenSegments ?? [];
  const layerId = layer?.id ?? feature.layerId;

  if (!layer) return { visible: false, reason: 'layer-hidden', layerId, hiddenSegments: segs };
  if (layer.frozen) return { visible: false, reason: 'layer-frozen', layerId, hiddenSegments: segs };
  if (!layer.visible) return { visible: false, reason: 'layer-hidden', layerId, hiddenSegments: segs };
  // Zero opacity is invisible by any test a surveyor would apply, and nothing in the UI currently
  // calls it hidden — which makes it the most confusing of the five, because the layer's eye icon
  // is still lit.
  if (layer.opacity <= 0) {
    return { visible: false, reason: 'layer-transparent', layerId, hiddenSegments: segs };
  }
  if (feature.hidden) return { visible: false, reason: 'feature-hidden', layerId, hiddenSegments: segs };

  return segs.length > 0
    ? { visible: true, reason: null, layerId: null, hiddenSegments: segs }
    : VISIBLE;
}

/** Shorthand for "the surveyor can see this". */
export function isVisible(feature: Feature, layer: Layer | undefined | null): boolean {
  return visibility(feature, layer).visible;
}

/**
 * The reasons the RENDER path acts on, which is deliberately not all of them.
 *
 * `layer-transparent` is absent. A 0-opacity layer draws its features at alpha 0 — invisible, but
 * still hit-tested, still snappable, still selectable by rubber band. Dropping them from the render
 * set here would ALSO drop them from selection and snap (every consumer shares this predicate), and
 * that is a behaviour change, not a model unification. C23 is the model; if that change is wanted
 * it belongs in C24–C26 where a surveyor can see it happen.
 *
 * The point of naming the divergence is that there is now ONE predicate with ONE documented
 * exception, rather than two predicates free to drift — which is what D3 was about.
 */
export const RENDER_SUPPRESSING_REASONS: ReadonlySet<HiddenReason> = new Set<HiddenReason>([
  'layer-frozen',
  'layer-hidden',
  'feature-hidden',
]);

/** The render / selection / snap predicate. Same model as `isVisible`, minus the opacity rule. */
export function isRenderable(feature: Feature, layer: Layer | undefined | null): boolean {
  const v = visibility(feature, layer);
  if (v.visible) return true;
  return !v.reason || !RENDER_SUPPRESSING_REASONS.has(v.reason);
}

/**
 * What the surveyor has to do to get it back, in their words.
 *
 * The panel renders these directly, so they name a control that exists rather than a field that
 * does — "Thaw the layer", not "set frozen to false".
 */
export const HIDDEN_REASON_LABEL: Record<HiddenReason, string> = {
  'layer-frozen': 'Layer is frozen',
  'layer-hidden': 'Layer is turned off',
  'layer-transparent': 'Layer opacity is 0',
  'feature-hidden': 'Hidden individually',
};

export const HIDDEN_REASON_FIX: Record<HiddenReason, string> = {
  'layer-frozen': 'Thaw the layer',
  'layer-hidden': 'Turn the layer on',
  'layer-transparent': 'Raise the layer opacity',
  'feature-hidden': 'Unhide this feature',
};

export interface HiddenGroup {
  reason: HiddenReason;
  /** Layer id for layer-level reasons; null for the feature-level one, whose members can span
   *  layers. */
  layerId: string | null;
  featureIds: string[];
}

/**
 * Group every invisible feature by reason (and by layer, for layer-level reasons) so a panel can
 * offer ONE control per group rather than one per feature.
 *
 * That grouping is the point: a frozen layer holding 4,000 features is one problem with one fix,
 * and listing it 4,000 times is what makes the current situation unreadable.
 *
 * Order is stable — reason priority, then layer id — so the panel does not reshuffle under the
 * cursor as features are unhidden.
 */
export function groupHidden(
  features: Iterable<Feature>,
  layers: Record<string, Layer>,
): HiddenGroup[] {
  const byKey = new Map<string, HiddenGroup>();
  for (const f of features) {
    const v = visibility(f, layers[f.layerId]);
    if (v.visible || !v.reason) continue;
    // Feature-level hiding is one group across the whole drawing; layer-level reasons are one
    // group per layer, because each has its own control.
    const layerKey = v.reason === 'feature-hidden' ? null : v.layerId;
    const key = `${v.reason}:${layerKey ?? ''}`;
    const existing = byKey.get(key);
    if (existing) existing.featureIds.push(f.id);
    else byKey.set(key, { reason: v.reason, layerId: layerKey, featureIds: [f.id] });
  }

  const order: HiddenReason[] = ['layer-frozen', 'layer-hidden', 'layer-transparent', 'feature-hidden'];
  return [...byKey.values()].sort((a, b) => {
    const d = order.indexOf(a.reason) - order.indexOf(b.reason);
    return d !== 0 ? d : (a.layerId ?? '').localeCompare(b.layerId ?? '');
  });
}

/** How many features are invisible. */
export function countHidden(
  features: Iterable<Feature>,
  layers: Record<string, Layer>,
): number {
  let n = 0;
  for (const f of features) {
    if (!visibility(f, layers[f.layerId]).visible) n += 1;
  }
  return n;
}

/**
 * C24 — the sixth mechanism, found by building the panel.
 *
 * `TextLabel.visible === false` hides a label without touching its feature, so a bearing call can
 * vanish while the line it annotates stays put. C23 enumerated five ways for a FEATURE to be
 * invisible and missed this one because it is not on a feature at all; the existing hidden-items
 * panel already had a whole tab for it.
 *
 * Kept separate from `visibility()` rather than folded in, because a hidden label is not a hidden
 * feature and merging them would make `countHidden` mean two different things at once. A label on
 * an invisible feature is excluded: it is not independently hidden, and listing it would send the
 * surveyor to un-hide a label that would still not appear.
 */
export function hiddenLabels(
  features: Iterable<Feature>,
  layers: Record<string, Layer>,
): Array<{ featureId: string; labelId: string }> {
  const out: Array<{ featureId: string; labelId: string }> = [];
  for (const f of features) {
    if (!visibility(f, layers[f.layerId]).visible) continue;
    for (const l of f.textLabels ?? []) {
      if (l.visible === false) out.push({ featureId: f.id, labelId: l.id });
    }
  }
  return out;
}

/** Everything invisible, features and labels. The number C25 keeps on screen. */
export function countAllHidden(
  features: Iterable<Feature>,
  layers: Record<string, Layer>,
): { features: number; labels: number; total: number } {
  const list = [...features];
  const f = countHidden(list, layers);
  const l = hiddenLabels(list, layers).length;
  return { features: f, labels: l, total: f + l };
}

export interface HiddenSummary {
  /** Features + labels. */
  total: number;
  hiddenFeatures: number;
  hiddenLabelCount: number;
  /** How many features are on screen, and how many exist at all. */
  visibleFeatures: number;
  totalFeatures: number;
  byReason: Record<HiddenReason, number>;
  /**
   * The drawing has content and none of it is on screen.
   *
   * This is the actual "where did my linework go" moment — not a count in the corner, but a blank
   * canvas. A number in the status bar only removes that failure for a surveyor who thinks to look
   * at the status bar, and the person most likely to miss it is the one staring at nothing.
   */
  blankButNotEmpty: boolean;
}

/**
 * C25 — one pass over the drawing answering everything an indicator needs.
 *
 * One walk rather than four: `countHidden`, `hiddenLabels` and `groupHidden` each iterate the whole
 * feature map, and a status bar that recomputes on every store change should not pay for three of
 * them. Same reasoning as C22's per-frame read — cheap in a fixture, not on 200k features.
 */
export function hiddenSummary(
  features: Iterable<Feature>,
  layers: Record<string, Layer>,
): HiddenSummary {
  const byReason: Record<HiddenReason, number> = {
    'layer-frozen': 0, 'layer-hidden': 0, 'layer-transparent': 0, 'feature-hidden': 0,
  };
  let hidden = 0;
  let visible = 0;
  let total = 0;
  let labels = 0;

  for (const f of features) {
    total += 1;
    const v = visibility(f, layers[f.layerId]);
    if (v.visible) {
      visible += 1;
      for (const l of f.textLabels ?? []) {
        if (l.visible === false) labels += 1;
      }
    } else if (v.reason) {
      hidden += 1;
      byReason[v.reason] += 1;
    }
  }

  return {
    total: hidden + labels,
    hiddenFeatures: hidden,
    hiddenLabelCount: labels,
    visibleFeatures: visible,
    totalFeatures: total,
    byReason,
    blankButNotEmpty: total > 0 && visible === 0,
  };
}

/** One line naming what is hiding things, for a tooltip or a notice. Empty when nothing is. */
export function describeHidden(summary: HiddenSummary): string {
  const parts: HiddenReason[] = ['layer-frozen', 'layer-hidden', 'layer-transparent', 'feature-hidden'];
  const bits = parts
    .filter((r) => summary.byReason[r] > 0)
    .map((r) => `${summary.byReason[r]} ${HIDDEN_REASON_LABEL[r].toLowerCase()}`);
  if (summary.hiddenLabelCount > 0) {
    bits.push(`${summary.hiddenLabelCount} hidden label${summary.hiddenLabelCount === 1 ? '' : 's'}`);
  }
  return bits.join(' · ');
}

/**
 * Features that would become visible if this one reason were reversed.
 *
 * Used by the panel's per-group action, and it is not the same as "the group's members": reversing
 * a frozen layer does not reveal a feature on it that is ALSO individually hidden. Telling the
 * surveyor "this will bring back 4,000 features" and then bringing back 3,996 is a small lie that
 * costs exactly the trust this panel is meant to build.
 */
export function wouldRevealCount(
  group: HiddenGroup,
  featuresById: Record<string, Feature>,
  layers: Record<string, Layer>,
): number {
  let n = 0;
  for (const id of group.featureIds) {
    const f = featuresById[id];
    if (!f) continue;
    const layer = layers[f.layerId];
    if (!layer) continue;
    // Simulate only this reversal, leaving every other suppressor in place.
    const patchedLayer: Layer =
      group.reason === 'layer-frozen' ? { ...layer, frozen: false }
      : group.reason === 'layer-hidden' ? { ...layer, visible: true }
      : group.reason === 'layer-transparent' ? { ...layer, opacity: 1 }
      : layer;
    const patchedFeature: Feature =
      group.reason === 'feature-hidden' ? { ...f, hidden: false } : f;
    if (visibility(patchedFeature, patchedLayer).visible) n += 1;
  }
  return n;
}
