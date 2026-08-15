// C24 — the hidden-items panel over the unified model.
//
// ── WHAT THE AUDIT FOUND ────────────────────────────────────────────────────────────────────────
//
// A `HiddenItemsPanel` already existed: 320 lines, two tabs (features and labels), per-item
// attributes, a per-item Show button, an Unhide All. Reachable from the layer panel and from a
// status-bar pill.
//
// It filtered `f.hidden === true`, **and nothing else.**
//
// So a frozen layer holding 4,000 features made the one screen built to answer "where did my
// linework go" report **"No hidden features."** — confidently, with a matching "0 hidden" in the
// status bar. That is the failure D3 predicted in as many words: a panel over one of five flags
// cannot say what to undo, because it cannot see four of the ways things got hidden.
//
// It also revealed a gap in C23's own enumeration: `TextLabel.visible === false` is a SIXTH
// mechanism, hiding a bearing call while the line it annotates stays put. The old panel had a whole
// tab for it and the new model did not know about it.
//
// ── WHAT IS TESTED HERE ─────────────────────────────────────────────────────────────────────────
//
// The label helper and the count are real logic and are exercised directly. The panel itself is a
// store-bound component with expandable rows; what is worth pinning there is that it consults the
// model at all, that the reversal it offers is the right one, and that "Unhide All" actually
// unhides all — which it did not.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hiddenLabels, countAllHidden, groupHidden } from '@/lib/cad/visibility';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature, Layer, TextLabel } from '@/lib/cad/types';

const layer = (over: Partial<Layer> = {}): Layer => ({
  id: 'L1', name: 'Layer 1',
  visible: true, locked: false, frozen: false,
  color: '#000000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  ...over,
});

const label = (id: string, visible: boolean): TextLabel => ({
  id, featureId: 'f', kind: 'BEARING', text: 'N 45 E',
  offset: { x: 0, y: 0 }, rotation: null, visible,
} as TextLabel);

let n = 0;
const feat = (over: Partial<Feature> = {}): Feature => ({
  id: `f${++n}`,
  type: 'LINE',
  geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  layerId: 'L1',
  style: { ...DEFAULT_FEATURE_STYLE },
  properties: {},
  ...over,
});

describe('hidden labels — the sixth mechanism', () => {
  const layers = { L1: layer(), L2: layer({ id: 'L2', frozen: true }) };

  it('finds a label hidden on a visible feature', () => {
    const f = feat({ textLabels: [label('a', false), label('b', true)] });
    expect(hiddenLabels([f], layers)).toEqual([{ featureId: f.id, labelId: 'a' }]);
  });

  it('ignores labels on a feature that is itself invisible', () => {
    // The label is not independently hidden, and listing it would send the surveyor to un-hide a
    // label that still would not appear — the same "third thing that did nothing" C23 designed
    // reason priority to avoid.
    const f = feat({ layerId: 'L2', textLabels: [label('a', false)] });
    expect(hiddenLabels([f], layers)).toEqual([]);
  });

  it('treats a label with no visible field as visible', () => {
    // Labels predating the flag have none, and defaulting them to hidden would fill the panel with
    // every label in every older drawing.
    const f = feat({ textLabels: [{ ...label('a', true), visible: undefined } as unknown as TextLabel] });
    expect(hiddenLabels([f], layers)).toEqual([]);
  });
});

describe('the honest total', () => {
  it('counts features hidden every way, plus labels', () => {
    const layers = {
      L1: layer({ id: 'L1' }),
      L2: layer({ id: 'L2', frozen: true }),
      L3: layer({ id: 'L3', visible: false }),
      L4: layer({ id: 'L4', opacity: 0 }),
    };
    const features = [
      feat({ layerId: 'L1', hidden: true }),
      feat({ layerId: 'L2' }),
      feat({ layerId: 'L3' }),
      feat({ layerId: 'L4' }),
      feat({ layerId: 'L1', textLabels: [label('x', false)] }),
      feat({ layerId: 'L1' }),
    ];
    // The old status-bar count would have said 1 here — the one `hidden` flag — while five things
    // were invisible.
    expect(countAllHidden(features, layers)).toEqual({ features: 4, labels: 1, total: 5 });
  });

  it('is zero on a clean drawing', () => {
    expect(countAllHidden([feat()], { L1: layer() })).toEqual({ features: 0, labels: 0, total: 0 });
  });
});

