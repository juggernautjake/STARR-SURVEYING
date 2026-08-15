// lib/cad/calculators/registry.ts — C28, one predictable place
//
// ── WHAT C27 MEASURED ───────────────────────────────────────────────────────────────────────────
//
// 13 calculation surfaces, all reachable, and reachable from **seven different doors**: a Calculator
// modal with a two-entry picker, a separate legacy Curve modal, a Calc Point dialog under the AI
// submenu, an Intersect dialog under Edit, a Traverse panel and viewer under View, a Closure report
// inside the traverse panel, and an area HUD that appears only while the MEASURE_AREA tool is
// active.
//
// Every one of them works. The problem is that a surveyor who wants to compute something has to
// already know which of the seven doors that particular computation lives behind — and the picker
// that looks like the answer offers two of the thirteen.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────────
//
// One list of every calculation the product can do, with how to get to it. The hub renders it; the
// dedicated dialogs keep working exactly as they did, because **rehoming twelve working surfaces
// into one modal would be a rewrite that risks all of them to fix a discovery problem.** The door
// is what was missing, not the rooms.
//
// Adding a calculator means adding an entry here. That is deliberately the only step, so the next
// C29 engine cannot ship reachable-from-nowhere — the shape C27 found three times in one module.

/** How the hub surfaces an entry. */
export type CalculatorMode =
  /** Rendered inside the calculator modal itself. */
  | 'INLINE'
  /** Has its own dialog; the hub dispatches its open event and steps out of the way. */
  | 'DIALOG';

export interface CalculatorEntry {
  id: string;
  /** What the surveyor calls it. */
  label: string;
  /** What it computes, in one line. Shown in the hub, because "Solver" tells nobody anything. */
  summary: string;
  mode: CalculatorMode;
  /** For `DIALOG` entries: the window event that opens it. */
  openEvent?: string;
  /** True when the calculation reads the current selection, so the hub can say so rather than
   *  letting the surveyor open it and find empty fields. C27 measured exactly one surface doing
   *  this; the flag exists so the count is visible as the rest catch up. */
  usesSelection: boolean;
  /** True when the answer becomes geometry in the drawing rather than text on a screen. The
   *  distinction a surveyor cares about most, and the one C27 found hardest to see from outside. */
  writesGeometry: boolean;
  /** Grouping in the hub. */
  group: 'GENERAL' | 'POINTS' | 'CURVES' | 'TRAVERSE' | 'AREA';
}

/**
 * Every calculation surface in the product.
 *
 * **On the two curve entries** (C27 finding F5): `CurveCalculatorBody` is the suite's curve
 * calculator and `CurveCalculator` is a separate 320-line modal. They are not duplicates to be
 * merged — the standalone one carries the `onPlace` flow that puts the solved curve on the drawing,
 * which is the only curve path that writes geometry back. So both are listed, named for what they
 * DO rather than for which file they are, and the difference is stated instead of hidden.
 */
