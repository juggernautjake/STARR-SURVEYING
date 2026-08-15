// C25 — an indicator that reaches the person who needs it.
//
// ── WHAT WAS ALREADY THERE, AND WHAT IT COULD NOT DO ────────────────────────────────────────────
//
// C24 left the status-bar pill correct (it counts every mechanism) and clickable. It removes the
// "where did my linework go" failure **for a surveyor who thinks to look at the status bar**.
//
// The person most likely to miss a small amber number in the corner is the one staring at an empty
// canvas — and that is precisely when the answer matters most, because a drawing opened with a
// saved layer state that turns everything off looks identical to a drawing that failed to load.
//
// So C25 is two things: the pill says WHAT is hiding things instead of just how many, and when
// nothing at all is on screen the canvas says so itself.
//
// The notice is deliberately NOT shown for a partially hidden drawing. Hiding things is a normal
// part of drafting; a warning that appears whenever anything is hidden would be on screen most of
// the time, and a warning you see constantly is one you stop reading.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hiddenSummary, describeHidden } from '@/lib/cad/visibility';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature, Layer, TextLabel } from '@/lib/cad/types';

const layer = (over: Partial<Layer> = {}): Layer => ({
  id: 'L1', name: 'Layer 1',
  visible: true, locked: false, frozen: false,
  color: '#000000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  ...over,
});

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

const hiddenLabel = (id: string): TextLabel =>
  ({ id, featureId: 'f', kind: 'BEARING', text: 'N 45 E', offset: { x: 0, y: 0 }, rotation: null, visible: false }) as TextLabel;