describe('the panel consults the model', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/HiddenItemsPanel.tsx'), 'utf8',
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('groups by reason instead of filtering one flag', () => {
    expect(code).toMatch(/groupHidden\(Object\.values\(store\.document\.features\), store\.document\.layers\)/);
  });

  it('renders a card per reason with its own control', () => {
    expect(code).toMatch(/reasonGroups\.map/);
    expect(code).toMatch(/HIDDEN_REASON_FIX\[group\.reason\]/);
  });

  it('each control performs the reversal its label promises', () => {
    // A button reading "Thaw the layer" that flipped `visible` instead would be indistinguishable
    // from a broken panel — the drawing stays missing and the label was right.
    const card = code.slice(code.indexOf('function ReasonGroupCard'));
    expect(card).toMatch(/'layer-frozen'[\s\S]{0,120}\{ frozen: false \}/);
    expect(card).toMatch(/'layer-hidden'[\s\S]{0,120}\{ visible: true \}/);
    expect(card).toMatch(/'layer-transparent'[\s\S]{0,120}\{ opacity: 1 \}/);
    expect(card).toMatch(/'feature-hidden'[\s\S]{0,160}unhideFeature/);
  });

  it('shows what the reversal will ACTUALLY reveal', () => {
    expect(code).toMatch(/wouldRevealCount\(group, features, layers\)/);
    // And says so when the two differ, rather than quietly over-promising.
    expect(code).toMatch(/stuck > 0/);
  });

  it('keeps the per-feature list for individually hidden features', () => {
    // Those were chosen one at a time and are worth inspecting one at a time. Listing a frozen
    // layer's 4,000 features the same way is what makes a panel unreadable.
    expect(code).toMatch(/filteredFeatures\.map/);
    expect(code).toMatch(/HiddenFeatureRow/);
  });
});

describe('"Unhide All" now unhides all', () => {
  const code = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/HiddenItemsPanel.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const handler = (() => {
    const at = code.indexOf('Unhide All');
    // The onClick sits above the label in the JSX.
    return code.slice(Math.max(0, at - 1400), at);
  })();

  it('thaws, shows and de-transparents every layer', () => {
    // It previously walked only `hiddenFeatures` and the labels, so a button reading "Unhide All"
    // left a frozen layer frozen — the worst kind of control, because it appears to have worked
    // and the drawing is still missing.
    expect(handler).toMatch(/if \(l\.frozen\) patch\.frozen = false/);
    expect(handler).toMatch(/if \(!l\.visible\) patch\.visible = true/);
    expect(handler).toMatch(/if \(l\.opacity <= 0\) patch\.opacity = 1/);
  });

  it('and still unhides features and labels', () => {
    expect(handler).toMatch(/unhideFeature\(f\.id\)/);
    expect(handler).toMatch(/updateTextLabel\(feature\.id, label\.id, \{ visible: true \}\)/);
  });

  it('does not iterate the stale group list', () => {
    // `reasonGroups` was computed against the current document and every reversal changes it.
    // Flipping the underlying fields outright is the only version that finishes in one press.
    expect(handler).not.toMatch(/reasonGroups\.(forEach|map)/);
  });
});

describe('the status bar agrees with the panel', () => {
  const bar = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/StatusBar.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('counts every mechanism', () => {
    // A bar reading "0 hidden" beside a panel listing 4,012 would be worse than either alone.
    //
    // C25 swapped `countAllHidden` for `hiddenSummary` — the same total in one pass, plus the
    // per-reason breakdown the tooltip needs. The invariant this test exists for is that the count
    // comes from the shared model over the whole document, not from the `hidden` flag; the
    // assertion follows the call rather than pinning a function name that was always going to move.
    expect(bar).toMatch(/hiddenSummary\(Object\.values\(doc\.features\), doc\.layers\)/);
    expect(bar).toMatch(/const hiddenCount = hidden\.total/);
    expect(bar).not.toMatch(/filter\(\(f\) => f\.hidden\)\.length/);
  });
});

describe('the panel is reachable', () => {
  it('from the View menu, on the event the app already uses', () => {
    // A second event name would have made the menu entry open nothing, which is the kind of defect
    // that looks like the feature was never built.
    const menu = readFileSync(join(process.cwd(), 'app/admin/cad/components/MenuBar.tsx'), 'utf8');
    expect(menu).toMatch(/Hidden Items…/);
    expect(menu).toMatch(/'cad:toggleHiddenItems'/);
    const layout = readFileSync(join(process.cwd(), 'app/admin/cad/CADLayout.tsx'), 'utf8');
    expect(layout).toMatch(/cad:toggleHiddenItems/);
  });
});

describe('grouping still holds for the panel’s shape', () => {
  it('one group per layer reason, one for the per-feature flag', () => {
    const layers = { L1: layer({ id: 'L1', frozen: true }), L2: layer({ id: 'L2' }) };
    const features = [
      feat({ layerId: 'L1' }),
      feat({ layerId: 'L1' }),
      feat({ layerId: 'L2', hidden: true }),
    ];
    const groups = groupHidden(features, layers);
    expect(groups.map((g) => g.reason)).toEqual(['layer-frozen', 'feature-hidden']);
    expect(groups[0].featureIds).toHaveLength(2);
  });
});
