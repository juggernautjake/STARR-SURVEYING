// C28 — one predictable place for the calculators.
//
// ── WHAT C27 MEASURED ───────────────────────────────────────────────────────────────────────────
//
// 13 calculation surfaces, all reachable, behind **seven different doors**: a Calculator modal with
// a two-entry picker, a separate legacy Curve modal, Calc Point under the AI submenu, Intersect
// under Edit, a Traverse panel and viewer under View, a Closure report inside the traverse panel,
// and an area HUD that exists only while MEASURE_AREA is active.
//
// Every one works. The problem is that a surveyor who wants to compute something has to already
// know which of the seven doors that computation lives behind — and the picker that looks like the
// answer offered two of the thirteen.
//
// ── WHAT THIS SLICE IS, AND IS NOT ──────────────────────────────────────────────────────────────
//
// It is one registry and one door. It is NOT a rehoming of twelve working dialogs into a single
// modal: that is a rewrite that risks all of them to fix a discovery problem, and the door was what
// was missing, not the rooms.
//
// C28's other two clauses — selection-as-input and provenance on write-back — are not this slice.
// C27 measured selection-as-input at 1 of 13 surfaces, so it is twelve surfaces of work; provenance
// has no field on `Feature` to write to yet, which is where C30 starts. Both are flagged per entry
// here so the gap is visible rather than assumed closed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CALCULATOR_REGISTRY,
  calculatorById,
  inlineCalculators,
  dialogCalculators,
  groupedCalculators,
  CALCULATOR_GROUP_LABEL,
} from '@/lib/cad/calculators/registry';

describe('the registry', () => {
  it('has unique ids', () => {
    const ids = CALCULATOR_REGISTRY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every door C27 found, not just the two that render inline', () => {
    for (const id of [
      'generic', 'curve', 'curve-place', 'calc-point', 'intersect', 'traverse', 'traverse-viewer',
    ]) {
      expect(calculatorById(id), `${id} missing`).toBeDefined();
    }
  });

  it('every DIALOG entry names the event that opens it', () => {
    // An entry with no event is a menu row that does nothing — the defect shape this doc has now
    // found in offsets, snap types, the code-style panel and the hidden-items panel.
    for (const c of dialogCalculators()) {
      expect(c.openEvent, `${c.id} has no open event`).toBeTruthy();
      expect(c.openEvent).toMatch(/^cad:/);
    }
  });

  it('every INLINE entry has no event, and vice versa', () => {
    for (const c of inlineCalculators()) expect(c.openEvent).toBeUndefined();
  });

  it('every entry says what it computes', () => {
    // "Solver" tells nobody anything. The summary is the difference between a list a surveyor can
    // scan and one they have to open seven times.
    for (const c of CALCULATOR_REGISTRY) {
      expect(c.summary.length, c.id).toBeGreaterThan(20);
      expect(c.label.length, c.id).toBeGreaterThan(0);
    }
  });

  it('groups are stable and every group has a label', () => {
    const groups = groupedCalculators();
    expect(groups.map((g) => g.group)).toEqual(['GENERAL', 'POINTS', 'CURVES', 'TRAVERSE']);
    for (const g of groups) expect(g.label).toBe(CALCULATOR_GROUP_LABEL[g.group]);
    // No empty groups rendered — a heading with nothing under it reads as "this drawing has none",
    // the C21 lesson.
    for (const g of groups) expect(g.entries.length).toBeGreaterThan(0);
  });

  it('accounts for every registry entry exactly once across groups', () => {
    const flat = groupedCalculators().flatMap((g) => g.entries.map((e) => e.id));
    expect(flat.sort()).toEqual(CALCULATOR_REGISTRY.map((c) => c.id).sort());
  });
});