describe('the summary answers everything an indicator needs', () => {
  const layers = {
    L1: layer({ id: 'L1' }),
    L2: layer({ id: 'L2', frozen: true }),
    L3: layer({ id: 'L3', visible: false }),
    L4: layer({ id: 'L4', opacity: 0 }),
  };

  it('breaks the count down by reason', () => {
    const features = [
      feat({ layerId: 'L2' }), feat({ layerId: 'L2' }),
      feat({ layerId: 'L3' }),
      feat({ layerId: 'L4' }),
      feat({ layerId: 'L1', hidden: true }),
      feat({ layerId: 'L1', textLabels: [hiddenLabel('x')] }),
      feat({ layerId: 'L1' }),
    ];
    const s = hiddenSummary(features, layers);
    expect(s.byReason).toEqual({
      'layer-frozen': 2, 'layer-hidden': 1, 'layer-transparent': 1, 'feature-hidden': 1,
    });
    expect(s.hiddenFeatures).toBe(5);
    expect(s.hiddenLabelCount).toBe(1);
    expect(s.total).toBe(6);
    expect(s.visibleFeatures).toBe(2);
    expect(s.totalFeatures).toBe(7);
  });

  it('counts labels only on features that are actually on screen', () => {
    // A label on an invisible feature is not independently hidden, and counting it would inflate a
    // number the surveyor is about to act on.
    const s = hiddenSummary([feat({ layerId: 'L2', textLabels: [hiddenLabel('x')] })], layers);
    expect(s.hiddenLabelCount).toBe(0);
  });

  it('walks the drawing once', () => {
    // `countHidden`, `hiddenLabels` and `groupHidden` each iterate the full feature map, and the
    // status bar recomputes on every store change. Same reasoning as C22's per-frame read: cheap
    // in a fixture, not on 200k features.
    const src = readFileSync(join(process.cwd(), 'lib/cad/visibility.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export function hiddenSummary'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect((body.match(/for \(const f of features\)/g) ?? []).length).toBe(1);
    expect(body).not.toMatch(/countHidden\(|hiddenLabels\(|groupHidden\(/);
  });
});

describe('blankButNotEmpty is the moment worth interrupting for', () => {
  it('is true when the drawing has content and none of it shows', () => {
    const layers = { L1: layer({ frozen: true }) };
    expect(hiddenSummary([feat(), feat()], layers).blankButNotEmpty).toBe(true);
  });

  it('is false for an empty drawing', () => {
    // "The drawing is empty" and "the drawing has 4,012 features you cannot see" are different
    // problems, and a notice about hiding would be nonsense for the first.
    expect(hiddenSummary([], { L1: layer() }).blankButNotEmpty).toBe(false);
  });

  it('is false when anything at all is visible', () => {
    // A partially hidden drawing is normal drafting. A notice there would be permanent furniture.
    const layers = { L1: layer({ id: 'L1' }), L2: layer({ id: 'L2', frozen: true }) };
    const s = hiddenSummary([feat({ layerId: 'L1' }), feat({ layerId: 'L2' })], layers);
    expect(s.blankButNotEmpty).toBe(false);
    expect(s.hiddenFeatures).toBe(1);
  });
});

describe('describeHidden says what to go fix', () => {
  it('names each reason with its count', () => {
    const layers = { L1: layer({ id: 'L1', frozen: true }), L2: layer({ id: 'L2', visible: false }) };
    const text = describeHidden(hiddenSummary([feat({ layerId: 'L1' }), feat({ layerId: 'L2' })], layers));
    expect(text).toMatch(/1 layer is frozen/i);
    expect(text).toMatch(/1 layer is turned off/i);
  });

  it('omits reasons with nothing behind them', () => {
    const layers = { L1: layer({ frozen: true }) };
    const text = describeHidden(hiddenSummary([feat()], layers));
    expect(text).not.toMatch(/opacity|individually/i);
  });

  it('is empty when nothing is hidden', () => {
    expect(describeHidden(hiddenSummary([feat()], { L1: layer() }))).toBe('');
  });

  it('mentions hidden labels', () => {
    const s = hiddenSummary([feat({ textLabels: [hiddenLabel('x')] })], { L1: layer() });
    expect(describeHidden(s)).toMatch(/1 hidden label/);
  });
});

describe('the notice is wired where the surveyor is looking', () => {
  const notice = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/BlankCanvasNotice.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('renders nothing unless the canvas is blank with content behind it', () => {
    expect(notice).toMatch(/if \(!summary\.blankButNotEmpty\) return null/);
  });

  it('names the count and the reason, not just "something is hidden"', () => {
    expect(notice).toMatch(/summary\.totalFeatures/);
    expect(notice).toMatch(/describeHidden\(summary\)/);
  });

  it('opens the panel on the event the app already uses', () => {
    expect(notice).toMatch(/'cad:toggleHiddenItems'/);
  });

  it('does not swallow canvas input', () => {
    // A full-width overlay that ate mouse events would make the canvas unusable in exactly the
    // state where the surveyor most wants to click a layer back on.
    expect(notice).toMatch(/pointer-events-none/);
    expect(notice).toMatch(/pointer-events-auto/);
  });

  it('is mounted on the canvas', () => {
    const vp = readFileSync(join(process.cwd(), 'app/admin/cad/components/CanvasViewport.tsx'), 'utf8');
    expect(vp).toMatch(/<BlankCanvasNotice \/>/);
  });
});

describe('the pill carries the breakdown', () => {
  const bar = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/StatusBar.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('uses the one-pass summary', () => {
    expect(bar).toMatch(/hiddenSummary\(Object\.values\(doc\.features\), doc\.layers\)/);
  });

  it('the tooltip says what is hiding things', () => {
    // "4,012 hidden" and "4,012 hidden, all of it one frozen layer" send the surveyor to
    // completely different places.
    expect(bar).toMatch(/describeHidden\(hidden\)/);
  });

  it('escalates when nothing at all is on screen', () => {
    // At that point it stops being a stat and becomes the answer to the question being asked.
    expect(bar).toMatch(/hidden\.blankButNotEmpty[\s\S]{0,120}text-red-300/);
  });

  it('still hides itself when nothing is hidden', () => {
    // A permanent "0 hidden" is clutter, and clutter is what makes the pill easy to miss when it
    // finally matters.
    expect(bar).toMatch(/\{hiddenCount > 0 && \(/);
  });
});