export const CALCULATOR_REGISTRY: ReadonlyArray<CalculatorEntry> = [
  {
    id: 'generic',
    label: 'Generic',
    summary: 'Plain arithmetic with a running tape.',
    mode: 'INLINE',
    usesSelection: false,
    writesGeometry: false,
    group: 'GENERAL',
  },
  {
    id: 'curve',
    label: 'Curve',
    summary: 'Solve a circular curve from any two of radius, length, delta, tangent, chord.',
    mode: 'INLINE',
    usesSelection: false,
    writesGeometry: false,
    group: 'CURVES',
  },
  {
    id: 'curve-place',
    label: 'Curve → place on drawing',
    // C29 — this claimed `writesGeometry: true` when C28 wrote it, on the strength of the
    // `onPlace` prop existing in the type. Nothing passed it, so the button never rendered. It is
    // wired now, and the claim is finally true.
    summary: 'The same curve solve, then draw it as an ARC on the active layer.',
    mode: 'DIALOG',
    openEvent: 'cad:openCurveCalculator',
    usesSelection: false,
    writesGeometry: true,
    group: 'CURVES',
  },
  {
    id: 'advanced-curve',
    label: 'Compound / reverse / spiral',
    // C29 — the UI `compound-curve.ts` was "built ahead of", per the reachability test's own note.
    summary: 'Compound and reverse curves and clothoid spirals, solved and drawn.',
    mode: 'INLINE',
    usesSelection: false,
    writesGeometry: true,
    group: 'CURVES',
  },
  {
    id: 'stakeout',
    label: 'Station / offset & stakeout',
    // C29 — two of the four capabilities C27 found genuinely absent, and the first surface built to
    // C28's second clause: it reads the live selection instead of asking for coordinates that are
    // already on screen.
    summary: 'Station and offset along an alignment, and angle-right stakeout from a setup.',
    mode: 'INLINE',
    usesSelection: true,
    writesGeometry: false,
    group: 'POINTS',
  },
  {
    id: 'calc-point',
    label: 'Calc Point',
    summary: 'Distance–distance, bearing–distance, bearing–bearing, fourth corner, parallel offset.',
    mode: 'DIALOG',
    openEvent: 'cad:openCalcPointDialog',
    usesSelection: true,
    writesGeometry: true,
    group: 'POINTS',
  },
  {
    id: 'intersect',
    label: 'Intersect',
    summary: 'Line, arc and circle intersections between existing features.',
    mode: 'DIALOG',
    openEvent: 'cad:openIntersect',
    usesSelection: false,
    writesGeometry: true,
    group: 'POINTS',
  },
  {
    id: 'traverse',
    label: 'Traverse',
    summary: 'Enter a traverse by bearing and distance; closure and adjustment live here.',
    mode: 'DIALOG',
    openEvent: 'cad:toggleTraversePanel',
    usesSelection: false,
    writesGeometry: true,
    group: 'TRAVERSE',
  },
  {
    id: 'partition',
    label: 'Partition to an area',
    // C29 — C27 called this "the classic reason a surveyor opens a calculator at all", and found
    // nothing in the product that could do it. It fills the AREA group, which the registry declared
    // and had nothing in — the empty-category shape C21 fixed for symbols.
    summary: 'Cut a parcel so one side has an exact area, by bearing or hinged at a point.',
    mode: 'INLINE',
    usesSelection: true,
    writesGeometry: true,
    group: 'AREA',
  },
  {
    id: 'traverse-viewer',
    label: 'Line & curve data',
    summary: 'Every line and curve in the drawing as a table, editable in place.',
    mode: 'DIALOG',
    openEvent: 'cad:toggleTraverseViewer',
    usesSelection: false,
    writesGeometry: true,
    group: 'TRAVERSE',
  },
];

/** Entries the calculator modal renders itself. */
export function inlineCalculators(): CalculatorEntry[] {
  return CALCULATOR_REGISTRY.filter((c) => c.mode === 'INLINE');
}

/** Entries the hub launches and then gets out of the way of. */
export function dialogCalculators(): CalculatorEntry[] {
  return CALCULATOR_REGISTRY.filter((c) => c.mode === 'DIALOG');
}

export function calculatorById(id: string): CalculatorEntry | undefined {
  return CALCULATOR_REGISTRY.find((c) => c.id === id);
}

export const CALCULATOR_GROUP_LABEL: Record<CalculatorEntry['group'], string> = {
  GENERAL: 'General',
  POINTS: 'Points & intersections',
  CURVES: 'Curves',
  TRAVERSE: 'Traverse',
  AREA: 'Area',
};

/** Entries in group order, then registry order. Stable, so the hub does not reshuffle. */
export function groupedCalculators(): Array<{
  group: CalculatorEntry['group'];
  label: string;
  entries: CalculatorEntry[];
}> {
  const order: CalculatorEntry['group'][] = ['GENERAL', 'POINTS', 'CURVES', 'TRAVERSE', 'AREA'];
  return order
    .map((group) => ({
      group,
      label: CALCULATOR_GROUP_LABEL[group],
      entries: CALCULATOR_REGISTRY.filter((c) => c.group === group),
    }))
    .filter((g) => g.entries.length > 0);
}