describe('the two curve entries are a decision, not a duplicate', () => {
  // C27 finding F5. `CurveCalculatorBody` is the suite's curve calculator; `CurveCalculator` is a
  // separate 320-line modal. They are not merge candidates — the standalone one carries the
  // `onPlace` flow that puts the solved curve on the drawing, which is the ONLY curve path that
  // creates geometry. Both are listed, named for what they do.
  it('one solves, one solves and draws', () => {
    expect(calculatorById('curve')!.writesGeometry).toBe(false);
    expect(calculatorById('curve-place')!.writesGeometry).toBe(true);
  });

  it('and the difference is in the label, not only the flag', () => {
    expect(calculatorById('curve-place')!.label).toMatch(/place on drawing/i);
  });
});

describe('the honest flags', () => {
  it('records that only one surface reads the selection', () => {
    // C27 measured 1 of 13. The flag exists so the gap is visible as the rest catch up, rather
    // than being assumed closed because C28 shipped.
    const withSelection = CALCULATOR_REGISTRY.filter((c) => c.usesSelection);
    expect(withSelection.map((c) => c.id)).toEqual(['calc-point']);
  });

  it('records which answers become geometry', () => {
    const writers = CALCULATOR_REGISTRY.filter((c) => c.writesGeometry).map((c) => c.id);
    expect(writers).toContain('calc-point');
    expect(writers).toContain('intersect');
    expect(writers).not.toContain('generic');
  });
});

describe('the picker offers all of it', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/CalculatorPicker.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('renders from the registry rather than its own list', () => {
    expect(src).toMatch(/groupedCalculators\(\)/);
    // The old hard-coded pair would silently stop matching the registry the moment C29 adds one.
    expect(src).not.toMatch(/\{ id: 'generic', label: 'Generic' \}/);
  });

  it('launches a dialog entry instead of trying to render it', () => {
    expect(src).toMatch(/entry\.mode === 'DIALOG'/);
    expect(src).toMatch(/new CustomEvent\(entry\.openEvent\)/);
  });

  it('does not persist a dialog as the active inline calculator', () => {
    // It is not what this modal shows next time; leaving it selected reopens the hub with a dialog
    // name in the box and nothing under it.
    const pick = src.slice(src.indexOf('function pick'), src.indexOf('return ('));
    expect(pick).toMatch(/return;\s*\}\s*setActiveCalculator/);
  });

  it('marks the entries that open somewhere else', () => {
    // One control that both switches a body and launches a dialog must not do the two silently.
    expect(src).toMatch(/'DIALOG' \? `\$\{c\.label\} ↗`/);
  });

  it('closes the hub when it launches one', () => {
    expect(src).toMatch(/onLaunchDialog\?\.\(\)/);
    const modal = readFileSync(
      join(process.cwd(), 'app/admin/cad/components/CalculatorModal.tsx'), 'utf8',
    );
    expect(modal).toMatch(/onLaunchDialog=\{onClose\}/);
  });
});

describe('every registered event has a listener', () => {
  // The whole slice fails silently if one of these is a typo: the picker dispatches into the void
  // and the surveyor concludes the entry is broken. This is the check that makes the registry
  // trustworthy.
  const sources = [
    'app/admin/cad/CADLayout.tsx',
    'app/admin/cad/components/CanvasViewport.tsx',
  ].map((p) => readFileSync(join(process.cwd(), p), 'utf8')).join('\n');

  it.each(dialogCalculators().map((c) => [c.id, c.openEvent!] as const))(
    '%s → %s',
    (_id, event) => {
      expect(sources).toContain(`addEventListener('${event}'`);
    },
  );
});

describe('the menu names the one place', () => {
  const menu = readFileSync(join(process.cwd(), 'app/admin/cad/components/MenuBar.tsx'), 'utf8');

  it('says it holds all of them', () => {
    // "Calculator…" reads like a pocket calculator, which is exactly why nobody looked there for
    // Calc Point.
    expect(menu).toMatch(/Calculations…\s+\(all calculators\)/);
  });

  it('and the old doors still work', () => {
    // This slice adds a door; it does not move the ones people already use.
    expect(menu).toMatch(/cad:openCalcPointDialog/);
    expect(menu).toMatch(/cad:openIntersect/);
    expect(menu).toMatch(/Curve Calculator…/);
  });
});
